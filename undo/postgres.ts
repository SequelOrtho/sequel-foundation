// Postgres snapshot engine for undoable deletes (DESIGN-CONVENTIONS §3 "Deletes
// can be undone for 30 minutes"). Server only. Database-driver agnostic: a hub
// hands in a `SqlExecutor` over its own transaction (Prisma:
// `{ query: (sql, params) => tx.$queryRawUnsafe(sql, ...params) }`).
//
// captureDelete() runs BEFORE the hub's own delete, inside the same
// transaction. It locks the root row (so no new child can attach between the
// capture and the delete), then walks the live foreign keys from pg_catalog:
//   ON DELETE CASCADE  → the child row is captured whole and walked in turn;
//   ON DELETE SET NULL → the child row is remembered with the value it loses.
// restoreSnapshot() puts it all back in one statement per row: parents first
// (a table-level topological order; inside a self-referencing table, each row
// after the row it points to), then the
// SET NULL links — only where the column is still null, so a link someone
// re-pointed meanwhile is left alone. A row that would clash (same key or
// unique value re-created, or a parent outside the snapshot gone) raises the
// database error; the caller's transaction rolls back and the route answers
// UNDO_CONFLICT_MESSAGE (`isRestoreConflict`).
//
// Values travel as jsonb text (to_jsonb / jsonb_populate_record) and are
// never parsed into JavaScript values, so every column type round-trips
// exactly without a per-type cast: enums, arrays, json, timestamps, bytea, and
// bigint / numeric beyond 2^53. Keys are matched in SQL against the table's
// own column types, so lookups use the primary-key and foreign-key indexes.
// Not handled: ON DELETE SET DEFAULT links (not relinked). A column added
// after the delete takes its default on restore.
//
// Child lookups use an index only where the foreign key column has one
// (Postgres does not add one by itself; Prisma's @@index does).
// Each row is one round trip: on Prisma, give the interactive transaction room
// for a large cascade (`prisma.$transaction(fn, { timeout: 15_000 })`).

