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
// KEEP IN SYNC WITH brand/theme.css. tests/palette.test.ts parses the CSS and
// fails if any value here drifts, so the sync is enforced rather than trusted.

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

export const BRAND_COLORS: Record<ThemeName, BrandColors> = {
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

export function brandColors(theme: ThemeName): BrandColors {
  return BRAND_COLORS[theme];
}

/**
 * Categorical series colors for multi-series charts, in order. Brand-forward
 * and distinguishable in both themes — pick by index and wrap with `%`.
 */
export function seriesColors(theme: ThemeName): string[] {
  const c = BRAND_COLORS[theme];
  return [c.navy, c.brand, c.rygGreen, "#93328e", c.rygYellow, c.muted];
}

/** Green / yellow / red for a stoplight value, in the active theme. */
export function rygColor(
  status: "green" | "yellow" | "red" | null | undefined,
  theme: ThemeName,
): string {
  const c = BRAND_COLORS[theme];
  if (status === "green") return c.rygGreen;
  if (status === "yellow") return c.rygYellow;
  if (status === "red") return c.rygRed;
  return c.rygNone;
}
