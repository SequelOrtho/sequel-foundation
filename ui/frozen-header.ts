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
 * How far down to move a table's header row. `tableTop` is the table's top
 * edge in the window (negative once it has scrolled above), `tableHeight` the
 * whole table, `headHeight` its header row.
 */
export function frozenOffset(tableTop: number, tableHeight: number, headHeight: number): number {
  if (!(tableTop < 0)) return 0;
  const room = tableHeight - headHeight - FROZEN_KEEP_PX;
  if (!(room > 0)) return 0;
  return Math.round(Math.min(-tableTop, room));
}

/**
 * How far to scroll the page up so a focused control is not hidden under a
 * frozen header (WCAG 2.4.11). 0 when it is already clear.
 */
export function focusClearance(controlTop: number, headBottom: number, gap = 4): number {
  const hidden = headBottom + gap - controlTop;
  return hidden > 0 ? Math.ceil(hidden) : 0;
}