export interface SqlExecutor {
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

/** A captured row: its table and the row as `to_jsonb` text (exact). */
export type SnapshotRow = { table: string; json: string };
/** A row whose SET NULL foreign key columns the delete clears. */
export type SnapshotLink = { table: string; json: string; columns: string[] };
export type DeleteSnapshot = {
  version: 1;
  root: { table: string; key: Record<string, unknown> };
  /** Insert order: parents before children. */
  rows: SnapshotRow[];
  /** SET NULL links to restore after the rows. */
  links: SnapshotLink[];
};

type ForeignKey = { child: string; action: string; childCols: string[]; parentCols: string[] };

export const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

const FK_SQL = `
SELECT cl.relname::text AS child, c.confdeltype::text AS action,
  array(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, o)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.o) AS child_cols,
  array(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, o)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.o) AS parent_cols
FROM pg_constraint c
JOIN pg_class p ON p.oid = c.confrelid
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace ns ON ns.oid = p.relnamespace
WHERE c.contype = 'f' AND p.relname = $1 AND ns.nspname = current_schema()
ORDER BY c.conname`;

const PK_SQL = `
SELECT a.attname::text AS col
FROM pg_index i
JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
WHERE i.indrelid = to_regclass(format('%I.%I', current_schema(), $1::text)) AND i.indisprimary
ORDER BY array_position(i.indkey::int2[], a.attnum)`;

const COLS_SQL = `
SELECT a.attname::text AS col
FROM pg_attribute a
WHERE a.attrelid = to_regclass(format('%I.%I', current_schema(), $1::text))
  AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
ORDER BY a.attnum`;

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : typeof v === "string" ? v.replace(/^{|}$/g, "").split(",").filter(Boolean) : [];

function catalog(exec: SqlExecutor) {
  const fks = new Map<string, Promise<ForeignKey[]>>();
  const pks = new Map<string, Promise<string[]>>();
  const cols = new Map<string, Promise<string[]>>();
  return {
    referencing(table: string) {
      if (!fks.has(table)) {
        fks.set(
          table,
          exec.query(FK_SQL, [table]).then((rows) =>
            rows.map((r) => ({
              child: String(r.child),
              action: String(r.action),
              childCols: asArray(r.child_cols),
              parentCols: asArray(r.parent_cols),
            })),
          ),
        );
      }
      return fks.get(table)!;
    },
    primaryKey(table: string) {
      if (!pks.has(table)) pks.set(table, exec.query(PK_SQL, [table]).then((rows) => rows.map((r) => String(r.col))));
      return pks.get(table)!;
    },
    /** Columns an INSERT may name (not dropped, not generated). */
    insertable(table: string) {
      if (!cols.has(table)) cols.set(table, exec.query(COLS_SQL, [table]).then((rows) => rows.map((r) => String(r.col))));
      return cols.get(table)!;
    },
  };
}

const list = (alias: string, cols: string[]) => cols.map((c) => `${alias}.${ident(c)}`).join(", ");
const tuple = (alias: string, cols: string[]) => (cols.length === 1 ? list(alias, cols) : `(${list(alias, cols)})`);
/** A JSON array of row texts, built without parsing them. */
const jsonArray = (texts: string[]) => `[${texts.join(",")}]`;

type Captured = { table: string; json: string; id: string };

async function identityExpr(cat: ReturnType<typeof catalog>, table: string, alias: string) {
  const pk = await cat.primaryKey(table);
  return pk.length > 0 ? `jsonb_build_array(${list(alias, pk)})::text` : `to_jsonb(${alias})::text`;
}

const rowsOf = (result: Record<string, unknown>[]): Array<{ json: string; id: string }> =>
  result.map((r) => ({ json: String(r.j), id: String(r.id) }));

/**
 * Record everything deleting `table` WHERE `key` will remove or unlink.
 * Returns null when no row matches. Call inside the delete's transaction,
 * immediately before the delete. Key values are cast to the columns' own
 * types, so an id may be passed as a number or a string (pass a bigint above
 * 2^53 as a string).
 */
export async function captureDelete(
  exec: SqlExecutor,
  table: string,
  key: Record<string, unknown>,
): Promise<DeleteSnapshot | null> {
  const cat = catalog(exec);
  const keyCols = Object.keys(key);
  if (keyCols.length === 0) throw new Error("captureDelete: key must name at least one column");
  const root = rowsOf(
    await exec.query(
      `SELECT to_jsonb(t)::text AS j, ${await identityExpr(cat, table, "t")} AS id FROM ${ident(table)} t
       WHERE ${tuple("t", keyCols)} = (SELECT ${list("k", keyCols)} FROM jsonb_populate_record(NULL::${ident(table)}, $1::jsonb) k)
       FOR UPDATE`,
      [JSON.stringify(key)],
    ),
  );
  if (root.length === 0) return null;

  const captured: Captured[] = [];
  const seen = new Set<string>();
  const linkMap = new Map<string, SnapshotLink>();
  const firstSeen: string[] = [];
  const add = (t: string, r: { json: string; id: string }) => {
    const id = `${t}:${r.id}`;
    if (seen.has(id)) return false;
    seen.add(id);
    captured.push({ table: t, json: r.json, id });
    if (!firstSeen.includes(t)) firstSeen.push(t);
    return true;
  };

  let frontier: Captured[] = [];
  for (const r of root) if (add(table, r)) frontier.push(captured[captured.length - 1]);

  while (frontier.length > 0) {
    const byTable = new Map<string, string[]>();
    for (const f of frontier) byTable.set(f.table, [...(byTable.get(f.table) ?? []), f.json]);
    const next: Captured[] = [];
    for (const [parent, texts] of byTable) {
      for (const fk of await cat.referencing(parent)) {
        if (fk.action !== "c" && fk.action !== "n") continue;
        const children = rowsOf(
          await exec.query(
            `SELECT to_jsonb(t)::text AS j, ${await identityExpr(cat, fk.child, "t")} AS id FROM ${ident(fk.child)} t
             WHERE ${tuple("t", fk.childCols)} IN (SELECT ${list("p", fk.parentCols)} FROM jsonb_populate_recordset(NULL::${ident(parent)}, $1::jsonb) p)
             ${fk.action === "c" ? "FOR UPDATE" : ""}`,
            [jsonArray(texts)],
          ),
        );
        if (fk.action === "c") {
          for (const c of children) if (add(fk.child, c)) next.push(captured[captured.length - 1]);
        } else {
          for (const c of children) {
            const id = `${fk.child}:${c.id}`;
            const link = linkMap.get(id) ?? { table: fk.child, json: c.json, columns: [] };
            for (const col of fk.childCols) if (!link.columns.includes(col)) link.columns.push(col);
            linkMap.set(id, link);
          }
        }
      }
    }
    frontier = next;
  }

  // A row restored whole needs no relink.
  const links: SnapshotLink[] = [];
  for (const [id, link] of linkMap) if (!seen.has(id)) links.push(link);

  // Every foreign key between two captured tables (any delete action) orders
  // the inserts, not only the cascades that were walked. A table that refers
  // to itself (a task tree) is ordered row by row.
  const edges = new Map<string, Set<string>>();
  const within = new Map<string, Map<string, string[]>>();
  for (const t of firstSeen) {
    for (const fk of await cat.referencing(t)) {
      if (!firstSeen.includes(fk.child)) continue;
      if (fk.child !== t) {
        edges.set(t, (edges.get(t) ?? new Set<string>()).add(fk.child));
        continue;
      }
      const deps = within.get(t) ?? new Map<string, string[]>();
      for (const [id, parentId] of await selfReferences(exec, captured.filter((c) => c.table === t), t, fk)) {
        if (parentId) deps.set(id, [...(deps.get(id) ?? []), parentId]);
      }
      within.set(t, deps);
    }
  }

  const ordered = orderForInsert(captured, edges, firstSeen, within);
  return { version: 1, root: { table, key }, rows: ordered.map(({ table: t, json }) => ({ table: t, json })), links };
}

/** For each captured row of a self-referencing table: the captured row its
 *  self foreign key points to, if any (keys compared in SQL, so they stay exact). */
async function selfReferences(
  exec: SqlExecutor,
  rows: Captured[],
  table: string,
  fk: ForeignKey,
): Promise<Array<readonly [string, string | undefined]>> {
  const hasRef = fk.childCols.map((c) => `r.${ident(c)} IS NOT NULL`).join(" AND ");
  const res = await exec.query(
    `SELECT r.ordinality AS n, jsonb_build_array(${list("r", fk.parentCols)})::text AS k,
            CASE WHEN ${hasRef} THEN jsonb_build_array(${list("r", fk.childCols)})::text END AS ref
     FROM jsonb_populate_recordset(NULL::${ident(table)}, $1::jsonb) WITH ORDINALITY r`,
    [jsonArray(rows.map((r) => r.json))],
  );
  const byKey = new Map(res.map((r) => [String(r.k), rows[Number(r.n) - 1].id]));
  return res.map((r) => {
    const id = rows[Number(r.n) - 1].id;
    const target = r.ref == null ? undefined : byKey.get(String(r.ref));
    return [id, target !== id ? target : undefined] as const;
  });
}

/** Parents before children: Kahn over the foreign keys between captured
 *  tables (a cycle falls back to first-capture order), then, inside a
 *  self-referencing table, each row after the captured row it points to. */
export function orderForInsert<R extends { table: string; id?: string }>(
  rows: R[],
  edges: Map<string, Set<string>>,
  tables: string[],
  within: Map<string, Map<string, string[]>> = new Map(),
): R[] {
  const indeg = new Map(tables.map((t) => [t, 0]));
  for (const [p, kids] of edges) for (const k of kids) if (indeg.has(k) && p !== k && indeg.has(p)) indeg.set(k, (indeg.get(k) ?? 0) + 1);
  const order: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = tables.filter((t) => remaining.has(t) && (indeg.get(t) ?? 0) === 0);
    const pick = ready.length > 0 ? ready : [tables.find((t) => remaining.has(t))!];
    for (const t of pick) {
      remaining.delete(t);
      order.push(t);
      for (const k of edges.get(t) ?? []) if (remaining.has(k)) indeg.set(k, (indeg.get(k) ?? 1) - 1);
    }
  }
  const out: R[] = [];
  for (const t of order) {
    const mine = rows.filter((r) => r.table === t);
    const deps = within.get(t);
    if (!deps || deps.size === 0) {
      out.push(...mine);
      continue;
    }
    // Depth-first: a row goes out after the captured row it points to.
    const byId = new Map(mine.map((r) => [r.id ?? "", r]));
    const placed = new Set<string>();
    const visiting = new Set<string>();
    const place = (r: R) => {
      const id = r.id ?? "";
      if (placed.has(id) || visiting.has(id)) return;
      visiting.add(id);
      for (const d of deps.get(id) ?? []) {
        const parent = byId.get(d);
        if (parent) place(parent);
      }
      visiting.delete(id);
      placed.add(id);
      out.push(r);
    };
    for (const r of mine) place(r);
  }
  return out;
}

