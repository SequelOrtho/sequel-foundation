"use client";

import { useLayoutEffect, useRef } from "react";
import { availableHeightBelow, horizontalNudge, VIEWPORT_GUTTER } from "./viewport-fit";

/**
 * Keep an open popover panel inside the window (DESIGN-CONVENTIONS §3,
 * "Popovers stay on screen"). Put the returned ref on the panel element and
 * pass whether it is open:
 *
 *   const panelRef = useFitInViewport<HTMLDivElement>(isOpen);
 *   {isOpen && <div ref={panelRef} className="absolute right-0 …">…</div>}
 *
 * Before paint it caps the panel's width at the window, slides it sideways
 * just enough to clear both edges, and caps its height at the room below it
 * (scrolling inside instead of running off the bottom). It re-fits on window
 * resize. Keep the panel's usual `left-0` / `right-0` anchor: the hook only
 * corrects the cases where that anchor would push it off screen. It writes
 * inline `transform`, `max-width`, `max-height` and `overflow-y`, so the panel
 * must not rely on those for anything else.
 */
export function useFitInViewport<T extends HTMLElement = HTMLDivElement>(open: boolean) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;

    function fit() {
      if (!el) return;
      // Measure from the panel's natural position, not last fit's.
      el.style.transform = "";
      el.style.maxHeight = "";
      el.style.overflowY = "";
      el.style.maxWidth = `calc(100vw - ${2 * VIEWPORT_GUTTER}px)`;
      const rect = el.getBoundingClientRect();
      const dx = horizontalNudge(rect.left, rect.right, window.innerWidth);
      if (dx !== 0) el.style.transform = `translateX(${dx}px)`;
      const room = availableHeightBelow(rect.top, window.innerHeight);
      if (rect.height > room) {
        el.style.maxHeight = `${room}px`;
        el.style.overflowY = "auto";
      }
    }

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

  return ref;
}
