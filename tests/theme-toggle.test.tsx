// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle, themeToggleWidthClass } from "../theme/ThemeToggle";

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: dark && query.includes("dark"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemeToggle", () => {
  it("stamps the stored theme on mount when the pre-hydration script never ran (client-rendered 403/404)", () => {
    mockSystemDark(false);
    window.localStorage.setItem("hub.theme", "dark");
    render(<ThemeToggle storageKey="hub.theme" />);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("resolves the Browser mode from the system appearance on mount", () => {
    mockSystemDark(true);
    render(<ThemeToggle storageKey="hub.theme" />);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("leaves light alone when that is the stored mode", () => {
    mockSystemDark(true);
    window.localStorage.setItem("hub.theme", "light");
    render(<ThemeToggle storageKey="hub.theme" />);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  // Owner report 2026-11-19: on Browser the button grew with its word and a
  // wrapping header re-flowed. The box may not depend on the mode.
  describe("one width in every mode", () => {
    it("is a fixed width wherever the word shows, and the icon box where it does not", () => {
      expect(themeToggleWidthClass("phone")).toBe("sm:w-24");
      expect(themeToggleWidthClass(false)).toBe("w-24");
      expect(themeToggleWidthClass(true)).toBe("");
    });

    it.each([["phone", "sm:w-24"], [false, "w-24"]] as const)(
      "keeps the same classes through the whole cycle (compact=%s)",
      (compact, width) => {
        mockSystemDark(false);
        const { getByRole } = render(<ThemeToggle storageKey="hub.theme" compact={compact} />);
        const button = getByRole("button");
        const seen = new Map<string, string>();
        for (let i = 0; i < 3; i++) {
          fireEvent.click(button);
          seen.set(button.getAttribute("aria-label") ?? "", button.className);
        }
        // Three clicks visit Light, Dark and Browser, each with its own name…
        expect([...seen.keys()].map((n) => n.split(".")[0]).sort()).toEqual([
          "Theme: Browser",
          "Theme: Dark",
          "Theme: Light",
        ]);
        // …and one class string, carrying the fixed width and no wrapping.
        expect(new Set(seen.values()).size).toBe(1);
        const classes = button.className.split(" ");
        expect(classes).toContain(width);
        expect(classes).toContain("whitespace-nowrap");
        expect(classes).toContain("justify-center");
      },
    );

    it("keeps the label, the phone-only hiding and the accessible name as they were", () => {
      mockSystemDark(false);
      window.localStorage.setItem("hub.theme", "system");
      const { getByRole } = render(<ThemeToggle storageKey="hub.theme" />);
      const button = getByRole("button");
      expect(button.getAttribute("aria-label")).toMatch(/^Theme: Browser\. .+\. Activate to switch\.$/);
      const word = button.querySelectorAll("span")[1];
      expect(word.textContent).toBe("Browser");
      expect(word.className).toBe("sr-only sm:not-sr-only");
    });
  });
});
