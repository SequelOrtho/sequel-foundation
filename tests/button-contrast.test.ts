import { describe, expect, it } from "vitest";
import { ENTITY_KEYS } from "../brand/entities";
import { brandColors, type BrandColors, type ThemeName } from "../brand/palette";
import { buttonClasses } from "../ui/Button";

// WCAG 2.x contrast ratio between two #rrggbb colors.
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#ffffff";
const ZINC_900 = "#18181b";
const DARK_CARD = "#18181b"; // dark:bg-zinc-900, the outline buttons' ground

// The solid variants' fill token and the label each theme puts on it. Light
// mode keeps white labels; dark mode flips to zinc-900 (UX audit FND-1).
const SOLID: { variant: "primary" | "secondary" | "danger"; fill: keyof BrandColors; hover: keyof BrandColors | null }[] = [
  { variant: "primary", fill: "brand", hover: "brand600" },
  { variant: "secondary", fill: "navy", hover: "navyMuted" },
  // danger's hover is a fixed Tailwind red, checked separately below.
  { variant: "danger", fill: "danger", hover: null },
];
// Tailwind v4 red-700 / red-300 (danger hover, light / dark).
const RED_700 = "#c10007";
const RED_300 = "#ffa2a2";

describe("solid buttons meet 4.5:1 in every entity and theme", () => {
  for (const entity of ENTITY_KEYS) {
    for (const theme of ["light", "dark"] as ThemeName[]) {
      const c = brandColors(theme, entity);
      const label = theme === "light" ? WHITE : ZINC_900;
      for (const { variant, fill, hover } of SOLID) {
        it(`${entity} ${theme} ${variant}`, () => {
          expect(contrast(c[fill], label)).toBeGreaterThanOrEqual(4.5);
          if (hover) expect(contrast(c[hover], label)).toBeGreaterThanOrEqual(4.5);
        });
      }
      it(`${entity} ${theme} accent (and hover) under zinc-900`, () => {
        expect(contrast(c.accent, ZINC_900)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.accentDark, ZINC_900)).toBeGreaterThanOrEqual(4.5);
      });
      it(`${entity} ${theme} brand text (links, outlineBrand, active tab)`, () => {
        expect(contrast(c.brand, theme === "light" ? WHITE : DARK_CARD)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  // The danger hover is a fixed Tailwind red, the same in every entity.
  it("danger hover meets 4.5:1 in both themes", () => {
    expect(contrast(RED_700, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(RED_300, ZINC_900)).toBeGreaterThanOrEqual(4.5);
  });

  // Ties the table above to the classes Button actually ships.
  it("the hover classes are the ones checked here", () => {
    expect(buttonClasses({ variant: "primary" })).toContain("hover:bg-brand-600");
    expect(buttonClasses({ variant: "secondary" })).toContain("hover:bg-brand-navy-muted");
    expect(buttonClasses({ variant: "danger" })).toContain("hover:bg-red-700");
    expect(buttonClasses({ variant: "danger" })).toContain("dark:hover:bg-red-300");
    expect(buttonClasses({ variant: "accent" })).toContain("text-zinc-900");
    expect(buttonClasses({ variant: "accent" })).toContain("hover:bg-brand-accent-dark");
  });

  it("each solid variant carries the dark-mode label class", () => {
    for (const { variant } of SOLID) {
      expect(buttonClasses({ variant })).toContain("dark:text-zinc-900");
    }
  });

  it("the Sequel guide blue stays available as brandBright for charts and logos", () => {
    expect(brandColors("light", "SEQ").brandBright).toBe("#009ddd");
    expect(contrast("#009ddd", WHITE)).toBeLessThan(4.5); // why it is not the text token
  });
});
