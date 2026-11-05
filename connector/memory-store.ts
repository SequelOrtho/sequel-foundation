import { randomUUID } from "node:crypto";
import type { EndReason } from "./ended-reasons";
import type { EndedGrant, GrantPatch, GrantRecord, GrantStore, NewGrant } from "./grants";
import { isGrantLive } from "./state";

// An in-memory GrantStore: the reference for a hub's own adapter, and the
// store the tests run on. Every method copies in and out, so a caller can
// never change a stored row by holding a reference. `update` is the
// compare-and-set every adapter must give: one conditional write on `version`.
// Not for production: rows are lost on restart and never shared across
// instances.

const copy = (r: GrantRecord): GrantRecord => ({ ...r, altEmails: [...r.altEmails], refreshUsedHashes: [...r.refreshUsedHashes] });

export function createMemoryGrantStore(opts: { now?: () => Date } = {}): GrantStore & { rows(): GrantRecord[] } {
  const rows = new Map<string, GrantRecord>();
  const clock = opts.now ?? (() => new Date());
  const find = (pick: (r: GrantRecord) => boolean) => {
    for (const r of rows.values()) if (pick(r)) return copy(r);
    return null;
  };
  const end = (pick: (r: GrantRecord) => boolean, reason: EndReason, now: Date): EndedGrant[] => {
    const ended: EndedGrant[] = [];
    for (const r of rows.values()) {
      if (!pick(r) || !isGrantLive(r, now)) continue;
      rows.set(r.id, { ...r, revokedAt: now, revokedReason: reason, accessHash: null, refreshHash: null, version: r.version + 1 });
      ended.push({ id: r.id, email: r.email, altEmails: [...r.altEmails] });
    }
    return ended;
  };

  return {
    async create(row: NewGrant) {
      const rec: GrantRecord = { ...row, id: randomUUID(), version: 0 };
      rows.set(rec.id, copy(rec));
      return copy(rec);
    },
    async findByCodeHash(hash) {
      return find((r) => r.codeHash === hash);
    },
    async findByAccessHash(hash) {
      return find((r) => r.accessHash === hash);
    },
    async findByRefreshHash(hash) {
      return find((r) => r.refreshHash === hash);
    },
    async findByUsedRefreshHash(hash) {
      return find((r) => r.refreshUsedHashes.includes(hash));
    },
    async update(id: string, expectedVersion: number, patch: GrantPatch) {
      const r = rows.get(id);
      if (!r || r.version !== expectedVersion) return null;
      const next: GrantRecord = { ...r, ...patch, id, version: r.version + 1 };
      rows.set(id, copy(next));
      return copy(next);
    },
    async touch(id: string, now: Date) {
      const r = rows.get(id);
      if (r) rows.set(id, { ...r, lastUsedAt: now, calls: r.calls + 1 });
    },
    async listByEmail(emails: readonly string[], limit: number) {
      const set = new Set(emails.map((e) => e.toLowerCase()));
      return [...rows.values()]
        .filter((r) => set.has(r.email) || r.altEmails.some((a) => set.has(a)))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map(copy);
    },
    async endOne(id, reason, now = clock()) {
      return end((r) => r.id === id, reason, now);
    },
    async endByPerson(email, reason, now = clock()) {
      const e = email.toLowerCase();
      return end((r) => r.email === e || r.altEmails.includes(e), reason, now);
    },
    async endAll(reason, now = clock()) {
      return end(() => true, reason, now);
    },
    rows() {
      return [...rows.values()].map(copy);
    },
  };
}
