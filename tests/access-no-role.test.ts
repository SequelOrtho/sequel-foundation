// Unit tests for the no-role sign-in policy (access/no-role.ts). The
// load-bearing assertions: the wording is the owner's verbatim, a pass can't
// be forged or replayed past its TTL, the admin email goes out at most once
// per interval, and a failed send releases the claim so a retry works.

import { describe, expect, it, vi } from "vitest";
import {
  ACCESS_REQUEST_NOTIFY_INTERVAL_MS,
  NO_ROLE_PASS_TTL_MS,
  accessRequestEmail,
  isNoRolePath,
  noRoleMessage,
  noRoleReasonFrom,
  noRoleRedirect,
  noRoleStatus,
  pendingAccessRequests,
  readNoRolePass,
  recordNoRoleAttempt,
  requestAccess,
  requestOutcomeFrom,
  signNoRolePass,
  uniqueEmails,
  type AccessRequestRow,
  type AccessRequestStore,
} from "../access/no-role";

const SECRET = "test-secret-not-real";
const T0 = new Date("2026-10-13T15:00:00Z");

function memoryStore(): AccessRequestStore & { rows: Map<string, AccessRequestRow> } {
  const rows = new Map<string, AccessRequestRow>();
  return {
    rows,
    async recordAttempt({ email, name, at }) {
      const r = rows.get(email);
      if (r) Object.assign(r, { attempts: r.attempts + 1, lastAttemptAt: at, name: name ?? r.name });
      else rows.set(email, { email, name, attempts: 1, firstAttemptAt: at, lastAttemptAt: at, requestedAt: null, notifiedAt: null });
    },
    async claimRequest({ email, name, now, notifyAfter }) {
      let r = rows.get(email);
      if (!r) {
        r = { email, name, attempts: 0, firstAttemptAt: now, lastAttemptAt: now, requestedAt: null, notifiedAt: null };
        rows.set(email, r);
      }
      r.requestedAt = now;
      if (r.notifiedAt && r.notifiedAt > notifyAfter) return false;
      r.notifiedAt = now;
      return true;
    },
    async releaseRequest(email, notifiedAt) {
      const r = rows.get(email);
      if (r && r.notifiedAt?.getTime() === notifiedAt.getTime()) r.notifiedAt = null;
    },
  };
}

describe("noRoleMessage", () => {
  it("is the owner's wording with the hub name substituted", () => {
    expect(noRoleMessage("Sequel Scheduler Hub")).toBe(
      "Your account doesn’t have a role in Sequel Scheduler Hub yet. Contact the System Administrator to request access, then sign in again.",
    );
  });
});

describe("status and path", () => {
  it("is 403 for no role and 503 when the lookup failed", () => {
    expect(noRoleStatus("no-role")).toBe(403);
    expect(noRoleStatus("unavailable")).toBe(503);
    expect(noRoleReasonFrom("unavailable")).toBe("unavailable");
    expect(noRoleReasonFrom(null)).toBe("no-role");
    expect(noRoleReasonFrom("anything")).toBe("no-role");
  });

  it("matches the page only, not its request sub-route", () => {
    expect(isNoRolePath("/auth/no-access")).toBe(true);
    expect(isNoRolePath("/auth/no-access/")).toBe(true);
    expect(isNoRolePath("/auth/no-access/request")).toBe(false);
    expect(isNoRolePath("/auth/signin")).toBe(false);
  });
});

