import { describe, expect, it } from "vitest";
import { ENTITY_KEYS } from "../brand/entities";
import { brandColors, type ThemeName } from "../brand/palette";
import { buttonClasses } from "../ui/Button";
import { FILE_INPUT_CLASS, fileInputClasses } from "../ui/file-input-class";
import * as ui from "../ui";
import { ZINC, contrast } from "./_contrast";

const tokens = FILE_INPUT_CLASS.split(" ");
const WHITE = "#ffffff";

// The outline Button's look, re-expressed on the ::file-selector-button: put
// `file:` before the utility itself, after any variants (`dark:border-zinc-700`
// → `dark:file:border-zinc-700`), and gate hover on `enabled:`.
function fileTwin(token: string): string {
  const parts = token.split(":");
  const utility = parts.pop()!;
  const variants = parts.map((v) => (v === "hover" ? "enabled:hover" : v));
  return [...variants, "file", utility].join(":");
}

const outlineLook = buttonClasses({ variant: "outline" })
  .split(" ")
  .filter((t) => /^(dark:)?(hover:)?((border|bg|text)-zinc-|bg-white$)|^border$/.test(t));

describe("FILE_INPUT_CLASS", () => {
  it("styles the file button exactly as the outline Button, in both themes", () => {
    expect(outlineLook).toHaveLength(9);
    for (const t of outlineLook) expect(tokens, `${t} → ${fileTwin(t)}`).toContain(fileTwin(t));
  });

  // min-h-8 = 32px, over the 24px WCAG 2.5.8 floor.
  it("gives the file button a rounded box with padding and a tap-target height", () => {
    for (const t of ["file:rounded-md", "file:px-3", "file:py-1.5", "file:min-h-8", "file:text-sm", "file:font-medium", "file:cursor-pointer"]) {
      expect(tokens).toContain(t);
    }
  });

  it("keeps the button's label on one line and lets the input shrink in a row", () => {
    expect(tokens).toContain("file:whitespace-nowrap");
    for (const t of ["block", "w-full", "min-w-0", "max-w-full"]) expect(tokens).toContain(t);
  });

  it("sets the file name in plain text-sm muted text", () => {
    expect(tokens).toContain("text-sm");
    expect(tokens).toContain("text-brand-muted");
  });

  it("draws the family focus ring on the input, never leaving it bare", () => {
    for (const t of ["focus-visible:outline-none", "focus-visible:ring-2", "focus-visible:ring-brand/50", "focus-visible:ring-offset-2"]) {
      expect(tokens).toContain(t);
    }
    expect(FILE_INPUT_CLASS).not.toMatch(/(^|\s)focus:outline-none/);
  });

  it("shows no hover change while disabled", () => {
    expect(tokens.filter((t) => t.includes("hover:")).every((t) => t.includes("enabled:hover:"))).toBe(true);
    expect(tokens).toContain("disabled:cursor-not-allowed");
  });

  it("is exported from the ui index", () => {
    expect(ui.FILE_INPUT_CLASS).toBe(FILE_INPUT_CLASS);
    expect(ui.fileInputClasses).toBe(fileInputClasses);
  });
});

describe("file picker contrast", () => {
  for (const entity of ENTITY_KEYS) {
    for (const theme of ["light", "dark"] as ThemeName[]) {
      it(`${entity} ${theme}: the muted file name is AA on the page ground`, () => {
        const ground = theme === "light" ? WHITE : ZINC[900];
        expect(contrast(brandColors(theme, entity).muted, ground)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it("the button label is AA on its ground and hover ground, both themes", () => {
    expect(contrast(ZINC[700], WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ZINC[700], ZINC[50])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ZINC[300], ZINC[900])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ZINC[300], ZINC[800])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("fileInputClasses", () => {
  it("returns the base alone when no extras are given", () => {
    expect(fileInputClasses()).toBe(FILE_INPUT_CLASS);
    expect(fileInputClasses("  ")).toBe(FILE_INPUT_CLASS);
  });
  it("appends call-site extras after the base", () => {
    expect(fileInputClasses(" mt-0.5 max-w-sm ")).toBe(`${FILE_INPUT_CLASS} mt-0.5 max-w-sm`);
  });
  // Tailwind v4 emits .w-full after .w-64, so a plain width extra would lose.
  it("drops the base w-full when the extras set an unprefixed width", () => {
    const cls = fileInputClasses("w-auto").split(" ");
    expect(cls).toContain("w-auto");
    expect(cls).not.toContain("w-full");
  });
  it("keeps w-full for max-w-*, min-w-*, and responsive widths", () => {
    for (const extra of ["max-w-xs", "min-w-40", "sm:w-64"]) {
      expect(fileInputClasses(extra).split(" ")).toContain("w-full");
    }
  });
});
