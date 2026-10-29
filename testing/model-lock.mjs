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

export { collectSourceFiles } from "./scrollers.mjs";

const SDK_CALL = /\bmessages\s*\.\s*(?:batches\s*\.\s*)?(?:create|parse|stream)\s*\(/g;
const FALLBACK_CALL = /\bwithModelFallback\s*\(/g;
const IDENT = "[A-Za-z_$][\\w$]*";

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
  let depth = 0;
  for (let k = open + 1; k < close; k++) {
    const c = code[k];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      const rest = code.slice(k + 1, close);
      const m = new RegExp(`^\\s*(?:async\\s+)?(?:\\(\\s*(${IDENT})\\s*(?::[^)]*)?\\)|(${IDENT}))\\s*=>`).exec(rest);
      return m ? m[1] ?? m[2] : null;
    }
  }
  return null;
}

function lineOf(source, index) {
  let line = 1;
  for (let k = 0; k < index; k++) if (source.charCodeAt(k) === 10) line++;
  return line;
}

/**
 * Every Anthropic SDK request in `files` that the model lock cannot vouch for:
 * outside a `withModelFallback(` callback (`reason: "outside-lock"`), or inside
 * one with a `model` that is not the callback's parameter
 * (`reason: "model-not-from-lock"`). `allow` takes `path` or `path:line`
 * keys, each with the reason it is accepted.
 */
export function findUnlockedModelCalls(files, options = {}) {
  const allow = options.allow ?? {};
  const hits = [];
  for (const { path, source } of files) {
    const code = mask(source);
    const spans = [];
    for (const m of code.matchAll(FALLBACK_CALL)) {
      const open = m.index + m[0].length - 1;
      const close = closeOf(code, open);
      spans.push({ open, close, param: callbackParam(code, open, close) });
    }
    for (const m of code.matchAll(SDK_CALL)) {
      const at = m.index;
      const line = lineOf(source, at);
      if (`${path}:${line}` in allow || path in allow) continue;
      const call = source.slice(at, at + m[0].length).replace(/\s+/g, "");
      const inner = spans.filter((s) => s.open < at && at < s.close).sort((a, b) => b.open - a.open)[0];
      if (!inner) {
        hits.push({ path, line, call, reason: "outside-lock" });
        continue;
      }
      const open = at + m[0].length - 1;
      const args = code.slice(open + 1, closeOf(code, open));
      const p = inner.param;
      const fromLock =
        p !== null &&
        (new RegExp(`\\bmodel\\s*:\\s*${p.replace(/\$/g, "\\$")}\\b(?!\\s*[.[(])`).test(args) ||
          (p === "model" && /(^|[{,\s])model\s*(?=[,}]|$)/m.test(args)));
      if (!fromLock) hits.push({ path, line, call, reason: "model-not-from-lock" });
    }
  }
  return hits;
}

/** A readable report: one line per hit, with the fix. */
export function formatUnlockedModelCalls(hits) {
  if (hits.length === 0) return "No Anthropic SDK call skips the model lock.";
  const lines = hits.map((h) =>
    h.reason === "outside-lock"
      ? `${h.path}:${h.line} ${h.call} is not inside withModelFallback(…) — the model lock never sees it`
      : `${h.path}:${h.line} ${h.call} sets its model from something other than withModelFallback's callback parameter`,
  );
  return [
    `${hits.length} Anthropic SDK call(s) skip the model lock (AI-CRAFT §1 "Model selection"):`,
    ...lines,
    "Fix: withModelFallback(modelFor(task), (model) => client.messages.create({ model, … })).",
  ].join("\n");
}
