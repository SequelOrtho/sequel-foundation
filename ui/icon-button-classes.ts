// Class logic for IconButton, split out so the node-environment unit suite can
// import it (tsconfig sets jsx: preserve for Next, so tests never import .tsx).
// Same arrangement as back-to-top-state.ts.

export type IconButtonTone = "neutral" | "danger";

const BASE =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const TONES: Record<IconButtonTone, string> = {
  neutral: "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
  // Destructive affordances rest neutral and only redden on intent, so a dense
  // list of remove buttons doesn't read as a wall of errors.
  danger: "text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400",
};

export function iconButtonClasses(tone: IconButtonTone = "neutral", className = ""): string {
  return [BASE, TONES[tone], className].filter(Boolean).join(" ");
}
