// The one text-control class: the same box, ground, and focus treatment the
// foundation pickers (AdaptiveSelect's native <select>, SearchCombobox's input)
// render, so a hand-rolled <input>/<textarea> beside them matches instead of
// taking the card's tint. The explicit `bg-white` is the point: an input with
// no background shows whatever it sits on, and on a tinted card
// (bg-brand-surface, bg-*-50) a prefilled field then reads as disabled next to
// the white pickers (Project Hub, 2026-09-29). Dark mode stays transparent over
// the dark card, like the pickers.
//
// The invalid state is part of the box (aria-invalid → danger border). It needs
// both variants: Tailwind v4 emits `dark:border-zinc-700` after a plain
// `aria-invalid:` border, so without `dark:aria-invalid:` the danger border
// vanished in dark mode (Audit Hub, 2026-09-29).
//
// A plain module (no "use client") so server components and the hubs'
// file-local class constants can import it. DESIGN-CONVENTIONS §3
// "Text inputs share the pickers' ground".
export const INPUT_CLASS =
  "block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60 aria-invalid:border-brand-danger dark:aria-invalid:border-brand-danger";

/**
 * INPUT_CLASS plus call-site extras. Pass only additive utilities (width,
 * rows, font, text alignment, state variants) — never a competing
 * padding/border/background, which would fight the base without
 * tailwind-merge to resolve it.
 *
 * Width is the one exception handled here: Tailwind v4 emits `.w-full` after
 * `.w-24`/`.w-32` at equal specificity, so a plain `w-*` extra would silently
 * lose to the base's `w-full`. When the extras carry an unprefixed `w-*`
 * token, `w-full` is dropped so the extra wins. Prefer `max-w-*` for a cap
 * that still fills narrower columns; responsive `sm:w-*` already outranks
 * the base and needs no help.
 */
export function inputClasses(extra = ""): string {
  const extras = extra.trim();
  if (!extras) return INPUT_CLASS;
  const setsWidth = extras.split(/\s+/).some((t) => /^w-/.test(t));
  const base = setsWidth
    ? INPUT_CLASS.split(" ").filter((t) => t !== "w-full").join(" ")
    : INPUT_CLASS;
  return `${base} ${extras}`;
}
