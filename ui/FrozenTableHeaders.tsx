"use client";

import { useEffect } from "react";
import { focusClearance, frozenOffset } from "./frozen-header";

// Frozen table headers for every table in an app (DESIGN-CONVENTIONS §3
// "Table headers follow the page"). Mount once in the root layout; a new
// table needs nothing:
//
//   <FrozenTableHeaders />
//
// On scroll it moves each table's header row down by how far the table has
// gone above the window (`--frozen-offset` + `data-frozen`, styled in
// brand/theme.css), so the column labels stay in view until the table's last
// row.
//
// Left alone: a header that is already sticky to the top, on the `<thead>` or
// on its cells (it manages itself), a table inside a box that scrolls up and
// down by itself (the page offset would be wrong there), and a header that is
// not drawn (a card layout that hides its header row on a phone).
//
// A header cell that is sticky sideways (a held first column, `sticky left-0`)
// keeps its hold while frozen: it is marked `data-frozen-sticky` here, and the
// theme leaves the position of a marked cell alone.
//
// A bar fixed to the top of the window carries `data-frozen-inset`; headers
// freeze under it instead of behind it.

const HEADS = "table > thead";
const STICKY_CELLS = ":scope > tr > [data-frozen-sticky]";

function insideOwnScroller(el: HTMLElement): boolean {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === "auto" || y === "scroll") && p.scrollHeight > p.clientHeight + 1) return true;
  }
  return false;
}

function release(head: HTMLElement) {
  if (!head.hasAttribute("data-frozen")) return;
  head.removeAttribute("data-frozen");
  head.style.removeProperty("--frozen-offset");
  for (const cell of head.querySelectorAll(STICKY_CELLS)) cell.removeAttribute("data-frozen-sticky");
}

const CELLS = ":scope > tr > *";

/**
 * Read before `data-frozen` goes on (the theme positions a frozen cell). Marks
 * the cells that are sticky sideways; answers false, marking nothing, when a
 * cell is sticky to the top: that header follows the page by itself.
 */
function markStickyCells(head: HTMLElement): boolean {
  const held: HTMLElement[] = [];
  for (const cell of head.querySelectorAll<HTMLElement>(CELLS)) {
    const style = getComputedStyle(cell);
    if (style.position !== "sticky") continue;
    if (style.top !== "auto" && style.top !== "") return false;
    held.push(cell);
  }
  for (const cell of held) cell.setAttribute("data-frozen-sticky", "");
  return true;
}

/** The room bars fixed to the top of the window take (`data-frozen-inset`). */
function topInset(): number {
  let inset = 0;
  for (const bar of document.querySelectorAll<HTMLElement>("[data-frozen-inset]")) {
    const box = bar.getBoundingClientRect();
    if (box.height > 0 && box.top <= inset + 1 && box.bottom > inset) inset = box.bottom;
  }
  return inset;
}

/** The bottom edge of a header as drawn: its lowest cell, in any of its rows. */
function drawnBottom(head: HTMLElement): number {
  let bottom = -Infinity;
  for (const cell of head.querySelectorAll<HTMLElement>(CELLS)) bottom = Math.max(bottom, cell.getBoundingClientRect().bottom);
  return bottom;
}

export function FrozenTableHeaders() {
  useEffect(() => {
    let frame = 0;
    // A resize can cross a breakpoint that makes a cell sticky (`md:sticky`),
    // so the next pass reads every header afresh.
    let reread = false;
    const update = () => {
      frame = 0;
      if (reread) {
        reread = false;
        for (const head of document.querySelectorAll<HTMLElement>(`${HEADS}[data-frozen]`)) release(head);
      }
      const inset = topInset();
      for (const head of document.querySelectorAll<HTMLElement>(HEADS)) {
        const table = head.parentElement as HTMLElement;
        const box = table.getBoundingClientRect();
        // Cheap exits first: most tables are not crossing the top of the window.
        if (box.top >= inset || box.bottom <= inset || head.offsetParent === null) {
          release(head);
          continue;
        }
        if (getComputedStyle(head).position === "sticky" || insideOwnScroller(table)) {
          release(head);
          continue;
        }
        // From the header row's own top, not the table's: a caption sits above
        // it. The row group's box does not move with its cells.
        const headTop = head.getBoundingClientRect().top;
        const offset = frozenOffset(headTop, box.bottom - headTop, head.offsetHeight, inset);
        if (offset === 0) {
          release(head);
          continue;
        }
        if (!head.hasAttribute("data-frozen")) {
          if (!markStickyCells(head)) continue;
          head.setAttribute("data-frozen", "");
        }
        head.style.setProperty("--frozen-offset", `${offset}px`);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      reread = true;
      schedule();
    };
    // A control tabbed to behind a frozen header is brought back into view.
    // The browser scrolls a focused control into view after this event, so
    // the check waits a frame, then reads the header where it now sits.
    let focusFrame = 0;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest?.("table > tbody, table > tfoot")) return;
      if (focusFrame) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        focusFrame = 0;
        if (!el.isConnected || document.activeElement !== el) return;
        update();
        const head = el.closest("table")?.querySelector<HTMLElement>(":scope > thead[data-frozen]");
        if (!head) return;
        const up = focusClearance(el.getBoundingClientRect().top, drawnBottom(head));
        if (up > 0) window.scrollBy({ top: -up });
      });
    };
    // A table that grows, shrinks, arrives or leaves without a scroll (a
    // filter, paging, a delete, a client navigation under this layout) moves
    // or orphans a frozen header, so the page's own changes ask for a pass too.
    const resized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resized?.observe(document.body);
    const changed = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
    changed?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("focusin", onFocus);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (focusFrame) cancelAnimationFrame(focusFrame);
      resized?.disconnect();
      changed?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("focusin", onFocus);
      for (const head of document.querySelectorAll<HTMLElement>(`${HEADS}[data-frozen]`)) release(head);
    };
  }, []);
  return null;
}
