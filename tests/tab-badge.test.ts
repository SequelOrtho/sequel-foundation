import { afterEach, describe, expect, it } from "vitest";
import {
  badgeText,
  badgeTitle,
  forgetBadgedTitles,
  iconBadgeGeometry,
  rememberBadgedTitle,
  sameTitleIgnoringBadge,
  stripBadge,
  stripShownBadge,
} from "../ui/tab-badge";

describe("tab badge helpers", () => {
  it("words the count, capped", () => {
    expect(badgeText(0)).toBe("");
    expect(badgeText(-2)).toBe("");
    expect(badgeText(Number.NaN)).toBe("");
    expect(badgeText(3)).toBe("3");
    expect(badgeText(99)).toBe("99");
    expect(badgeText(100)).toBe("99+");
    expect(badgeText(10, 9)).toBe("9+");
    expect(badgeText(2.7)).toBe("2");
  });

  it("puts the count in front, replaces an old one and never doubles it", () => {
    expect(badgeTitle("Alerts · Hub", 3)).toBe("(3) Alerts · Hub");
    expect(badgeTitle("(3) Alerts · Hub", 5)).toBe("(5) Alerts · Hub");
    expect(badgeTitle("(99+) Alerts · Hub", 4)).toBe("(4) Alerts · Hub");
    expect(badgeTitle(badgeTitle("Home · Hub", 2), 2)).toBe("(2) Home · Hub");
    expect(badgeTitle("(3) Alerts · Hub", 0)).toBe("Alerts · Hub");
    expect(badgeTitle("Alerts · Hub", 250)).toBe("(99+) Alerts · Hub");
  });

  it("strips only its own prefix", () => {
    expect(stripBadge("(12) Page · Hub")).toBe("Page · Hub");
    expect(stripBadge("(draft) Page · Hub")).toBe("(draft) Page · Hub");
    expect(stripBadge("Page (3) · Hub")).toBe("Page (3) · Hub");
    expect(sameTitleIgnoringBadge("(4) Page · Hub", "Page · Hub")).toBe(true);
    expect(sameTitleIgnoringBadge("(4) Page · Hub", "Other · Hub")).toBe(false);
  });

  it("leaves a page's own leading number alone (review F4)", () => {
    expect(badgeTitle("(2026) Annual Report · Hub", 0)).toBe("(2026) Annual Report · Hub");
    expect(badgeTitle("(2026) Annual Report · Hub", 3)).toBe("(3) (2026) Annual Report · Hub");
    expect(badgeTitle("(3) (2026) Annual Report · Hub", 0)).toBe("(2026) Annual Report · Hub");
    expect(stripBadge("(0) x")).toBe("(0) x");
    expect(stripBadge("(05) x")).toBe("(05) x");
    expect(stripBadge("(100) x")).toBe("(100) x");
  });

  it("is stable on a page with no title (review F9)", () => {
    expect(badgeTitle("", 3)).toBe("(3)");
    // The browser trims the trailing space, so "(3)" is what reads back.
    expect(badgeTitle("(3)", 3)).toBe("(3)");
    expect(badgeTitle("(3)", 0)).toBe("");
    expect(badgeTitle("(3)", 5)).toBe("(5)");
  });

  it("places the circle in the top-right corner inside the icon", () => {
    const g = iconBadgeGeometry(32);
    expect(g.cx + g.r).toBeLessThanOrEqual(32);
    expect(g.cy - g.r).toBeGreaterThanOrEqual(0);
    expect(g.r).toBeGreaterThanOrEqual(8);
  });
});

describe("stripShownBadge (review F18)", () => {
  afterEach(() => forgetBadgedTitles());

  it("takes the count off only a title the badge wrote", () => {
    rememberBadgedTitle("(3) Alerts · Hub", "Alerts · Hub");
    expect(stripShownBadge("(3) Alerts · Hub")).toBe("Alerts · Hub");
    expect(stripShownBadge("(12) Midwest Expansion · Hub")).toBe("(12) Midwest Expansion · Hub");
    expect(stripShownBadge("Alerts · Hub")).toBe("Alerts · Hub");
  });

  it("keeps a page's own leading count even when the badge once showed that number elsewhere", () => {
    rememberBadgedTitle("(12) Alerts · Hub", "Alerts · Hub");
    expect(stripShownBadge("(12) Midwest Expansion · Hub")).toBe("(12) Midwest Expansion · Hub");
  });

  it("forgets the oldest titles past its cap", () => {
    rememberBadgedTitle("(1) First · Hub", "First · Hub");
    for (let i = 0; i < 200; i++) rememberBadgedTitle(`(2) Page ${i} · Hub`, `Page ${i} · Hub`);
    expect(stripShownBadge("(1) First · Hub")).toBe("(1) First · Hub");
    expect(stripShownBadge("(2) Page 199 · Hub")).toBe("Page 199 · Hub");
  });
});