describe("the pass", () => {
  it("round-trips the identity, lower-casing the email", () => {
    const pass = signNoRolePass({ email: " Pat.Doe@SequelOrtho.com ", name: "Pat Doe" }, SECRET, T0);
    expect(readNoRolePass(pass, SECRET, T0)).toEqual({ email: "pat.doe@sequelortho.com", name: "Pat Doe", at: T0 });
  });

  it("rejects another secret, a tampered body, and garbage", () => {
    const pass = signNoRolePass({ email: "pat@x.com" }, SECRET, T0);
    expect(readNoRolePass(pass, "other-secret", T0)).toBeNull();
    const [, sig] = pass.split(".");
    const forged = `${Buffer.from(JSON.stringify({ e: "boss@x.com", n: null, t: T0.getTime() })).toString("base64url")}.${sig}`;
    expect(readNoRolePass(forged, SECRET, T0)).toBeNull();
    for (const bad of ["", "abc", ".", "a.b", null, undefined]) expect(readNoRolePass(bad, SECRET, T0)).toBeNull();
    expect(readNoRolePass(pass, undefined, T0)).toBeNull();
  });

  it("expires after the TTL and is never valid from the future", () => {
    const pass = signNoRolePass({ email: "pat@x.com" }, SECRET, T0);
    expect(readNoRolePass(pass, SECRET, new Date(T0.getTime() + NO_ROLE_PASS_TTL_MS))).not.toBeNull();
    expect(readNoRolePass(pass, SECRET, new Date(T0.getTime() + NO_ROLE_PASS_TTL_MS + 1))).toBeNull();
    expect(readNoRolePass(pass, SECRET, new Date(T0.getTime() - 1000))).toBeNull();
  });

  it("refuses to sign without a secret", () => {
    expect(() => signNoRolePass({ email: "pat@x.com" }, "", T0)).toThrow(/secret/);
  });

  it("redirects to the page with the pass URL-encoded", () => {
    const pass = signNoRolePass({ email: "pat@x.com" }, SECRET, T0);
    const url = new URL(noRoleRedirect(pass), "https://hub.example");
    expect(url.pathname).toBe("/auth/no-access");
    expect(url.searchParams.get("t")).toBe(pass);
  });
});

describe("recordNoRoleAttempt", () => {
  it("logs and counts attempts per person", async () => {
    const store = memoryStore();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await recordNoRoleAttempt(store, { email: "Pat@X.com", name: "Pat", at: T0 }, "Sequel Scheduler Hub");
    await recordNoRoleAttempt(store, { email: "pat@x.com", at: new Date(T0.getTime() + 60_000) }, "Sequel Scheduler Hub");
    expect(store.rows.get("pat@x.com")).toMatchObject({ attempts: 2, name: "Pat", firstAttemptAt: T0 });
    expect(warn.mock.calls[0]![0]).toContain('app="Sequel Scheduler Hub" email="pat@x.com"');
    warn.mockRestore();
  });

  it("never throws when the store is down", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = { ...memoryStore(), recordAttempt: async () => { throw new Error("db down"); } };
    await expect(recordNoRoleAttempt(store, { email: "pat@x.com" }, "Hub")).resolves.toBeUndefined();
    err.mockRestore();
    warn.mockRestore();
  });
});

