// "Withheld on purpose is said in words" (AI-CRAFT §2.6, DESIGN-CONVENTIONS
// §3; owner ruling 2026-10-29, Mike: "let's make sure when results are
// purposely being redacted based on rules that that is made clear to the user
// so it isn't reported as a 'bug'"). A hub's Ask the Hub tools leave some
// fields out by rule (reasons, notes, free text). Without saying so, the
// person reads the gap as a fault. Three pieces make it plain:
//  - `withheld(fields, howToSee)` — a tool spreads it into its result, so the
//    model reads WHAT was left out and HOW to see it;
//  - ASSISTANT_PRIVACY_PROMPT — one fixed sentence block `runAssistantStep`
//    appends to the system prompt, telling the model to say so plainly and
//    never call it an error (static, so the prompt stays cacheable);
//  - the panel's opt-in `privacyNote` — a standing muted line under the input.
//
// Pure and client-safe.

/** What a tool says when it doesn't name how to see the rest. */
export const WITHHELD_DEFAULT_HOW_TO_SEE = "Open the linked page to see them.";

/** The panel's standing line when a hub passes `privacyNote: true`. */
export const DEFAULT_PRIVACY_NOTE =
  "Ask the Hub leaves out some details on purpose to protect privacy. Open a record to see everything you have access to.";

/**
 * The fixed system-prompt block `runAssistantStep` appends after the hub's own
 * prompt (once, every step, inside the cached prefix). A constant: never put
 * per-request data in it.
 */
export const ASSISTANT_PRIVACY_PROMPT = [
  "Some details are left out of tool results on purpose, by this hub's privacy rules.",
  'When a tool result carries a "withheld" field, tell the person plainly what was left out, that it was left out on purpose by the hub\'s privacy rules, and how to see it (the "withheld" field says how).',
  "Never call it an error, a bug, a fault or missing data, never suggest reporting it, and never guess what the withheld details say.",
].join(" ");

/**
 * The marker a tool spreads into its result when it leaves fields out by rule:
 * `{ ...rows, ...withheld(["reasons", "notes"]) }` →
 * `{ withheld: "Left out on purpose by this hub's privacy rules: reasons, notes. Open the linked page to see them." }`.
 * Field names are the person's words ("reasons", "notes"), never column names.
 * With no fields it says only that some details were left out.
 */
export function withheld(fields: readonly string[], howToSee: string = WITHHELD_DEFAULT_HOW_TO_SEE): { withheld: string } {
  const names = [...new Set(fields.map((f) => f.trim()).filter(Boolean))];
  const what = names.length > 0
    ? `Left out on purpose by this hub's privacy rules: ${names.join(", ")}.`
    : "Some details were left out on purpose by this hub's privacy rules.";
  const how = howToSee.trim();
  return { withheld: how ? `${what} ${how}` : what };
}
