// The "Fonts are local" rule (DESIGN-CONVENTIONS §1, v0.36.0), as a check each
// hub runs from its own unit suite.
//
// `next/font/google` downloads every font file from Google during
// `next build`. When that download fails the build fails ("Module not found:
// Can't resolve '@vercel/turbopack-next/internal/font/google/font'"), and a
// network blip has broken hub CI and deploys many times. Hubs load the brand
// faces with `next/font/local` from npm packages that ship the files
// (`@fontsource-variable/montserrat`, `geist/font/mono`), so the build never
// leaves the machine. This check keeps `next/font/google` from coming back.
//
// findGoogleFontImports reads source text and returns every module reference
// to `next/font/google` (or the legacy `@next/font/google`, or a subpath of
// either): static `import … from`, side-effect `import "…"`, `export … from`,
// dynamic `import(…)` and `require(…)`, in any quote style. Comments are
// skipped, and so is a plain string that merely mentions the module.
//
// Shipped as plain JavaScript (fonts.mjs + fonts.d.mts), like scrollers.mjs,
// so it loads anywhere: a hub's vitest suite or a Node script. Edit both
// files together.

export { collectSourceFiles } from "./scrollers.mjs";

/** Module specifiers that fetch fonts from Google at build time. */
export const GOOGLE_FONT_MODULES = ["next/font/google", "@next/font/google"];

const isGoogleFontModule = (spec) =>
  GOOGLE_FONT_MODULES.some((m) => spec === m || spec.startsWith(`${m}/`));

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

// One pass over the source: string literals (quoted, and template literals
// without `${…}`, as [start, end, value]) with comments skipped. A `//` right
// after a colon is a URL, not a comment. A template literal with `${…}` is
// skipped whole: its specifier is computed, which this check can't resolve.
function stringLiterals(source) {
  const out = [];
  const n = source.length;
  let i = 0;
  while (i < n) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/" && source[i - 1] !== ":") {
      const e = source.indexOf("\n", i);
      i = e < 0 ? n : e;
    } else if (ch === "/" && source[i + 1] === "*") {
      const e = source.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      let value = "";
      let computed = false;
      let closed = false;
      while (j < n) {
        const c = source[j];
        if (c === "\\") {
          value += source[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (c === ch) {
          closed = true;
          break;
        }
        if (ch !== "`" && c === "\n") break;
        if (ch === "`" && c === "$" && source[j + 1] === "{") computed = true;
        value += c;
        j++;
      }
      if (closed && !computed) out.push([i, j + 1, value]);
      i = closed ? j + 1 : i + 1;
    } else i++;
  }
  return out;
}

// The code right before a string literal that makes it a module specifier:
// `from`, a bare `import` (side effect), or the open paren of `import(` /
// `require(` (whitespace and newlines allowed between).
const SPECIFIER_CONTEXT = /(?:\bfrom|\bimport|\bimport\s*\(|\brequire\s*\()\s*$/;

/**
 * Every reference to `next/font/google` (or `@next/font/google`, or a subpath)
 * as a module in `files`: `import … from`, `import "…"`, `export … from`,
 * `import(…)` and `require(…)`, any quote style. Comments and plain strings
 * that only mention the module are ignored.
 *
 * `allow` takes `path` or `path:line` keys with a written reason each
 * (an empty reason throws).
 */
export function findGoogleFontImports(files, options = {}) {
  const allow = options.allow ?? {};
  for (const [key, reason] of Object.entries(allow)) {
    if (!String(reason).trim()) throw new Error(`font allow-list entry "${key}" needs a reason`);
  }
  const hits = [];
  for (const { path, source } of files) {
    for (const [start, , value] of stringLiterals(source)) {
      if (!isGoogleFontModule(value)) continue;
      if (!SPECIFIER_CONTEXT.test(source.slice(Math.max(0, start - 200), start))) continue;
      const line = lineOf(source, start);
      if (path in allow || `${path}:${line}` in allow) continue;
      const lineStart = source.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = source.indexOf("\n", start);
      hits.push({
        path,
        line,
        module: value,
        statement: source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd).trim(),
      });
    }
  }
  return hits;
}

/** A readable report: one line per hit, with the fix. */
export function formatGoogleFontImports(hits) {
  if (hits.length === 0) return "no next/font/google imports";
  const lines = [
    `${hits.length} next/font/google import(s) — it downloads fonts at build time and a network blip fails the build (DESIGN-CONVENTIONS §1 "Fonts are local"). Load the face with next/font/local from @fontsource-variable/montserrat / geist/font/mono instead:`,
  ];
  for (const h of hits) lines.push(`- ${h.path}:${h.line}  ${h.statement}`);
  return lines.join("\n");
}
