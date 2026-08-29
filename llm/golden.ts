// Golden-set runner — the Gate 2 (quality) scaffold from docs/AI-CRAFT.md §4.
// "We tried a few prompts and it looked fine" is the vibes void: a prompt edit
// or model bump can fix one case and quietly break twenty-five others. The
// cure is a set of realistic cases with expected PROPERTIES (not exact
// wording — generation is probabilistic; assert what must be true, not what
// was once said), run before prompt/model changes ship.
//
// The foundation owns the runner; each app owns only its cases and the run
// function (usually the same lib/llm function production calls). Cases live
// as typed TS modules next to the feature, and a small script (`npm run
// golden`) executes the set pre-release — real model calls cost real money,
// so golden runs are a deliberate pre-ship step, not an every-commit CI job,
// until a team decides otherwise.
//
//   const report = await runGoldenSet(CASES, (input) => categorizeNarrative(input));
//   console.log(formatGoldenReport("categorize", report));
//   assertGoldenPass(report); // non-zero exit for the release script

export type GoldenCheck<O> = {
  name: string; // what property this asserts, e.g. "classification is NEAR_MISS"
  pass: (output: O) => boolean;
};

export type GoldenCase<I, O> = {
  id: string; // stable case id, e.g. "fall-no-harm-01"
  input: I;
  checks: Array<GoldenCheck<O>>;
};

export type GoldenFailure = {
  id: string;
  failedChecks: string[]; // names of checks that returned false
  error: string | null; // error class when the run itself threw
};

export type GoldenReport = {
  total: number;
  passed: number;
  failures: GoldenFailure[];
  durationMs: number;
};

// Common check builders — enough for most classification-style sets; anything
// richer is a plain GoldenCheck with its own predicate.
export function fieldEquals<O>(key: keyof O & string, value: unknown): GoldenCheck<O> {
  return { name: `${key} = ${JSON.stringify(value)}`, pass: (o) => o[key] === value };
}

export function fieldOneOf<O>(key: keyof O & string, values: readonly unknown[]): GoldenCheck<O> {
  return {
    name: `${key} in ${JSON.stringify(values)}`,
    pass: (o) => values.includes(o[key]),
  };
}

export function fieldMatches<O>(key: keyof O & string, re: RegExp): GoldenCheck<O> {
  return {
    name: `${key} matches ${re}`,
    pass: (o) => typeof o[key] === "string" && re.test(o[key] as string),
  };
}

function errorClass(err: unknown): string {
  return err instanceof Error ? err.constructor.name : "unknown";
}

// Run every case with bounded concurrency (default 2 — gentle on rate limits;
// golden runs share the production budget). A throwing run is a failure with
// its error class recorded, never an aborted set — the report always covers
// every case.
export async function runGoldenSet<I, O>(
  cases: ReadonlyArray<GoldenCase<I, O>>,
  run: (input: I, c: GoldenCase<I, O>) => Promise<O>,
  opts?: { concurrency?: number },
): Promise<GoldenReport> {
  const started = Date.now();
  const concurrency = Math.max(1, opts?.concurrency ?? 2);
  const failures: GoldenFailure[] = [];
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= cases.length) return;
      const c = cases[index];
      try {
        const output = await run(c.input, c);
        const failed = c.checks.filter((check) => !check.pass(output)).map((check) => check.name);
        if (failed.length > 0) failures.push({ id: c.id, failedChecks: failed, error: null });
      } catch (err) {
        failures.push({ id: c.id, failedChecks: [], error: errorClass(err) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));

  return {
    total: cases.length,
    passed: cases.length - failures.length,
    failures: failures.sort((a, b) => a.id.localeCompare(b.id)),
    durationMs: Date.now() - started,
  };
}

// Human summary for the release script's output.
export function formatGoldenReport(label: string, report: GoldenReport): string {
  const head = `[golden:${label}] ${report.passed}/${report.total} passed in ${report.durationMs}ms`;
  if (report.failures.length === 0) return head;
  const lines = report.failures.map((f) =>
    f.error
      ? `  ✗ ${f.id} — run threw ${f.error}`
      : `  ✗ ${f.id} — failed: ${f.failedChecks.join("; ")}`,
  );
  return [head, ...lines].join("\n");
}

// Throw (→ non-zero exit) when anything failed, naming the cases.
export function assertGoldenPass(report: GoldenReport): void {
  if (report.failures.length === 0) return;
  const ids = report.failures.map((f) => f.id).join(", ");
  throw new Error(`Golden set failed: ${report.failures.length}/${report.total} cases (${ids})`);
}
