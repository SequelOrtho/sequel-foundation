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
