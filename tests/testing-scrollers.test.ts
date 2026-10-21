import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  collectSourceFiles,
  findUnpositionedScrollers,
  formatUnpositionedScrollers,
} from "../testing/scrollers.mjs";

const f = (source: string, path = "app/page.tsx") => [{ path, source }];
const hits = (source: string, opts?: Parameters<typeof findUnpositionedScrollers>[1]) =>
  findUnpositionedScrollers(f(source), opts);

describe("findUnpositionedScrollers", () => {
  it("flags a scrolling table wrapper with no position", () => {
    const r = hits(`<div className="overflow-x-auto rounded-md border">\n  <table>…<span className="sr-only">Actions</span></table>\n</div>`);
    expect(r).toEqual([{ path: "app/page.tsx", line: 1, scroller: "overflow-x-auto", classes: "overflow-x-auto rounded-md border" }]);
  });

  it("accepts a wrapper with relative, absolute, fixed or sticky", () => {
    for (const pos of ["relative", "absolute", "fixed", "sticky"]) {
      expect(hits(`<div className="${pos} overflow-x-auto">`)).toEqual([]);
    }
  });

  it("flags every sideways scroller: overflow-auto, -scroll, -x-scroll, and variant prefixes", () => {
    for (const cls of ["overflow-auto", "overflow-scroll", "overflow-x-scroll", "sm:overflow-x-auto", "md:max-lg:overflow-x-auto"]) {
      expect(hits(`<div className="p-2 ${cls}">`).map((h) => h.scroller)).toEqual([cls]);
    }
  });

  it("does not count a prefixed position: md:relative leaves the phone width unpositioned", () => {
    expect(hits(`<div className="md:relative overflow-x-auto">`)).toHaveLength(1);
  });

  it("does not mistake look-alike classes", () => {
    expect(hits(`<div className="overflow-x-hidden overflow-hidden overflow-x-autoplay relative-ish">`)).toEqual([]);
    expect(hits(`<div className="overflow-x-auto relative-ish">`)).toHaveLength(1);
  });

  it("leaves vertical-only scrollers alone unless asked", () => {
    const src = `<ul className="max-h-72 overflow-y-auto">`;
    expect(hits(src)).toEqual([]);
    expect(hits(src, { vertical: true }).map((h) => h.scroller)).toEqual(["overflow-y-auto"]);
  });

  it("reads a whole className expression: cn() arguments and conditional template parts", () => {
    expect(hits(`<div className={cn("overflow-x-auto", "relative")}>`)).toEqual([]);
    expect(hits("<div className={`overflow-x-auto ${wide ? \"relative\" : \"\"}`}>")).toEqual([]);
    expect(hits(`<div className={cn("overflow-x-auto", open && "p-2")}>`)).toHaveLength(1);
  });

  it("checks class constants outside JSX", () => {
    expect(hits(`const WRAP = "overflow-x-auto rounded";\nconst OK = 'relative overflow-x-auto';`)).toEqual([
      { path: "app/page.tsx", line: 1, scroller: "overflow-x-auto", classes: "overflow-x-auto rounded" },
    ]);
  });

  it("ignores comments and prose", () => {
    const src = [
      `// the overflow-x-auto wrapper needs "relative"`,
      `/* overflow-auto */`,
      `<p>Wrap a wide table in overflow-x-auto.</p>`,
      `<p>Don't let one apostrophe hide the rest</p>`,
      `<div className="relative overflow-x-auto" />`,
    ].join("\n");
    expect(hits(src)).toEqual([]);
  });

  it("reports one hit per class string and the right line", () => {
    const src = `\n\n<div className="overflow-auto sm:overflow-x-auto">`;
    expect(hits(src)).toEqual([{ path: "app/page.tsx", line: 3, scroller: "overflow-auto", classes: "overflow-auto sm:overflow-x-auto" }]);
  });

  it("takes an allow-list by path or path:line, each with a reason", () => {
    const src = `<div className="overflow-x-auto">\n<div className="overflow-x-auto p-1">`;
    expect(hits(src, { allow: { "app/page.tsx:1": "holds only plain text" } }).map((h) => h.line)).toEqual([2]);
    expect(hits(src, { allow: { "app/page.tsx": "a code sample page" } })).toEqual([]);
    expect(() => hits(src, { allow: { "app/page.tsx": " " } })).toThrow(/needs a reason/);
  });

  it("formats a report that names the fix", () => {
    expect(formatUnpositionedScrollers([])).toMatch(/no unpositioned/);
    const report = formatUnpositionedScrollers(hits(`<div className="overflow-x-auto">`));
    expect(report).toContain("app/page.tsx:1");
    expect(report).toContain("relative");
  });
});

// The rule holds for the foundation's own components, vertical scrollers
// included (MultiSelectFilter's option list is `relative`).
describe("the foundation's own components", () => {
  it("have no unpositioned scrolling wrapper", () => {
    const root = join(__dirname, "..");
    const files = collectSourceFiles(root, ["ui", "session", "access", "undo", "theme", "brand"]);
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((x) => x.path === join("ui", "MultiSelectFilter.tsx"))).toBe(true);
    const found = findUnpositionedScrollers(files, { vertical: true });
    expect(found, formatUnpositionedScrollers(found)).toEqual([]);
  });
});
