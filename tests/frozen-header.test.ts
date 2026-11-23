import { describe, it, expect } from "vitest";
import { FROZEN_KEEP_PX, focusClearance, frozenOffset } from "../ui/frozen-header";

describe("frozen table headers: how far the header row moves", () => {
  it("stays put while the table's top is in the window", () => {
    expect(frozenOffset(0, 900, 40)).toBe(0);
    expect(frozenOffset(120, 900, 40)).toBe(0);
  });

  it("follows the page once the table's top has scrolled above", () => {
    expect(frozenOffset(-1, 900, 40)).toBe(1);
    expect(frozenOffset(-300, 900, 40)).toBe(300);
  });

  it("leaves with the table: never past the room above its last row", () => {
    const room = 900 - 40 - FROZEN_KEEP_PX;
    expect(frozenOffset(-room, 900, 40)).toBe(room);
    expect(frozenOffset(-5000, 900, 40)).toBe(room);
  });

  it("does nothing on a table too short to scroll under its own header", () => {
    expect(frozenOffset(-10, 60, 40)).toBe(0);
    expect(frozenOffset(-10, 0, 0)).toBe(0);
  });

  it("is never negative, never beyond the table, and whole pixels, for any table", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 500; i += 1) {
      const top = rnd() * 4000 - 3000;
      const height = rnd() * 3000;
      const head = rnd() * 120;
      const off = frozenOffset(top, height, head);
      expect(Number.isInteger(off)).toBe(true);
      expect(off).toBeGreaterThanOrEqual(0);
      if (off > 0) {
        expect(top).toBeLessThan(0);
        expect(off).toBeLessThanOrEqual(Math.ceil(-top));
        expect(off + head).toBeLessThanOrEqual(height - FROZEN_KEEP_PX + 1);
      }
    }
  });
});

describe("frozen table headers: under a bar fixed to the top of the window", () => {
  it("freezes once the header row reaches the bar, and sits under it", () => {
    expect(frozenOffset(48, 900, 40, 48)).toBe(0);
    expect(frozenOffset(47, 900, 40, 48)).toBe(1);
    expect(frozenOffset(-300, 900, 40, 48)).toBe(348);
  });

  it("still leaves with the table", () => {
    expect(frozenOffset(-5000, 900, 40, 48)).toBe(900 - 40 - FROZEN_KEEP_PX);
  });

  it("no bar is the same as an inset of 0", () => {
    for (const top of [-700, -1, 0, 30]) expect(frozenOffset(top, 900, 40, 0)).toBe(frozenOffset(top, 900, 40));
  });
});

describe("frozen table headers: a focused control is never left under the header", () => {
  it("asks for no scroll when the control is clear of the header", () => {
    expect(focusClearance(80, 40)).toBe(0);
    expect(focusClearance(44, 40)).toBe(0);
  });

  it("asks for exactly the hidden part, plus the gap", () => {
    expect(focusClearance(30, 40)).toBe(14);
    expect(focusClearance(-12.5, 40)).toBe(57);
  });
});
