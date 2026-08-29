// Output-contract hardening for LLM responses. Foundation models are
// probabilistic text generators: the same prompt that returned clean JSON in
// the demo will eventually prepend "Sure, here is your JSON:", wrap the payload
// in a ```json fence, or come back truncated. A naive JSON.parse at the call
// site turns each of those into an unhandled exception and a blank panel.
//
// The contract layer: extract the JSON payload from whatever surrounds it,
// parse it, and validate it with a caller-supplied type guard — so every
// failure mode becomes one typed LlmOutputError that llmErrorEvent maps to a
// safe, deterministic user-facing fallback instead of a crash. Callers never
// JSON.parse model text directly; they call parseLlmJson with their guard.

export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmOutputError";
  }
}

// Pull the first complete JSON value (object or array) out of model output,
// tolerating conversational preamble, markdown code fences, and trailing
// remarks. Throws LlmOutputError when no JSON value is present or the value
// never closes (a truncated generation — max_tokens hit mid-payload).
export function extractJsonPayload(text: string): string {
  // Prefer a fenced block when present — the fence is the model telling us
  // where the payload is. Fall back to scanning the whole text.
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(text);
  const candidate = fence ? fence[1] : text;

  const start = candidate.search(/[{[]/);
  if (start === -1) {
    throw new LlmOutputError("Model output contains no JSON value.");
  }

  // Balanced scan honoring string literals, so braces inside string values
  // (or apostrophes/quotes in prose fields) can't derail the depth count.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  throw new LlmOutputError("Model output ends before the JSON value closes (truncated generation).");
}

// Extract + parse + validate in one step. The guard is the schema: a plain
// type predicate the caller owns (domain shapes stay in each app, per the
// repo's domain-free rule). Guard rejection is an output-contract failure —
// same typed error, same safe fallback — never a crash in render code.
export function parseLlmJson<T>(text: string, guard: (value: unknown) => value is T): T {
  const payload = extractJsonPayload(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new LlmOutputError("Model output is not valid JSON.");
  }
  if (!guard(parsed)) {
    throw new LlmOutputError("Model output does not match the expected shape.");
  }
  return parsed;
}
