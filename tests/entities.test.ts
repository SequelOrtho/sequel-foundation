import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bareHex, ENTITIES, ENTITY_KEYS, entityAssetDir, isEntityKey } from "../brand/entities";
import { ENTITY_BRAND_COLORS } from "../brand/palette";
import { docxBrand, NAVY } from "../docs-kit/docx-brand";
import { blueHeaderFill, HEADER_FILL, headerFill } from "../docs-kit/xlsx-brand";

// The entity registry restates each brand guide; theme.css / palette.ts carry
// the same values as tokens. Pin the two together, and pin the logo files the
// registry names to what is actually on disk.

const root = join(__dirname, "..");

/** PNG width/height from the IHDR chunk — no image library needed. */
function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString("latin1"), `${file} is not a PNG`).toBe("PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe("entity registry", () => {
  it("has exactly the three operating entities, in the order setup asks for them", () => {
    expect(ENTITY_KEYS).toEqual(["SEQ", "FVO", "ON"]);
    expect(ENTITY_KEYS.map((k) => ENTITIES[k].name)).toEqual([
      "Sequel Ortho",
      "Fox Valley Orthopedics",
      "OrthoNebraska",
    ]);
    for (const k of ENTITY_KEYS) expect(ENTITIES[k].key).toBe(k);
  });

  it("isEntityKey guards the key set exactly", () => {
    expect(isEntityKey("FVO")).toBe(true);
    expect(isEntityKey("fvo")).toBe(false);
    expect(isEntityKey(undefined)).toBe(false);
  });

  it("written forms lead with the guide's preferred name", () => {
    for (const k of ENTITY_KEYS) expect(ENTITIES[k].writtenForms[0]).toBe(ENTITIES[k].name);
    expect(ENTITIES.ON.name).toBe("OrthoNebraska"); // one word, capital O and N
    expect(ENTITIES.FVO.writtenForms).toContain("FVO");
  });

  it.each(ENTITY_KEYS)("%s token roles match the light theme tokens", (k) => {
    const { roles } = ENTITIES[k];
    const c = ENTITY_BRAND_COLORS[k].light;
    expect(c.navy).toBe(roles.navy.toLowerCase());
    expect(c.brand).toBe(roles.primary.toLowerCase());
    expect(c.accent).toBe(roles.accent.toLowerCase());
    expect(c.muted).toBe(roles.muted.toLowerCase());
    expect(c.surface).toBe(roles.surface.toLowerCase());
  });

  it.each(ENTITY_KEYS)("%s roles draw on the guide's swatches (except derived neutrals)", (k) => {
    const { roles, swatches } = ENTITIES[k];
    const official = new Set(swatches.map((s) => s.hex));
    for (const role of ["navy", "primary", "accent", "highlight"] as const) {
      expect(official.has(roles[role]), `${k}.${role} ${roles[role]} is not a guide swatch`).toBe(true);
    }
  });

  it.each(ENTITY_KEYS)("%s swatches are well-formed #RRGGBB", (k) => {
    for (const s of ENTITIES[k].swatches) expect(s.hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("entity logo assets", () => {
  it.each(ENTITY_KEYS)("%s logo files exist, lockups share the registry aspect", (k) => {
    const { logo } = ENTITIES[k];
    for (const f of [logo.color, logo.reverse, logo.white, logo.mark, logo.icon]) {
      expect(existsSync(join(root, f)), f).toBe(true);
    }
    for (const f of [logo.color, logo.reverse, logo.white]) {
      const { w, h } = pngSize(join(root, f));
      expect(w / h, f).toBeCloseTo(logo.aspect, 2);
    }
  });

  it.each(ENTITY_KEYS)("%s favicon is a square in its asset dir", (k) => {
    const { logo } = ENTITIES[k];
    expect(logo.icon).toBe(`brand/assets/${entityAssetDir(k)}/icon.png`);
    const { w, h } = pngSize(join(root, logo.icon));
    expect(w).toBe(h);
  });

  it("every logo file is exported to apps", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.exports["./brand/assets/*"]).toBe("./brand/assets/*");
    expect(pkg.exports["./brand/entities"]).toBe("./brand/entities.ts");
    expect(pkg.exports["./brand/EntityLogo"]).toBe("./brand/EntityLogo.tsx");
  });
});

describe("entity document brand", () => {
  it("Sequel keeps the historical constants", () => {
    expect(docxBrand().NAVY).toBe(NAVY);
    expect(docxBrand("SEQ").FONT).toBe("Montserrat");
    expect(headerFill()).toBe(HEADER_FILL);
  });

  it("FVO and ON take their own darks, primaries, highlights and document faces", () => {
    expect(docxBrand("FVO")).toMatchObject({ NAVY: "14332D", BLUE: "177255", LIME: "14C579", FONT: "Open Sans", HEADING_FONT: "Montserrat" });
    expect(docxBrand("ON")).toMatchObject({ NAVY: "25245C", BLUE: "0072CE", LIME: "D2D755", FONT: "Arial", HEADING_FONT: "Arial" });
    // Critical/danger stay family-wide.
    expect(docxBrand("FVO").CRITICAL).toBe(docxBrand("SEQ").CRITICAL);
  });

  it("xlsx header fills follow the entity", () => {
    expect(headerFill("FVO").fgColor?.argb).toBe(`FF${bareHex(ENTITIES.FVO.roles.navy)}`);
    expect(blueHeaderFill("ON").fgColor?.argb).toBe("FF0072CE");
  });
});
