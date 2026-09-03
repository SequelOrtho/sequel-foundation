import { describe, expect, it } from "vitest";
import {
  comboMatches,
  comboScore,
  isSearchableSize,
  rankComboOptions,
  SEARCHABLE_SELECT_THRESHOLD,
} from "../ui/combo-match";

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
  it("fuzzy: in-order subsequence within a word (≥3 chars)", () => {
    expect(comboMatches(opt, "nyn")).toBe(true); // n·g·u·y·e·n → n,y,n
    expect(comboMatches(opt, "alytcs")).toBe(true); // analytics
    expect(comboMatches(opt, "an")).toBe(true); // substring, fine
    expect(comboMatches(opt, "zq")).toBe(false); // too short for the loose tiers, no substring
  });
  it("fuzzy: tolerates one typo or transposition (≥4 chars)", () => {
    expect(comboMatches(opt, "ngyuen")).toBe(true); // transposition
    expect(comboMatches(opt, "nguen")).toBe(true); // deletion
    expect(comboMatches(opt, "nguyan")).toBe(true); // substitution
    expect(comboMatches(opt, "analitycs")).toBe(false); // two edits — out
    expect(comboMatches(opt, "smith")).toBe(false);
  });
  it("short tokens never match loosely", () => {
    expect(comboMatches(opt, "amx")).toBe(false); // 3 chars: subsequence a·m·x? no x → no; typo tier needs ≥4
    expect(comboMatches({ id: 2, label: "Zed" }, "zdd")).toBe(false);
  });
});

describe("comboScore / rankComboOptions", () => {
  const people = [
    { id: 1, label: "Anderson, Sam" },
    { id: 2, label: "Samuels, Kim" },
    { id: 3, label: "Osamu, Lee" },
    { id: 4, label: "Salmon, Pat" }, // "sam" is a subsequence of "salmon"
  ];
  it("ranks prefix > word-prefix > substring > subsequence, stable otherwise", () => {
    expect(rankComboOptions(people, "sam").map((p) => p.id)).toEqual([2, 1, 3, 4]);
    expect(comboScore(people[1], "sam")).toBeGreaterThan(comboScore(people[0], "sam")!);
    expect(comboScore(people[0], "sam")).toBeGreaterThan(comboScore(people[2], "sam")!);
    expect(comboScore(people[2], "sam")).toBeGreaterThan(comboScore(people[3], "sam")!);
  });
  it("drops non-matches and returns the input untouched for a blank query", () => {
    expect(rankComboOptions(people, "xyz")).toEqual([]);
    expect(rankComboOptions(people, "  ")).toBe(people);
    expect(comboScore(people[0], "")).toBe(0);
    expect(comboScore(people[0], "xyz")).toBeNull();
  });
});

describe("isSearchableSize", () => {
  it("is strictly more than 12", () => {
    expect(SEARCHABLE_SELECT_THRESHOLD).toBe(12);
    expect(isSearchableSize(12)).toBe(false);
    expect(isSearchableSize(13)).toBe(true);
    expect(isSearchableSize(0)).toBe(false);
  });
});
