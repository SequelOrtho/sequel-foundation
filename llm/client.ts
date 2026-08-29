import Anthropic from "@anthropic-ai/sdk";

// Single Anthropic client for the whole app. All LLM calls are isolated behind
// this one module so prompts, caching, and model selection live in one place.
// Tests mock this module — never the SDK internals.

// Model selection lives in ./models.ts (task-class → model configuration).
// Do NOT set temperature/top_p/top_k or budget_tokens on any current model — they 400.

// Non-streaming default per the claude-api skill guidance — keeps requests
// under the SDK's HTTP timeout while leaving room for structured output.
export const LLM_MAX_TOKENS = 16_000;

// Hard timeout budget + explicit retry policy — configuration, not code, like
// model selection. Without a budget, a degraded provider leaves the user on a
// perpetual spinner; with one, the call fails fast into the typed-error path
// (llmErrorEvent maps the SDK's timeout error to a clear 504) and the route
// can degrade to its deterministic fallback. 120s default: comfortably above
// the ~20s a healthy Opus 5 + adaptive-thinking call runs, far below the SDK's
// 10-minute default, which is not a budget anyone chose. Retries stay at the
// SDK's own default (2, with backoff, on 408/429/5xx/connection errors) but
// are pinned here explicitly so the policy is visible and overridable.
export const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 120_000);
export const LLM_MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 2);

let _client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example).",
      );
    }
    _client = new Anthropic({
      apiKey,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: LLM_MAX_RETRIES,
    });
  }
  return _client;
}
