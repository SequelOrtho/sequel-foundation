import { describe, expect, it } from "vitest";
import { comboMatches } from "../ui/combo-match";

const opt = { id: 1, label: "Nguyen, Amy", sublabel: "Analytics", keywords: "Amy Nguyen" };

describe("comboMatches", () => {
  it("token-AND across label + sublabel + keywords, case-insensitive", () => {
    expect(comboMatches(opt, "amy ngu")).toBe(true); // First Last order via keywords
    expect(comboMatches(opt, "nguyen amy")).toBe(true); // Last, First order via label
    expect(comboMatches(opt, "amy analytics")).toBe(true);
    expect(comboMatches(opt, "amy bob")).toBe(false);
  });
  it("empty query matches everything", () => {
    expect(comboMatches(opt, "  ")).toBe(true);
  });
});
