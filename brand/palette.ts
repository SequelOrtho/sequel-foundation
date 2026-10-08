// The brand palette in JavaScript.
//
// brand/theme.css is the source of truth for anything that can be styled with a
// class — use `text-brand-navy`, `bg-ryg-green` and friends there and never
// reach for a hex. This module exists for the cases that genuinely cannot take
// a Tailwind class:
//
//   - SVG/canvas chart libraries (Recharts, D3) that want a color string
//   - exporters (pptx/xlsx/docx) rendering outside the browser entirely
//
// Before this existed, every chart hardcoded hex copies of the tokens — and
// because a hardcoded value cannot follow `data-theme`, charts stayed on their
// light-mode colors against a dark background. Chart code should read
// `useBrandColors()` (ui/brand-colors.ts); server-side exporters take
// `brandColors("light")` directly.
//
// Per entity (brand/entities.ts): ENTITY_BRAND_COLORS.FVO / .ON carry the
// re-pitched values of the `:root[data-entity=…]` blocks; BRAND_COLORS stays the
// Sequel Ortho palette it always was. useBrandColors() reads <html data-entity>
// as well as data-theme, so chart code needs no entity plumbing of its own.
//
// KEEP IN SYNC WITH brand/theme.css. tests/palette.test.ts parses the CSS and
// fails if any value here drifts, so the sync is enforced rather than trusted.

import { DEFAULT_ENTITY, type EntityKey } from "./entities";

export type ThemeName = "light" | "dark";

export type BrandColors = {
  background: string;
  foreground: string;
  brand: string;
  brand600: string;
  brand700: string;
  navy: string;
  navyMuted: string;
  accent: string;
  accentDark: string;
  muted: string;
  surface: string;
  danger: string;
  rygGreen: string;
  rygYellow: string;
  rygRed: string;
  rygNone: string;
  rygGreenText: string;
  rygYellowText: string;
  rygRedText: string;
  success: string;
  warning: string;
};

/** CSS custom property backing each key — the contract tests/palette.test.ts checks. */
export const BRAND_COLOR_VARS: Record<keyof BrandColors, string> = {
  background: "--background",
  foreground: "--foreground",
  brand: "--brand-primary",
  brand600: "--brand-primary-600",
  brand700: "--brand-primary-700",
  navy: "--brand-navy",
  navyMuted: "--brand-navy-muted",
  accent: "--brand-accent",
  accentDark: "--brand-accent-dark",
  muted: "--brand-muted",
  surface: "--brand-surface",
  danger: "--brand-danger",
  rygGreen: "--ryg-green",
  rygYellow: "--ryg-yellow",
  rygRed: "--ryg-red",
  rygNone: "--ryg-none",
  rygGreenText: "--ryg-green-text",
  rygYellowText: "--ryg-yellow-text",
  rygRedText: "--ryg-red-text",
  success: "--brand-success",
  warning: "--brand-warning",
};

const SEQ_COLORS: Record<ThemeName, BrandColors> = {
  light: {
    background: "#ffffff",
    foreground: "#171717",
    brand: "#009ddd",
    brand600: "#0083bd",
    brand700: "#006a9c",
    navy: "#0f1263",
    navyMuted: "#232a7a",
    accent: "#cad400",
    accentDark: "#9aa300",
    muted: "#707372",
    surface: "#f8f8f8",
    danger: "#e51919",
    rygGreen: "#16a34a",
    rygYellow: "#eab308",
    rygRed: "#dc2626",
    rygNone: "#d4d4d8",
    rygGreenText: "#15803d",
    rygYellowText: "#a16207",
    rygRedText: "#dc2626",
    success: "#16a34a",
    warning: "#b45309",
  },
  dark: {
    background: "#0a0a0a",
    foreground: "#ededed",
    brand: "#35b5e8",
    brand600: "#54c5ec",
    brand700: "#8fd9f2",
    navy: "#c3c8f5",
    navyMuted: "#a5abe8",
    accent: "#d6e04a",
    accentDark: "#cad400",
    muted: "#a1a1aa",
    surface: "#111114",
    danger: "#f87171",
    rygGreen: "#4ade80",
    rygYellow: "#facc15",
    rygRed: "#f87171",
    rygNone: "#52525b",
    rygGreenText: "#4ade80",
    rygYellowText: "#facc15",
    rygRedText: "#f87171",
    success: "#4ade80",
    warning: "#fbbf24",
  },
};

