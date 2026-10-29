// The family model lock (AI-CRAFT §1 "Model selection" and §2.6 rule 5; owner
// ruling 2026-10-29, Mike: "we need to lock all now"). The Anthropic account
// runs with zero data retention and some hubs hold patient data, so every AI
// call in every hub may only ever reach a model eligible for zero data
// retention. Fable 5 needs 30-day retention and must never be reachable.
//
// The list lives in code, here, and nowhere else: LLM_MODEL_PROSE /
// LLM_MODEL_PRESENTATION / LLM_MODEL_FALLBACK choose BETWEEN approved models
// and can never add one. `withModelFallback` (llm/models.ts), the one funnel
// every call goes through, refuses an unlisted primary before calling it and
// never tries an unlisted fallback. Changing the list is a foundation release.
//
// Pure and client-safe (no SDK import): a panel reads the message from here to
// show it as written.

/** The only models any Sequel AI call may reach (exact ids). */
export const APPROVED_MODELS = ["claude-opus-5", "claude-opus-4-8"] as const;
export type ApprovedModel = (typeof APPROVED_MODELS)[number];

/** True when `model` is on the family list (exact id match). */
export function isApprovedModel(model: string): model is ApprovedModel {
  return (APPROVED_MODELS as readonly string[]).includes(model);
}

/** The status the refusal travels with (a stream's error event, a route's early answer). */
export const MODEL_NOT_APPROVED_STATUS = 503;

/** What a person sees when a feature's configured model isn't on the list. */
export const MODEL_NOT_APPROVED_MESSAGE =
  "This AI feature is switched off on this site: its AI model isn't one approved for patient data. Contact the System Administrator.";

/**
 * Thrown by `withModelFallback` (before `call` runs) when the configured model
 * is not on APPROVED_MODELS. `llmErrorEvent` maps it to
 * `{ status: 503, error: <its message> }`. It carries the model id for the
 * server's own use; the message never names it.
 */
export class ModelNotApprovedError extends Error {
  readonly status = MODEL_NOT_APPROVED_STATUS;
  readonly model: string;
  constructor(model: string, message: string = MODEL_NOT_APPROVED_MESSAGE) {
    super(message);
    this.name = "ModelNotApprovedError";
    this.model = model;
  }
}

/** The one log line for a refusal: the model id only, never the prompt. */
export function modelLockLogLine(model: string): string {
  return `[llm] model ${model} is not on the approved list; no model call made`;
}
