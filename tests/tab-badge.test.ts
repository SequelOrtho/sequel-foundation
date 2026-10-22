import { describe, expect, it } from "vitest";
import { badgeText, badgeTitle, iconBadgeGeometry, sameTitleIgnoringBadge, stripBadge } from "../ui/tab-badge";

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

  it("places the circle in the top-right corner inside the icon", () => {
    const g = iconBadgeGeometry(32);
    expect(g.cx + g.r).toBeLessThanOrEqual(32);
    expect(g.cy - g.r).toBeGreaterThanOrEqual(0);
    expect(g.r).toBeGreaterThanOrEqual(8);
  });
});
