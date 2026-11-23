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
// Left alone: a header that is already `position: sticky` (it manages
// itself), a table inside a box that scrolls up and down by itself (the page
// offset would be wrong there), and a header that is not drawn (a card
// layout that hides its header row on a phone).
//
// A header cell that is itself sticky (a held first column, `sticky left-0`)
// keeps its hold while frozen: it is marked `data-frozen-sticky` here, and the
// theme leaves the position of a marked cell alone.

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

/** Read before `data-frozen` goes on: the theme positions a frozen cell. */
function markStickyCells(head: HTMLElement) {
  for (const cell of head.querySelectorAll<HTMLElement>(":scope > tr > *")) {
    if (getComputedStyle(cell).position === "sticky") cell.setAttribute("data-frozen-sticky", "");
  }
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
      for (const head of document.querySelectorAll<HTMLElement>(HEADS)) {
        const table = head.parentElement as HTMLElement;
        const box = table.getBoundingClientRect();
        // Cheap exits first: most tables are not crossing the top of the window.
        if (box.top >= 0 || box.bottom <= 0 || head.offsetParent === null) {
          release(head);
          continue;
        }
        if (getComputedStyle(head).position === "sticky" || insideOwnScroller(table)) {
          release(head);
          continue;
        }
        const offset = frozenOffset(box.top, box.height, head.offsetHeight);
        if (offset === 0) {
          release(head);
          continue;
        }
        if (!head.hasAttribute("data-frozen")) {
          markStickyCells(head);
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
        const cell = head?.querySelector<HTMLElement>("th, td");
        if (!cell) return;
        const up = focusClearance(el.getBoundingClientRect().top, cell.getBoundingClientRect().bottom);
        if (up > 0) window.scrollBy({ top: -up });
      });
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("focusin", onFocus);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (focusFrame) cancelAnimationFrame(focusFrame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("focusin", onFocus);
      for (const head of document.querySelectorAll<HTMLElement>(`${HEADS}[data-frozen]`)) release(head);
    };
  }, []);
  return null;
}
