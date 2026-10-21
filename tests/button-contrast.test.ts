import { describe, expect, it } from "vitest";
import { ENTITY_KEYS } from "../brand/entities";
import { brandColors, type BrandColors, type ThemeName } from "../brand/palette";
import { BUTTON_BUSY_CLASS, BUTTON_DISABLED_CLASS, buttonClasses } from "../ui/Button";
import { ZINC, contrast } from "./_contrast";
import { compareSpecificity, compileClasses, specificity } from "./_tailwind";

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

// Disabled is its own state (v0.30.0): a neutral zinc ground with muted text
// in every variant, replacing `disabled:opacity-50`, which left a light dark-
// mode fill looking enabled (hub walk-through 2026-10-21).
describe("disabled buttons look disabled in both themes", () => {
  const VARIANTS = ["primary", "secondary", "accent", "outline", "outlineBrand", "ghost", "danger"] as const;
  const DISABLED = { light: { ground: ZINC[100], label: ZINC[500] }, dark: { ground: ZINC[800], label: ZINC[500] } };

  it("every variant carries the disabled state and no opacity-only disabled", () => {
    for (const variant of VARIANTS) {
      const cls = buttonClasses({ variant }).split(" ");
      for (const t of BUTTON_DISABLED_CLASS.split(" ")) expect(cls, `${variant} ${t}`).toContain(t);
      expect(cls.some((t) => /^disabled:opacity/.test(t)), variant).toBe(false);
    }
  });

  it("paints a neutral ground and a muted label in each theme", () => {
    const t = BUTTON_DISABLED_CLASS.split(" ");
    expect(t).toEqual(expect.arrayContaining([
      "disabled:not-aria-busy:bg-zinc-100",
      "disabled:not-aria-busy:text-zinc-500",
      "dark:disabled:not-aria-busy:bg-zinc-800",
      "dark:disabled:not-aria-busy:text-zinc-500",
      "disabled:not-aria-busy:cursor-not-allowed",
    ]));
  });

  // Compiled with the real Tailwind v4 engine (tests/_tailwind.ts): every
  // disabled rule must outrank every hover, dark-mode and dark-mode hover rule
  // of every variant that sets the same property, by specificity — so neither
  // hovering a disabled button nor the stylesheet's order can undo the
  // disabled look — and must leave a busy button alone.
  it("outranks every variant's hover and dark rules by compiled specificity, and skips busy buttons", async () => {
    const tokens = VARIANTS.flatMap((variant) => buttonClasses({ variant }).split(" "));
    const rules = await compileClasses(tokens);
    const disabledTokens = new Set(BUTTON_DISABLED_CLASS.split(" "));
    const disabled = rules.filter((r) => disabledTokens.has(r.token));
    // Every disabled token compiled to a real rule.
    expect(new Set(disabled.map((r) => r.token))).toEqual(disabledTokens);
    for (const d of disabled) {
      expect(d.selector, d.token).toContain(":disabled");
      expect(d.selector, d.token).toContain(':not(*[aria-busy="true"])');
    }
    for (const variant of VARIANTS) {
      const own = new Set(buttonClasses({ variant }).split(" ").filter((t) => !disabledTokens.has(t)));
      const competitors = rules.filter((r) => own.has(r.token) && /(^|:)(hover|dark|enabled):/.test(r.token));
      expect(competitors.length, variant).toBeGreaterThan(0);
      for (const d of disabled) {
        for (const c of competitors) {
          if (!c.props.some((p) => d.props.includes(p))) continue;
          expect(
            compareSpecificity(specificity(d.selector), specificity(c.selector)),
            `${variant}: ${d.selector} vs ${c.selector}`,
          ).toBeGreaterThan(0);
        }
      }
    }
    const busy = rules.filter((r) => BUTTON_BUSY_CLASS.split(" ").includes(r.token));
    expect(busy.length).toBe(2);
    for (const b of busy) expect(b.selector).toContain('[aria-busy="true"]');
  });

  it("keeps the disabled label at least 3:1 on its ground", () => {
    expect(contrast(DISABLED.light.label, DISABLED.light.ground)).toBeGreaterThanOrEqual(3);
    expect(contrast(DISABLED.dark.label, DISABLED.dark.ground)).toBeGreaterThanOrEqual(3);
  });

  // A disabled button reads as disabled by losing its colour, not by fading:
  // the ground is a neutral gray, and every solid fill differs from it by hue
  // (a channel spread over 24) or by lightness (3:1 or more).
  it("sets a neutral ground apart from every solid fill, every entity", () => {
    const spread = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return Math.max(...ch) - Math.min(...ch);
    };
    for (const theme of ["light", "dark"] as ThemeName[]) expect(spread(DISABLED[theme].ground)).toBeLessThanOrEqual(4);
    for (const entity of ENTITY_KEYS) {
      for (const theme of ["light", "dark"] as ThemeName[]) {
        const c = brandColors(theme, entity);
        for (const fill of [c.brand, c.navy, c.danger, c.accent]) {
          const ground = DISABLED[theme].ground;
          expect(spread(fill) > 24 || contrast(ground, fill) >= 3, `${entity} ${theme} ${fill}`).toBe(true);
        }
      }
    }
    // In dark mode it is also lighter than the outline variants' zinc-900, so
    // a disabled outline Button doesn't look like an enabled one.
    expect(contrast(DISABLED.dark.ground, ZINC[900])).toBeGreaterThan(1.1);
  });

  it("leaves a busy button looking busy: its fill, dimmed, with the progress cursor", () => {
    expect(BUTTON_BUSY_CLASS.split(" ")).toEqual(["aria-busy:cursor-progress", "aria-busy:opacity-80"]);
    for (const variant of VARIANTS) expect(buttonClasses({ variant })).toContain(BUTTON_BUSY_CLASS);
  });

  // The fix must not change any enabled button's look: with the disabled and
  // busy states taken out, every variant's classes are exactly v0.29.0's.
  it("leaves every enabled button exactly as it was", () => {
    const V029_BASE =
      "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 min-h-10 px-4 py-2 text-sm";
    const V029: Record<(typeof VARIANTS)[number], string> = {
      primary: "bg-brand text-white hover:bg-brand-600 dark:text-zinc-900",
      secondary: "bg-brand-navy text-white hover:bg-brand-navy-muted dark:text-zinc-900",
      accent: "bg-brand-accent text-zinc-900 dark:text-zinc-900 hover:bg-brand-accent-dark hover:text-zinc-900 dark:hover:text-zinc-900",
      outline: "border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
      outlineBrand: "border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-brand hover:border-brand hover:bg-brand-surface",
      ghost: "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
      danger: "bg-brand-danger text-white hover:bg-red-700 dark:text-zinc-900 dark:hover:bg-red-300",
    };
    const stateTokens = new Set([...BUTTON_DISABLED_CLASS.split(" "), ...BUTTON_BUSY_CLASS.split(" ")]);
    for (const variant of VARIANTS) {
      const enabled = buttonClasses({ variant }).split(" ").filter((t) => !stateTokens.has(t)).join(" ");
      expect(enabled).toBe(`${V029_BASE} ${V029[variant]}`);
    }
  });
});
