import Anthropic from "@anthropic-ai/sdk";

// Model selection is CONFIGURATION, not code. Call sites declare a task class
// and read the model from here, so adopting a new model is an env-var change
// (or a one-line default bump below) — never a call-site rewrite. This is the
// canonical copy for all Sequel apps (formerly twinned by hand between
// project-insights and Sequel_Ortho).
//
// Both task classes run on Claude Opus 5. The split is kept because it is the
// seam that makes per-workload retargeting an env change (see the env vars
// below) rather than a call-site edit — not because the two currently differ:
//  - "prose"        → narrative/summary text over existing content
//                     (briefings, forecasts, summaries, assists, synthesis)
//  - "presentation" → content that lands in decks/graphics
//                     (deck commentary, brand-diagram generation)
//
// If the configured model is unavailable on the org — 404 (unknown id / no
// access), 403 (key lacks the model), or 400 (e.g. Fable 5 without 30-day
// data retention, if an env override selects it) — `withModelFallback` retries
// the call once on the fallback model. Opus 4.8 stays the fallback because it
// is the recommended rescue for Opus 5 and carries no retention requirement;
// it is a rescue target only, never what a healthy call is issued on.
//
// All three accept the request shapes used in lib/llm/ (adaptive thinking or
// omitted, no sampling params, output_config.effort). Note Opus 5 thinks by
// default — omitting `thinking` runs adaptive — and an explicit
// `{type: "disabled"}` is rejected above effort "high", so leave thinking
// adaptive/omitted rather than disabling it.

export type LlmTaskClass = "prose" | "presentation";

export const LLM_MODEL_PROSE = process.env.LLM_MODEL_PROSE ?? "claude-opus-5";
export const LLM_MODEL_PRESENTATION =
  process.env.LLM_MODEL_PRESENTATION ?? "claude-opus-5";
export const LLM_FALLBACK_MODEL =
  process.env.LLM_MODEL_FALLBACK ?? "claude-opus-4-8";

export function modelFor(task: LlmTaskClass): string {
  return task === "presentation" ? LLM_MODEL_PRESENTATION : LLM_MODEL_PROSE;
}

// Typed-exception check per the repo convention (never string-match messages).
// BadRequestError is included because model unavailability can surface as a 400
// (e.g. an env override selecting Fable 5 on a non-retention org); a genuinely
// malformed request costs one extra attempt and then surfaces the same error
// from the fallback call.
function isModelUnavailableError(err: unknown): boolean {
  return (
    err instanceof Anthropic.NotFoundError ||
    err instanceof Anthropic.PermissionDeniedError ||
    err instanceof Anthropic.BadRequestError
  );
}

export async function withModelFallback<T>(
  primaryModel: string,
  call: (model: string) => Promise<T>,
): Promise<{ result: T; model: string }> {
  try {
    return { result: await call(primaryModel), model: primaryModel };
  } catch (err) {
    if (primaryModel !== LLM_FALLBACK_MODEL && isModelUnavailableError(err)) {
      return {
        result: await call(LLM_FALLBACK_MODEL),
        model: LLM_FALLBACK_MODEL,
      };
    }
    throw err;
  }
}
