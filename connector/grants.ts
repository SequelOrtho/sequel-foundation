import { DEFAULT_LIFETIMES, type ConnectorLifetimes } from "./config";
import type { EndReason } from "./ended-reasons";
import { newToken, pkceMatches, tokenHash, type AuthorizeParams, type TokenPrefixes } from "./crypto";
import type { ClaudeMemberCheck } from "./members";
import { accessExpiry, expiresInSeconds, grantEndsAt, isGrantLive, refreshExpiry, type GrantDates } from "./state";

// The connector's grants, over a hub's own store. A person allows Claude, the
// hub creates a grant holding only the sign-in code's hash; Claude swaps the
// code (once, within five minutes, with its PKCE verifier) for an access
// token and a refresh token; each refresh rotates the refresh token.
//
// Races: every swap is a compare-and-set on the row's `version`, so two
// requests with the same code or refresh token can't both win. A code used
// twice ends the connection. A refresh token used twice ends it too, except
// the one just replaced inside the grace window (Claude retrying), which is
// only refused.
//
// Server-only (node:crypto through ./crypto). Never throws on a notice.

/** One connection as the store keeps it. Tokens appear only as SHA-256 hashes. */
export type GrantRecord = GrantDates & {
  id: string;
  /** Bumped by every update except `touch`. The compare-and-set key. */
  version: number;
  email: string;
  altEmails: string[];
  role: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  resource: string;
  codeHash: string;
  codeChallenge: string;
  accessHash: string | null;
  accessExpiresAt: Date | null;
  refreshHash: string | null;
  /** The refresh token just replaced, and when (the grace window). */
  refreshPrevHash: string | null;
  refreshPrevAt: Date | null;
  /** Every refresh token this connection has used. A reuse of any ends it. */
  refreshUsedHashes: string[];
  revokedReason: EndReason | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  calls: number;
};

export type NewGrant = Omit<GrantRecord, "id" | "version">;
export type GrantPatch = Partial<Omit<GrantRecord, "id" | "version" | "createdAt">>;

/** A connection an end closed, with whom to tell. */
export type EndedGrant = { id: string; email: string; altEmails: string[] };

/**
 * What a hub stores grants in. Every lookup by hash is exact. `update` writes
 * only when the row's version is still `expectedVersion` and bumps it,
 * returning the new row, or null when it lost. The three ends touch only rows
 * that are live by `isGrantLive` (a hub writes it as a where clause) and
 * return exactly the rows they ended.
 */
export interface GrantStore {
  create(row: NewGrant): Promise<GrantRecord>;
  findByCodeHash(hash: string): Promise<GrantRecord | null>;
  findByAccessHash(hash: string): Promise<GrantRecord | null>;
  findByRefreshHash(hash: string): Promise<GrantRecord | null>;
  /** The connection that ever used this refresh token (`refreshUsedHashes`). */
  findByUsedRefreshHash(hash: string): Promise<GrantRecord | null>;
  update(id: string, expectedVersion: number, patch: GrantPatch): Promise<GrantRecord | null>;
  /** Counts a tool call. Leaves `version` alone, so it never makes a refresh lose. */
  touch(id: string, now: Date): Promise<void>;
  /** A person's connections by any of their addresses (lower-cased), newest first. */
  listByEmail(emails: readonly string[], limit: number): Promise<GrantRecord[]>;
  endOne(id: string, reason: EndReason, now: Date): Promise<EndedGrant[]>;
  /** Live rows whose email or any alt email is `email`. */
  endByPerson(email: string, reason: EndReason, now: Date): Promise<EndedGrant[]>;
  endAll(reason: EndReason, now: Date): Promise<EndedGrant[]>;
}

