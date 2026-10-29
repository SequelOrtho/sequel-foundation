// The model lock as a source check (AI-CRAFT §1 "Model selection"; owner
// ruling 2026-10-29, Mike: "we need to lock all now"). The lock itself lives in
// `withModelFallback` (llm/models.ts): it refuses any model not on
// APPROVED_MODELS before the call runs. A call that reaches the Anthropic SDK
// some other way skips the lock, so every hub runs this check from its unit
// suite (and the foundation runs it on itself):
//
//   1. every `messages.create(` / `.parse(` / `.stream(` / `.batches.create(`
//      sits inside the callback of a `withModelFallback(` call, and
//   2. that request's `model` is the callback's own parameter
//      (`(model) => client.messages.create({ model, … })`), never a literal
//      or another variable.
//
// It reads source text: comments and string contents are blanked before
// parentheses are matched. Regex literals are not recognised; a quote inside
// one can blank the rest of its line — good enough for route and lib code.
//
// Shipped as plain JavaScript (model-lock.mjs + model-lock.d.mts), like
// scrollers.mjs, so it loads anywhere. Edit both files together.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { collectSourceFiles as collectFiles } from "./scrollers.mjs";

/**
 * The source files under `dirs` (relative to `root`) the scan reads. Unlike
 * the scroller scan's collector it also reads `.mts` / `.cts` / `.cjs` (Netlify
 * functions are `.mts`, and a background function that calls the SDK directly
 * is exactly what the lock must see), and it skips a listed folder that
 * doesn't exist, so one list works in every hub.
 */
export function collectSourceFiles(
  root,
  dirs,
  extensions = [".tsx", ".jsx", ".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"],
) {
  return collectFiles(root, dirs.filter((d) => existsSync(join(root, d))), extensions);
}

const SDK_CALL = /\bmessages\s*\.\s*(?:batches\s*\.\s*)?(?:create|parse|stream|toolRunner)\s*\(/g;
// The same methods taken as a value (`.bind(…)`, `const send = client.messages.create`),
// or pulled out of `messages` by destructuring: the call then happens where the scan can't see it.
const SDK_REFERENCE = /\bmessages\s*\.\s*(?:batches\s*\.\s*)?(?:create|parse|stream|toolRunner)\b(?!\s*\()/g;
const SDK_DESTRUCTURE = /\}\s*=\s*[\w$.()?!\s]*\bmessages\s*(?:\.\s*batches\s*)?(?=[;,)\n]|$)/gm;
const IDENT = "[A-Za-z_$][\\w$]*";
const SDK_ALIAS = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*[\w$.?!()\s]*\.\s*messages\s*(?:\.\s*batches\s*)?(?=[;,)\n]|$)/gm;

