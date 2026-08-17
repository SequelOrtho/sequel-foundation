"use client";

import { useCallback, useRef } from "react";

// "Click Edit → the (possibly off-screen) edit form scrolls into view and its
// first field takes focus." rAF defers until after the open-state render;
// honors prefers-reduced-motion.
export function useScrollToEdit<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const scrollToEdit = useCallback(() => {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const reduce = typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      el.querySelector<HTMLElement>("input, select, textarea, button")?.focus({ preventScroll: true });
    });
  }, []);
  return { ref, scrollToEdit };
}
