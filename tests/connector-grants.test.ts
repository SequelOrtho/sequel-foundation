import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  checkAuthorize,
  createConnectorGrants,
  createMemoryGrantStore,
  issueClientId,
  CLAUDE_CALLBACKS,
  DEFAULT_LIFETIMES,
  tokenResponse,
  type ConnectorAuditEvent,
  type EndedGrant,
  type EndReason,
  type IdentityAdapter,
} from "../connector/server";
import type { ClaudeMemberCheck, ClaudeMembership } from "../connector/members";

const KEY = { secret: "s".repeat(32), label: "test" };
const RESOURCE = "https://hub.netlify.app/api/mcp";
const ISSUER = "https://hub.netlify.app";
const verifier = "v".repeat(43) + "-._~";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const callback = CLAUDE_CALLBACKS[0];

function setup(identity: Partial<IdentityAdapter> = {}, members?: ClaudeMemberCheck) {
  let t = new Date("2026-11-05T12:00:00Z").getTime();
  const now = () => new Date(t);
  const advance = (ms: number) => (t += ms);
  const store = createMemoryGrantStore({ now });
  const audits: ConnectorAuditEvent[] = [];
  const told: { ended: readonly EndedGrant[]; reason: EndReason }[] = [];
  const grants = createConnectorGrants({
    store,
    identity: { signInAllowed: () => true, ...identity },
    notices: { audit: (e) => void audits.push(e), tell: (ended, reason) => void told.push({ ended, reason }) },
    now,
    log: () => {},
    members,
  });
  const clientId = issueClientId({ redirectUris: [callback], name: "Claude" }, KEY);
  const check = checkAuthorize(
    { client_id: clientId, redirect_uri: callback, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", resource: RESOURCE },
    { key: KEY, resource: RESOURCE, issuer: ISSUER },
  );
  if (!check.ok) throw new Error(check.message);
  const allow = () => grants.createGrant({ params: check.params, email: "Pat@Example.com", altEmails: ["pat.alt@example.com"], role: "PM" });
  const exchange = (code: string, v = verifier) => grants.exchangeCode({ code, clientId, redirectUri: callback, verifier: v, resource: RESOURCE });
  const refresh = (refreshToken: string) => grants.refresh({ refreshToken, clientId, resource: null });
  return { store, grants, audits, told, clientId, allow, exchange, refresh, advance };
}

describe("connector grants: the full flow", () => {
  it("allows, swaps the code, verifies, refreshes and lists", async () => {
    const s = setup();
    const { id, code } = await s.allow();
    expect(s.store.rows()[0].codeHash).not.toContain(code);
    const out = await s.exchange(code);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.tokens.expiresIn).toBe(DEFAULT_LIFETIMES.accessTtlMs / 1000);
    expect(tokenResponse(out.tokens).token_type).toBe("Bearer");
    const v = await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: RESOURCE });
    expect(v).toMatchObject({ ok: true, grantId: id, email: "pat@example.com", role: "PM" });
    const r = await s.refresh(out.tokens.refreshToken);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: RESOURCE })).ok).toBe(false);
    expect((await s.grants.verifyAccessToken(r.tokens.accessToken, { resource: RESOURCE })).ok).toBe(true);
    const list = await s.grants.listGrants(["PAT.ALT@example.com"]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, state: "active", calls: 2 });
  });

  it("refuses a wrong verifier, callback or expired code", async () => {
    const s = setup();
    const { code } = await s.allow();
    expect((await s.exchange(code, "w".repeat(43))).ok).toBe(false);
    expect((await s.grants.exchangeCode({ code, clientId: s.clientId, redirectUri: null, verifier, resource: null })).ok).toBe(false);
    s.advance(DEFAULT_LIFETIMES.codeTtlMs + 1);
    expect((await s.exchange(code)).ok).toBe(false);
  });

  it("a code used twice ends the connection, audited as a reuse and told", async () => {
    const s = setup();
    const { id, code } = await s.allow();
    const first = await s.exchange(code);
    expect(first.ok).toBe(true);
    const again = await s.exchange(code);
    expect(again).toMatchObject({ ok: false, reused: { id } });
    expect(s.store.rows()[0].revokedReason).toBe("code-reused");
    expect(s.audits.at(-1)).toMatchObject({ action: "connector.reuse", reason: "code-reused", actor: null });
    expect(s.told.at(-1)?.reason).toBe("code-reused");
    if (first.ok) expect((await s.grants.verifyAccessToken(first.tokens.accessToken, { resource: RESOURCE })).ok).toBe(false);
  });
});

