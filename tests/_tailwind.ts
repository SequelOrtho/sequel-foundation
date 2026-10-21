// Compile class names with the real Tailwind v4 engine (the `tailwindcss`
// devDependency, pinned to the version the hubs build with) plus the
// foundation theme, and flatten the nested output into plain rules — so a
// test can assert on the selectors and specificity the browser will see,
// not on the class strings.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { compile } from "tailwindcss";

const require = createRequire(import.meta.url);
const TW_DIR = dirname(require.resolve("tailwindcss/package.json"));
const THEME = resolve(__dirname, "../brand/theme.css");

export type CompiledRule = {
  /** The utility class the rule comes from, unescaped ("dark:hover:bg-x"). */
  token: string;
  /** The full flattened selector. */
  selector: string;
  /** Property names the rule sets. */
  props: string[];
};

type Node = { prelude: string; children: Node[]; decls: string[] };

function parse(css: string): Node[] {
  let i = 0;
  const block = (): Node[] => {
    const nodes: Node[] = [];
    let buf = "";
    const decls: string[] = [];
    while (i < css.length) {
      const ch = css[i];
      if (ch === "\\") {
        buf += ch + css[i + 1];
        i += 2;
      } else if (ch === '"' || ch === "'") {
        const end = css.indexOf(ch, i + 1);
        buf += css.slice(i, end + 1);
        i = end + 1;
      } else if (ch === "/" && css[i + 1] === "*") {
        i = css.indexOf("*/", i + 2) + 2;
      } else if (ch === "{") {
        i++;
        const prelude = buf.trim();
        buf = "";
        const inner = block() as Node[] & { decls: string[] };
        nodes.push({ prelude, children: inner, decls: inner.decls });
      } else if (ch === "}") {
        i++;
        if (buf.trim()) decls.push(buf.trim());
        return Object.assign(nodes, { decls });
      } else if (ch === ";") {
        i++;
        if (buf.trim()) decls.push(buf.trim());
        buf = "";
      } else {
        buf += ch;
        i++;
      }
    }
    return Object.assign(nodes, { decls });
  };
  return block();
}

function flatten(nodes: Node[], parent: string, out: { selector: string; props: string[] }[]) {
  for (const n of nodes) {
    if (n.prelude.startsWith("@")) {
      // @layer / @media / @supports wrap rules without changing specificity;
      // @property / @keyframes hold no selectors we care about.
      if (/^@(property|keyframes|font-face)/.test(n.prelude)) continue;
      // Declarations straight inside a nested @media belong to the parent rule.
      if (parent && n.decls.length) out.push({ selector: parent, props: n.decls.map((d) => d.split(":")[0].trim()) });
      flatten(n.children, parent, out);
      continue;
    }
    const selector = parent && n.prelude.includes("&") ? n.prelude.replaceAll("&", parent) : n.prelude;
    const props = n.decls.map((d) => d.split(":")[0].trim());
    if (props.length) out.push({ selector, props });
    flatten(n.children, selector, out);
  }
}

/** Compile `classes` and return one flattened rule per utility rule. */
export async function compileClasses(classes: string[]): Promise<CompiledRule[]> {
  const compiler = await compile(`@import "tailwindcss";\n@import "${THEME}";`, {
    base: TW_DIR,
    async loadStylesheet(id: string, base: string) {
      const path = id === "tailwindcss" ? resolve(TW_DIR, "index.css") : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  const css = compiler.build([...new Set(classes)]);
  const flat: { selector: string; props: string[] }[] = [];
  flatten(parse(css), "", flat);
  const rules: CompiledRule[] = [];
  for (const r of flat) {
    const m = /^\.((?:\\.|[\w-])+)/.exec(r.selector);
    if (!m) continue;
    rules.push({ token: m[1].replace(/\\(.)/g, "$1"), selector: r.selector, props: r.props });
  }
  return rules;
}

export type Specificity = [number, number, number];

/** CSS Selectors Level 4 specificity of one complex selector. */
export function specificity(selector: string): Specificity {
  const s: Specificity = [0, 0, 0];
  let i = 0;
  const ident = () => {
    while (i < selector.length && (/[\w-]/.test(selector[i]) || selector[i] === "\\")) i += selector[i] === "\\" ? 2 : 1;
  };
  const args = (): string => {
    // selector[i] === "("
    let depth = 0;
    const start = i;
    for (; i < selector.length; i++) {
      if (selector[i] === "(") depth++;
      else if (selector[i] === ")" && --depth === 0) break;
    }
    i++;
    return selector.slice(start + 1, i - 1);
  };
  const splitList = (list: string) => {
    const parts: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of list) {
      if (ch === "(" || ch === "[") depth++;
      if (ch === ")" || ch === "]") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);
    return parts.map((p) => p.trim()).filter(Boolean);
  };
  const add = (t: Specificity) => {
    s[0] += t[0];
    s[1] += t[1];
    s[2] += t[2];
  };
  while (i < selector.length) {
    const ch = selector[i];
    if (ch === "#") {
      i++;
      ident();
      s[0]++;
    } else if (ch === ".") {
      i++;
      ident();
      s[1]++;
    } else if (ch === "[") {
      i = selector.indexOf("]", i) + 1;
      s[1]++;
    } else if (ch === ":" && selector[i + 1] === ":") {
      i += 2;
      ident();
      s[2]++;
      if (selector[i] === "(") args();
    } else if (ch === ":") {
      i++;
      const start = i;
      ident();
      const name = selector.slice(start, i);
      if (selector[i] === "(") {
        const inner = args();
        if (name === "where") continue;
        if (name === "is" || name === "not" || name === "has") {
          const best = splitList(inner)
            .map(specificity)
            .sort((a, b) => compareSpecificity(b, a))[0];
          if (best) add(best);
          continue;
        }
      }
      s[1]++;
    } else if (/[a-zA-Z]/.test(ch)) {
      ident();
      s[2]++;
    } else i++;
  }
  return s;
}

export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
