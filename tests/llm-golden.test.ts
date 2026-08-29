// Unit tests for the golden-set runner (llm/golden.ts) — the Gate 2 scaffold.
// Locks: every case is always covered (a throwing run is a recorded failure,
// never an aborted set), failed checks are named, concurrency is bounded, and
// the assert/format pair behaves as a release script expects.

import { describe, expect, it } from "vitest";
import {
  assertGoldenPass,
  fieldEquals,
  fieldMatches,
  fieldOneOf,
  formatGoldenReport,
  runGoldenSet,
  type GoldenCase,
} from "../llm/golden";

type Out = { classification: string; harm: string; rationale: string };

const CASES: Array<GoldenCase<string, Out>> = [
  {
    id: "near-miss-01",
    input: "wrong tray opened but caught before use",
    checks: [fieldEquals<Out>("classification", "NEAR_MISS"), fieldEquals<Out>("harm", "NO_HARM")],
  },
  {
    id: "fall-01",
    input: "patient slipped near bay 3",
    checks: [
      fieldEquals<Out>("classification", "INCIDENT"),
      fieldOneOf<Out>("harm", ["MILD", "UNKNOWN"]),
      fieldMatches<Out>("rationale", /fall|slip/i),
    ],
  },
];

const perfectRun = async (input: string): Promise<Out> =>
  input.includes("caught")
    ? { classification: "NEAR_MISS", harm: "NO_HARM", rationale: "caught before reaching the patient" }
    : { classification: "INCIDENT", harm: "UNKNOWN", rationale: "a slip and fall occurred" };

describe("runGoldenSet", () => {
  it("passes a clean set", async () => {
    const report = await runGoldenSet(CASES, perfectRun);
    expect(report).toMatchObject({ total: 2, passed: 2, failures: [] });
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("names exactly the checks that failed", async () => {
    const report = await runGoldenSet(CASES, async () => ({
      classification: "INCIDENT",
      harm: "UNKNOWN",
      rationale: "a slip occurred",
    }));
    expect(report.passed).toBe(1);
    expect(report.failures).toEqual([
      {
        id: "near-miss-01",
        failedChecks: ['classification = "NEAR_MISS"', 'harm = "NO_HARM"'],
        error: null,
      },
    ]);
  });

  it("records a throwing run as a failure and still covers every case", async () => {
    class RunBoom extends Error {}
    const report = await runGoldenSet(CASES, async (input) => {
      if (input.includes("slipped")) throw new RunBoom("api down");
      return perfectRun(input);
    });
    expect(report.total).toBe(2);
    expect(report.failures).toEqual([{ id: "fall-01", failedChecks: [], error: "RunBoom" }]);
  });

  it("bounds concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `case-${i}`,
      input: "x",
      checks: [] as Array<never>,
    }));
    await runGoldenSet(
      many,
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return {};
      },
      { concurrency: 2 },
    );
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("formatGoldenReport / assertGoldenPass", () => {
  it("summarizes failures for humans and throws for scripts", async () => {
    const report = await runGoldenSet(CASES, async () => ({
      classification: "INCIDENT",
      harm: "UNKNOWN",
      rationale: "a slip occurred",
    }));
    const text = formatGoldenReport("categorize", report);
    expect(text).toContain("[golden:categorize] 1/2 passed");
    expect(text).toContain("✗ near-miss-01");
    expect(() => assertGoldenPass(report)).toThrow(/near-miss-01/);
  });

  it("stays quiet on a passing report", async () => {
    const report = await runGoldenSet(CASES, perfectRun);
    expect(formatGoldenReport("categorize", report)).not.toContain("✗");
    expect(() => assertGoldenPass(report)).not.toThrow();
  });
});
