"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_ENTITY, isEntityKey, type EntityKey } from "../brand/entities";
import { brandColors, seriesColors, type BrandColors, type ThemeName } from "../brand/palette";

// Live brand palette for chart code.
//
// Tailwind classes follow `data-theme` for free; a hex string handed to Recharts
// or an SVG `fill` does not. This hook closes that gap — it reads the theme the
// pre-hydration script stamped on <html> and re-renders when the toggle changes
// it, so charts re-color with the rest of the app instead of staying on their
// light-mode values against a dark background.
//
// It reads <html data-entity> too (brand/entities.ts), so an FVO or
// OrthoNebraska app's charts take that entity's palette with no extra wiring.
//
// useSyncExternalStore rather than an effect: the theme is external state that
// exists before React hydrates, and reading it in an effect would paint one
// frame with the wrong palette (and trip react-hooks/set-state-in-effect).

/** Reads <html data-theme>. Defaults to light — matches the CSS, which only goes dark on an explicit attribute. */
export function readThemeAttr(el: { getAttribute(name: string): string | null } | null): ThemeName {
  return el?.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Reads <html data-entity>. Missing/unknown → Sequel Ortho, matching the CSS (no attribute = default tokens). */
export function readEntityAttr(el: { getAttribute(name: string): string | null } | null): EntityKey {
  const v = el?.getAttribute("data-entity");
  return isEntityKey(v) ? v : DEFAULT_ENTITY;
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-entity"],
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

function getEntitySnapshot(): EntityKey {
  return typeof document === "undefined" ? DEFAULT_ENTITY : readEntityAttr(document.documentElement);
}

// data-entity is server-rendered on <html>, but the server snapshot cannot read
// it; the default is replaced on hydration (a chart is a client island anyway).
function getEntityServerSnapshot(): EntityKey {
  return DEFAULT_ENTITY;
}

/** The entity stamped on <html data-entity>, kept live. */
export function useEntityKey(): EntityKey {
  return useSyncExternalStore(subscribe, getEntitySnapshot, getEntityServerSnapshot);
}

/** The brand palette for the active entity + theme. Re-renders when either changes. */
export function useBrandColors(): BrandColors {
  return brandColors(useThemeName(), useEntityKey());
}

/** Categorical series colors for the active entity + theme. */
export function useSeriesColors(): string[] {
  return seriesColors(useThemeName(), useEntityKey());
}
