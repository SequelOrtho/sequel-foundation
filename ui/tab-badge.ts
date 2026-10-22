// The unread count in the browser tab (DESIGN-CONVENTIONS §3 "In-app alerts";
// owner ruling 2026-10-22, Mike: "1-yes, 2-yes" to showing the bell's count in
// the tab title and on the tab's icon). Pure half: the title prefix and the
// favicon geometry, shared by UnreadBadge and the hubs' own title logic.
//
// Count only, never content (owner ruling 2026-10-22, "6-yes"): tabs show on
// shared screens and in screen shares, so no name or message text goes here.

/** The title shows the exact count up to this, then "99+". */
export const TITLE_BADGE_MAX = 99;
/** The favicon has room for one digit, then "9+". */
export const ICON_BADGE_MAX = 9;

// Only what badgeTitle writes: 1–99 or "99+", then a space (or the end, for a
// page with no title of its own — the browser trims the trailing space). A
// title that starts with "(2026)" or "(0)" is the page's own and stays put.
const PREFIX = /^\((?:[1-9]\d?|99\+)\)(?: |$)/;

/** "3", or "99+" past `max`. Empty for zero or less. */
export function badgeText(count: number, max: number = TITLE_BADGE_MAX): string {
  const n = Math.floor(Number.isFinite(count) ? count : 0);
  if (n <= 0) return "";
  return n > max ? `${max}+` : String(n);
}

/** The title without an unread prefix: "(3) Alerts · Hub" → "Alerts · Hub". */
export function stripBadge(title: string): string {
  return title.replace(PREFIX, "");
}

/**
 * The title with the unread count in front — "(3) Alerts · Hub" — replacing
 * any count already there, and the bare title at zero. The count goes first
 * because browsers cut a long tab title from the right.
 */
export function badgeTitle(title: string, count: number): string {
  const bare = stripBadge(title);
  const text = badgeText(count);
  if (!text) return bare;
  return bare ? `(${text}) ${bare}` : `(${text})`;
}

/** Two titles name the same page once their unread counts are set aside. */
export function sameTitleIgnoringBadge(a: string, b: string): boolean {
  return stripBadge(a) === stripBadge(b);
}

/**
 * Where the favicon's count circle goes on a square icon of `size` px: the
 * top-right corner, large enough to read at 16 px, with the digits sized to it.
 */
export function iconBadgeGeometry(size: number): { cx: number; cy: number; r: number; font: number } {
  const r = Math.round(size * 0.3);
  return { cx: size - r, cy: r, r, font: Math.round(r * 1.5) };
}
