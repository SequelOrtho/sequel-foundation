// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../theme/ThemeToggle";

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
});
