// Ask the Hub's approved-model list (AI-CRAFT §2.6, "rule 5" for the
// patient-data hubs). A hub whose tools can read patient data passes
// `allowedModels` to `runAssistantStep`: only models eligible for zero data
// retention (claude-opus-5, claude-opus-4-8 — never Fable 5, which needs
// 30-day retention). An LLM_MODEL_PROSE / LLM_MODEL_FALLBACK override can then
// never move the assistant onto a model outside the list: an unlisted primary
// makes no call at all, and an unlisted fallback is never tried.
//
// Pure and client-safe (no SDK): the panel reads the message from here to show
// it as written.

/** The status the refusal travels with (the stream's error event and a route's early answer). */
export const MODEL_NOT_APPROVED_STATUS = 503;

/** What the person sees when the configured model isn't on the hub's list. */
export const MODEL_NOT_APPROVED_MESSAGE =
  "Ask the Hub is switched off on this site: its AI model isn't one approved for patient data. Contact the System Administrator.";

/**
 * Thrown by `runAssistantStep` (before any tool or model call) when the
 * configured model is not on `allowedModels`. `streamJob` turns it into the
 * error event `{ status: 503, error: MODEL_NOT_APPROVED_MESSAGE }`. It carries
 * the model id for the server's own use; the message never names it.
 */
export class AssistantModelNotApprovedError extends Error {
  readonly status = MODEL_NOT_APPROVED_STATUS;
  readonly model: string;
  constructor(model: string) {
    super(MODEL_NOT_APPROVED_MESSAGE);
    this.name = "AssistantModelNotApprovedError";
    this.model = model;
  }
}

/** True when `model` is on the list (exact id match). No list = every model. */
export function modelApproved(model: string, allowed: readonly string[] | undefined): boolean {
  return allowed === undefined || allowed.includes(model);
}

/** The one log line for a refusal: the configured model id only, never the question. */
export function modelNotApprovedLogLine(model: string): string {
  return `[assistant] model ${model} is not on this hub's approved list; no model call made`;
}
