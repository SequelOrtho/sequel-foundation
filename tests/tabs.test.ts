import { describe, expect, it } from "vitest";
import { pickTab, tabClasses, tabHref } from "../ui/tabs";

const TABS = ["pending", "approved", "all"] as const;

describe("pickTab", () => {
  it("returns an allow-listed key and falls back on everything else", () => {
    expect(pickTab("approved", TABS, "pending")).toBe("approved");
    expect(pickTab(undefined, TABS, "pending")).toBe("pending");
    expect(pickTab("javascript:alert(1)", TABS, "pending")).toBe("pending");
    expect(pickTab("__proto__", TABS, "pending")).toBe("pending");
    expect(pickTab("constructor", TABS, "all")).toBe("all");
    expect(pickTab("", TABS, "pending")).toBe("pending");
  });

  it("takes the first value of a repeated param, still through the allow-list", () => {
    expect(pickTab(["all", "pending"], TABS, "pending")).toBe("all");
    expect(pickTab(["nope", "all"], TABS, "pending")).toBe("pending");
    expect(pickTab([], TABS, "pending")).toBe("pending");
  });
});

describe("tabHref", () => {
  it("makes the default tab the bare URL and stamps ?tab= for the rest", () => {
    expect(tabHref("/admin", "pending", "pending")).toBe("/admin");
    expect(tabHref("/admin", "approved", "pending")).toBe("/admin?tab=approved");
  });

  it("renames the param and appends to an existing query", () => {
    expect(tabHref("/compliance/obligations", "open", "all", { param: "view" })).toBe("/compliance/obligations?view=open");
    expect(tabHref("/reports?year=2026", "q3", "all")).toBe("/reports?year=2026&tab=q3");
    expect(tabHref("/reports?year=2026", "all", "all")).toBe("/reports?year=2026");
  });

  it("keeps extra allow-listed params, drops empty ones, never duplicates the tab param", () => {
    expect(tabHref("/projects/9", "gates", "overview", { query: { from: "portfolio" } })).toBe("/projects/9?from=portfolio&tab=gates");
    expect(tabHref("/projects/9", "overview", "overview", { query: { from: "portfolio" } })).toBe("/projects/9?from=portfolio");
    expect(tabHref("/projects/9", "gates", "overview", { query: { from: undefined, q: "" } })).toBe("/projects/9?tab=gates");
    expect(tabHref("/projects/9", "gates", "overview", { query: { tab: "smuggled" } })).toBe("/projects/9?tab=gates");
  });

  it("URL-encodes values", () => {
    expect(tabHref("/x", "a b", "all", { query: { from: "my hub&co" } })).toBe("/x?from=my%20hub%26co&tab=a%20b");
  });
});

describe("tabClasses", () => {
  it("marks the selected tab with the brand rule and keeps the others muted", () => {
    expect(tabClasses(true)).toContain("border-brand");
    expect(tabClasses(true)).toContain("font-semibold");
    expect(tabClasses(false)).toContain("border-transparent");
    expect(tabClasses(false)).toContain("text-brand-muted");
    expect(tabClasses(false, "extra")).toMatch(/ extra$/);
  });
});
