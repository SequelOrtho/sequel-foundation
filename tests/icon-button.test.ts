import { describe, expect, it } from "vitest";
import { iconButtonClasses } from "../ui/icon-button-classes";

// The three things that kept getting dropped when an icon button was
// hand-rolled — hit area, focus ring, radius — pinned so a future restyle
// cannot quietly drop them again.

describe("iconButtonClasses", () => {
  it("carries a 36px hit area regardless of glyph size", () => {
    expect(iconButtonClasses()).toContain("h-9");
    expect(iconButtonClasses()).toContain("w-9");
  });

  it("carries the same focus-visible ring as Button", () => {
    const c = iconButtonClasses();
    expect(c).toContain("focus-visible:ring-2");
    expect(c).toContain("focus-visible:ring-brand/50");
  });

  it("is rounded and shrink-proof in flex rows", () => {
    expect(iconButtonClasses()).toContain("rounded-md");
    expect(iconButtonClasses()).toContain("shrink-0");
  });

  it("tones differ only in color, and both cover dark mode", () => {
    const neutral = iconButtonClasses("neutral");
    const danger = iconButtonClasses("danger");
    expect(neutral).not.toBe(danger);
    expect(danger).toContain("hover:text-red-600");
    expect(neutral).toContain("dark:");
    expect(danger).toContain("dark:");
  });

  it("both tones rest neutral, so a list of remove buttons is not a wall of red", () => {
    expect(iconButtonClasses("danger")).toContain("text-zinc-500");
  });

  it("appends caller classes last so they win", () => {
    expect(iconButtonClasses("neutral", "ml-2")).toMatch(/ml-2$/);
  });

  it("omits an empty className without leaving a double space", () => {
    expect(iconButtonClasses("neutral", "")).not.toMatch(/\s{2}/);
  });
});