describe("connector grants: refresh races and replays", () => {
  it("two refreshes at once: one wins, the loser is refused without ending anything", async () => {
    const s = setup();
    const { code } = await s.allow();
    const out = await s.exchange(code);
    if (!out.ok) throw new Error("exchange");
    const [a, b] = await Promise.all([s.refresh(out.tokens.refreshToken), s.refresh(out.tokens.refreshToken)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser.ok).toBe(false);
    if (!loser.ok) expect(loser.reused).toBeUndefined();
    expect(s.store.rows()[0].revokedAt).toBeNull();
  });

  it("a replay inside the grace window is only refused", async () => {
    const s = setup();
    const { code } = await s.allow();
    const out = await s.exchange(code);
    if (!out.ok) throw new Error("exchange");
    const r = await s.refresh(out.tokens.refreshToken);
    expect(r.ok).toBe(true);
    s.advance(DEFAULT_LIFETIMES.refreshGraceMs - 1);
    const replay = await s.refresh(out.tokens.refreshToken);
    expect(replay).toMatchObject({ ok: false });
    expect(s.store.rows()[0].revokedAt).toBeNull();
    if (r.ok) expect((await s.refresh(r.tokens.refreshToken)).ok).toBe(true);
  });

  it("a replay past the grace window ends the connection as refresh-reused", async () => {
    const s = setup();
    const { id, code } = await s.allow();
    const out = await s.exchange(code);
    if (!out.ok) throw new Error("exchange");
    await s.refresh(out.tokens.refreshToken);
    s.advance(DEFAULT_LIFETIMES.refreshGraceMs + 1);
    const replay = await s.refresh(out.tokens.refreshToken);
    expect(replay).toMatchObject({ ok: false, reused: { id } });
    expect(s.store.rows()[0].revokedReason).toBe("refresh-reused");
    expect(s.audits.at(-1)?.action).toBe("connector.reuse");
  });

  it("an older used refresh token ends it even inside the grace window", async () => {
    const s = setup();
    const { code } = await s.allow();
    const out = await s.exchange(code);
    if (!out.ok) throw new Error("exchange");
    const r1 = await s.refresh(out.tokens.refreshToken);
    if (!r1.ok) throw new Error("r1");
    await s.refresh(r1.tokens.refreshToken);
    expect((await s.refresh(out.tokens.refreshToken)).ok).toBe(false);
    expect(s.store.rows()[0].revokedReason).toBe("refresh-reused");
  });

  it("touch never bumps the version, so a tool call can't make a refresh lose", async () => {
    const s = setup();
    const { code } = await s.allow();
    const out = await s.exchange(code);
    if (!out.ok) throw new Error("exchange");
    const before = s.store.rows()[0].version;
    await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: RESOURCE });
    await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: RESOURCE });
    expect(s.store.rows()[0].version).toBe(before);
    expect(s.store.rows()[0].calls).toBe(2);
  });

  it("the refresh never outlives the absolute limit", async () => {
    const s = setup();
    const { code } = await s.allow();
    let tok = await s.exchange(code);
    for (let day = 0; day < 13; day++) {
      if (!tok.ok) throw new Error("refresh");
      s.advance(24 * 3600_000);
      tok = await s.refresh(tok.tokens.refreshToken);
    }
    expect(tok.ok).toBe(true);
    s.advance(24 * 3600_000);
    if (tok.ok) expect((await s.refresh(tok.tokens.refreshToken)).ok).toBe(false);
  });
});

