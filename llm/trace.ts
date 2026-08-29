import { randomUUID } from "node:crypto";
import { redactSecrets } from "./input-gate";

// Per-request LLM tracing — the Gate 5 (observability) floor from
// docs/AI-CRAFT.md §4: when a user reports a wrong answer, engineering needs a
// correlatable record of that request — sanitized input, served model, token
// counts, latency, outcome — not just a log line. The record is the
// requirement, not the vendor: this module builds the record and hands it to a
// caller-supplied sink; each app persists it with its own stack (a Prisma
// table on Postgres/Neon, a plain table via mssql on Azure SQL, or the
// console sink below as the zero-infrastructure floor).
//
// Privacy posture: inputPreview is secret-redacted (llm/input-gate) and
// truncated before it ever reaches a sink, but redaction is not de-identification
// — an app whose inputs carry PHI decides at the SINK whether to persist the
// preview or drop it and keep only inputChars. The helper never persists
// anything itself.

export type LlmTraceOutcome = "ok" | "error";

export type LlmTraceRecord = {
  feature: string; // which AI surface (e.g. "categorize", "portfolio-briefing")
  requestId: string; // caller-supplied correlation id, or a generated UUID
  at: string; // ISO timestamp of the call's start
  latencyMs: number;
  model: string | null; // the model that actually served (null if it never got that far)
  viaFallback: boolean;
  inputChars: number | null;
  inputPreview: string | null; // secret-redacted + truncated; sinks may drop it (PHI apps)
  inputTokens: number | null;
  outputTokens: number | null;
  outcome: LlmTraceOutcome;
  errorClass: string | null; // error CLASS name (+ status when present), never the message
};

export type LlmTraceSink = (record: LlmTraceRecord) => void | Promise<void>;

const PREVIEW_MAX_CHARS = 300;

// Secret-redacted, truncated view of the user input for the trace record.
export function sanitizedPreview(input: string, maxChars = PREVIEW_MAX_CHARS): string {
  const { text } = redactSecrets(input);
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

// Class-not-message error naming, per the repo's never-string-match-errors
// convention (and so a trace row can't smuggle user data via an exception).
function classOf(err: unknown): string {
  if (!(err instanceof Error)) return "unknown";
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? `${err.constructor.name} ${status}` : err.constructor.name;
}

export type LlmTrace = {
  requestId: string;
  succeed(opts: {
    model: string;
    viaFallback?: boolean;
    usage?: { input_tokens?: number; output_tokens?: number } | null;
  }): LlmTraceRecord;
  fail(err: unknown, opts?: { model?: string | null }): LlmTraceRecord;
};

// Start timing one model call. Call succeed()/fail() exactly once when it
// settles; hand the record to a sink via emitLlmTrace.
//
//   const trace = startLlmTrace({ feature: "categorize", input: narrative });
//   try {
//     const { result, model } = await withModelFallback(modelFor("prose"), ...);
//     emitLlmTrace(sink, trace.succeed({ model, usage: response.usage }));
//   } catch (err) {
//     emitLlmTrace(sink, trace.fail(err));
//     throw err;
//   }
export function startLlmTrace(meta: {
  feature: string;
  input?: string;
  requestId?: string;
}): LlmTrace {
  const startedAt = Date.now();
  const requestId = meta.requestId ?? randomUUID();
  const base = {
    feature: meta.feature,
    requestId,
    at: new Date(startedAt).toISOString(),
    inputChars: meta.input != null ? meta.input.length : null,
    inputPreview: meta.input != null ? sanitizedPreview(meta.input) : null,
  };
  return {
    requestId,
    succeed(opts) {
      return {
        ...base,
        latencyMs: Date.now() - startedAt,
        model: opts.model,
        viaFallback: opts.viaFallback ?? false,
        inputTokens: opts.usage?.input_tokens ?? null,
        outputTokens: opts.usage?.output_tokens ?? null,
        outcome: "ok",
        errorClass: null,
      };
    },
    fail(err, opts) {
      return {
        ...base,
        latencyMs: Date.now() - startedAt,
        model: opts?.model ?? null,
        viaFallback: false,
        inputTokens: null,
        outputTokens: null,
        outcome: "error",
        errorClass: classOf(err),
      };
    },
  };
}

// Fire-and-forget delivery: a broken sink must never break the feature, so
// sync throws are swallowed and async rejections are caught. Tracing is
// telemetry — the user's answer never waits on it and never fails for it.
export function emitLlmTrace(sink: LlmTraceSink, record: LlmTraceRecord): void {
  try {
    void Promise.resolve(sink(record)).catch((err) => {
      console.error("[llm-trace] sink failed", err);
    });
  } catch (err) {
    console.error("[llm-trace] sink failed", err);
  }
}

// Zero-infrastructure sink: one structured line per request in production
// logs. Enough to correlate a complaint with a request until an app wires a
// database sink. Suppressed under NODE_ENV=test like the served-model line.
export const consoleTraceSink: LlmTraceSink = (record) => {
  if (process.env.NODE_ENV === "test") return;
  console.info(`[llm-trace] ${JSON.stringify(record)}`);
};