/** Put a snapshot back. Call inside a transaction; any clash throws. */
export async function restoreSnapshot(exec: SqlExecutor, snapshot: DeleteSnapshot): Promise<{ rows: number; links: number }> {
  if (snapshot.version !== 1) throw new Error("restoreSnapshot: unknown snapshot version");
  const cat = catalog(exec);
  for (const { table, json } of snapshot.rows) {
    // Name only the columns the snapshot carries (keys only — values stay
    // text), so a column added since the delete takes its default.
    const present = new Set(Object.keys(JSON.parse(json) as object));
    const cols = (await cat.insertable(table)).filter((c) => present.has(c));
    await exec.query(
      `INSERT INTO ${ident(table)} (${cols.map(ident).join(", ")}) OVERRIDING SYSTEM VALUE
       SELECT ${list("r", cols)} FROM jsonb_populate_record(NULL::${ident(table)}, $1::jsonb) r RETURNING 1 AS ok`,
      [json],
    );
  }
  let links = 0;
  for (const link of snapshot.links) {
    const pk = await cat.primaryKey(link.table);
    const all = Object.keys(JSON.parse(link.json) as object);
    const matchCols = pk.length > 0 ? pk : all.filter((c) => !link.columns.includes(c));
    const set = link.columns.map((c) => `${ident(c)} = r.${ident(c)}`).join(", ");
    const match = matchCols.map((c) => `t.${ident(c)} IS NOT DISTINCT FROM r.${ident(c)}`).join(" AND ");
    const stillNull = link.columns.map((c) => `t.${ident(c)} IS NULL`).join(" AND ");
    const done = await exec.query(
      `UPDATE ${ident(link.table)} t SET ${set} FROM jsonb_populate_record(NULL::${ident(link.table)}, $1::jsonb) r WHERE ${match} AND ${stillNull} RETURNING 1 AS ok`,
      [link.json],
    );
    links += done.length;
  }
  return { rows: snapshot.rows.length, links };
}

/** Postgres unique (23505), foreign-key (23503) and not-null (23502)
 *  violations, raw or wrapped by a driver (Prisma surfaces them as
 *  P2002/P2003/P2011, or P2010 with the code in its message). */
export function isRestoreConflict(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown; meta?: { code?: unknown } } | null;
  const codes = [e?.code, e?.meta?.code].map((c) => String(c ?? ""));
  if (codes.some((c) => ["23505", "23503", "23502", "P2002", "P2003", "P2011"].includes(c))) return true;
  const msg = String(e?.message ?? "");
  return /23505|23503|23502|duplicate key value|violates foreign key constraint|violates unique constraint|violates not-null constraint/i.test(msg);
}

/** Rows a snapshot will bring back, by table — for the toast label and the audit row. */
export function snapshotCounts(snapshot: DeleteSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of snapshot.rows) out[r.table] = (out[r.table] ?? 0) + 1;
  return out;
}
