import { describe, expect, it } from "vitest";
import {
  LAST_ACTIVE_KEY,
  endsAt,
  expiryWarningText,
  extendsSession,
  formatCountdown,
  readLastActive,
  warningAt,
  writeLastActive,
} from "../session/expiry";

const O = "https://hub.example";

describe("session expiry, pure", () => {
  it("counts same-origin fetches as activity, never static files or other sites", () => {
    expect(extendsSession({ name: `${O}/master?_rsc=1`, initiatorType: "fetch" }, O)).toBe(true);
    expect(extendsSession({ name: `${O}/api/assignments`, initiatorType: "xmlhttprequest" }, O)).toBe(true);
    expect(extendsSession({ name: `${O}/_next/static/chunks/a.js`, initiatorType: "fetch" }, O)).toBe(false);
    expect(extendsSession({ name: `${O}/_next/image?url=x`, initiatorType: "fetch" }, O)).toBe(false);
    expect(extendsSession({ name: `${O}/logo.png`, initiatorType: "img" }, O)).toBe(false);
    expect(extendsSession({ name: "https://fonts.gstatic.com/x", initiatorType: "fetch" }, O)).toBe(false);
    expect(extendsSession({ name: "not a url", initiatorType: "fetch" }, O)).toBe(false);
    // Of the /api/auth routes (outside the proxy) only the session read re-issues the cookie.
    expect(extendsSession({ name: `${O}/api/auth/session`, initiatorType: "fetch" }, O)).toBe(true);
    expect(extendsSession({ name: `${O}/api/auth/csrf`, initiatorType: "fetch" }, O)).toBe(false);
    expect(extendsSession({ name: `${O}/api/auth/providers`, initiatorType: "fetch" }, O)).toBe(false);
  });

  it("never counts a failed request as activity (owner ruling 2026-10-21, \"3-No\")", () => {
    const at = (responseStatus?: number) => ({ name: `${O}/api/poll`, initiatorType: "fetch", responseStatus });
    expect(extendsSession(at(200), O)).toBe(true);
    expect(extendsSession(at(304), O)).toBe(true);
    expect(extendsSession(at(401), O)).toBe(false);
    expect(extendsSession(at(403), O)).toBe(false);
    expect(extendsSession(at(500), O)).toBe(false);
    expect(extendsSession(at(0), O)).toBe(false);
    expect(extendsSession(at(undefined), O)).toBe(true); // a browser that doesn't report it
  });

  it("times the warning and the end from the latest request", () => {
    expect(endsAt(1_000, 600_000)).toBe(601_000);
    expect(warningAt(1_000, 600_000, 120_000)).toBe(481_000);
    expect(warningAt(1_000, 60_000, 120_000)).toBe(1_000); // never before the last request
  });

  it("formats the countdown and the sentence", () => {
    expect(formatCountdown(119_100)).toBe("2:00");
    expect(formatCountdown(59_000)).toBe("0:59");
    expect(formatCountdown(-5)).toBe("0:00");
    expect(expiryWarningText(120_000)).toMatch(/about 2 minutes\.$/);
    expect(expiryWarningText(20_000)).toMatch(/about 1 minute\.$/);
  });

  it("shares only a later time, and survives blocked storage", () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    writeLastActive(s, 500);
    writeLastActive(s, 300);
    expect(m.get(LAST_ACTIVE_KEY)).toBe("500");
    expect(readLastActive(s)).toBe(500);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readLastActive(blocked)).toBe(0);
    expect(() => writeLastActive(blocked, 1)).not.toThrow();
  });
});
