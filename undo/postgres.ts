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
// (a table-level topological order, capture order within a table), then the
// SET NULL links — only where the column is still null, so a link someone
// re-pointed meanwhile is left alone. A row that would clash (same key or
// unique value re-created, or a parent outside the snapshot gone) raises the
// database error; the caller's transaction rolls back and the route answers
// UNDO_CONFLICT_MESSAGE (`isRestoreConflict`).
//
// Values travel as jsonb (to_jsonb / jsonb_populate_record), so every column
// type round-trips without a per-type cast: enums, arrays, json, timestamps,
// numeric, bytea. Not handled: ON DELETE SET DEFAULT links (not relinked),
// GENERATED ALWAYS columns (Prisma emits none).

export interface SqlExecutor {
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

type Row = Record<string, unknown>;

export type SnapshotRow = { table: string; row: Row };
export type SnapshotLink = { table: string; row: Row; columns: string[] };
export type DeleteSnapshot = {
  version: 1;
  root: { table: string; key: Row };
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

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : typeof v === "string" ? v.replace(/^{|}$/g, "").split(",").filter(Boolean) : [];

function catalog(exec: SqlExecutor) {
  const fks = new Map<string, Promise<ForeignKey[]>>();
  const pks = new Map<string, Promise<string[]>>();
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
  };
}

const tupleSql = (alias: string, cols: string[]) =>
  `jsonb_build_array(${cols.map((c) => `${alias}.${ident(c)}`).join(", ")})`;
const inParam = (n: number) => `= ANY(ARRAY(SELECT jsonb_array_elements($${n}::jsonb)))`;

const parseRows = (rows: Record<string, unknown>[]) =>
  rows.map((r) => (typeof r.j === "string" ? (JSON.parse(r.j) as Row) : (r.j as Row)));

async function identity(cat: ReturnType<typeof catalog>, table: string, row: Row): Promise<string> {
  const pk = await cat.primaryKey(table);
  return `${table}:${JSON.stringify(pk.length ? pk.map((c) => row[c]) : row)}`;
}

/**
 * Record everything deleting `table` WHERE `key` will remove or unlink.
 * Returns null when no row matches. Call inside the delete's transaction,
 * immediately before the delete.
 */
export async function captureDelete(exec: SqlExecutor, table: string, key: Row): Promise<DeleteSnapshot | null> {
  const cat = catalog(exec);
  const keyCols = Object.keys(key);
  if (keyCols.length === 0) throw new Error("captureDelete: key must name at least one column");
  const root = parseRows(
    await exec.query(
      `SELECT to_jsonb(t)::text AS j FROM ${ident(table)} t WHERE ${tupleSql("t", keyCols)} = $1::jsonb FOR UPDATE`,
      [JSON.stringify(keyCols.map((c) => key[c]))],
    ),
  );
  if (root.length === 0) return null;

  const captured: SnapshotRow[] = [];
  const seen = new Set<string>();
  const linkMap = new Map<string, SnapshotLink>();
  const firstSeen: string[] = [];

  const add = async (t: string, row: Row) => {
    const id = await identity(cat, t, row);
    if (seen.has(id)) return false;
    seen.add(id);
    captured.push({ table: t, row });
    if (!firstSeen.includes(t)) firstSeen.push(t);
    return true;
  };

  let frontier: SnapshotRow[] = [];
  for (const r of root) if (await add(table, r)) frontier.push({ table, row: r });

  while (frontier.length > 0) {
    const byTable = new Map<string, Row[]>();
    for (const f of frontier) byTable.set(f.table, [...(byTable.get(f.table) ?? []), f.row]);
    const next: SnapshotRow[] = [];
    for (const [parent, rows] of byTable) {
      for (const fk of await cat.referencing(parent)) {
        if (fk.action !== "c" && fk.action !== "n") continue;
        const values = rows
          .map((r) => fk.parentCols.map((c) => r[c]))
          .filter((v) => v.every((x) => x !== null && x !== undefined));
        if (values.length === 0) continue;
        const children = parseRows(
          await exec.query(
            `SELECT to_jsonb(t)::text AS j FROM ${ident(fk.child)} t WHERE ${tupleSql("t", fk.childCols)} ${inParam(1)}${fk.action === "c" ? " FOR UPDATE" : ""}`,
            [JSON.stringify(values)],
          ),
        );
        if (fk.action === "c") {
          for (const c of children) if (await add(fk.child, c)) next.push({ table: fk.child, row: c });
        } else {
          for (const c of children) {
            const id = await identity(cat, fk.child, c);
            const link = linkMap.get(id) ?? { table: fk.child, row: c, columns: [] };
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
  // the inserts, not only the cascades that were walked.
  const edges = new Map<string, Set<string>>();
  for (const t of firstSeen) {
    for (const fk of await cat.referencing(t)) {
      if (fk.child === t || !firstSeen.includes(fk.child)) continue;
      edges.set(t, (edges.get(t) ?? new Set<string>()).add(fk.child));
    }
  }

  return { version: 1, root: { table, key }, rows: orderForInsert(captured, edges, firstSeen), links };
}

/** Parents before children: Kahn over the foreign keys between captured
 *  tables; a cycle falls back to first-capture order. Rows keep capture order
 *  inside their table (breadth-first, so a self-referencing parent comes first). */
export function orderForInsert(rows: SnapshotRow[], edges: Map<string, Set<string>>, tables: string[]): SnapshotRow[] {
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
  const rank = new Map(order.map((t, i) => [t, i]));
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (rank.get(a.r.table)! - rank.get(b.r.table)!) || a.i - b.i)
    .map((x) => x.r);
}

/** Put a snapshot back. Call inside a transaction; any clash throws. */
export async function restoreSnapshot(exec: SqlExecutor, snapshot: DeleteSnapshot): Promise<{ rows: number; links: number }> {
  if (snapshot.version !== 1) throw new Error("restoreSnapshot: unknown snapshot version");
  const cat = catalog(exec);
  for (const { table, row } of snapshot.rows) {
    await exec.query(
      `INSERT INTO ${ident(table)} SELECT * FROM jsonb_populate_record(NULL::${ident(table)}, $1::jsonb) RETURNING 1 AS ok`,
      [JSON.stringify(row)],
    );
  }
  let links = 0;
  for (const link of snapshot.links) {
    const pk = await cat.primaryKey(link.table);
    const matchCols = pk.length > 0 ? pk : Object.keys(link.row).filter((c) => !link.columns.includes(c));
    const set = link.columns.map((c) => `${ident(c)} = r.${ident(c)}`).join(", ");
    const match = matchCols.map((c) => `t.${ident(c)} IS NOT DISTINCT FROM r.${ident(c)}`).join(" AND ");
    const stillNull = link.columns.map((c) => `t.${ident(c)} IS NULL`).join(" AND ");
    const done = await exec.query(
      `UPDATE ${ident(link.table)} t SET ${set} FROM jsonb_populate_record(NULL::${ident(link.table)}, $1::jsonb) r WHERE ${match} AND ${stillNull} RETURNING 1 AS ok`,
      [JSON.stringify(link.row)],
    );
    links += done.length;
  }
  return { rows: snapshot.rows.length, links };
}

/** Postgres unique (23505) / foreign-key (23503) violations, raw or wrapped
 *  by a driver (Prisma surfaces them as P2002/P2003, or P2010 with the code
 *  in its message). */
export function isRestoreConflict(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown; meta?: { code?: unknown } } | null;
  const codes = [e?.code, e?.meta?.code].map((c) => String(c ?? ""));
  if (codes.some((c) => c === "23505" || c === "23503" || c === "P2002" || c === "P2003")) return true;
  const msg = String(e?.message ?? "");
  return /23505|23503|duplicate key value|violates foreign key constraint|violates unique constraint/i.test(msg);
}

/** Rows a snapshot will bring back, by table — for the toast label and the audit row. */
export function snapshotCounts(snapshot: DeleteSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of snapshot.rows) out[r.table] = (out[r.table] ?? 0) + 1;
  return out;
}
