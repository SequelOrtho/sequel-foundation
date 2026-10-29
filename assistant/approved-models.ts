// Ask the Hub's side of the model lock (AI-CRAFT §2.6 rule 5). The family
// lock (llm/approved-models.ts, APPROVED_MODELS) binds every AI call: only
// models eligible for zero data retention, never Fable 5. A hub may narrow it
// further for the assistant with `runAssistantStep({ allowedModels })`; the
// step then accepts a model only when it is on BOTH lists. An unlisted primary
// runs no tool and makes no model call; an unlisted fallback is never tried.
//
// Pure and client-safe (no SDK): the panel reads the message from here to show
// it as written.
import {
  isApprovedModel,
  ModelNotApprovedError,
  MODEL_NOT_APPROVED_MESSAGE,
  MODEL_NOT_APPROVED_STATUS,
} from "../llm/approved-models";

export { MODEL_NOT_APPROVED_STATUS, MODEL_NOT_APPROVED_MESSAGE };

/** What the person sees in Ask the Hub when its configured model isn't approved. */
export const ASSISTANT_MODEL_NOT_APPROVED_MESSAGE =
  "Ask the Hub is switched off on this site: its AI model isn't one approved for patient data. Contact the System Administrator.";

/**
 * Thrown by `runAssistantStep` (before any tool or model call) when the
 * configured model is not on the family list or the hub's `allowedModels`.
 * A ModelNotApprovedError, so `llmErrorEvent` sends it as
 * `{ status: 503, error: ASSISTANT_MODEL_NOT_APPROVED_MESSAGE }`. It carries
 * the model id for the server's own use; the message never names it.
 */
export class AssistantModelNotApprovedError extends ModelNotApprovedError {
  constructor(model: string) {
    super(model, ASSISTANT_MODEL_NOT_APPROVED_MESSAGE);
    this.name = "AssistantModelNotApprovedError";
  }
}

/**
 * True when `model` may run: it is on the family list (APPROVED_MODELS) and,
 * when the hub passes a narrower `allowed` list, on that too. No hub list =
 * the family list alone — never every model.
 */
export function modelApproved(model: string, allowed: readonly string[] | undefined): boolean {
  return isApprovedModel(model) && (allowed === undefined || allowed.includes(model));
}

/**
 * The one log line for a refusal: the configured model id only, never the
 * question. When the id would be approved without its surrounding whitespace
 * (on the family list and the hub's `allowed` list), the line says so — the
 * step is still refused; the setting is fixed, never trimmed silently.
 */
export function modelNotApprovedLogLine(model: string, allowed?: readonly string[]): string {
  if (model !== model.trim() && modelApproved(model.trim(), allowed)) {
    return `[assistant] model ${JSON.stringify(model)} is not on the approved list: it has surrounding whitespace (without it, ${model.trim()} is approved — fix the setting); no model call made`;
  }
  return `[assistant] model ${model} is not on the approved list; no model call made`;
}
