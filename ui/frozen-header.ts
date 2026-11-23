// Frozen table headers (owner ask, Project Hub 2026-11-23, Mike: "when
// scrolling down on a table, the header label row should be 'frozen' so that
// labels follow the user down as they scroll"; moved here the same day:
// "that seems like something that belongs in the Foundation repo"). Pure, so
// the rule is tested without a browser; ./FrozenTableHeaders.tsx applies it.
//
// Most wide tables sit in a sideways-scrolling box, and a box that scrolls
// sideways is also the nearest scroller for `position: sticky`, so a sticky
// header there never follows the PAGE. The header row is moved down by
// exactly how far its table has gone above the window instead.

/** Room kept under a frozen header for the table's last row, so the header
 *  leaves with its table instead of covering the next section. */
export const FROZEN_KEEP_PX = 44;

/**
 * How far down to move a table's header row. `headTop` is the header row's own
 * top edge in the window, where the table drew it (negative once it has
 * scrolled above; a caption above the header is not part of it), `bodyHeight`
 * the table from that edge to its bottom, `headHeight` the header row. `inset`
 * is the room a bar fixed to the top of the window takes: the header stops
 * under the bar, not behind it.
 */
export function frozenOffset(headTop: number, bodyHeight: number, headHeight: number, inset = 0): number {
  if (!(headTop < inset)) return 0;
  const room = bodyHeight - headHeight - FROZEN_KEEP_PX;
  if (!(room > 0)) return 0;
  return Math.round(Math.min(inset - headTop, room));
}

/**
 * How far to scroll the page up so a focused control is not hidden under a
 * frozen header (WCAG 2.4.11). 0 when it is already clear.
 */
export function focusClearance(controlTop: number, headBottom: number, gap = 4): number {
  const hidden = headBottom + gap - controlTop;
  return hidden > 0 ? Math.ceil(hidden) : 0;
}