/** Who the person is to the hub. Hub roles only, never an identity-provider claim. */
export interface IdentityAdapter {
  /** The sign-in may still use the hub (its domain allow-list, say). */
  signInAllowed(email: string): boolean | Promise<boolean>;
  /**
   * The person's current hub roles by any of their addresses. Optional: with
   * it, `verifyAccessToken` ends a connection whose chosen role is gone.
   * `lookupFailed` means "ask again later", never "no roles".
   */
  hubRoles?(addresses: readonly string[]): Promise<{ roles: readonly string[]; lookupFailed?: boolean }>;
}

export type ConnectorAuditEvent = {
  action: "connector.grant" | "connector.revoke" | "connector.reuse";
  reason?: EndReason;
  /** Null for an end nobody's hand was on. */
  actor: string | null;
  grantIds: string[];
};

/** How the hub tells people and audits. Both may throw; the module catches it. */
export interface NoticeAdapter {
  audit(event: ConnectorAuditEvent): void | Promise<void>;
  /** Tell each person (bell, email). Never called for the person's own end. */
  tell(ended: readonly EndedGrant[], reason: EndReason): void | Promise<void>;
}

export type TokenPair = { accessToken: string; refreshToken: string; expiresIn: number };
export type TokenError = { error: "invalid_grant" | "invalid_request"; description: string };
export type TokenResult = { ok: true; tokens: TokenPair; grantId: string } | { ok: false; error: TokenError; reused?: EndedGrant };

export const BAD_CODE: TokenError = { error: "invalid_grant", description: "The sign-in code is not valid. Connect again from Claude." };
export const BAD_REFRESH: TokenError = { error: "invalid_grant", description: "This connection has ended. Connect again from Claude." };

/** The RFC 6749 token response for a pair. */
export function tokenResponse(t: TokenPair) {
  return { access_token: t.accessToken, token_type: "Bearer", expires_in: t.expiresIn, refresh_token: t.refreshToken };
}

export type VerifiedToken =
  | { ok: true; grantId: string; email: string; altEmails: string[]; role: string; expiresAt: Date }
  /** Unknown, expired, ended, or just ended here: answer 401 invalid_token. */
  | { ok: false; reason: "invalid" | "ended" }
  /** A role lookup failed: answer a retry, end nothing. */
  | { ok: false; reason: "retry" };

export type GrantSummary = {
  id: string;
  clientName: string;
  role: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  calls: number;
  state: "active" | "waiting" | "ended";
  endsAt: Date;
  revokedReason: EndReason | null;
};

export type ConnectorGrantsOptions = {
  store: GrantStore;
  identity: IdentityAdapter;
  notices?: NoticeAdapter;
  members?: ClaudeMemberCheck;
  lifetimes?: Partial<ConnectorLifetimes>;
  tokenPrefixes?: TokenPrefixes;
  now?: () => Date;
  /** Where a failed notice or audit is logged. Default console.error. */
  log?: (line: string) => void;
};

const lower = (s: string) => s.trim().toLowerCase();

