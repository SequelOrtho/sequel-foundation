// Integration test for the Postgres snapshot engine. Needs a real database:
// set UNDO_PG_URL (CI starts a postgres service; locally any throwaway
// cluster). Without it the suite is skipped — the engine is SQL, and a fake
// executor would prove nothing about it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { captureDelete, isRestoreConflict, orderForInsert, restoreSnapshot, snapshotCounts, type SqlExecutor } from "../undo/postgres";

const URL = process.env.UNDO_PG_URL;
const SCHEMA = "undo_engine_test";

const SETUP = `
DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
CREATE SCHEMA ${SCHEMA};
SET search_path TO ${SCHEMA};
CREATE TYPE "Status" AS ENUM ('OPEN', 'DONE');
CREATE TABLE "Person" (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE "Project" (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, status "Status" NOT NULL DEFAULT 'OPEN',
  tags TEXT[] NOT NULL DEFAULT '{}', meta JSONB, budget NUMERIC(12,2), blob BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "pmId" INTEGER REFERENCES "Person"(id) ON DELETE SET NULL
);
CREATE TABLE "Task" (
  id TEXT PRIMARY KEY, "projectId" INTEGER NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "parentId" TEXT REFERENCES "Task"(id) ON DELETE CASCADE, "assigneeId" INTEGER REFERENCES "Person"(id) ON DELETE SET NULL,
  title TEXT NOT NULL, statuses "Status"[] NOT NULL DEFAULT '{}'
);
CREATE TABLE "Comment" (
  id SERIAL PRIMARY KEY, "taskId" TEXT NOT NULL REFERENCES "Task"(id) ON DELETE CASCADE,
  "authorId" INTEGER NOT NULL REFERENCES "Person"(id) ON DELETE CASCADE, body TEXT NOT NULL
);
CREATE TABLE "Note" (id SERIAL PRIMARY KEY, "projectId" INTEGER REFERENCES "Project"(id) ON DELETE SET NULL, body TEXT);
CREATE TABLE "Tag" (id SERIAL PRIMARY KEY, label TEXT NOT NULL);
CREATE TABLE "_ProjectToTag" ("A" INTEGER NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE, "B" INTEGER NOT NULL REFERENCES "Tag"(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX "_ProjectToTag_AB_unique" ON "_ProjectToTag"("A", "B");
CREATE TABLE "Membership" ("projectId" INTEGER NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE, "personId" INTEGER NOT NULL REFERENCES "Person"(id) ON DELETE CASCADE, role TEXT, PRIMARY KEY ("projectId", "personId"));
`;

const SEED = `
TRUNCATE "Person", "Project", "Task", "Comment", "Note", "Tag", "_ProjectToTag", "Membership" RESTART IDENTITY CASCADE;
INSERT INTO "Person" (name) VALUES ('Pat'), ('Lee');
INSERT INTO "Project" (name, status, tags, meta, budget, blob, "createdAt", "pmId")
  VALUES ('Alpha', 'DONE', '{a,"b c"}', '{"k": [1, {"x": null}]}', 1234.56, '\\x0102ff', '2026-10-20 12:34:56.789', 1),
         ('Beta', 'OPEN', '{}', NULL, NULL, NULL, '2026-10-01 00:00:00', 2);
INSERT INTO "Task" (id, "projectId", "parentId", "assigneeId", title, statuses) VALUES
  ('t-root', 1, NULL, 2, 'Root', '{OPEN,DONE}'), ('t-child', 1, 't-root', 1, 'Child', '{}'), ('t-beta', 2, NULL, 1, 'Beta task', '{}');
INSERT INTO "Comment" ("taskId", "authorId", body) VALUES ('t-child', 2, 'deep'), ('t-beta', 2, 'other');
INSERT INTO "Note" ("projectId", body) VALUES (1, 'linked'), (2, 'beta');
INSERT INTO "Tag" (label) VALUES ('x'), ('y');
INSERT INTO "_ProjectToTag" ("A", "B") VALUES (1, 1), (1, 2), (2, 1);
INSERT INTO "Membership" VALUES (1, 1, 'pm'), (1, 2, 'member');
`;

const dump = async (c: pg.Client) => {
  const out: Record<string, unknown[]> = {};
  for (const t of ["Person", "Project", "Task", "Comment", "Note", "Tag", "_ProjectToTag", "Membership"]) {
    out[t] = (await c.query(`SELECT to_jsonb(t)::text AS j FROM "${t}" t ORDER BY 1`)).rows.map((r) => r.j);
  }
  return out;
};

