// A connection's state, from its dates alone. Pure. Every surface asks these
// (the hub's list, its counts, its ends), so "open" has one meaning:
// `isGrantLive(g, now) === (grantState(g, now) !== "ended")` for every row,
// pinned by a property test. A hub that filters in SQL writes the same rule
// as a where clause and tests it against `isGrantLive`.

export type GrantDates = {
  revokedAt: Date | null;
  codeUsedAt: Date | null;
  codeExpiresAt: Date;
  refreshExpiresAt: Date | null;
  absoluteExpiresAt: Date;
};

/** "active" (tokens issued and good), "waiting" (allowed, code not yet swapped), "ended". */
export type GrantState = "active" | "waiting" | "ended";

export function grantState(g: GrantDates, now: Date): GrantState {
  if (g.revokedAt || g.absoluteExpiresAt <= now) return "ended";
  if (!g.codeUsedAt) return g.codeExpiresAt > now ? "waiting" : "ended";
  return g.refreshExpiresAt && g.refreshExpiresAt > now ? "active" : "ended";
}

/**
 * Still open: not ended, inside its absolute limit, and either a code still
 * waiting to be swapped or tokens whose refresh is still good. Written as the
 * where clause a database filter mirrors.
 */
export function isGrantLive(g: GrantDates, now: Date): boolean {
  if (g.revokedAt !== null || !(g.absoluteExpiresAt > now)) return false;
  if (g.codeUsedAt === null) return g.codeExpiresAt > now;
  return g.refreshExpiresAt !== null && g.refreshExpiresAt > now;
}

/** When a connection ended, or the latest it can end if nothing renews it. */
export function grantEndsAt(g: GrantDates): Date {
  if (g.revokedAt) return g.revokedAt;
  // A waiting code dies at its five minutes; tokens at the refresh's idle week.
  const natural = g.codeUsedAt ? (g.refreshExpiresAt ?? g.codeUsedAt) : g.codeExpiresAt;
  return natural < g.absoluteExpiresAt ? natural : g.absoluteExpiresAt;
}

/** When a refresh token issued now stops working: the idle limit, never past the connection's own end. */
export function refreshExpiry(now: Date, absoluteExpiresAt: Date, idleMs: number): Date {
  return new Date(Math.min(now.getTime() + idleMs, absoluteExpiresAt.getTime()));
}

/** When an access token issued now stops working, never past the connection's own end. */
export function accessExpiry(now: Date, absoluteExpiresAt: Date, ttlMs: number): Date {
  return new Date(Math.min(now.getTime() + ttlMs, absoluteExpiresAt.getTime()));
}

/** The token response's `expires_in`: whole seconds, at least one. */
export function expiresInSeconds(now: Date, expiresAt: Date): number {
  return Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
