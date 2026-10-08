import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENTITY_KEYS } from "../brand/entities";
import {
  BRAND_COLORS,
  BRAND_COLOR_VARS,
  ENTITY_BRAND_COLORS,
  brandColors,
  rygColor,
  seriesColors,
  type BrandColors,
} from "../brand/palette";
import { readEntityAttr, readThemeAttr } from "../ui/brand-colors";

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
const ENTITY_OVERRIDES = ENTITY_KEYS.filter((k) => k !== "SEQ");
const entityLight = (k: string) => varsIn(`:root[data-entity="${k}"] {`);
const entityDark = (k: string) => varsIn(`:root[data-entity="${k}"][data-theme="dark"] {`);

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

describe("entity palettes mirror their theme.css blocks", () => {
  const keys = Object.keys(BRAND_COLOR_VARS) as (keyof BrandColors)[];

  it("the Sequel entry is the unchanged default palette", () => {
    expect(ENTITY_BRAND_COLORS.SEQ).toBe(BRAND_COLORS);
  });

  describe.each(ENTITY_OVERRIDES)("%s", (k) => {
    const light = { ...cssLight, ...entityLight(k) };
    const dark = { ...cssDark, ...entityDark(k) };

    it.each(keys)("light %s", (key) => {
      expect(ENTITY_BRAND_COLORS[k].light[key].toLowerCase()).toBe(light[BRAND_COLOR_VARS[key]].toLowerCase());
    });

    it.each(keys)("dark %s", (key) => {
      expect(ENTITY_BRAND_COLORS[k].dark[key].toLowerCase()).toBe(dark[BRAND_COLOR_VARS[key]].toLowerCase());
    });

    it("re-declares in its dark block every var its light block shares with the Sequel dark block", () => {
      // :root[data-entity=X] and :root[data-theme="dark"] tie on specificity, so
      // the entity's LIGHT value would win in dark mode by source order unless
      // the higher-specificity entity-dark block restates it.
      const darkKeys = new Set(Object.keys(entityDark(k)));
      const leaking = Object.keys(entityLight(k)).filter((v) => v in cssDark && !darkKeys.has(v));
      expect(leaking, `${k} light values leak into dark mode: ${leaking.join(", ")}`).toEqual([]);
    });

    it("overrides only declared tokens (no typos that silently do nothing)", () => {
      const known = new Set(Object.keys(cssLight));
      const unknown = [...Object.keys(entityLight(k)), ...Object.keys(entityDark(k))].filter((v) => !known.has(v));
      expect(unknown).toEqual([]);
    });

    it("re-pitches the whole blue-* ramp", () => {
      const ramp = Object.keys(cssLight).filter((v) => v.startsWith("--brand-ramp-"));
      expect(ramp.length).toBe(11);
      for (const v of ramp) expect(entityLight(k)[v], v).toBeDefined();
    });
  });

  it("status colors are family-wide: no entity re-pitches RYG / success / warning / danger", () => {
    for (const k of ENTITY_OVERRIDES) {
      const vars = [...Object.keys(entityLight(k)), ...Object.keys(entityDark(k))];
      expect(vars.filter((v) => /^--(ryg-|brand-(success|warning|danger))/.test(v))).toEqual([]);
    }
  });

  it("the Tailwind blue-* ramp reads the per-entity vars", () => {
    for (const step of [50, 500, 900, 950]) {
      expect(css).toContain(`--color-blue-${step}: var(--brand-ramp-${step});`);
    }
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

  it("series colors are distinct within a theme, for every entity", () => {
    for (const k of ENTITY_KEYS) {
      for (const theme of ["light", "dark"] as const) {
        const s = seriesColors(theme, k);
        expect(s.length).toBe(6);
        expect(new Set(s).size).toBe(s.length);
      }
    }
  });

  it("brandColors / seriesColors default to Sequel Ortho", () => {
    expect(brandColors("light")).toBe(BRAND_COLORS.light);
    expect(seriesColors("dark")).toEqual(seriesColors("dark", "SEQ"));
    expect(brandColors("light", "FVO").navy).toBe("#14332d");
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

describe("readEntityAttr", () => {
  const el = (v: string | null) => ({ getAttribute: () => v });

  it("reads a known entity key", () => {
    expect(readEntityAttr(el("FVO"))).toBe("FVO");
    expect(readEntityAttr(el("ON"))).toBe("ON");
  });

  it("falls back to Sequel Ortho for missing/unknown values, matching the CSS", () => {
    expect(readEntityAttr(el(null))).toBe("SEQ");
    expect(readEntityAttr(el("fvo"))).toBe("SEQ"); // case-sensitive, like the attribute selector
    expect(readEntityAttr(null)).toBe("SEQ");
  });
});
