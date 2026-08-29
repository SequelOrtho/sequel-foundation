// Unit tests for the identity-aware fixed-window rate-limit core
// (llm/rate-limit.ts). The load-bearing assertions: no raw identity ever
// appears in a stored key, both budgets are counted before either is judged,
// and a store failure declines the call (fail closed) instead of waving it by.

import { describe, expect, it, vi } from "vitest";
import {
  RATE_WINDOW_MS_DEFAULT,
  checkRateBudget,
  clientIpFrom,
  globalRateKey,
  identityRateKey,
  retryAfterSeconds,
  type FixedWindowStore,
  type RateWindowRow,
} from "../llm/rate-limit";

function memoryStore(): FixedWindowStore & { rows: Map<string, RateWindowRow> } {
  const rows = new Map<string, RateWindowRow>();
  return {
    rows,
    async bump(key, now, windowMs) {
      const row = rows.get(key);
      if (!row || now.getTime() - row.windowStart.getTime() >= windowMs) {
        const fresh = { count: 1, windowStart: now };
        rows.set(key, fresh);
        return fresh;
      }
      row.count += 1;
      return row;
    },
  };
}

describe("identityRateKey", () => {
  it("never embeds the raw identity (user id, email, or IP)", () => {
    for (const identity of ["203.0.113.7", "mike@sequelortho.com", "user-4471"]) {
      const key = identityRateKey("assist", identity);
      expect(key).not.toContain(identity);
      expect(key).not.toContain(identity.slice(0, 4));
      expect(key).toMatch(/^assist:i:[0-9a-f]{32}$/);
    }
  });

  it("is stable per identity and distinct across identities, routes, and salts", () => {
    const a = identityRateKey("assist", "user-1");
    expect(identityRateKey("assist", "user-1")).toBe(a);
    expect(identityRateKey("assist", "user-2")).not.toBe(a);
    expect(identityRateKey("other", "user-1")).not.toBe(a);
    expect(identityRateKey("assist", "user-1", "other-salt")).not.toBe(a);
  });
});

describe("clientIpFrom", () => {
  it("prefers the Netlify header, falls back to the first x-forwarded-for hop, then unknown", () => {
    expect(
      clientIpFrom(
        new Headers({ "x-nf-client-connection-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }),
      ),
    ).toBe("203.0.113.7");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});

describe("retryAfterSeconds", () => {
  it("counts down to rollover and never returns less than 1", () => {
    const start = new Date("2026-08-29T12:00:00Z");
    expect(retryAfterSeconds(start, new Date(start.getTime() + RATE_WINDOW_MS_DEFAULT - 30_000))).toBe(30);
    expect(retryAfterSeconds(start, new Date(start.getTime() + RATE_WINDOW_MS_DEFAULT + 5_000))).toBe(1);
  });
});

describe("checkRateBudget", () => {
  const budget = { route: "assist", identity: "user-1", perIdentity: 3, global: 5 };

  it("allows under budget, blocks past the per-identity limit with a Retry-After", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) {
      expect(await checkRateBudget(store, budget)).toEqual({ allowed: true });
    }
    const blocked = await checkRateBudget(store, budget);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("enforces the global ceiling across identities", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i++) {
      const out = await checkRateBudget(store, { ...budget, identity: `user-${i}` });
      expect(out.allowed).toBe(true);
    }
    const blocked = await checkRateBudget(store, { ...budget, identity: "user-99" });
    expect(blocked.allowed).toBe(false);
  });

  it("skips the global bucket when no global budget is set", async () => {
    const store = memoryStore();
    await checkRateBudget(store, { route: "assist", identity: "user-1", perIdentity: 3 });
    expect([...store.rows.keys()]).toEqual([identityRateKey("assist", "user-1")]);
  });

  it("counts both buckets even on a blocked request (no free retry-hammering)", async () => {
    const store = memoryStore();
    for (let i = 0; i < 6; i++) await checkRateBudget(store, budget);
    expect(store.rows.get(globalRateKey("assist"))!.count).toBe(6);
  });

  it("resets after the window rolls over", async () => {
    const store = memoryStore();
    const t0 = new Date("2026-08-29T12:00:00Z");
    for (let i = 0; i < 4; i++) await checkRateBudget(store, budget, t0);
    expect((await checkRateBudget(store, budget, t0)).allowed).toBe(false);
    const later = new Date(t0.getTime() + RATE_WINDOW_MS_DEFAULT + 1);
    expect(await checkRateBudget(store, budget, later)).toEqual({ allowed: true });
  });

  it("fails closed when the store errors", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: FixedWindowStore = {
      bump: () => Promise.reject(new Error("db down")),
    };
    const out = await checkRateBudget(broken, budget);
    expect(out.allowed).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
