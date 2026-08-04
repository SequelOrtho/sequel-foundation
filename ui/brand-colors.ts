"use client";

import { useSyncExternalStore } from "react";
import { BRAND_COLORS, seriesColors, type BrandColors, type ThemeName } from "../brand/palette";

// Live brand palette for chart code.
//
// Tailwind classes follow `data-theme` for free; a hex string handed to Recharts
// or an SVG `fill` does not. This hook closes that gap — it reads the theme the
// pre-hydration script stamped on <html> and re-renders when the toggle changes
// it, so charts re-color with the rest of the app instead of staying on their
// light-mode values against a dark background.
//
// useSyncExternalStore rather than an effect: the theme is external state that
// exists before React hydrates, and reading it in an effect would paint one
// frame with the wrong palette (and trip react-hooks/set-state-in-effect).

/** Reads <html data-theme>. Defaults to light — matches the CSS, which only goes dark on an explicit attribute. */
export function readThemeAttr(el: { getAttribute(name: string): string | null } | null): ThemeName {
  return el?.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): ThemeName {
  return typeof document === "undefined" ? "light" : readThemeAttr(document.documentElement);
}

// Server snapshot: the markup is rendered before the stamp exists, and the
// pre-hydration script settles it before first paint.
function getServerSnapshot(): ThemeName {
  return "light";
}

/** The theme currently stamped on <html>, kept live. */
export function useThemeName(): ThemeName {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The brand palette for the active theme. Re-renders on a theme change. */
export function useBrandColors(): BrandColors {
  return BRAND_COLORS[useThemeName()];
}

/** Categorical series colors for the active theme. */
export function useSeriesColors(): string[] {
  return seriesColors(useThemeName());
}
