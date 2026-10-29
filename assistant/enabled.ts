// The Ask the Hub switch (DESIGN-CONVENTIONS §3 "Ask the Hub"). Read on the
// server at request time, never baked into the browser bundle (a changed value
// takes a redeploy, like every Netlify variable).
//
// On only when there is a model to call (ANTHROPIC_API_KEY set) AND
// ASSISTANT_ENABLED is unset, empty, true, 1, on or yes. Anything else is read
// as off, so a mistyped "disabled" never leaves it running. Off, the hub's step
// route answers 404 and its layout hides the button — both ask this one rule.
// A hub with a stricter switch of its own (Project Hub's connector) adds it on
// top; it never loosens this one.

/** The words that leave Ask the Hub on (besides unset or empty). */
export const ASSISTANT_ON_WORDS = ["true", "1", "on", "yes"] as const;

export function assistantEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (!(env.ANTHROPIC_API_KEY ?? "").trim()) return false;
  const raw = (env.ASSISTANT_ENABLED ?? "").trim().toLowerCase();
  return raw === "" || (ASSISTANT_ON_WORDS as readonly string[]).includes(raw);
}
