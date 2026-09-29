// The one text-control class: the same box, ground, and focus treatment the
// foundation pickers (AdaptiveSelect's native <select>, SearchCombobox's input)
// render, so a hand-rolled <input>/<textarea> beside them matches instead of
// taking the card's tint. The explicit `bg-white` is the point: an input with
// no background shows whatever it sits on, and on a tinted card
// (bg-brand-surface, bg-*-50) a prefilled field then reads as disabled next to
// the white pickers (Project Hub, 2026-09-29). Dark mode stays transparent over
// the dark card, like the pickers.
//
// A plain module (no "use client") so server components and the hubs'
// file-local class constants can import it. DESIGN-CONVENTIONS §3
// "Text inputs share the pickers' ground".
export const INPUT_CLASS =
  "block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

/**
 * INPUT_CLASS plus call-site extras. Pass only additive utilities (width,
 * rows, font, text alignment) — never a competing padding/border/background,
 * which would fight the base without tailwind-merge to resolve it.
 */
export function inputClasses(extra = ""): string {
  return extra.trim() ? `${INPUT_CLASS} ${extra.trim()}` : INPUT_CLASS;
}
