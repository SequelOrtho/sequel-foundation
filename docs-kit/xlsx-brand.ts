import ExcelJS from "exceljs";
import { bareHex, DEFAULT_ENTITY, ENTITIES, type EntityKey } from "../brand/entities";

// Shared ExcelJS style constants + small layout helpers for every Sequel xlsx
// exporter. Canonical decision (Phase B): workbook header rows use the BRAND
// NAVY fill — the same header treatment as the pptx contentTable and docx
// table shading — so a workbook, a deck, and a report read as one system.
// (The Acquisition Hub's original helper used zinc-900; adopting this module
// aligns it. Status fills stay on the Tailwind status palette, matching the
// in-app RYG chips.)

export const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F1263" }, // brand navy
};

// Accent-header alternative (brand Light Blue) — for secondary bands or sheets
// that need two header levels; the primary header stays navy.
export const BLUE_HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF009DDD" },
};

// Per-entity header fills (brand/entities.ts): the entity's dark (FVO dark
// green, ON navy) for the primary header, its primary for the accent band.
// The constants above are the Sequel Ortho values and stay as they were.
const solid = (hex: string): ExcelJS.FillPattern => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: `FF${bareHex(hex)}` },
});

export function headerFill(entity: EntityKey = DEFAULT_ENTITY): ExcelJS.FillPattern {
  return entity === "SEQ" ? HEADER_FILL : solid(ENTITIES[entity].roles.navy);
}

export function blueHeaderFill(entity: EntityKey = DEFAULT_ENTITY): ExcelJS.FillPattern {
  return entity === "SEQ" ? BLUE_HEADER_FILL : solid(ENTITIES[entity].roles.primary);
}

export const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: "FFFFFFFF" },
  bold: true,
};

export const GREY_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF4F4F5" }, // zinc-100
};

export const RED_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFEE2E2" }, // red-100
};

export const GREEN_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD1FAE5" }, // emerald-100
};

export const AMBER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFEF3C7" }, // amber-100
};

export function addHeader(
  sheet: ExcelJS.Worksheet,
  titles: string[],
  entity: EntityKey = DEFAULT_ENTITY,
) {
  sheet.addRow(titles);
  const row = sheet.getRow(sheet.rowCount);
  row.font = HEADER_FONT;
  row.fill = headerFill(entity);
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 22;
}

export function titleBlock(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle?: string,
  columns = 6,
) {
  sheet.addRow([title]);
  sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, columns);
  const t = sheet.getRow(sheet.rowCount);
  t.font = { bold: true, size: 14 };
  t.height = 26;
  if (subtitle) {
    sheet.addRow([subtitle]);
    sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, columns);
    const s = sheet.getRow(sheet.rowCount);
    s.font = { italic: true, color: { argb: "FF52525B" } }; // zinc-600
    s.height = 18;
  }
  sheet.addRow([]); // spacer
}

export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