// Entity overrides: exactly the variables the entity's theme.css blocks set;
// everything else (RYG, success/warning/danger, page ground) is family-wide.
const FVO_COLORS: Record<ThemeName, BrandColors> = {
  light: {
    ...SEQ_COLORS.light,
    foreground: "#1e1e1e",
    brand: "#177255",
    brand600: "#136047",
    brand700: "#104e3a",
    navy: "#14332d",
    navyMuted: "#15493b",
    accent: "#f4d659",
    accentDark: "#d7bc4e",
    muted: "#5b6964",
    surface: "#f2f4f4",
  },
  dark: {
    ...SEQ_COLORS.dark,
    foreground: "#ededed",
    brand: "#14c579",
    brand600: "#43d394",
    brand700: "#8ee5bc",
    navy: "#c2e5d4",
    navyMuted: "#9fd5bc",
    accent: "#f7e07f",
    accentDark: "#f4d659",
    muted: "#a1a1aa",
    surface: "#111114",
  },
};

const ON_COLORS: Record<ThemeName, BrandColors> = {
  light: {
    ...SEQ_COLORS.light,
    brand: "#0072ce",
    brand600: "#0060ad",
    brand700: "#004e8c",
    navy: "#25245c",
    navyMuted: "#3f3e70",
    accent: "#d2d755",
    accentDark: "#b9bd4b",
    muted: "#63666a",
  },
  dark: {
    ...SEQ_COLORS.dark,
    brand: "#00a3e0",
    brand600: "#3bb8e8",
    brand700: "#85d3f0",
    navy: "#c9c8ef",
    navyMuted: "#a9a8e0",
    accent: "#dde27a",
    accentDark: "#d2d755",
    muted: "#a1a1aa",
  },
};

export const ENTITY_BRAND_COLORS: Record<EntityKey, Record<ThemeName, BrandColors>> = {
  SEQ: SEQ_COLORS,
  FVO: FVO_COLORS,
  ON: ON_COLORS,
};

/** The Sequel Ortho palette (the default entity) — unchanged since v0.x. */
export const BRAND_COLORS: Record<ThemeName, BrandColors> = SEQ_COLORS;

export function brandColors(theme: ThemeName, entity: EntityKey = DEFAULT_ENTITY): BrandColors {
  return ENTITY_BRAND_COLORS[entity][theme];
}

// Categorical chart series per entity, in order — brand-forward and
// distinguishable within each theme. Sequel's list predates the registry and
// is unchanged; FVO's three greens are spread apart with its secondaries
// between them; ON's follows its logo gradient.
const SERIES: Record<EntityKey, (theme: ThemeName) => string[]> = {
  SEQ: (theme) => {
    const c = SEQ_COLORS[theme];
    return [c.navy, c.brand, c.rygGreen, "#93328e", c.rygYellow, c.muted];
  },
  FVO: (theme) =>
    theme === "light"
      ? ["#14332d", "#14c579", "#f07d42", "#f4d659", "#177255", "#5b6964"]
      : ["#c2e5d4", "#14c579", "#f49a6b", "#f7e07f", "#5fa58c", "#a1a1aa"],
  ON: (theme) =>
    theme === "light"
      ? ["#25245c", "#0072ce", "#43b02a", "#93328e", "#00a3e0", "#63666a"]
      : ["#c9c8ef", "#00a3e0", "#6cc95a", "#c46cc0", "#85d3f0", "#a1a1aa"],
};

/**
 * Categorical series colors for multi-series charts, in order. Brand-forward
 * and distinguishable in both themes — pick by index and wrap with `%`.
 */
export function seriesColors(theme: ThemeName, entity: EntityKey = DEFAULT_ENTITY): string[] {
  return SERIES[entity](theme);
}

/** Green / yellow / red for a stoplight value, in the active theme (family-wide — no entity). */
export function rygColor(
  status: "green" | "yellow" | "red" | null | undefined,
  theme: ThemeName,
): string {
  const c = SEQ_COLORS[theme];
  if (status === "green") return c.rygGreen;
  if (status === "yellow") return c.rygYellow;
  if (status === "red") return c.rygRed;
  return c.rygNone;
}