export function createConnectorGrants(opts: ConnectorGrantsOptions) {
  const { store, identity, notices, members } = opts;
  const life: ConnectorLifetimes = { ...DEFAULT_LIFETIMES, ...opts.lifetimes };
  const clock = opts.now ?? (() => new Date());
  const log = opts.log ?? ((line: string) => console.error(line));

  async function safely(what: string, fn: () => unknown): Promise<void> {
    try {
      await fn();
    } catch (err) {
      log(`[connector] ${what} failed ${err instanceof Error ? err.name : "error"}`);
    }
  }

  /** Audit FIRST, then tell: a slow email must never cost the audit row. */
  async function afterEnd(ended: readonly EndedGrant[], reason: EndReason, actor: string | null, action: ConnectorAuditEvent["action"] = "connector.revoke") {
    if (ended.length === 0 || !notices) return;
    await safely("audit", () => notices.audit({ action, reason, actor, grantIds: ended.map((e) => e.id) }));
    if (reason !== "person") await safely("end notice", () => notices.tell(ended, reason));
  }

  async function systemEnd(id: string, reason: EndReason, now: Date): Promise<EndedGrant | undefined> {
    const ended = await store.endOne(id, reason, now);
    const action = reason === "code-reused" || reason === "refresh-reused" ? "connector.reuse" : "connector.revoke";
    await afterEnd(ended, reason, null, action);
    return ended[0];
  }

  /** The sign-in rule; a lookup that throws answers "retry" and ends nothing. */
  async function signInCheck(email: string): Promise<boolean | "retry"> {
    try {
      return await identity.signInAllowed(email);
    } catch {
      return "retry";
    }
  }

  /** The Claude member check, when configured; anything but a definite "not-member" lets it through. */
  async function memberCheck(row: { email: string; altEmails: readonly string[] }, now: Date) {
    if (!members) return "member" as const;
    try {
      return await members.membership([row.email, ...row.altEmails], now.getTime());
    } catch {
      return "unavailable" as const;
    }
  }

  function freshTokens(now: Date, absoluteExpiresAt: Date) {
    const accessToken = newToken("access", opts.tokenPrefixes);
    const refreshToken = newToken("refresh", opts.tokenPrefixes);
    const accessExpiresAt = accessExpiry(now, absoluteExpiresAt, life.accessTtlMs);
    return {
      pair: { accessToken, refreshToken, expiresIn: expiresInSeconds(now, accessExpiresAt) },
      patch: {
        accessHash: tokenHash(accessToken),
        accessExpiresAt,
        refreshHash: tokenHash(refreshToken),
        refreshExpiresAt: refreshExpiry(now, absoluteExpiresAt, life.refreshIdleMs),
      },
    };
  }

  /**
   * Ends connections and tells the people (except for their own end).
   * `actor` is who did it (null for none); the audit row is written first.
   */
  async function endGrants(
    target: { id: string } | { email: string } | { all: true },
    reason: EndReason,
    actor: string | null,
  ): Promise<EndedGrant[]> {
    const now = clock();
    const ended =
      "id" in target
        ? await store.endOne(target.id, reason, now)
        : "email" in target
          ? lower(target.email)
            ? await store.endByPerson(lower(target.email), reason, now)
            : []
          : await store.endAll(reason, now);
    await afterEnd(ended, reason, actor);
    return ended;
  }

  return {
    lifetimes: life,

    /** The person allowed Claude: a new grant holding only the code's hash. The hub audits the allow. */
    async createGrant(input: { params: AuthorizeParams; email: string; altEmails: readonly string[]; role: string }): Promise<{ id: string; code: string }> {
      const now = clock();
      const code = newToken("code", opts.tokenPrefixes);
      const row = await store.create({
        email: lower(input.email),
        altEmails: input.altEmails.map(lower).filter(Boolean),
        role: input.role,
        clientId: input.params.clientId,
        clientName: input.params.client.name,
        redirectUri: input.params.redirectUri,
        resource: input.params.resource,
        codeHash: tokenHash(code),
        codeChallenge: input.params.codeChallenge,
        codeExpiresAt: new Date(now.getTime() + life.codeTtlMs),
        codeUsedAt: null,
        accessHash: null,
        accessExpiresAt: null,
        refreshHash: null,
        refreshExpiresAt: null,
        refreshPrevHash: null,
        refreshPrevAt: null,
        refreshUsedHashes: [],
        absoluteExpiresAt: new Date(now.getTime() + life.grantMaxMs),
        revokedAt: null,
        revokedReason: null,
        createdAt: now,
        lastUsedAt: null,
        calls: 0,
      });
      return { id: row.id, code };
    },

    /** The authorization_code grant. Runs the member check too (a consent post should run it as well). */
    async exchangeCode(input: { code: string; clientId: string; redirectUri: string | null; verifier: string | null; resource: string | null }): Promise<TokenResult> {
      const now = clock();
      if (!input.code || input.code.length > 200) return { ok: false, error: BAD_CODE };
      const row = await store.findByCodeHash(tokenHash(input.code));
      if (!row) return { ok: false, error: BAD_CODE };
      const reused = async (): Promise<TokenResult> => {
        // RFC 6749 §4.1.2: a code used twice ends what it was used for.
        const ended = await systemEnd(row.id, "code-reused", now);
        return { ok: false, error: BAD_CODE, ...(ended ? { reused: ended } : {}) };
      };
      if (row.codeUsedAt) return reused();
      if (row.revokedAt || row.codeExpiresAt <= now || row.absoluteExpiresAt <= now) return { ok: false, error: BAD_CODE };
      // RFC 6749 §4.1.3: the callback named at sign-in must be named again.
      if (row.clientId !== input.clientId || input.redirectUri !== row.redirectUri) return { ok: false, error: BAD_CODE };
      // RFC 8707: `resource` may be left out; the token is then for the grant's own.
      if (input.resource != null && input.resource !== row.resource) return { ok: false, error: BAD_CODE };
      if (!pkceMatches(input.verifier, row.codeChallenge)) return { ok: false, error: BAD_CODE };
      const allowed = await signInCheck(row.email);
      if (allowed === "retry") return { ok: false, error: BAD_CODE };
      if (!allowed) {
        await systemEnd(row.id, "sign-in-not-allowed", now);
        return { ok: false, error: BAD_CODE };
      }
      if ((await memberCheck(row, now)) === "not-member") {
        await systemEnd(row.id, "not-claude-member", now);
        return { ok: false, error: BAD_CODE };
      }
      const fresh = freshTokens(now, row.absoluteExpiresAt);
      const won = await store.update(row.id, row.version, { codeUsedAt: now, ...fresh.patch });
      if (!won) return reused();
      return { ok: true, tokens: fresh.pair, grantId: row.id };
    },

    /**
     * The refresh_token grant. Rotates on every use. A refresh whose answer is
     * lost (the network drops it) leaves the client holding a token that was
     * just replaced: inside `refreshGraceMs` it is refused without ending the
     * connection, but it can't be recovered, so the person connects again.
     * Hub roles are not re-checked here: every MCP call re-checks them in
     * `verifyAccessToken`, so a token minted for a lost role ends on first use.
     */
    async refresh(input: { refreshToken: string; clientId: string; resource: string | null }): Promise<TokenResult> {
      const now = clock();
      if (!input.refreshToken || input.refreshToken.length > 200) return { ok: false, error: BAD_REFRESH };
      const hash = tokenHash(input.refreshToken);
      const row = await store.findByRefreshHash(hash);
      if (!row) {
        const used = await store.findByUsedRefreshHash(hash);
        if (!used || used.revokedAt) return { ok: false, error: BAD_REFRESH };
        const justReplaced =
          used.refreshPrevHash === hash && used.refreshPrevAt != null && now.getTime() - used.refreshPrevAt.getTime() <= life.refreshGraceMs;
        if (justReplaced) return { ok: false, error: BAD_REFRESH };
        const ended = await systemEnd(used.id, "refresh-reused", now);
        return { ok: false, error: BAD_REFRESH, ...(ended ? { reused: ended } : {}) };
      }
      if (row.clientId !== input.clientId) return { ok: false, error: BAD_REFRESH };
      if (input.resource != null && input.resource !== row.resource) return { ok: false, error: BAD_REFRESH };
      if (row.revokedAt || !row.refreshExpiresAt || row.refreshExpiresAt <= now || row.absoluteExpiresAt <= now) {
        return { ok: false, error: BAD_REFRESH };
      }
      const allowed = await signInCheck(row.email);
      if (allowed === "retry") return { ok: false, error: BAD_REFRESH };
      if (!allowed) {
        await systemEnd(row.id, "sign-in-not-allowed", now);
        return { ok: false, error: BAD_REFRESH };
      }
      // Only a definite "not a member" ends it: an unreadable list keeps going.
      if ((await memberCheck(row, now)) === "not-member") {
        await systemEnd(row.id, "not-claude-member", now);
        return { ok: false, error: BAD_REFRESH };
      }
      const fresh = freshTokens(now, row.absoluteExpiresAt);
      const won = await store.update(row.id, row.version, {
        ...fresh.patch,
        refreshPrevHash: hash,
        refreshPrevAt: now,
        refreshUsedHashes: [...row.refreshUsedHashes, hash],
      });
      // Lost a race with another refresh of the same token: refused, not theft.
      if (!won) return { ok: false, error: BAD_REFRESH };
      return { ok: true, tokens: fresh.pair, grantId: row.id };
    },

    /**
     * The person behind an MCP call's bearer token. Counts the call. With
     * `identity.hubRoles`, a chosen role no longer held ends the connection
     * ("role-gone"); a failed lookup answers "retry" and ends nothing.
     * `expected.resource` is this MCP endpoint's address (the grant's RFC 8707
     * audience): a token issued for another hub's endpoint is "invalid".
     */
    async verifyAccessToken(token: string | null | undefined, expected: { resource: string }): Promise<VerifiedToken> {
      const now = clock();
      if (!token || token.length > 200) return { ok: false, reason: "invalid" };
      const row = await store.findByAccessHash(tokenHash(token));
      if (!row || row.revokedAt || !row.accessExpiresAt || row.accessExpiresAt <= now || row.absoluteExpiresAt <= now) {
        return { ok: false, reason: "invalid" };
      }
      if (row.resource !== expected.resource) return { ok: false, reason: "invalid" };
      const allowed = await signInCheck(row.email);
      if (allowed === "retry") return { ok: false, reason: "retry" };
      if (!allowed) {
        await systemEnd(row.id, "sign-in-not-allowed", now);
        return { ok: false, reason: "ended" };
      }
      if (identity.hubRoles) {
        let held: { roles: readonly string[]; lookupFailed?: boolean };
        try {
          held = await identity.hubRoles([row.email, ...row.altEmails]);
        } catch {
          return { ok: false, reason: "retry" };
        }
        if (!held.roles.includes(row.role)) {
          if (held.lookupFailed) return { ok: false, reason: "retry" };
          await systemEnd(row.id, "role-gone", now);
          return { ok: false, reason: "ended" };
        }
      }
      await store.touch(row.id, now).catch(() => {});
      return { ok: true, grantId: row.id, email: row.email, altEmails: row.altEmails, role: row.role, expiresAt: row.accessExpiresAt };
    },

    endGrants,

    /**
     * The person ends one of their own connections. False when it isn't theirs
     * or has already ended. Only their newest 50 are looked at (the same list
     * Claude Connections shows), so an older one can't be ended from here.
     */
    async endOwnGrant(id: string, emails: readonly string[]): Promise<boolean> {
      const mine = new Set(emails.map(lower));
      const rows = await store.listByEmail([...mine], 50);
      if (!rows.some((r) => r.id === id)) return false;
      const ended = await endGrants({ id }, "person", [...mine][0] ?? null);
      return ended.length === 1;
    },

    /** A person's connections, newest first, at most 50. */
    async listGrants(emails: readonly string[]): Promise<GrantSummary[]> {
      const now = clock();
      if (emails.length === 0) return [];
      const rows = await store.listByEmail(emails.map(lower), 50);
      return rows.map((r) => ({
        id: r.id,
        clientName: r.clientName,
        role: r.role,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        calls: r.calls,
        state: isGrantLive(r, now) ? (r.codeUsedAt ? "active" : "waiting") : "ended",
        endsAt: grantEndsAt(r),
        revokedReason: r.revokedReason,
      }));
    },
  };
}

export type ConnectorGrants = ReturnType<typeof createConnectorGrants>;
