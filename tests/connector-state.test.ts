import { describe, expect, it } from "vitest";
import { accessExpiry, expiresInSeconds, grantEndsAt, grantState, isGrantLive, refreshExpiry, type GrantDates } from "../connector";

const base = new Date("2026-11-05T00:00:00Z").getTime();
const d = (h: number | null) => (h == null ? null : new Date(base + h * 3600_000));

// A small deterministic generator, so the property check is repeatable.
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

describe("grant state", () => {
  it("isGrantLive agrees with grantState and grantEndsAt over generated grants", () => {
    const r = rng(7);
    const pick = () => (r() < 0.3 ? null : Math.round(r() * 400 - 50));
    for (let i = 0; i < 2000; i++) {
      const g: GrantDates = {
        revokedAt: r() < 0.2 ? d(pick() ?? 0) : null,
        codeUsedAt: null,
        codeExpiresAt: d(Math.round(r() * 10)) as Date,
        refreshExpiresAt: null,
        absoluteExpiresAt: d(Math.round(r() * 400)) as Date,
      };
      // A swapped code always comes with a refresh expiry (the token endpoint writes both).
      if (r() < 0.6) {
        g.codeUsedAt = d(Math.round(r() * 5));
        g.refreshExpiresAt = d(Math.round(r() * 400 - 50));
      }
      const now = d(Math.round(r() * 450 - 25)) as Date;
      expect(isGrantLive(g, now)).toBe(grantState(g, now) !== "ended");
      if (!g.revokedAt) expect(isGrantLive(g, now)).toBe(now < grantEndsAt(g));
    }
  });
  it("waits for a code, then lives on the refresh", () => {
    const g: GrantDates = { revokedAt: null, codeUsedAt: null, codeExpiresAt: d(1)!, refreshExpiresAt: null, absoluteExpiresAt: d(300)! };
    expect(grantState(g, d(0)!)).toBe("waiting");
    expect(grantState(g, d(2)!)).toBe("ended");
    const used = { ...g, codeUsedAt: d(0), refreshExpiresAt: d(100) };
    expect(grantState(used, d(50)!)).toBe("active");
    expect(grantState(used, d(101)!)).toBe("ended");
    expect(grantState({ ...used, revokedAt: d(10) }, d(5)!)).toBe("ended");
  });
  it("caps every expiry at the absolute limit", () => {
    expect(refreshExpiry(d(0)!, d(10)!, 100 * 3600_000)).toEqual(d(10));
    expect(accessExpiry(d(0)!, d(10)!, 3600_000)).toEqual(d(1));
    expect(expiresInSeconds(d(0)!, d(0)!)).toBe(1);
    expect(expiresInSeconds(d(0)!, d(1)!)).toBe(3600);
  });
});
