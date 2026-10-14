// Session-end policy (DESIGN-CONVENTIONS §4 "Signing out and ended sessions").
// Pure and framework-light on purpose: proxy.ts imports this file, so it uses
// only the Web Fetch API (Request/Response/Headers) — no React, no next/*,
// no node:* — and every hub on Auth.js, or on its own session cookie, can use it.
//
// The rules it encodes came from real dead ends (Project Hub, Oct 2026):
//
// 1. Sign Out is a plain HTML form POST to a stable route (/auth/sign-out),
//    never a Server Action. A Server Action's id changes on every deploy and
//    the action only exists on the page that rendered it, so a tab left open
//    across a deploy — or a click after the session already expired, when the
//    proxy bounced the action POST to the sign-in page — failed with "Server
//    Action … was not found on the server" and an error screen.
// 2. The sign-out response is a full-page 303 with a RELATIVE Location, so the
//    browser stays on the host it is on (behind Netlify a route handler can see
//    the deploy permalink as its host) and the client router cache is discarded.
//    It also sends Clear-Site-Data: "cache" so Back cannot show a cached
//    signed-in page.
// 3. When the session is gone, the proxy answers each kind of request in the
//    shape its caller can handle: a page gets a redirect to sign-in that comes
//    back to the same page; a fetch to /api/* gets a 401 JSON error (a redirect
//    there hands fetch() an HTML sign-in page, which fails as "Unexpected token
//    '<'"); a Server Action gets Next's own x-action-redirect header, so the
//    client router does a full navigation to sign-in instead of throwing "An
//    unexpected response was received from the server".

export const SIGN_IN_PATH = "/auth/signin";
export const SIGN_OUT_PATH = "/auth/sign-out";
export const SIGNED_OUT_PATH = "/auth/signin?signedOut=1";

// BroadcastChannel name SignOutForm posts to and SessionWatch listens on, so a
// sign-out in one tab tells the hub's other open tabs at once.
export const SESSION_CHANNEL = "sequel-session";

export const SESSION_ENDED_MESSAGE = "Your session has ended. Sign in again to continue.";

// Query params that must never ride a callbackUrl: _rsc is Next's per-request
// cache buster on client-side navigations (an RSC fetch that the proxy turned
// into a sign-in redirect would otherwise carry it back after sign-in).
const STRIPPED_PARAMS = ["_rsc"];

// A post-sign-in destination the hub can safely send someone to: same-origin
// path only (no scheme, no protocol-relative "//", no backslash tricks), not an
// API or auth route (landing on raw JSON or back on the sign-in page is a dead
// end of its own). Anything else falls back.
export function safeCallbackUrl(raw: string | null | undefined, fallback = "/"): string {
  if (typeof raw !== "string" || raw === "") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, "http://local.invalid");
  } catch {
    return fallback;
  }
  if (url.host !== "local.invalid") return fallback;
  const path = url.pathname;
  if (path === "/api" || path.startsWith("/api/") || path === "/auth" || path.startsWith("/auth/")) {
    return fallback;
  }
  for (const p of STRIPPED_PARAMS) url.searchParams.delete(p);
  const search = url.searchParams.toString();
  return path + (search ? `?${search}` : "") + url.hash;
}

// The sign-in page URL that returns to `pathAndSearch` afterwards (relative).
export function signInHref(pathAndSearch?: string | null): string {
  const back = safeCallbackUrl(pathAndSearch, "");
  return back ? `${SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(back)}` : SIGN_IN_PATH;
}

export type SignedOutRequestKind = "api" | "action" | "page";

type HeaderReader = { get(name: string): string | null };

// How the proxy should answer a request that arrived without a session.
// A browser navigation (typing the URL, a download link to /api/export/…)
// is a page even under /api/: it should land on sign-in, not on raw JSON.
export function signedOutRequestKind(pathname: string, headers: HeaderReader): SignedOutRequestKind {
  const navigation = headers.get("sec-fetch-mode") === "navigate";
  if (!navigation && (pathname === "/api" || pathname.startsWith("/api/"))) return "api";
  if (headers.get("next-action")) return "action";
  return "page";
}

const NO_STORE = "no-store";

