import Anthropic from "@anthropic-ai/sdk";
import { LlmOutputError } from "./output";

// Shared mapping of typed Anthropic SDK exceptions to a {status, error} pair for
// the LLM-backed routes. Never string-match error messages — map the typed
// exception classes. Unknown errors map to a generic 500: the routes stream
// their responses (see lib/llm/stream.ts), so by the time the LLM call throws
// the HTTP status is already committed to 200 — we cannot re-throw to surface a
// 500, so we log and emit a generic error event instead.
export function llmErrorEvent(err: unknown): { status: number; error: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 503, error: "AI service is not configured (missing or invalid API key)." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, error: "AI service is rate-limited. Try again shortly." };
  }
  // 403 from Anthropic = the key is recognized but lacks permission for the
  // resource (commonly: no access to this model, or a restricted/wrong-workspace
  // key). Distinct from a missing/invalid key (401 → AuthenticationError above),
  // so name the likely cause instead of a bare "AI service error (403)".
  if (err instanceof Anthropic.PermissionDeniedError) {
    return {
      status: 403,
      error: "AI service access denied — the configured API key lacks permission for this model. Check ANTHROPIC_API_KEY.",
    };
  }
  // The hard timeout budget fired (LLM_TIMEOUT_MS in llm/client.ts). Checked
  // before the generic APIError branch — it's a subclass with no status, and
  // "AI service error (unknown)" hides the one thing the user can act on.
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return {
      status: 504,
      error: "The AI service did not respond within its time budget. Try again — if it persists, the provider is degraded.",
    };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, error: `AI service error (${err.status ?? "unknown"}).` };
  }
  // The model answered, but the payload failed the output contract
  // (llm/output.ts): preamble-wrapped, truncated, or shape-invalid JSON.
  // Deterministic fallback message instead of a crashed panel; retrying is
  // legitimate — generation is probabilistic and usually succeeds next call.
  if (err instanceof LlmOutputError) {
    return {
      status: 502,
      error: "The AI response did not match the expected format. Try again.",
    };
  }
  if (err instanceof Error && err.message.includes("ANTHROPIC_API_KEY")) {
    return { status: 503, error: "AI service is not configured (missing API key)." };
  }
  console.error("Unexpected LLM error:", err);
  return { status: 500, error: "Unexpected error generating the AI response." };
}
