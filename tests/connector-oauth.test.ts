import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkAuthorize,
  checkRegistration,
  CLAUDE_CALLBACKS,
  consentPath,
  isCodeChallenge,
  isConsentRefusal,
  issueClientId,
  newToken,
  pkceMatches,
  readClientId,
  registrationResponse,
  STATE_MAX,
  tokenHash,
  withParams,
} from "../connector/server";

const key = { secret: "k".repeat(32), label: "test" };
const ctx = { key, resource: "https://hub.netlify.app/api/mcp", issuer: "https://hub.netlify.app" };
const verifier = "a".repeat(50);
const challenge = createHash("sha256").update(verifier).digest("base64url");

describe("tokens and PKCE", () => {
  it("makes prefixed random tokens and hashes them", () => {
    const t = newToken("access");
    expect(t.startsWith("cna_")).toBe(true);
    expect(newToken("access")).not.toBe(t);
    expect(tokenHash(t)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("checks S256 only", () => {
    expect(isCodeChallenge(challenge)).toBe(true);
    expect(isCodeChallenge("short")).toBe(false);
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches("b".repeat(50), challenge)).toBe(false);
    expect(pkceMatches("short", challenge)).toBe(false);
    expect(pkceMatches(undefined, challenge)).toBe(false);
  });
});

describe("stateless client ids", () => {
  it("round-trips and refuses a changed or foreign id", () => {
    const id = issueClientId({ redirectUris: [CLAUDE_CALLBACKS[0]], name: "Claude" }, key);
    expect(id.startsWith("cn1.")).toBe(true);
    expect(readClientId(id, key)).toEqual({ redirectUris: [CLAUDE_CALLBACKS[0]], name: "Claude" });
    expect(readClientId(id, { ...key, secret: "z".repeat(32) })).toBeNull();
    expect(readClientId(id, { ...key, label: "other" })).toBeNull();
    expect(readClientId(id.slice(0, -2) + "xx", key)).toBeNull();
    expect(readClientId("junk", key)).toBeNull();
    expect(readClientId(7, key)).toBeNull();
  });
  it("registers Claude's callbacks only", () => {
    const ok = checkRegistration({ redirect_uris: [...CLAUDE_CALLBACKS], client_name: "Claude\n<b>" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.client.name).not.toMatch(/\n/);
      const res = registrationResponse(ok.client, key, new Date(1_000_000));
      expect(res.token_endpoint_auth_method).toBe("none");
      expect(readClientId(res.client_id, key)?.redirectUris).toEqual([...CLAUDE_CALLBACKS]);
    }
    expect(checkRegistration({ redirect_uris: ["https://evil.com/cb"] })).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
    expect(checkRegistration({ redirect_uris: [] })).toMatchObject({ ok: false });
    expect(checkRegistration(null)).toMatchObject({ ok: false, error: "invalid_client_metadata" });
  });
});

describe("checkAuthorize", () => {
  const clientId = issueClientId({ redirectUris: [CLAUDE_CALLBACKS[0]], name: "Claude" }, key);
  const q = { client_id: clientId, redirect_uri: CLAUDE_CALLBACKS[0], response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "s1" };

  it("accepts a good request", () => {
    const r = checkAuthorize(q, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.params).toMatchObject({ clientId, redirectUri: CLAUDE_CALLBACKS[0], codeChallenge: challenge, state: "s1" });
  });
  it("never redirects for an unknown client or callback", () => {
    expect(checkAuthorize({ ...q, client_id: "cn1.bad" }, ctx)).toMatchObject({ ok: false, redirect: null });
    expect(checkAuthorize({ ...q, redirect_uri: CLAUDE_CALLBACKS[1] }, ctx)).toMatchObject({ ok: false, redirect: null });
  });
  it("redirects other errors back to Claude with state and iss", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ code_challenge: "x" }, "invalid_request"],
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ resource: "https://elsewhere/api/mcp" }, "invalid_target"],
      [{ state: "s".repeat(STATE_MAX + 1) }, "invalid_request"],
    ];
    for (const [patch, error] of cases) {
      const r = checkAuthorize({ ...q, ...patch }, ctx);
      expect(r.ok).toBe(false);
      if (r.ok || !r.redirect) throw new Error("expected a redirect");
      const u = new URL(r.redirect);
      expect(u.origin + u.pathname).toBe(CLAUDE_CALLBACKS[0]);
      expect(u.searchParams.get("error")).toBe(error);
      expect(u.searchParams.get("iss")).toBe(ctx.issuer);
    }
  });
});

describe("consent paths", () => {
  it("carries every field and a known refusal", () => {
    const p = consentPath({ clientId: "c", redirectUri: "r", codeChallenge: "x", state: "s&t", resource: "https://hub.netlify.app/api/mcp" }, "company");
    const u = new URL(p, "https://hub.com");
    expect(u.pathname).toBe("/connect/authorize");
    expect(u.searchParams.get("state")).toBe("s&t");
    expect(u.searchParams.get("refused")).toBe("company");
    expect(isConsentRefusal("company")).toBe(true);
    expect(isConsentRefusal("other")).toBe(false);
  });
  it("adds params to a URL, skipping empty ones", () => {
    expect(withParams("https://a/b?x=1", { code: "c", state: null })).toBe("https://a/b?x=1&code=c");
  });
});
