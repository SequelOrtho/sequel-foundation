// Keep a popover on screen (DESIGN-CONVENTIONS §3, "Popovers stay on
// screen"). Pure geometry, so it is testable without a browser; the
// `useFitInViewport` hook measures the panel and applies the result.
//
// The defect this exists for (Project Hub, 2026-10-14): a top-nav menu
// anchored `right-0` to its button opens leftward. When the header wraps (a
// signed-in header carries the account control, so the nav drops to its own
// line) the leftmost menu's button sits near the page edge and its panel runs
// off the left of the screen, clipped and hard to read.

/** Space kept between a popover and the window edge, in px. */
export const VIEWPORT_GUTTER = 8;

/**
 * How far to move a panel horizontally (px; positive = right) so that its
 * `[left, right]` span sits inside `[gutter, viewportWidth - gutter]`. A panel
 * wider than the room left over pins to the left gutter — the start of each
 * line stays readable, and the caller caps the width so it never needs this.
 */
export function horizontalNudge(
  left: number,
  right: number,
  viewportWidth: number,
  gutter: number = VIEWPORT_GUTTER,
): number {
  const minLeft = gutter;
  const maxRight = viewportWidth - gutter;
  if (right - left > maxRight - minLeft) return minLeft - left;
  if (left < minLeft) return minLeft - left;
  if (right > maxRight) return maxRight - right;
  return 0;
}

/**
 * Height available below a panel's top edge before it meets the bottom of the
 * window (never below a usable floor, so a panel opened low on the page still
 * shows a few rows and scrolls).
 */
export function availableHeightBelow(
  top: number,
  viewportHeight: number,
  gutter: number = VIEWPORT_GUTTER,
  floor: number = 160,
): number {
  return Math.max(floor, Math.floor(viewportHeight - top - gutter));
}
