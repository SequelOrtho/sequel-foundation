import { describe, expect, it } from "vitest";
import { brandColors } from "../brand/palette";

// RygStatus colours its glyph and word with the RYG text tokens, so they must
// read at 4.5:1 on every ground a status sits on — page, card, surface, and the
// zinc-100 band/row ground (PR review F3: the first values failed there).
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

const GROUNDS = {
  light: ["#ffffff", "#fafafa", "#f4f4f5", brandColors("light").surface],
  dark: ["#09090b", "#18181b", "#27272a", brandColors("dark").surface],
} as const;

describe("RYG text tokens (RygStatus)", () => {
  it("the 'none' level uses the zinc pair the contrast check holds", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../ui/RygStatus.tsx", import.meta.url), "utf8");
    expect(src).toContain('none: "text-zinc-600 dark:text-zinc-400"');
  });
  for (const theme of ["light", "dark"] as const) {
    it(`reach 4.5:1 on every ${theme} ground`, () => {
      const c = brandColors(theme);
      // "none" is zinc-600 in light mode, zinc-400 in dark (ui/RygStatus.tsx).
      const none = theme === "light" ? "#52525b" : "#a1a1aa";
      for (const text of [c.rygGreenText, c.rygYellowText, c.rygRedText, none]) {
        for (const ground of GROUNDS[theme]) {
          expect(contrast(text, ground), `${text} on ${ground}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
