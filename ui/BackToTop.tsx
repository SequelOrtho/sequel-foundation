"use client";

import { useEffect, useRef, useState } from "react";
import { nextBackToTopState, type BackToTopState } from "./back-to-top-state";

// Floating "Back to top" pill for long scroll surfaces (NN/g back-to-top
// guidelines): appears only once the user is more than `minScreens` viewport
// heights down the page AND signals upward intent by scrolling up, so short
// pages and downward reading never see it. Quiet outline styling — never the
// accent (reserved for hand-off) — icon + label, hidden from print.
// Visibility logic lives in ./back-to-top-state (pure, unit-tested).
//
// Mount once per long page (or in a layout — it stays hidden until the
// thresholds are met):
//
//   <BackToTop />

export function BackToTop({
  minScreens = 2.5,
  label = "Back to top",
  className = "",
}: {
  /** Viewport-heights of scroll before the pill may appear. */
  minScreens?: number;
  label?: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const stateRef = useRef<BackToTopState>({ y: 0, visible: false });

  useEffect(() => {
    // Seed the position so the first real scroll event has a true delta
    // (matters when the browser restores a mid-page scroll position).
    stateRef.current = { y: window.scrollY, visible: false };
    const onScroll = () => {
      const next = nextBackToTopState(
        stateRef.current,
        window.scrollY,
        window.innerHeight,
        minScreens,
      );
      const changed = next.visible !== stateRef.current.visible;
      stateRef.current = next;
      if (changed) setVisible(next.visible);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [minScreens]);

  if (!visible) return null;
  return (
    <button
      type="button"
      data-no-print
      onClick={() => {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        // Keyboard/AT users land where they visually went: move focus to the
        // main landmark without re-scrolling.
        const main = document.querySelector<HTMLElement>("main");
        if (main) {
          if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
          main.focus({ preventScroll: true });
        }
      }}
      className={`animate-seq-fade-in fixed bottom-6 right-6 z-40 inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-lg hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 ${className}`}
    >
      <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
      {label}
    </button>
  );
}