describe("requestAccess", () => {
  const pass = { email: "pat@x.com", name: "Pat Doe", at: T0 };
  const quiet = () => {
    const a = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = vi.spyOn(console, "warn").mockImplementation(() => {});
    return () => { a.mockRestore(); b.mockRestore(); };
  };

  it("emails every admin once, in one message, then throttles for the interval", async () => {
    const store = memoryStore();
    const send = vi.fn(async (_mail: { to: string[] }) => "sent" as const);
    const adminEmails = async () => ["B@x.com", "a@x.com", "b@x.com"];
    const base = { store, pass, appName: "Sequel Scheduler Hub", adminEmails, send, reviewUrl: "https://hub.example/admin/users" };

    expect(await requestAccess({ ...base, now: T0 })).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ to: ["a@x.com", "b@x.com"] });

    const later = new Date(T0.getTime() + ACCESS_REQUEST_NOTIFY_INTERVAL_MS - 1);
    expect(await requestAccess({ ...base, now: later })).toBe("already");
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.rows.get("pat@x.com")!.requestedAt).toEqual(later);

    const nextDay = new Date(T0.getTime() + ACCESS_REQUEST_NOTIFY_INTERVAL_MS + 1);
    expect(await requestAccess({ ...base, now: nextDay })).toBe("sent");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("is 'recorded' when mail is off or there is no admin address", async () => {
    const restore = quiet();
    expect(
      await requestAccess({ store: memoryStore(), pass, appName: "Hub", adminEmails: async () => ["a@x.com"], send: async () => "logged", now: T0 }),
    ).toBe("recorded");
    const send = vi.fn(async () => "sent" as const);
    expect(await requestAccess({ store: memoryStore(), pass, appName: "Hub", adminEmails: async () => [], send, now: T0 })).toBe("recorded");
    expect(send).not.toHaveBeenCalled();
    restore();
  });

  it("releases the claim when the send fails, so a retry emails", async () => {
    const restore = quiet();
    const store = memoryStore();
    const adminEmails = async () => ["a@x.com"];
    expect(await requestAccess({ store, pass, appName: "Hub", adminEmails, send: async () => "failed", now: T0 })).toBe("failed");
    expect(store.rows.get("pat@x.com")!.notifiedAt).toBeNull();
    const thrower = async () => { throw new Error("graph 500"); };
    expect(await requestAccess({ store, pass, appName: "Hub", adminEmails, send: thrower, now: T0 })).toBe("failed");
    expect(await requestAccess({ store, pass, appName: "Hub", adminEmails, send: async () => "sent", now: T0 })).toBe("sent");
    restore();
  });

  it("fails without throwing when the store or admin lookup is down", async () => {
    const restore = quiet();
    const broken = { ...memoryStore(), claimRequest: async () => { throw new Error("db down"); } };
    expect(await requestAccess({ store: broken, pass, appName: "Hub", adminEmails: async () => ["a@x.com"], send: async () => "sent", now: T0 })).toBe("failed");
    const store = memoryStore();
    expect(
      await requestAccess({ store, pass, appName: "Hub", adminEmails: async () => { throw new Error("db down"); }, send: async () => "sent", now: T0 }),
    ).toBe("failed");
    expect(store.rows.get("pat@x.com")!.notifiedAt).toBeNull();
    restore();
  });
});

describe("helpers", () => {
  it("uniqueEmails lower-cases, dedupes, drops blanks and non-addresses", () => {
    expect(uniqueEmails(["B@x.com", " b@x.com ", "", null, undefined, "nope", "a@x.com"])).toEqual(["a@x.com", "b@x.com"]);
  });

  it("requestOutcomeFrom accepts only known outcomes", () => {
    for (const o of ["sent", "recorded", "already", "failed", "expired"]) expect(requestOutcomeFrom(o)).toBe(o);
    expect(requestOutcomeFrom("hacked")).toBeNull();
    expect(requestOutcomeFrom(null)).toBeNull();
  });

  it("pendingAccessRequests drops people who now have a role, newest first", () => {
    const rows = [
      { email: "old@x.com", lastAttemptAt: new Date("2026-10-01") },
      { email: "granted@x.com", lastAttemptAt: new Date("2026-10-12") },
      { email: "new@x.com", lastAttemptAt: new Date("2026-10-10") },
    ];
    expect(pendingAccessRequests(rows, (e) => e === "granted@x.com").map((r) => r.email)).toEqual(["new@x.com", "old@x.com"]);
  });
});

describe("accessRequestEmail", () => {
  it("names the person, the app, a Central time and the review link", () => {
    const m = accessRequestEmail({ appName: "Sequel Incident & Event Hub", email: "pat@x.com", name: "Pat <Doe>", at: T0, reviewUrl: "https://hub.example/admin" });
    expect(m.subject).toBe("Access request: Pat <Doe> — Sequel Incident & Event Hub");
    expect(m.text).toContain("Pat <Doe> (pat@x.com) signed in to Sequel Incident & Event Hub");
    expect(m.text).toContain("CDT");
    expect(m.text).toContain("https://hub.example/admin");
    expect(m.html).toContain("Pat &lt;Doe&gt;");
    expect(m.html).toContain("Sequel Incident &amp; Event Hub");
    expect(m.html).not.toContain("<Doe>");
  });

  it("falls back to the email when there is no name or review link", () => {
    const m = accessRequestEmail({ appName: "Hub", email: "pat@x.com", name: null, at: T0 });
    expect(m.subject).toBe("Access request: pat@x.com — Hub");
    expect(m.text).toContain("assign them a role in Hub");
  });
});
