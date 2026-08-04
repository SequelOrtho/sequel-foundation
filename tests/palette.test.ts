import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BRAND_COLORS,
  BRAND_COLOR_VARS,
  brandColors,
  rygColor,
  seriesColors,
  type BrandColors,
} from "../brand/palette";
import { readThemeAttr } from "../ui/brand-colors";

// brand/palette.ts restates theme.css in JavaScript so charts and exporters can
// read a hex. A restatement that nobody checks is just a copy waiting to drift —
// which is exactly how every chart in the fleet ended up on hardcoded light-mode
// hex in the first place. So: parse the CSS and diff it.

const css = readFileSync(fileURLToPath(new URL("../brand/theme.css", import.meta.url)), "utf8");

/** Custom properties declared in one CSS block, by selector. */
function varsIn(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found in theme.css: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const body = css.slice(open + 1, close);
  const out: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(--[a-z0-9-]+):\s*([^;]+);/i);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const cssLight = varsIn(":root {");
const cssDark = varsIn(':root[data-theme="dark"]');

describe("brand palette mirrors theme.css", () => {
  const keys = Object.keys(BRAND_COLOR_VARS) as (keyof BrandColors)[];

  it.each(keys)("light %s matches its custom property", (key) => {
    const cssVar = BRAND_COLOR_VARS[key];
    expect(cssLight[cssVar], `${cssVar} missing from :root`).toBeDefined();
    expect(BRAND_COLORS.light[key].toLowerCase()).toBe(cssLight[cssVar].toLowerCase());
  });

  it.each(keys)("dark %s matches its custom property", (key) => {
    const cssVar = BRAND_COLOR_VARS[key];
    expect(cssDark[cssVar], `${cssVar} missing from the dark block`).toBeDefined();
    expect(BRAND_COLORS.dark[key].toLowerCase()).toBe(cssDark[cssVar].toLowerCase());
  });

  it("covers every token the dark block re-pitches", () => {
    // If theme.css gains a token that changes between themes, it belongs here —
    // otherwise chart code has no themed way to reach it.
    const mapped = new Set(Object.values(BRAND_COLOR_VARS));
    const drifting = Object.keys(cssDark).filter(
      (v) => !mapped.has(v) && cssLight[v] !== undefined && cssLight[v] !== cssDark[v],
    );
    expect(drifting, `themed tokens missing from BRAND_COLOR_VARS: ${drifting.join(", ")}`).toEqual(
      [],
    );
  });

  it("light and dark actually differ (a copy-paste of one block would pass everything else)", () => {
    expect(BRAND_COLORS.light.rygGreen).not.toBe(BRAND_COLORS.dark.rygGreen);
    expect(BRAND_COLORS.light.background).not.toBe(BRAND_COLORS.dark.background);
  });
});

describe("palette helpers", () => {
  it("brandColors selects by theme", () => {
    expect(brandColors("dark").navy).toBe(BRAND_COLORS.dark.navy);
  });

  it("rygColor maps statuses and falls back to the neutral track", () => {
    expect(rygColor("green", "light")).toBe(BRAND_COLORS.light.rygGreen);
    expect(rygColor("red", "dark")).toBe(BRAND_COLORS.dark.rygRed);
    expect(rygColor(null, "light")).toBe(BRAND_COLORS.light.rygNone);
    expect(rygColor(undefined, "light")).toBe(BRAND_COLORS.light.rygNone);
  });

  it("series colors are distinct within a theme", () => {
    for (const theme of ["light", "dark"] as const) {
      const s = seriesColors(theme);
      expect(new Set(s).size).toBe(s.length);
    }
  });
});

describe("readThemeAttr", () => {
  const el = (v: string | null) => ({ getAttribute: () => v });

  it("reads dark only from an explicit attribute", () => {
    expect(readThemeAttr(el("dark"))).toBe("dark");
    expect(readThemeAttr(el("light"))).toBe("light");
  });

  it("defaults to light for missing/unknown values, matching the CSS", () => {
    expect(readThemeAttr(el(null))).toBe("light");
    expect(readThemeAttr(el("system"))).toBe("light");
    expect(readThemeAttr(null)).toBe("light");
  });
});
