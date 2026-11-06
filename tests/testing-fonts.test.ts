import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectSourceFiles,
  findGoogleFontImports,
  formatGoogleFontImports,
} from "../testing/fonts.mjs";

const hits = (source: string, path = "app/fonts.ts", opts?: Parameters<typeof findGoogleFontImports>[1]) =>
  findGoogleFontImports([{ path, source }], opts);

describe("findGoogleFontImports", () => {
  it("flags a static named import, with its line and statement", () => {
    const r = hits(`// fonts\nimport { Montserrat, Geist_Mono } from "next/font/google";\n`);
    expect(r).toEqual([
      {
        path: "app/fonts.ts",
        line: 2,
        module: "next/font/google",
        statement: `import { Montserrat, Geist_Mono } from "next/font/google";`,
      },
    ]);
  });

  it("flags every quote style", () => {
    for (const q of [`"`, `'`, "`"]) {
      expect(hits(`import { Montserrat } from ${q}next/font/google${q};`)).toHaveLength(1);
    }
  });

  it("flags multi-line, default, namespace, type, side-effect and re-export forms", () => {
    const forms = [
      `import {\n  Montserrat,\n  Open_Sans,\n} from "next/font/google";`,
      `import * as google from 'next/font/google'`,
      `import type { NextFont } from "next/font/google";`,
      `import "next/font/google";`,
      `export { Montserrat } from "next/font/google";`,
      `export * from "next/font/google"`,
      `import{Montserrat}from"next/font/google"`,
    ];
    for (const src of forms) expect(hits(src), src).toHaveLength(1);
  });

  it("flags dynamic import() and require(), any quotes and spacing", () => {
    const forms = [
      `const g = await import("next/font/google");`,
      `const g = await import( 'next/font/google' );`,
      "const g = await import(`next/font/google`);",
      `const g = import(\n  "next/font/google"\n);`,
      `const { Montserrat } = require("next/font/google");`,
      `const g = require ('next/font/google')`,
    ];
    for (const src of forms) expect(hits(src), src).toHaveLength(1);
  });

  it("flags the legacy @next/font/google package and subpaths", () => {
    expect(hits(`import { Inter } from "@next/font/google";`).map((h) => h.module)).toEqual(["@next/font/google"]);
    expect(hits(`import "next/font/google/target.css";`).map((h) => h.module)).toEqual(["next/font/google/target.css"]);
  });

  it("accepts next/font/local, geist and other modules", () => {
    const src = [
      `import localFont from "next/font/local";`,
      `import { GeistMono } from "geist/font/mono";`,
      `import { googleish } from "next/font/googlex";`,
      `import x from "my-next/font/google";`,
    ].join("\n");
    expect(hits(src)).toEqual([]);
  });

  it("ignores comments and strings that only mention the module", () => {
    const src = [
      `// was: import { Montserrat } from "next/font/google";`,
      `/* import("next/font/google") */`,
      `/**`,
      ` * import { Geist_Mono } from 'next/font/google'`,
      ` */`,
      `const why = "next/font/google downloads at build time";`,
      `const banned = ["next/font/google"];`,
      `const url = "https://fonts.google.com"; // see "next/font/google"`,
    ].join("\n");
    expect(hits(src)).toEqual([]);
  });

  it("does not let an apostrophe in JSX text hide a later import", () => {
    const src = `<p>Don't</p>\nimport { Montserrat } from "next/font/google";`;
    expect(hits(src).map((h) => h.line)).toEqual([2]);
  });

  it("finds each import across several files", () => {
    const r = findGoogleFontImports([
      { path: "app/layout.tsx", source: `import { Montserrat } from "next/font/google";` },
      { path: "app/fonts.ts", source: `import localFont from "next/font/local";` },
      { path: "app/global-error.tsx", source: `import { Geist_Mono } from "next/font/google";\nconst x = await import("next/font/google");` },
    ]);
    expect(r.map((h) => `${h.path}:${h.line}`)).toEqual(["app/layout.tsx:1", "app/global-error.tsx:1", "app/global-error.tsx:2"]);
  });

  it("honours a reasoned allow-list by path or path:line, and refuses an empty reason", () => {
    const src = `import { A } from "next/font/google";\nimport { B } from "next/font/google";`;
    expect(hits(src, "app/fonts.ts", { allow: { "app/fonts.ts": "migrating in #12" } })).toEqual([]);
    expect(hits(src, "app/fonts.ts", { allow: { "app/fonts.ts:1": "migrating" } }).map((h) => h.line)).toEqual([2]);
    expect(() => hits(src, "app/fonts.ts", { allow: { "app/fonts.ts": " " } })).toThrow(/needs a reason/);
  });
});

describe("formatGoogleFontImports", () => {
  it("says so when clean", () => {
    expect(formatGoogleFontImports([])).toBe("no next/font/google imports");
  });

  it("lists each hit with the fix", () => {
    const out = formatGoogleFontImports(hits(`import { Montserrat } from "next/font/google";`, "app/layout.tsx"));
    expect(out).toContain("1 next/font/google import(s)");
    expect(out).toContain("next/font/local");
    expect(out).toContain(`- app/layout.tsx:1  import { Montserrat } from "next/font/google";`);
  });
});

describe("this repo follows the rule", () => {
  it("imports next/font/google nowhere in its own code", () => {
    const root = join(__dirname, "..");
    const dirs = ["access", "assistant", "brand", "connector", "deck-kit", "docs-kit", "holidays", "llm", "session", "testing", "theme", "ui", "undo", "scripts"];
    const r = findGoogleFontImports(collectSourceFiles(root, dirs));
    expect(r, formatGoogleFontImports(r)).toEqual([]);
  });
});

// fonts.mjs and fonts.d.mts are edited by hand side by side; keep their
// exports in step.
describe("testing/fonts ships matching JS and types", () => {
  it("declares every runtime export and nothing else", async () => {
    const runtime = Object.keys(await import("../testing/fonts.mjs")).sort();
    const dts = readFileSync(new URL("../testing/fonts.d.mts", import.meta.url), "utf8");
    const declared = [
      ...[...dts.matchAll(/export declare (?:const|function) (\w+)/g)].map((m) => m[1]),
      ...[...dts.matchAll(/^export \{ (\w+) \} from/gm)].map((m) => m[1]),
    ].sort();
    expect(declared).toEqual(runtime);
  });
});
