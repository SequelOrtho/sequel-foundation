import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// brand/theme.css is plain CSS, so these are source-text invariants: the rules
// that make dark mode safe by default for every consumer. If one disappears,
// un-darkened hub code silently regresses to invisible text — lock them here.
const css = readFileSync(join(__dirname, "../brand/theme.css"), "utf8");

describe("theme.css page ground", () => {
  it("owns body background/color from the theme vars, inside @layer base", () => {
    const base = css.match(/@layer base \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(base).toContain("background: var(--background)");
    expect(base).toContain("color: var(--foreground)");
  });

  it("syncs color-scheme with the stamped theme", () => {
    expect(css).toMatch(/:root \{\s*color-scheme: light;/);
    expect(css).toMatch(/:root\[data-theme="dark"\] \{\s*color-scheme: dark;/);
  });

  it("gives native <select> options a dark ground in dark mode, unlayered", () => {
    const rule = css.match(
      /\[data-theme="dark"\] option,\s*\[data-theme="dark"\] optgroup \{([^}]*)\}/,
    );
    expect(rule?.[1]).toContain("background-color: var(--brand-surface)");
    expect(rule?.[1]).toContain("color: var(--foreground)");
    const base = css.match(/@layer base \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(base).not.toContain("option");
  });
});

// ui/FrozenTableHeaders.tsx sets data-frozen + --frozen-offset; these rules
// are the other half. Unlayered, like the option rule, so a cell's own
// bg-* / z-* / sticky utilities (all layered) cannot undo them.
describe("frozen table headers", () => {
  const rule = (selector: string) => {
    const at = css.indexOf(`\n${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it("moves the header cells by the offset, on an opaque ground in both themes", () => {
    const light = rule("thead[data-frozen] > tr > *");
    expect(light).toContain("transform: translateY(var(--frozen-offset, 0px))");
    expect(light).toContain("background-color: var(--color-white)");
    expect(rule('[data-theme="dark"] thead[data-frozen] > tr > *')).toContain("background-color: var(--color-zinc-900)");
  });

  it("never repositions a header cell that is itself sticky (a held first column)", () => {
    const positioned = rule("thead[data-frozen] > tr > :not([data-sticky-column], [data-frozen-sticky])");
    expect(positioned).toContain("position: relative");
    expect(rule("thead[data-frozen] > tr > :is([data-sticky-column], [data-frozen-sticky])")).not.toContain("position");
  });

  it("stacks above a held body column (z-10) and below sticky bars and popovers (z-20)", () => {
    const z = (s: string) => Number(rule(s).match(/z-index: (\d+)/)?.[1]);
    const cell = z("thead[data-frozen] > tr > :not([data-sticky-column], [data-frozen-sticky])");
    const held = z("thead[data-frozen] > tr > :is([data-sticky-column], [data-frozen-sticky])");
    expect(cell).toBeGreaterThan(10);
    expect(held).toBeGreaterThan(cell);
    expect(held).toBeLessThan(20);
  });

  it("is unlayered, and prints where the table drew it", () => {
    for (const layer of css.matchAll(/@layer [a-z]+ \{([\s\S]*?)\n\}/g)) expect(layer[1]).not.toContain("data-frozen");
    const print = css.slice(css.indexOf("thead[data-frozen] > tr > * {", css.indexOf("@media print {\n  thead")));
    expect(print.slice(0, print.indexOf("}"))).toContain("transform: none");
  });
});

describe("entity typography", () => {
  it("body text reads the entity body face, with Montserrat as the default", () => {
    expect(css).toMatch(
      /\nbody \{\s*--brand-font-body: var\(--font-montserrat, "Montserrat"\);\s*--brand-font-heading: var\(--font-montserrat, "Montserrat"\);\s*font-family: var\(--brand-font-body\)/,
    );
    expect(css).toContain("--font-sans: var(--brand-font-body);");
  });

  it("font roles are declared on body, never :root (next/font vars live on <body>)", () => {
    // A var() inside a custom property resolves where it is declared; on :root
    // --font-montserrat is undefined and the role collapses to its fallback.
    for (const block of [':root {', ':root[data-entity="FVO"] {', ':root[data-entity="ON"] {']) {
      const start = css.indexOf(block);
      expect(css.slice(start, css.indexOf("\n}", start))).not.toContain("--brand-font-");
    }
  });

  it("FVO body is Open Sans and its headings Montserrat, inside @layer base", () => {
    expect(css).toMatch(/:root\[data-entity="FVO"\] body \{\s*--brand-font-body: var\(--font-open-sans, "Open Sans"\);/);
    const base = css.match(/@layer base \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(base).toContain(':root[data-entity="FVO"] :where(h1, h2, h3, h4, h5, h6)');
    expect(base).toContain("var(--brand-font-heading)");
  });

  it("no unscoped heading font rule — SEQ/ON headings keep inheriting", () => {
    expect(css).not.toMatch(/^\s*h1,\s*$/m);
  });
});

describe("dark-mode contrast rescue", () => {
  it("rescues un-darkened mid-gray text across all five gray families", () => {
    for (const fam of ["gray", "slate", "zinc", "neutral", "stone"]) {
      expect(css).toContain(`.text-${fam}-500`);
      expect(css).toContain(`.text-${fam}-600`);
      expect(css).toContain(`.text-${fam}-900`);
    }
  });

  it("rescues un-darkened light borders", () => {
    expect(css).toContain(".border-zinc-200");
    expect(css).toContain(".border-zinc-300");
  });

  it("leaves elements that declare their own dark: styles alone", () => {
    const guards = css.match(/:not\(\[class\*="dark:text"\]\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(3);
    expect(css).toContain(':not([class*="dark:border"])');
  });

  it("stays scoped to the stamped dark theme, never the media query", () => {
    const rescue = css.slice(css.indexOf("Dark-mode contrast rescue"));
    expect(rescue).toContain('[data-theme="dark"]');
    expect(rescue).not.toContain("prefers-color-scheme");
  });
});

describe("ui components use theme-aware muted text", () => {
  it.each(["Field", "SaveState"])("%s has no un-darkened zinc text", (name) => {
    const src = readFileSync(join(__dirname, `../ui/${name}.tsx`), "utf8");
    const unpaired = src
      .match(/className="[^"]*"/g)
      ?.filter((c) => /text-(gray|slate|zinc|neutral|stone)-[2-9]/.test(c) && !c.includes("dark:text"));
    expect(unpaired ?? []).toEqual([]);
  });
});