describe("connector grants: identity checks and ends", () => {
  it("a role no longer held ends the connection as role-gone", async () => {
    const roles = { roles: ["PM"] as string[], lookupFailed: false };
    const s = setup({ hubRoles: async () => roles });
    const { code } = await s.allow();
    const out = await s.exchange(code);
    if (!out.ok) throw new Error("exchange");
    expect((await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: RESOURCE })).ok).toBe(true);
    roles.roles = [];
    roles.lookupFailed = true;
    expect(await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: RESOURCE })).toEqual({ ok: false, reason: "retry" });
    expect(s.store.rows()[0].revokedAt).toBeNull();
    roles.lookupFailed = false;
    expect(await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: RESOURCE })).toEqual({ ok: false, reason: "ended" });
    expect(s.store.rows()[0].revokedReason).toBe("role-gone");
    expect(s.told.at(-1)?.reason).toBe("role-gone");
  });

  it("a throwing role lookup answers retry and ends nothing", async () => {
    const s = setup({ hubRoles: async () => { throw new Error("db"); } });
    const { code } = await s.allow();
    const out = await s.exchange(code);
    if (!out.ok) throw new Error("exchange");
    expect(await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: RESOURCE })).toEqual({ ok: false, reason: "retry" });
    expect(s.store.rows()[0].revokedAt).toBeNull();
  });

  it("a sign-in no longer allowed ends it at the next swap", async () => {
    let allowed = true;
    const s = setup({ signInAllowed: () => allowed });
    const { code } = await s.allow();
    allowed = false;
    expect((await s.exchange(code)).ok).toBe(false);
    expect(s.store.rows()[0].revokedReason).toBe("sign-in-not-allowed");
  });

  it("audits first, then tells; the person's own end tells nobody", async () => {
    const order: string[] = [];
    const store = createMemoryGrantStore();
    const grants = createConnectorGrants({
      store,
      identity: { signInAllowed: () => true },
      notices: { audit: () => void order.push("audit"), tell: () => void order.push("tell") },
      log: () => {},
    });
    const clientId = issueClientId({ redirectUris: [callback], name: "Claude" }, KEY);
    const params = { clientId, client: { redirectUris: [callback], name: "Claude" }, redirectUri: callback, codeChallenge: challenge, state: null, resource: RESOURCE };
    const a = await grants.createGrant({ params, email: "a@x.com", altEmails: [], role: "PM" });
    const b = await grants.createGrant({ params, email: "a@x.com", altEmails: [], role: "PM" });
    expect(await grants.endOwnGrant(a.id, ["A@x.com"])).toBe(true);
    expect(order).toEqual(["audit"]);
    expect(await grants.endOwnGrant(a.id, ["a@x.com"])).toBe(false);
    expect(await grants.endOwnGrant(b.id, ["someone@else.com"])).toBe(false);
    await grants.endGrants({ email: "a@x.com" }, "admin-person", "admin@x.com");
    expect(order).toEqual(["audit", "audit", "tell"]);
    expect(await grants.endGrants({ all: true }, "admin", "admin@x.com")).toEqual([]);
  });

  it("a failing notice is logged, never thrown", async () => {
    const log = vi.fn();
    const store = createMemoryGrantStore();
    const grants = createConnectorGrants({
      store,
      identity: { signInAllowed: () => true },
      notices: { audit: () => { throw new TypeError("x"); }, tell: async () => { throw new Error("mail"); } },
      log,
    });
    const params = { clientId: "c", client: { redirectUris: [callback], name: "Claude" }, redirectUri: callback, codeChallenge: challenge, state: null, resource: RESOURCE };
    await grants.createGrant({ params, email: "a@x.com", altEmails: [], role: "PM" });
    await expect(grants.endGrants({ all: true }, "admin", null)).resolves.toHaveLength(1);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toContain("TypeError");
  });
});

describe("connector grants: round-1 fixes", () => {
  const memberCheck = (answer: () => ClaudeMembership): ClaudeMemberCheck => ({ configured: true, membership: async () => answer(), reset: () => {} });

  it("refuses an access token issued for another endpoint (audience)", async () => {
    const s = setup();
    const { code } = await s.allow();
    const out = await s.exchange(code);
    if (!out.ok) throw new Error("exchange");
    expect(await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: "https://other.netlify.app/api/mcp" })).toEqual({ ok: false, reason: "invalid" });
    expect((await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: RESOURCE })).ok).toBe(true);
  });

  it("refuses a client id signed with another hub's key", () => {
    const other = issueClientId({ redirectUris: [callback], name: "Claude" }, { secret: "z".repeat(32), label: "test" });
    const check = checkAuthorize(
      { client_id: other, redirect_uri: callback, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", resource: RESOURCE },
      { key: KEY, resource: RESOURCE, issuer: ISSUER },
    );
    expect(check.ok).toBe(false);
  });

  it("a throwing sign-in check answers retry and ends nothing", async () => {
    let fail = false;
    const s = setup({ signInAllowed: () => { if (fail) throw new Error("graph"); return true; } });
    const first = await s.allow();
    const out = await s.exchange(first.code);
    if (!out.ok) throw new Error("exchange");
    fail = true;
    expect(await s.grants.verifyAccessToken(out.tokens.accessToken, { resource: RESOURCE })).toEqual({ ok: false, reason: "retry" });
    expect((await s.refresh(out.tokens.refreshToken)).ok).toBe(false);
    const second = await s.allow();
    expect(await s.exchange(second.code)).toMatchObject({ ok: false });
    expect(s.store.rows().every((r) => r.revokedAt === null)).toBe(true);
    expect(s.told).toHaveLength(0);
  });

  it("a person off the Claude member list is refused at the code swap", async () => {
    const s = setup({}, memberCheck(() => "not-member"));
    const { code } = await s.allow();
    expect((await s.exchange(code)).ok).toBe(false);
    expect(s.store.rows()[0].revokedReason).toBe("not-claude-member");
    expect(s.told.at(-1)?.reason).toBe("not-claude-member");
  });

  it("an unreadable member list never ends a connection", async () => {
    const s = setup({}, memberCheck(() => "unavailable"));
    const { code } = await s.allow();
    expect((await s.exchange(code)).ok).toBe(true);
    expect(s.store.rows()[0].revokedAt).toBeNull();
  });
});
