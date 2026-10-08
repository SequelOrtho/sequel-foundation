// Brand constants for generated Word documents (the `docx` library). Every
// Sequel docx exporter previously re-declared these five per file — this is
// the one shared source. Hex strings are docx-style (no leading #).
//
// Usage: table-header shading + title runs take NAVY, links/accents take BLUE,
// the accent rule under a title is LIME→NAVY (mirror of the deck accentBar),
// secondary text takes GREY, and every run sets font: FONT (Montserrat is the
// brand typeface in documents too — see brand/BRAND.md).

import { bareHex, DEFAULT_ENTITY, ENTITIES, type EntityKey } from "../brand/entities";
import { FONT as SEQ_FONT } from "../deck-kit/fonts";

export { FONT } from "../deck-kit/fonts";

export const NAVY = "0F1263"; // Dark Blue — headings, table-header shading
export const BLUE = "009DDD"; // Light Blue — links, accents, h2
export const LIME = "CAD400"; // accent rule / highlight
export const GREY = "707372"; // secondary text
export const SURFACE = "F8F8F8"; // tinted panel shading
export const DANGER = "E51919"; // error / critical text
// Critical table-row shading — maroon, never the navy header fill (a critical
// row must not read as a second header; same rule as decks).
export const CRITICAL = "8C1D2D";

// ---- Per-entity brand (brand/entities.ts) --------------------------------
// The constants above are Sequel Ortho's. An FVO / OrthoNebraska exporter takes
// the same roles from docxBrand(entity) — NAVY = the entity's dark (headings,
// table-header shading), BLUE = its primary (links, h2), LIME = its highlight
// rule (FVO light green, ON lime 584) — plus the entity's document typefaces
// (FVO: Montserrat headings over Open Sans body; ON: Arial, per its guide's
// "internal communications & presentations" rule). DANGER and CRITICAL stay
// family-wide: a critical row reads the same in every entity's reports.

export type DocxBrand = {
  NAVY: string;
  BLUE: string;
  LIME: string;
  GREY: string;
  SURFACE: string;
  DANGER: string;
  CRITICAL: string;
  /** Body runs. */
  FONT: string;
  /** Title / heading runs. */
  HEADING_FONT: string;
};

export function docxBrand(entity: EntityKey = DEFAULT_ENTITY): DocxBrand {
  if (entity === "SEQ") {
    return { NAVY, BLUE, LIME, GREY, SURFACE, DANGER, CRITICAL, FONT: SEQ_FONT, HEADING_FONT: SEQ_FONT };
  }
  const { roles, fonts } = ENTITIES[entity];
  return {
    NAVY: bareHex(roles.navy),
    BLUE: bareHex(roles.primary),
    LIME: bareHex(roles.highlight),
    GREY: bareHex(roles.muted),
    SURFACE: bareHex(roles.surface),
    DANGER,
    CRITICAL,
    FONT: fonts.documents.body,
    HEADING_FONT: fonts.documents.heading,
  };
}
