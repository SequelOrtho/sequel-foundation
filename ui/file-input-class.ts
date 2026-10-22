// The one file-picker class (DESIGN-CONVENTIONS §3 "File pickers look like a
// button", v0.30.0). A bare <input type="file"> renders the browser's
// "Choose File  No file chosen" as plain text on most grounds, so it doesn't
// read as a control (hub walk-through 2026-10-21: Scheduler import, Incident
// attachments, Audit data intake). This class keeps the native input — its
// keyboard behaviour, its accessible name from the <label>, `accept`,
// `multiple`, `webkitdirectory` and form posting all stay the browser's — and
// styles its `::file-selector-button` (Tailwind v4 `file:` variant) as the
// `outline` Button: neutral border, white ground (zinc-900 in dark mode),
// rounded, padded, at least 32px tall, with the outline Button's hover.
//
// The input itself is plain text-sm with the chosen file's name in muted text
// (`text-brand-muted`, AA on both grounds). Keyboard focus draws the family
// ring on the input, like Button and INPUT_CLASS. `w-full min-w-0` lets it
// shrink inside a flex or grid row, so on a 390px phone the name is cut
// short by the browser instead of pushing the row (and the page) sideways;
// the button's own label never wraps (`file:whitespace-nowrap`).
//
// The outline Button's classes appear here with `file:` in front of the
// utility, and its hover as `enabled:hover:file:` — hover on the whole input,
// since a click anywhere on it opens the picker, and none while it is
// disabled. tests/file-input-class.test.ts holds the two in step.
//
// A plain module (no "use client"), so server components and the hubs'
// file-local class constants can import it.
export const FILE_INPUT_CLASS =
  "block w-full min-w-0 max-w-full cursor-pointer rounded-md text-sm text-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 " +
  "file:mr-3 file:min-h-8 file:cursor-pointer file:whitespace-nowrap file:rounded-md file:border file:border-solid file:border-zinc-300 dark:file:border-zinc-700 file:bg-white dark:file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 dark:file:text-zinc-300 file:transition-colors enabled:hover:file:bg-zinc-50 dark:enabled:hover:file:bg-zinc-800 disabled:file:cursor-not-allowed";

/**
 * FILE_INPUT_CLASS plus call-site extras (a top margin, a width cap). Pass
 * only additive utilities — never a competing border/background, which would
 * fight the base without tailwind-merge to resolve it.
 *
 * As with `inputClasses`, an unprefixed `w-*` extra (`w-auto`, `w-64`) drops
 * the base `w-full`, since Tailwind v4 emits `.w-full` after `.w-64` at equal
 * specificity and the extra would otherwise silently lose. For the same
 * reason an unprefixed `max-w-*` extra drops the base `max-w-full`: Tailwind
 * emits `.max-w-full` after `.max-w-64` and `.max-w-2xl` (and before
 * `.max-w-md`), so a cap would win or lose by its name alone. Prefer
 * `max-w-*` for a cap that still shrinks on a phone.
 */
export function fileInputClasses(extra = ""): string {
  const extras = extra.trim();
  if (!extras) return FILE_INPUT_CLASS;
  const tokens = extras.split(/\s+/);
  const setsWidth = tokens.some((t) => /^w-/.test(t));
  const setsMaxWidth = tokens.some((t) => /^max-w-/.test(t));
  const base = FILE_INPUT_CLASS.split(" ")
    .filter((t) => !(setsWidth && t === "w-full") && !(setsMaxWidth && t === "max-w-full"))
    .join(" ");
  return `${base} ${extras}`;
}
