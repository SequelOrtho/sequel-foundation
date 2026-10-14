import { describe, expect, it, vi } from "vitest";
import {
  SESSION_ENDED_MESSAGE,
  SIGNED_OUT_PATH,
  entraSignOutUrl,
  isCrossSiteRequest,
  safeCallbackUrl,
  sessionCookieNames,
  signInHref,
  signOutRoute,
  signedOutRequestKind,
  signedOutResponse,
} from "../session/policy";

const req = (url: string, init: RequestInit = {}) => new Request(url, init);

describe("safeCallbackUrl", () => {
  it("keeps same-origin page paths with their query", () => {
    expect(safeCallbackUrl("/projects/12?tab=risks")).toBe("/projects/12?tab=risks");
  });
  it("strips Next's _rsc cache buster", () => {
    expect(safeCallbackUrl("/admin/roles?_rsc=abc123&q=x")).toBe("/admin/roles?q=x");
    expect(safeCallbackUrl("/admin/roles?_rsc=abc123")).toBe("/admin/roles");
  });
  it("refuses other origins and tricks", () => {
    for (const bad of ["https://evil.example/x", "//evil.example", "/\\evil.example", "javascript:alert(1)", "projects", "/a\nb"]) {
      expect(safeCallbackUrl(bad, "/home")).toBe("/home");
    }
  });
  it("refuses API and auth routes (dead ends after sign-in)", () => {
    expect(safeCallbackUrl("/api/ai-jobs/1")).toBe("/");
    expect(safeCallbackUrl("/auth/signin?signedOut=1")).toBe("/");
    expect(safeCallbackUrl("/auth/sign-out")).toBe("/");
  });
  it("falls back on empty input", () => {
    expect(safeCallbackUrl(undefined)).toBe("/");
    expect(safeCallbackUrl("", "/projects")).toBe("/projects");
  });
});

describe("signInHref", () => {
  it("round-trips the current page", () => {
    expect(signInHref("/admin/roles?x=1")).toBe("/auth/signin?callbackUrl=%2Fadmin%2Froles%3Fx%3D1");
  });
  it("drops an unsafe destination instead of carrying it", () => {
    expect(signInHref("/api/projects")).toBe("/auth/signin");
    expect(signInHref(null)).toBe("/auth/signin");
  });
});

describe("signedOutResponse", () => {
  it("answers /api/* with a 401 JSON error, never an HTML redirect", async () => {
    const res = signedOutResponse(req("https://hub.example/api/projects"));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: SESSION_ENDED_MESSAGE, signIn: "/auth/signin" });
  });
  it("answers a Server Action with Next's x-action-redirect back to this page", () => {
    const res = signedOutResponse(
      req("https://hub.example/admin/roles?q=1", { method: "POST", headers: { "next-action": "abc" } }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-action-redirect")).toBe("/auth/signin?callbackUrl=%2Fadmin%2Froles%3Fq%3D1;replace");
  });
  it("redirects a page to sign-in on its own origin, returning here afterwards", () => {
    const res = signedOutResponse(req("https://hub.example/projects?_rsc=z"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://hub.example/auth/signin?callbackUrl=%2Fprojects");
  });
  it("uses 303 for a non-GET page request so the browser follows with GET", () => {
    expect(signedOutResponse(req("https://hub.example/x", { method: "POST" })).status).toBe(303);
  });
  it("classifies requests", () => {
    const h = new Headers();
    expect(signedOutRequestKind("/api", h)).toBe("api");
    expect(signedOutRequestKind("/apis", h)).toBe("page");
    expect(signedOutRequestKind("/x", new Headers({ "next-action": "1" }))).toBe("action");
    expect(signedOutRequestKind("/api/export/deck", new Headers({ "sec-fetch-mode": "navigate" }))).toBe("page");
  });
});

describe("signOutRoute", () => {
  it("POST ends the session and 303s to the signed-out page, clearing the cache", async () => {
    const endSession = vi.fn().mockResolvedValue(undefined);
    const { POST } = signOutRoute({ endSession });
    const res = await POST(req("https://hub.example/auth/sign-out", { method: "POST", headers: { "sec-fetch-site": "same-origin" } }));
    expect(endSession).toHaveBeenCalledOnce();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(SIGNED_OUT_PATH);
    expect(res.headers.get("clear-site-data")).toBe('"cache"');
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("still clears the session cookies and lands signed out when endSession throws", async () => {
    const onError = vi.fn();
    const { POST } = signOutRoute({ endSession: () => Promise.reject(new Error("boom")), onError });
    const res = await POST(
      req("https://hub.example/auth/sign-out", {
        method: "POST",
        headers: { cookie: "pi.theme=dark; __Secure-authjs.session-token.0=a; __Secure-authjs.session-token.1=b" },
      }),
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(SIGNED_OUT_PATH);
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(/^__Secure-authjs\.session-token\.0=; Path=\/; Max-Age=0; .*Secure$/);
  });
  it("refuses a cross-site POST without signing out", async () => {
    const endSession = vi.fn();
    const { POST } = signOutRoute({ endSession });
    const res = await POST(req("https://hub.example/auth/sign-out", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }));
    expect(endSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("/");
  });
  it("GET never signs out; it goes to the sign-in page", () => {
    const endSession = vi.fn();
    const res = signOutRoute({ endSession }).GET();
    expect(endSession).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/auth/signin");
  });
});

describe("helpers", () => {
  it("finds Auth.js session cookie names, chunks included", () => {
    expect(sessionCookieNames("a=1; authjs.session-token=x; authjs.csrf-token=y")).toEqual(["authjs.session-token"]);
    expect(sessionCookieNames(null)).toEqual([]);
  });
  it("detects cross-site requests only when the browser says so", () => {
    expect(isCrossSiteRequest(new Headers({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossSiteRequest(new Headers({ "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isCrossSiteRequest(new Headers())).toBe(false);
  });
  it("derives Microsoft's end-session URL from the Entra issuer", () => {
    expect(entraSignOutUrl("https://login.microsoftonline.com/tid-123/v2.0")).toBe(
      "https://login.microsoftonline.com/tid-123/oauth2/v2.0/logout",
    );
    expect(entraSignOutUrl("https://login.microsoftonline.com/tid/v2.0", "https://hub.example/auth/signin?signedOut=1")).toBe(
      "https://login.microsoftonline.com/tid/oauth2/v2.0/logout?post_logout_redirect_uri=https%3A%2F%2Fhub.example%2Fauth%2Fsignin%3FsignedOut%3D1",
    );
    expect(entraSignOutUrl(undefined)).toBeNull();
    expect(entraSignOutUrl("not a url")).toBeNull();
  });
});
