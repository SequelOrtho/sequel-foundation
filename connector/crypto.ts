import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { CLAUDE_CALLBACKS, isClaudeCallback } from "./config";
import { withParams } from "./consent";

// The connector's OAuth rules: opaque tokens kept only as SHA-256 hashes,
// PKCE (S256, required), and stateless client registration. A client id is
// a signed list of Claude's callbacks, so registering writes nothing and a
// stranger can't send a code anywhere else. Server-only (node:crypto).

const b64url = (buf: Buffer) => buf.toString("base64url");

export type TokenKind = "code" | "access" | "refresh";

/** Prefixes a pasted token reads as. A hub may pass its own ("phc_" …). */
export type TokenPrefixes = Record<TokenKind, string>;
export const DEFAULT_TOKEN_PREFIXES: TokenPrefixes = { code: "cnc_", access: "cna_", refresh: "cnr_" };

/** A fresh secret token: 32 random bytes, prefixed by kind. */
export function newToken(kind: TokenKind, prefixes: TokenPrefixes = DEFAULT_TOKEN_PREFIXES): string {
  return `${prefixes[kind]}${b64url(randomBytes(32))}`;
}

/** What the store keeps instead of a token: its SHA-256, hex. */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isCodeChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE.test(value);
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) equals the challenge, compared in constant time. */
export function pkceMatches(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !VERIFIER.test(verifier) || !CHALLENGE.test(challenge)) return false;
  const actual = Buffer.from(b64url(createHash("sha256").update(verifier, "ascii").digest()));
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ---------- Stateless client ids ----------

/**
 * How a hub signs its client ids. `label` keeps one hub's ids from being
 * read by another that shares a secret; `prefix` marks the id ("phc1.").
 */
export type ClientIdKey = { secret: string; label: string; prefix?: string };

export const DEFAULT_CLIENT_PREFIX = "cn1.";
export const CLIENT_NAME_MAX = 80;
const CLIENT_ID_MAX = 2000;

function clientKey(k: ClientIdKey): Buffer {
  return createHash("sha256").update(`${k.secret}|${k.label}|connector-client-v1`).digest();
}

/** A client's name as typed by whoever registered it: control characters out, trimmed and capped. */
export function cleanClientName(raw: unknown): string {
  const text = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim() : "";
  return (text || "Claude").slice(0, CLIENT_NAME_MAX);
}

export type ClientInfo = { redirectUris: string[]; name: string };

/** Signs a registration: the client id carries its own callbacks and name. */
export function issueClientId(info: ClientInfo, key: ClientIdKey): string {
  const body = b64url(Buffer.from(JSON.stringify({ v: 1, r: info.redirectUris, n: info.name }), "utf8"));
  const sig = b64url(createHmac("sha256", clientKey(key)).update(body).digest());
  return `${key.prefix ?? DEFAULT_CLIENT_PREFIX}${body}.${sig}`;
}

/** The registration a client id carries, or null when this hub did not sign it. */
export function readClientId(clientId: unknown, key: ClientIdKey): ClientInfo | null {
  const prefix = key.prefix ?? DEFAULT_CLIENT_PREFIX;
  if (typeof clientId !== "string" || clientId.length > CLIENT_ID_MAX || !clientId.startsWith(prefix)) return null;
  const [body, sig, extra] = clientId.slice(prefix.length).split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(b64url(createHmac("sha256", clientKey(key)).update(body).digest()));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { v?: unknown; r?: unknown; n?: unknown };
    if (parsed.v !== 1 || !Array.isArray(parsed.r) || parsed.r.length === 0 || !parsed.r.every(isClaudeCallback)) return null;
    return { redirectUris: parsed.r as string[], name: cleanClientName(parsed.n) };
  } catch {
    return null;
  }
}

export type RegistrationResult =
  | { ok: true; client: ClientInfo }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string };

/** RFC 7591 registration, checked: Claude's callbacks only, the code flow only, a public client (PKCE, no secret). */
export function checkRegistration(body: unknown): RegistrationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_client_metadata", description: "The registration must be a JSON object." };
  }
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > CLAUDE_CALLBACKS.length) {
    return { ok: false, error: "invalid_redirect_uri", description: "Register Claude's own callback address." };
  }
  if (!uris.every(isClaudeCallback)) {
    return { ok: false, error: "invalid_redirect_uri", description: "This Hub sends sign-ins only to Claude (claude.ai or claude.com)." };
  }
  const grants = b.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || !grants.every((g) => g === "authorization_code" || g === "refresh_token"))) {
    return { ok: false, error: "invalid_client_metadata", description: "Only the authorization_code and refresh_token grants are offered." };
  }
  const types = b.response_types;
  if (types !== undefined && (!Array.isArray(types) || !types.every((t) => t === "code"))) {
    return { ok: false, error: "invalid_client_metadata", description: "Only the code response type is offered." };
  }
  return { ok: true, client: { redirectUris: [...new Set(uris as string[])], name: cleanClientName(b.client_name) } };
}

/** The RFC 7591 answer for a checked registration (201 body). */
export function registrationResponse(client: ClientInfo, key: ClientIdKey, now: Date = new Date()) {
  return {
    client_id: issueClientId(client, key),
    client_id_issued_at: Math.floor(now.getTime() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

// ---------- The authorize request ----------

export const STATE_MAX = 1000;

export type AuthorizeParams = {
  clientId: string;
  client: ClientInfo;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string;
};

export type AuthorizeCheck =
  /** Good: show the consent page. */
  | { ok: true; params: AuthorizeParams }
  /** The client or callback can't be trusted: say so on the page, never redirect. */
  | { ok: false; redirect: null; message: string }
  /** The client is real but the request is wrong: send the error back to Claude (RFC 6749 §4.1.2.1). */
  | { ok: false; redirect: string; message: string };

const first = (v: unknown): string | null => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null);

/**
 * Checks an authorize request (the consent page's query, and again the
 * Allow post, which carries the same fields). `resource` must be the MCP
 * endpoint when given (RFC 8707); `scope` is ignored, since every
 * connection is read-only.
 */
export function checkAuthorize(query: Record<string, unknown>, ctx: { key: ClientIdKey; resource: string; issuer: string }): AuthorizeCheck {
  const clientId = first(query.client_id);
  const client = readClientId(clientId, ctx.key);
  if (!clientId || !client) {
    return { ok: false, redirect: null, message: "This connection request didn't come from a client the Hub knows. Start again from Claude." };
  }
  const redirectUri = first(query.redirect_uri);
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { ok: false, redirect: null, message: "This connection request names a return address the Hub doesn't send sign-ins to. Start again from Claude." };
  }
  const stateRaw = first(query.state);
  const state = stateRaw && stateRaw.length <= STATE_MAX ? stateRaw : null;
  const back = (error: string, description: string) => ({
    ok: false as const,
    redirect: withParams(redirectUri, { error, error_description: description, state, iss: ctx.issuer }),
    message: description,
  });
  if (stateRaw && !state) return back("invalid_request", "The state parameter is too long.");
  if (first(query.response_type) !== "code") return back("unsupported_response_type", "Only the code response type is offered.");
  const challenge = first(query.code_challenge);
  if (!isCodeChallenge(challenge)) return back("invalid_request", "A PKCE code challenge is required.");
  if (first(query.code_challenge_method) !== "S256") return back("invalid_request", "The PKCE method must be S256.");
  const resource = first(query.resource);
  if (resource != null && resource !== ctx.resource) return back("invalid_target", "This sign-in is only for the Hub's connector address.");
  return { ok: true, params: { clientId, client, redirectUri, codeChallenge: challenge, state, resource: ctx.resource } };
}