describe.skipIf(!URL)("undo/postgres engine (real Postgres)", () => {
  let c: pg.Client;
  const exec: SqlExecutor = { query: async (sql, params) => (await c.query(sql, params as unknown[])).rows };
  const tx = async <T,>(fn: () => Promise<T>) => {
    await c.query("BEGIN");
    try {
      const v = await fn();
      await c.query("COMMIT");
      return v;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  };

  beforeAll(async () => {
    c = new pg.Client({ connectionString: URL });
    await c.connect();
    await c.query(SETUP);
  });
  afterAll(async () => {
    await c?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await c?.end();
  });
  beforeEach(async () => {
    await c.query(`SET search_path TO ${SCHEMA}`);
    await c.query(SEED);
  });

  it("captures the cascade tree + SET NULL links, and restores the database exactly", async () => {
    const before = await dump(c);
    const snap = await tx(async () => {
      const s = await captureDelete(exec, "Project", { id: 1 });
      await c.query(`DELETE FROM "Project" WHERE id = 1`);
      return s;
    });
    expect(snap).not.toBeNull();
    expect(snapshotCounts(snap!)).toEqual({ Project: 1, Task: 2, Comment: 1, _ProjectToTag: 2, Membership: 2 });
    expect(snap!.links.map((l) => [l.table, l.columns])).toEqual([["Note", ["projectId"]]]);
    // JSON-safe: it is stored as a json column by the hubs.
    const stored = JSON.parse(JSON.stringify(snap));
    const after = await dump(c);
    expect(after.Project).toHaveLength(1);
    const res = await tx(() => restoreSnapshot(exec, stored));
    expect(res).toEqual({ rows: 8, links: 1 });
    expect(await dump(c)).toEqual(before);
  });

  it("orders inserts parents-first even when a child's parent was captured later", async () => {
    // Deleting a Person cascades Comments (authored) and Memberships, and
    // nulls Task.assigneeId / Project.pmId.
    const before = await dump(c);
    const snap = await tx(async () => {
      const s = await captureDelete(exec, "Person", { id: 2 });
      await c.query(`DELETE FROM "Person" WHERE id = 2`);
      return s;
    });
    expect(snapshotCounts(snap!)).toEqual({ Person: 1, Comment: 2, Membership: 1 });
    expect(snap!.links.map((l) => l.table).sort()).toEqual(["Project", "Task"]);
    await tx(() => restoreSnapshot(exec, snap!));
    expect(await dump(c)).toEqual(before);
  });

  it("deletes a self-referencing subtree and restores parent before child", async () => {
    const before = await dump(c);
    const snap = await tx(async () => {
      const s = await captureDelete(exec, "Task", { id: "t-root" });
      await c.query(`DELETE FROM "Task" WHERE id = 't-root'`);
      return s;
    });
    expect(snap!.rows.map((r) => (r.row as { id: string }).id ?? r.table)).toEqual(["t-root", "t-child", 1]);
    await tx(() => restoreSnapshot(exec, snap!));
    expect(await dump(c)).toEqual(before);
  });

  it("leaves a link alone when someone re-pointed it after the delete", async () => {
    const snap = await tx(async () => {
      const s = await captureDelete(exec, "Project", { id: 1 });
      await c.query(`DELETE FROM "Project" WHERE id = 1`);
      return s;
    });
    await c.query(`UPDATE "Note" SET "projectId" = 2 WHERE body = 'linked'`);
    const res = await tx(() => restoreSnapshot(exec, snap!));
    expect(res.links).toBe(0);
    expect((await c.query(`SELECT "projectId" FROM "Note" WHERE body = 'linked'`)).rows[0].projectId).toBe(2);
  });

  it("refuses (and rolls back) when a unique value was re-used meanwhile", async () => {
    const snap = await tx(async () => {
      const s = await captureDelete(exec, "Project", { id: 1 });
      await c.query(`DELETE FROM "Project" WHERE id = 1`);
      return s;
    });
    await c.query(`INSERT INTO "Project" (name) VALUES ('Alpha')`);
    const err = await tx(() => restoreSnapshot(exec, snap!)).catch((e) => e);
    expect(isRestoreConflict(err)).toBe(true);
    expect((await c.query(`SELECT count(*)::int AS n FROM "Task"`)).rows[0].n).toBe(1);
  });

  it("refuses when a parent outside the snapshot is gone", async () => {
    const snap = await tx(async () => {
      const s = await captureDelete(exec, "Task", { id: "t-child" });
      await c.query(`DELETE FROM "Task" WHERE id = 't-child'`);
      return s;
    });
    await c.query(`DELETE FROM "Task" WHERE id = 't-root'`);
    const err = await tx(() => restoreSnapshot(exec, snap!)).catch((e) => e);
    expect(isRestoreConflict(err)).toBe(true);
  });

  it("answers null for a missing row", async () => {
    expect(await captureDelete(exec, "Project", { id: 999 })).toBeNull();
  });
});

describe("orderForInsert", () => {
  it("puts parents first and keeps capture order within a table", () => {
    const rows = [
      { table: "C", row: { i: 1 } },
      { table: "A", row: { i: 2 } },
      { table: "B", row: { i: 3 } },
      { table: "A", row: { i: 4 } },
    ];
    const edges = new Map([["A", new Set(["B"])], ["B", new Set(["C"])]]);
    expect(orderForInsert(rows, edges, ["C", "A", "B"]).map((r) => r.row.i)).toEqual([2, 4, 3, 1]);
  });
  it("falls back to capture order on a cycle", () => {
    const rows = [{ table: "A", row: { i: 1 } }, { table: "B", row: { i: 2 } }];
    const edges = new Map([["A", new Set(["B"])], ["B", new Set(["A"])]]);
    expect(orderForInsert(rows, edges, ["A", "B"]).map((r) => r.row.i)).toEqual([1, 2]);
  });
});

describe("isRestoreConflict", () => {
  it("recognises raw and Prisma-wrapped violations", () => {
    expect(isRestoreConflict({ code: "23505" })).toBe(true);
    expect(isRestoreConflict({ code: "P2010", message: 'Raw query failed. Code: `23503`.' })).toBe(true);
    expect(isRestoreConflict({ code: "P2002" })).toBe(true);
    expect(isRestoreConflict(new Error("connection reset"))).toBe(false);
  });
});
