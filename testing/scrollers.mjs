// The scrolling-table rule (DESIGN-CONVENTIONS §3 "A scrolling wrapper is
// positioned", v0.30.0), as a check each hub runs from its own unit suite.
//
// Text visible only to screen readers (`sr-only`) is `position: absolute`. An
// absolutely positioned box is laid out against its nearest *positioned*
// ancestor, and an `overflow-x-auto` wrapper only clips and scrolls what is
// laid out inside it. So when the wrapper itself is not positioned, the
// sr-only text in a wide table escapes it and widens the page: on a phone
// the whole page scrolls sideways (hub walk-through 2026-10-21: Scheduler
// schedules, Incident compliance, Audit data intake). `relative` on the
// scrolling wrapper keeps everything inside it.
//
// findUnpositionedScrollers reads source text and returns every class string
// with a scrolling overflow class and no unprefixed relative / absolute /
// fixed / sticky. It reads string literals, and for a `className={…}`
// expression the whole expression, so `cn("overflow-x-auto", "relative")` and
// a template literal with a conditional `relative` both count as positioned.
//
// Shipped as plain JavaScript (scrollers.mjs + scrollers.d.mts), like
// a11y.mjs, so it loads anywhere: a hub's vitest suite or a Node script.
// Edit both files together.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Overflow classes that make a box scroll sideways (both axes included). */
export const HORIZONTAL_SCROLL_CLASSES = ["overflow-x-auto", "overflow-x-scroll", "overflow-auto", "overflow-scroll"];
/** Vertical-only scrollers, checked with `{ vertical: true }`. */
export const VERTICAL_SCROLL_CLASSES = ["overflow-y-auto", "overflow-y-scroll"];
/** Classes that make a box a containing block for absolute children. */
export const POSITION_CLASSES = ["relative", "absolute", "fixed", "sticky"];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

// One pass over the source: the outermost string literals (a template literal
// counts whole, `${…}` and the strings inside it included) and the comments.
// Quoted strings end at a newline, so an apostrophe in JSX text ("Don't")
// can't swallow the rest of the file. Regex literals are not recognised —
// good enough for component source.
function scan(source) {
  const literals = [];
  const comments = [];
  let i = 0;
  const n = source.length;
  // Returns the index just past a quoted string, or -1 if a newline ends it.
  const quoted = (from, q) => {
    for (let j = from + 1; j < n; j++) {
      const ch = source[j];
      if (ch === "\\") j++;
      else if (ch === q) return j + 1;
      else if (ch === "\n") return -1;
    }
    return -1;
  };
  // Returns the index just past a template literal starting at `from`.
  const template = (from) => {
    let j = from + 1;
    while (j < n) {
      const ch = source[j];
      if (ch === "\\") j += 2;
      else if (ch === "`") return j + 1;
      else if (ch === "$" && source[j + 1] === "{") {
        let depth = 1;
        j += 2;
        while (j < n && depth > 0) {
          const c = source[j];
          if (c === "{") depth++;
          else if (c === "}") depth--;
          if (depth === 0) break;
          if (c === '"' || c === "'") {
            const e = quoted(j, c);
            j = e < 0 ? j + 1 : e;
            continue;
          }
          if (c === "`") {
            j = template(j);
            continue;
          }
          j++;
        }
        j++;
      } else j++;
    }
    return n;
  };
  while (i < n) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      const e = source.indexOf("\n", i);
      const end = e < 0 ? n : e;
      comments.push([i, end]);
      i = end;
    } else if (ch === "/" && source[i + 1] === "*") {
      const e = source.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      comments.push([i, end]);
      i = end;
    } else if (ch === '"' || ch === "'") {
      const e = quoted(i, ch);
      if (e < 0) i++;
      else {
        literals.push([i, e]);
        i = e;
      }
    } else if (ch === "`") {
      const e = template(i);
      literals.push([i, e]);
      i = e;
    } else i++;
  }
  return { literals, comments };
}

const inside = (spans, index) => spans.find(([a, b]) => index >= a && index < b) ?? null;

// When the literal sits inside a `className={ … }` expression, the whole
// expression (brace-balanced); otherwise null.
function classNameExpressionAround(source, literalStart) {
  const attr = source.lastIndexOf("className={", literalStart);
  if (attr < 0) return null;
  const open = attr + "className=".length;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i >= literalStart ? [attr, i + 1] : null;
    }
  }
  return null;
}

function tokensOf(text) {
  return text.split(/[\s"'`{}()[\],?$+]+/).filter(Boolean);
}

/**
 * Every class string in `files` that scrolls (an overflow class from
 * HORIZONTAL_SCROLL_CLASSES — or VERTICAL_SCROLL_CLASSES too with
 * `vertical: true` — under any variant prefix) and carries none of
 * POSITION_CLASSES unprefixed.
 *
 * `allow` takes `path` or `path:line` keys with a written reason each
 * (an empty reason throws), for a scroller known to hold nothing absolute.
 */
export function findUnpositionedScrollers(files, options = {}) {
  const allow = options.allow ?? {};
  for (const [key, reason] of Object.entries(allow)) {
    if (!String(reason).trim()) throw new Error(`scroller allow-list entry "${key}" needs a reason`);
  }
  const scrollClasses = options.vertical ? [...HORIZONTAL_SCROLL_CLASSES, ...VERTICAL_SCROLL_CLASSES] : HORIZONTAL_SCROLL_CLASSES;
  const pattern = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(${scrollClasses.map(escapeRe).join("|")})(?![\\w-])`, "g");
  const hits = [];
  for (const { path, source } of files) {
    const { literals, comments } = scan(source);
    const seen = new Set();
    for (const m of source.matchAll(pattern)) {
      if (inside(comments, m.index)) continue;
      const lit = inside(literals, m.index);
      if (!lit) continue;
      const [start, end] = classNameExpressionAround(source, lit[0]) ?? lit;
      const key = `${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (tokensOf(source.slice(start, end)).some((t) => POSITION_CLASSES.includes(t))) continue;
      const line = lineOf(source, m.index);
      if (path in allow || `${path}:${line}` in allow) continue;
      hits.push({ path, line, scroller: m[0], classes: source.slice(lit[0] + 1, lit[1] - 1) });
    }
  }
  return hits;
}

/** A readable report: one line per hit, with the fix. */
export function formatUnpositionedScrollers(hits) {
  if (hits.length === 0) return "no unpositioned scrolling wrappers";
  const lines = [
    `${hits.length} scrolling wrapper(s) without relative — sr-only text inside escapes and widens the page on a phone (DESIGN-CONVENTIONS §3). Add \`relative\`:`,
  ];
  for (const h of hits) lines.push(`- ${h.path}:${h.line}  "${h.classes}"`);
  return lines.join("\n");
}

/**
 * The `.tsx` / `.jsx` / `.ts` / `.js` / `.mjs` files under `dirs` (relative to
 * `root`), as `{ path, source }` with `path` relative to `root` — the input
 * findUnpositionedScrollers takes. Skips node_modules, .next and dot folders.
 */
export function collectSourceFiles(root, dirs, extensions = [".tsx", ".jsx", ".ts", ".js", ".mjs"]) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (extensions.some((e) => name.endsWith(e)) && !/\.d\.[cm]?ts$/.test(name)) {
        out.push({ path: relative(root, full), source: readFileSync(full, "utf8") });
      }
    }
  };
  for (const d of dirs) walk(join(root, d));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