// Comments and the contents of strings and template literals become spaces
// (newlines kept, so indexes and line numbers still line up). A quoted string
// ends at a newline, so an apostrophe in a regex or JSX text blanks one line
// at most.
function mask(source) {
  const out = source.split("");
  const n = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      let j = i;
      while (j < n && source[j] !== "\n") j++;
      blank(i, j);
      i = j;
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const j = end === -1 ? n : end + 2;
      blank(i, j);
      i = j;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && source[j] !== ch && source[j] !== "\n") j += source[j] === "\\" ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else if (ch === "`") {
      let j = i + 1;
      while (j < n && source[j] !== "`") j += source[j] === "\\" ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

/** Index of the `)` closing the `(` at `open`, or the end of the text. */
function closeOf(code, open) {
  let depth = 0;
  for (let k = open; k < code.length; k++) {
    const c = code[k];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return code.length;
}

/** The callback's parameter name: the identifier after the first top-level comma in `args`. */
function callbackParam(code, open, close) {
  const args = topLevelItems(code, open, close);
  const arrow = new RegExp(`^\\s*(?:async\\s+)?(?:\\(\\s*(${IDENT})\\s*(?::[^)]*)?\\)|(${IDENT}))\\s*=>`);
  for (const [from, to] of args.slice(1)) {
    const m = arrow.exec(code.slice(from, to));
    if (m) return m[1] ?? m[2];
  }
  return null;
}

function lineOf(source, index) {
  let line = 1;
  for (let k = 0; k < index; k++) if (source.charCodeAt(k) === 10) line++;
  return line;
}

/**
 * True when some file in `files` defines `name` (`function name(` or
 * `const name = (…) =>`) and that definition's body hands its own callback
 * parameter (the last one) straight to withModelFallback —
 * `withModelFallback(primary, call)` — outside comments and strings.
 */
function wrapperForwardsToLock(files, name) {
  const def = new RegExp(`\\b(?:function\\s+${escapeRe(name)}\\s*(?:<[^>]*>)?\\s*\\(|(?:const|let)\\s+${escapeRe(name)}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:<[^>]*>)?\\s*\\()`, "g");
  for (const { source } of files) {
    const code = mask(source);
    for (const m of code.matchAll(def)) {
      const open = m.index + m[0].length - 1;
      const close = closeOf(code, open);
      const params = topLevelItems(code, open, close);
      const last = params.length ? /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)/.exec(code.slice(...params[params.length - 1])) : null;
      if (!last) continue;
      const body = bodyAfter(code, close);
      if (!body) continue;
      const forwards = new RegExp(`\\bwithModelFallback\\s*(?:<[^>]*>)?\\s*\\([^,()]*(?:\\([^()]*\\)[^,()]*)*,\\s*${escapeRe(last[1])}\\s*[,)]`);
      if (forwards.test(code.slice(body[0], body[1]))) return true;
    }
  }
  return false;
}

/**
 * The function body `{…}` after a parameter list ending at `close`: skips a
 * return type (`: Promise<{ result: T }>`) and an arrow, then takes the first
 * brace block at generic depth 0 that is not followed by another block.
 */
function bodyAfter(code, close) {
  let angle = 0;
  for (let k = close + 1; k < code.length; k++) {
    const c = code[k];
    if (c === "<") angle++;
    else if (c === ">" && code[k - 1] !== "=") angle = Math.max(0, angle - 1);
    else if (c === ";") return null;
    else if (c === "{") {
      const end = closeOf(code, k);
      if (angle > 0) {
        k = end;
        continue;
      }
      if (/^\s*(?:=>\s*)?\{/.test(code.slice(end + 1, end + 40)) && !/=>\s*$/.test(code.slice(close, k))) {
        k = end; // an object return type; the body follows
        continue;
      }
      return [k, end];
    }
  }
  return null;
}

/** Top-level `[from, to)` spans of the comma-separated items between `open` and `close`. */
function topLevelItems(code, open, close) {
  const items = [];
  let depth = 0;
  let from = open + 1;
  for (let k = open + 1; k < close; k++) {
    const c = code[k];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      items.push([from, k]);
      from = k + 1;
    }
  }
  items.push([from, close]);
  return items.filter(([a, b]) => code.slice(a, b).trim() !== "");
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `...(cond ? { a: 1, b } : {})` — a conditional spread of an inline object
 * literal that names no `model` key and spreads nothing itself, so it can't
 * replace the model set before it. Any other spread after `model` can.
 */
function inlineSpreadWithoutModel(masked, raw) {
  const m = /^\.\.\.\(\s*[^?{}()]+\?\s*\{/.exec(masked);
  if (!m || !masked.endsWith(")")) return false;
  const open = m[0].length - 1;
  const close = closeOf(masked, open);
  if (!/^\s*:\s*\{\s*\}\s*\)$/.test(masked.slice(close + 1))) return false;
  for (const [a, b] of topLevelItems(masked, open, close)) {
    const item = raw.slice(a, b).trim();
    if (item.startsWith("...") || item.startsWith("[")) return false;
    const key = /^(?:(['"])(.*?)\1|([A-Za-z_$][\w$]*))/.exec(item);
    if (!key || (key[2] ?? key[3]) === "model") return false;
  }
  return true;
}

/**
 * True when the request object (the SDK call's first argument) takes its
 * model from the lock's callback parameter `p`, and nothing later in the
 * object can replace it: exactly one `model` key, written `model: p` (or the
 * shorthand `model` when `p` is `model`), with no spread (`...rest`) or
 * computed key (`[k]: …`) after it — a later one could set `model` again.
 */
function modelFromLock(code, source, argsOpen, argsClose, p) {
  const first = topLevelItems(code, argsOpen, argsClose)[0];
  if (!first) return false;
  const text = code.slice(first[0], first[1]);
  const lead = text.length - text.trimStart().length;
  const objOpen = first[0] + lead;
  if (code[objOpen] !== "{") return false;
  const objClose = closeOf(code, objOpen);
  if (code.slice(objClose + 1, first[1]).trim() !== "") return false;
  let modelAt = -1;
  let ok = false;
  const props = topLevelItems(code, objOpen, objClose);
  for (let i = 0; i < props.length; i++) {
    const [a, b] = props[i];
    const raw = source.slice(a, b).trim();
    if (raw.startsWith("...") || raw.startsWith("[")) {
      const lead = source.slice(a, b).length - source.slice(a, b).trimStart().length;
      const masked = code.slice(a + lead, a + lead + raw.length);
      if (modelAt !== -1 && !inlineSpreadWithoutModel(masked, raw)) return false;
      continue;
    }
    const key = /^(?:(['"])(.*?)\1|([A-Za-z_$][\w$]*))/.exec(raw);
    const name = key ? (key[2] ?? key[3]) : null;
    if (name !== "model") continue;
    if (modelAt !== -1) return false;
    modelAt = i;
    const value = raw.slice(key[0].length).trim();
    ok = value === "" ? p === "model" : new RegExp(`^:\\s*${escapeRe(p)}$`).test(value);
  }
  return modelAt !== -1 && ok;
}

/**
 * Every Anthropic SDK request in `files` that the model lock cannot vouch for:
 * outside a `withModelFallback(` callback (`reason: "outside-lock"`), or inside
 * one with a `model` that is not the callback's parameter
 * (`reason: "model-not-from-lock"`). `allow` takes `path` or `path:line`
 * keys, each with the reason it is accepted. `lockWrappers` names a hub's own
 * wrappers that hand their callback to withModelFallback (Doc Hub, Project
 * Hub and Market Expansion's `tracedModelCall`): a call inside one counts as
 * inside the lock, and the wrapper itself is checked — its definition must be
 * among `files` and hand its own callback to withModelFallback, or every use is
 * reported (`reason: "wrapper-not-locked"`, on the first use).
 */
export function findUnlockedModelCalls(files, options = {}) {
  const allow = options.allow ?? {};
  const wrappers = options.lockWrappers ?? [];
  const verified = new Set(wrappers.filter((w) => wrapperForwardsToLock(files, w)));
  const names = ["withModelFallback", ...wrappers].map(escapeRe);
  const lockCall = new RegExp(`\\b(?:${names.join("|")})\\s*\\(`, "g");
  const hits = [];
  for (const { path, source } of files) {
    const code = mask(source);
    const allowed = (at) => `${path}:${lineOf(source, at)}` in allow || path in allow;
    const spans = [];
    for (const m of code.matchAll(lockCall)) {
      const open = m.index + m[0].length - 1;
      const close = closeOf(code, open);
      const name = m[0].replace(/\s*\($/, "");
      if (name !== "withModelFallback" && !verified.has(name)) {
        const before = code.slice(Math.max(0, m.index - 40), m.index);
        if (/\bfunction\s+$/.test(before)) continue; // the wrapper's own definition
        if (!allowed(m.index)) hits.push({ path, line: lineOf(source, m.index), call: m[0].replace(/\s+/g, ""), reason: "wrapper-not-locked" });
        continue;
      }
      spans.push({ open, close, param: callbackParam(code, open, close) });
    }
    for (const re of [SDK_REFERENCE, SDK_DESTRUCTURE]) {
      for (const m of code.matchAll(re)) {
        const before = code.slice(Math.max(0, m.index - 80), m.index);
        if (re === SDK_REFERENCE && /\btypeof\s+[\w$.?!\s]*$/.test(before)) continue; // a type, not a call
        if (allowed(m.index)) continue;
        const call = source.slice(m.index, m.index + m[0].length).replace(/\s+/g, "");
        hits.push({ path, line: lineOf(source, m.index), call, reason: "outside-lock" });
      }
    }
    // `const m = client.messages; m.create(…)` — an alias the SDK_CALL pattern can't see.
    for (const a of code.matchAll(SDK_ALIAS)) {
      const use = new RegExp(`(?<![\\w$.])${escapeRe(a[1])}\\s*\\.\\s*(?:batches\\s*\\.\\s*)?(?:create|parse|stream|toolRunner)\\b`, "g");
      for (const u of code.matchAll(use)) {
        if (allowed(u.index)) continue;
        hits.push({ path, line: lineOf(source, u.index), call: source.slice(u.index, u.index + u[0].length).replace(/\s+/g, ""), reason: "outside-lock" });
      }
    }
    for (const m of code.matchAll(SDK_CALL)) {
      const at = m.index;
      const line = lineOf(source, at);
      if (allowed(at)) continue;
      const call = source.slice(at, at + m[0].length).replace(/\s+/g, "");
      const inner = spans.filter((s) => s.open < at && at < s.close).sort((a, b) => b.open - a.open)[0];
      if (!inner) {
        hits.push({ path, line, call, reason: "outside-lock" });
        continue;
      }
      const open = at + m[0].length - 1;
      const p = inner.param;
      // The callback must not assign its own parameter (`model = "…"`) before using it.
      const reassigned =
        p !== null &&
        new RegExp(`(?<![\\w$.])${escapeRe(p)}\\s*(?:[-+*/%&|^]|\\?\\?|&&|\\|\\||\\*\\*|<<|>>>?)?=(?![=>])`).test(
          code.slice(inner.open + 1, inner.close),
        );
      const fromLock = p !== null && !reassigned && modelFromLock(code, source, open, closeOf(code, open), p);
      if (!fromLock) hits.push({ path, line, call, reason: "model-not-from-lock" });
    }
  }
  return hits.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

/** A readable report: one line per hit, with the fix. */
export function formatUnlockedModelCalls(hits) {
  if (hits.length === 0) return "No Anthropic SDK call skips the model lock.";
  const lines = hits.map((h) =>
    h.reason === "outside-lock"
      ? `${h.path}:${h.line} ${h.call} is not inside withModelFallback(…) — the model lock never sees it`
      : h.reason === "wrapper-not-locked"
        ? `${h.path}:${h.line} ${h.call} is listed in lockWrappers, but no scanned file defines it handing its callback to withModelFallback(primary, call)`
        : `${h.path}:${h.line} ${h.call} sets its model from something other than the lock's callback parameter, or lets a later spread, a second model key or a reassignment replace it`,
  );
  return [
    `${hits.length} Anthropic SDK call(s) skip the model lock (AI-CRAFT §1 "Model selection"):`,
    ...lines,
    "Fix: withModelFallback(modelFor(task), (model) => client.messages.create({ model, … })).",
  ].join("\n");
}
