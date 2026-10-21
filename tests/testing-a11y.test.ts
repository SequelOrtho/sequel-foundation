import { describe, expect, it } from "vitest";
import {
  A11Y_TAGS,
  blockingViolations,
  findBrokenLinks,
  formatBrokenLinks,
  formatViolations,
  sameOriginLinks,
  themeInitFor,
  type AxeViolation,
} from "../testing/a11y.mjs";

const v = (id: string, impact: AxeViolation["impact"], nodes = 1): AxeViolation => ({
  id,
  impact,
  help: `${id} help`,
  helpUrl: `https://dequeuniversity.com/rules/axe/${id}`,
  nodes: Array.from({ length: nodes }, (_, i) => ({ target: [`#el${i}`] })),
});

describe("a11y CI helpers (UX audit Q5 / FND-22)", () => {
  it("scans WCAG 2.2 AA", () => {
    expect(A11Y_TAGS).toContain("wcag22aa");
    expect(A11Y_TAGS).toContain("wcag2aa");
  });

  it("fails on serious and critical only, minus reasoned exceptions", () => {
    const results = { violations: [v("color-contrast", "serious"), v("region", "moderate"), v("label", "critical"), v("x", null)] };
    expect(blockingViolations(results).map((x) => x.id)).toEqual(["color-contrast", "label"]);
    expect(blockingViolations(results, { allow: { label: "third-party widget, ticket 12" } }).map((x) => x.id)).toEqual(["color-contrast"]);
    expect(() => blockingViolations(results, { allow: { label: " " } })).toThrow(/needs a reason/);
  });

  it("reports rule, help link and up to five elements", () => {
    const text = formatViolations([v("color-contrast", "serious", 7)], "/master (dark)");
    expect(text).toContain("/master (dark): 1 blocking");
    expect(text).toContain("color-contrast: color-contrast help (https://dequeuniversity.com/rules/axe/color-contrast)");
    expect(text).toContain("#el4");
    expect(text).not.toContain("#el5");
    expect(text).toContain("…and 2 more");
    expect(formatViolations([], "/")).toBe("/: no blocking accessibility issues");
  });

  it("checks same-origin pages only, once each, without fragments", () => {
    const links = sameOriginLinks(
      ["/admin", "/admin#users", "https://hub.example/admin", "https://other.example/x", "mailto:a@b.c", "#top", "tel:1", null, "", "help?x=1"],
      "https://hub.example/schedule/provider",
    );
    expect(links).toEqual(["https://hub.example/admin", "https://hub.example/schedule/help?x=1"]);
  });

  it("finds broken links: 4xx/5xx and failed requests", async () => {
    const answers: Record<string, number | Error> = { "/a": 200, "/b": 404, "/c": new Error("timeout"), "/d": 500, "/e": 302 };
    const broken = await findBrokenLinks(Object.keys(answers), async (u) => {
      const a = answers[u];
      if (a instanceof Error) throw a;
      return { status: a };
    });
    expect(broken.map((b) => b.url)).toEqual(["/b", "/c", "/d"]);
    expect(formatBrokenLinks(broken, "/")).toContain("/c → failed (timeout)");
    expect(formatBrokenLinks([], "/")).toBe("/: no broken links");
    expect(await findBrokenLinks([], async () => ({ status: 200 }))).toEqual([]);
  });

  it("pins the theme before load with the app's key", () => {
    const store = new Map<string, string>();
    const localStorage = { setItem: (k: string, val: string) => store.set(k, val) };
    new Function("localStorage", themeInitFor('sch.theme"', "dark"))(localStorage);
    expect(store.get('sch.theme"')).toBe("dark");
  });
});

// a11y.mjs and a11y.d.mts are edited by hand side by side (Playwright can't
// load TypeScript from node_modules); keep their exports in step.
describe("testing/a11y ships matching JS and types", () => {
  it("declares every runtime export and nothing else", async () => {
    const { readFileSync } = await import("node:fs");
    const runtime = Object.keys(await import("../testing/a11y.mjs")).sort();
    const dts = readFileSync(new URL("../testing/a11y.d.mts", import.meta.url), "utf8");
    const declared = [...dts.matchAll(/export declare (?:const|function) (\w+)/g)].map((m) => m[1]).sort();
    expect(declared).toEqual(runtime);
  });
});