// The proxy's answer to a signed-out request (rule 3 above). The redirect
// Location is absolute on the request's own origin: Next's proxy rejects a
// relative Location ("Invalid URL" → 500), and the proxy sees the public host
// (unlike route handlers behind Netlify — see signOutRoute).
export function signedOutResponse(req: Pick<Request, "url" | "method" | "headers">): Response {
  const url = new URL(req.url);
  const kind = signedOutRequestKind(url.pathname, req.headers);
  if (kind === "api") {
    return new Response(JSON.stringify({ error: SESSION_ENDED_MESSAGE, signIn: SIGN_IN_PATH }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": NO_STORE },
    });
  }
  // For an action (and an RSC navigation) the page the person is on is the
  // request path itself; come back there after sign-in.
  const target = signInHref(url.pathname + url.search);
  if (kind === "action") {
    return new Response(null, {
      status: 401,
      headers: { "x-action-redirect": `${target};replace`, "cache-control": NO_STORE },
    });
  }
  return new Response(null, {
    status: req.method === "GET" || req.method === "HEAD" ? 307 : 303,
    headers: { location: new URL(target, url).toString(), "cache-control": NO_STORE },
  });
}

// CSRF floor for the sign-out POST: refuse only what the browser itself says
// came from another site. Sec-Fetch-Site is sent by every current browser;
// when it is absent (old browser, tooling) the request is allowed — a forced
// sign-out is a nuisance, and a refused real one would be a dead end.
export function isCrossSiteRequest(headers: HeaderReader): boolean {
  return headers.get("sec-fetch-site") === "cross-site";
}

// Auth.js session cookies (all chunks, secure-prefixed or not). Used to clear
// the session by hand when the library's own signOut throws, so Sign Out
// still ends the session instead of failing.
const AUTHJS_SESSION_COOKIE = /^(__Secure-)?(authjs|next-auth)\.session-token(\.\d+)?$/;

export function sessionCookieNames(cookieHeader: string | null, match: RegExp = AUTHJS_SESSION_COOKIE): string[] {
  if (!cookieHeader) return [];
  const names = cookieHeader
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name && match.test(name));
  return [...new Set(names)];
}

function expireCookie(name: string): string {
  const secure = name.startsWith("__Secure-") ? "; Secure" : "";
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export type SignOutRouteOptions = {
  // Ends the session server-side. For Auth.js: () => signOut({ redirect: false }).
  endSession: (req: Request) => Promise<unknown>;
  // Where the person lands (relative). Default: the sign-in page's
  // "You have been signed out" state.
  redirectTo?: string;
  // Cookies to expire by hand if endSession throws. Default: Auth.js's.
  sessionCookie?: RegExp;
  // Called with the error when endSession throws (the hub logs it).
  onError?: (error: unknown) => void;
};

// The /auth/sign-out route handler (rules 1 and 2). POST ends the session and
// 303s to the signed-out page; GET (a bookmark, a typed URL, a prefetch) never
// signs anyone out — it sends them to the sign-in page, which offers Sign Out
// when a session is still open. Never throws: a failed sign-out still clears
// the cookie and lands on the signed-out page.
export function signOutRoute(options: SignOutRouteOptions): {
  GET: () => Response;
  POST: (req: Request) => Promise<Response>;
} {
  const redirectTo = options.redirectTo ?? SIGNED_OUT_PATH;
  return {
    GET: () =>
      new Response(null, { status: 303, headers: { location: SIGN_IN_PATH, "cache-control": NO_STORE } }),
    POST: async (req: Request) => {
      if (isCrossSiteRequest(req.headers)) {
        return new Response(null, { status: 303, headers: { location: "/", "cache-control": NO_STORE } });
      }
      const headers = new Headers({
        location: redirectTo,
        "cache-control": NO_STORE,
        "clear-site-data": '"cache"',
      });
      try {
        await options.endSession(req);
      } catch (error) {
        options.onError?.(error);
        for (const name of sessionCookieNames(req.headers.get("cookie"), options.sessionCookie)) {
          headers.append("set-cookie", expireCookie(name));
        }
      }
      return new Response(null, { status: 303, headers });
    },
  };
}

// Microsoft's end-session URL for the tenant behind an Auth.js Entra issuer
// ("https://login.microsoftonline.com/<tenant>/v2.0"). Signs the browser out of
// Microsoft too — Outlook and Teams on the web included — so the hubs offer it
// as an explicit choice on the signed-out page, never as the default.
// postLogoutRedirectUri, when given, must be registered on the app
// registration; without it Microsoft shows its own "You signed out" page.
export function entraSignOutUrl(issuer: string | null | undefined, postLogoutRedirectUri?: string): string | null {
  if (!issuer) return null;
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    return null;
  }
  const tenant = url.pathname.split("/").filter(Boolean)[0];
  if (!tenant || url.protocol !== "https:") return null;
  const out = new URL(`/${tenant}/oauth2/v2.0/logout`, url.origin);
  if (postLogoutRedirectUri) out.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
  return out.toString();
}
