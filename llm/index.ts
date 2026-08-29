// Sequel LLM plumbing — the shared, domain-free layer under every AI feature.
// Prompts, schemas, and routes stay in each app; this is the client seam,
// model-selection configuration, typed error mapping, the deterministic
// input gate and output contract that bracket every model call (see
// docs/AI-CRAFT.md), and the SSE streaming pattern that survives serverless
// platform timeouts.
export { getClient, LLM_MAX_TOKENS, LLM_TIMEOUT_MS, LLM_MAX_RETRIES } from "./client";
export {
  modelFor,
  withModelFallback,
  LLM_MODEL_PROSE,
  LLM_MODEL_PRESENTATION,
  LLM_FALLBACK_MODEL,
} from "./models";
export type { LlmTaskClass } from "./models";
export { llmErrorEvent } from "./http";
export { extractJsonPayload, parseLlmJson, LlmOutputError } from "./output";
export { gateLlmInput, redactSecrets, LLM_INPUT_MAX_CHARS } from "./input-gate";
export type { LlmInputGateResult, LlmRedactionKind } from "./input-gate";
export { startLlmTrace, emitLlmTrace, sanitizedPreview, consoleTraceSink } from "./trace";
export type { LlmTrace, LlmTraceRecord, LlmTraceSink, LlmTraceOutcome } from "./trace";
export {
  checkRateBudget,
  clientIpFrom,
  identityRateKey,
  globalRateKey,
  retryAfterSeconds,
  RATE_WINDOW_MS_DEFAULT,
} from "./rate-limit";
export type { FixedWindowStore, RateBudget, RateDecision, RateWindowRow } from "./rate-limit";
export {
  runGoldenSet,
  formatGoldenReport,
  assertGoldenPass,
  fieldEquals,
  fieldOneOf,
  fieldMatches,
} from "./golden";
export type { GoldenCase, GoldenCheck, GoldenFailure, GoldenReport } from "./golden";
export { streamJob } from "./stream";
export type { LlmStreamEvent } from "./stream";
export { consumeLlmStream, LlmStreamError } from "./stream-client";
