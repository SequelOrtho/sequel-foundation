import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectSourceFiles,
  findUnlockedModelCalls,
  formatUnlockedModelCalls,
} from "../testing/model-lock.mjs";

// Owner ruling 2026-10-29, Mike: "we need to lock all now". withModelFallback
// refuses any model off APPROVED_MODELS; this scan makes sure no SDK call
// reaches Anthropic some other way.

const hits = (source: string, path = "lib/llm/x.ts", allow?: Record<string, string>) =>
  findUnlockedModelCalls([{ path, source }], allow ? { allow } : undefined);

describe("findUnlockedModelCalls", () => {
  it("passes a call made inside withModelFallback with the callback's model", () => {
    expect(
      hits(`const { result } = await withModelFallback(modelFor("prose"), (model) =>
  client.messages.create({ model, max_tokens: 100, messages }),
);`),
    ).toEqual([]);
    expect(
      hits(`await withModelFallback(primary, async (m) => getClient().messages.parse({ model: m, max_tokens: 1, messages }));`),
    ).toEqual([]);
    expect(
      hits(`await withModelFallback(primary, (model: string) => client.messages.stream({ max_tokens: 1, model: model, messages }));`),
    ).toEqual([]);
  });

  it("flags a bare SDK call, whatever the model expression", () => {
    const r = hits(`const res = await client.messages.create({ model: modelFor("prose"), max_tokens: 100, messages });`);
    expect(r).toEqual([{ path: "lib/llm/x.ts", line: 1, call: "messages.create(", reason: "outside-lock" }]);
    expect(hits(`client.messages.batches.create({ requests })`).map((h) => h.reason)).toEqual(["outside-lock"]);
    expect(hits(`client.beta.messages.parse({ model: "claude-opus-5" })`).map((h) => h.reason)).toEqual(["outside-lock"]);
  });

  it("flags a literal model inside the lock (the lock vouches for its own model only)", () => {
    const r = hits(`await withModelFallback(modelFor("prose"), (model) =>
  client.messages.create({ model: "claude-fable-5", max_tokens: 1, messages }));`);
    expect(r).toEqual([{ path: "lib/llm/x.ts", line: 2, call: "messages.create(", reason: "model-not-from-lock" }]);
    expect(
      hits(`await withModelFallback(p, (model) => client.messages.create({ model: process.env.MODEL, messages }));`).map((h) => h.reason),
    ).toEqual(["model-not-from-lock"]);
    expect(
      hits(`await withModelFallback(p, (model) => client.messages.create({ model: model.replace("5", "4"), messages }));`).map((h) => h.reason),
    ).toEqual(["model-not-from-lock"]);
  });

  it("flags a call that only sits after a withModelFallback call, not inside it", () => {
    const r = hits(`await withModelFallback(p, (model) => Promise.resolve(model));
await client.messages.create({ model: "claude-fable-5", messages });`);
    expect(r.map((h) => [h.line, h.reason])).toEqual([[2, "outside-lock"]]);
  });

  it("ignores comments and strings that mention the SDK", () => {
    expect(
      hits(`// client.messages.create({ model: "claude-fable-5" })
/* messages.create( */
const doc = "call client.messages.create( only through withModelFallback";
const t = \`messages.parse(\`;`),
    ).toEqual([]);
  });

  it("takes reviewed exceptions by path or path:line", () => {
    const src = `client.messages.create({ model: "x" })`;
    expect(hits(src, "scripts/probe.ts", { "scripts/probe.ts": "reason" })).toEqual([]);
    expect(hits(src, "scripts/probe.ts", { "scripts/probe.ts:1": "reason" })).toEqual([]);
    expect(hits(src, "scripts/probe.ts", { "scripts/probe.ts:2": "reason" })).toHaveLength(1);
  });

  it("reports each hit with the fix", () => {
    const report = formatUnlockedModelCalls(hits(`client.messages.create({ model: "x" })`));
    expect(report).toContain("lib/llm/x.ts:1");
    expect(report).toContain("withModelFallback");
    expect(formatUnlockedModelCalls([])).toMatch(/No Anthropic SDK call/);
  });
});

describe("findUnlockedModelCalls — overrides inside the lock (review round 1)", () => {
  const inLock = (obj: string, body = "") =>
    hits(`await withModelFallback(primary, (model) => {${body}
  return client.messages.create(${obj});
});`).map((h) => h.reason);

  it("flags a spread, a computed key or a second model key after the lock's model", () => {
    expect(inLock(`{ model, ...rest }`)).toEqual(["model-not-from-lock"]);
    expect(inLock(`{ model, ...(flag ? opts : {}) }`)).toEqual(["model-not-from-lock"]);
    expect(inLock(`{ model, ...(flag ? { model: "claude-fable-5" } : {}) }`)).toEqual(["model-not-from-lock"]);
    expect(inLock(`{ model, [key]: value }`)).toEqual(["model-not-from-lock"]);
    expect(inLock(`{ model, model: "claude-fable-5" }`)).toEqual(["model-not-from-lock"]);
    expect(inLock(`{ model, "model": "claude-fable-5" }`)).toEqual(["model-not-from-lock"]);
    expect(inLock(`params`)).toEqual(["model-not-from-lock"]);
  });

  it("accepts a spread before the model, and an inline conditional spread without a model key after it", () => {
    expect(inLock(`{ ...base, model }`)).toEqual([]);
    expect(inLock(`{ model, ...(last ? { tool_choice: { type: "none" } } : {}), messages }`)).toEqual([]);
  });

  it("flags a callback that reassigns its own model parameter", () => {
    expect(inLock(`{ model }`, `\n  model = "claude-fable-5";`)).toEqual(["model-not-from-lock"]);
    expect(inLock(`{ model }`, `\n  model ??= process.env.LLM_MODEL_PROSE;`)).toEqual(["model-not-from-lock"]);
    expect(inLock(`{ model }`, `\n  if (model === "x") log(model);`)).toEqual([]);
  });

  it("flags an SDK method taken by reference or destructured off messages", () => {
    expect(hits(`const send = client.messages.create.bind(client.messages);`).map((h) => h.reason)).toEqual(["outside-lock"]);
    expect(hits(`const { create } = client.messages;`).map((h) => h.reason)).toEqual(["outside-lock"]);
    expect(hits(`type P = Parameters<typeof client.messages.create>[0];`)).toEqual([]);
    expect(hits(`const m = client.messages;\nawait m.create({ model: "claude-fable-5" });`)).toEqual([
      { path: "lib/llm/x.ts", line: 2, call: "m.create", reason: "outside-lock" },
    ]);
    expect(hits(`const history = body.messages;\nhistory.push(x);`)).toEqual([]);
    expect(hits(`client.beta.messages.toolRunner({ model: "claude-opus-5" })`).map((h) => h.reason)).toEqual(["outside-lock"]);
  });

  it("flags Doc Hub's courier shape: its own client and an env model in a .mts function", () => {
    const r = hits(
      `const client = new Anthropic();
const model = process.env.LLM_MODEL_PROSE ?? "claude-opus-5";
const res = await client.messages.parse({ model, max_tokens: 1, messages });`,
      "netlify/functions/process-slice-background.mts",
    );
    expect(r).toEqual([{ path: "netlify/functions/process-slice-background.mts", line: 3, call: "messages.parse(", reason: "outside-lock" }]);
  });
});

describe("findUnlockedModelCalls — lockWrappers", () => {
  const traced = {
    path: "lib/llm/traced.ts",
    // The shape of Project Hub / Doc Hub / Market Expansion's lib/llm/traced.ts.
    source: `export async function tracedModelCall<T>(
  feature: string,
  primaryModel: string,
  call: (model: string) => Promise<T>,
): Promise<{ result: T; model: string }> {
  const trace = startLlmTrace({ feature });
  const out = await withModelFallback(primaryModel, call);
  return out;
}`,
  };
  const use = {
    path: "lib/llm/assist.ts",
    source: `await tracedModelCall("assist", modelFor("prose"), (model) => client.messages.create({ model, max_tokens: 1, messages }));`,
  };

  it("accepts a call inside a declared wrapper that forwards to withModelFallback", () => {
    expect(findUnlockedModelCalls([traced, use], { lockWrappers: ["tracedModelCall"] })).toEqual([]);
    // Undeclared, the same call is outside the lock.
    expect(findUnlockedModelCalls([traced, use]).map((h) => h.reason)).toEqual(["outside-lock"]);
  });

  it("still checks the model inside a declared wrapper", () => {
    const bad = { path: use.path, source: use.source.replace("{ model,", '{ model: "claude-fable-5",') };
    expect(findUnlockedModelCalls([traced, bad], { lockWrappers: ["tracedModelCall"] }).map((h) => h.reason)).toEqual(["model-not-from-lock"]);
  });

  it("reports a declared wrapper that is missing or doesn't call withModelFallback", () => {
    const fake = { path: traced.path, source: traced.source.replace("withModelFallback(primaryModel, call)", "call(primaryModel)") };
    // Calls withModelFallback, but not with its own callback: the hub's call never reaches the lock.
    const sidestep = {
      path: traced.path,
      source: traced.source.replace("withModelFallback(primaryModel, call)", 'withModelFallback(primaryModel, (m) => ping(m)).then(() => call("claude-fable-5"))'),
    };
    for (const files of [[use], [fake, use], [sidestep, use]]) {
      const r = findUnlockedModelCalls(files, { lockWrappers: ["tracedModelCall"] });
      expect(r.map((h) => h.reason)).toContain("wrapper-not-locked");
      expect(r.map((h) => h.reason)).toContain("outside-lock");
      expect(formatUnlockedModelCalls(r)).toMatch(/lockWrappers/);
    }
  });
});

describe("collectSourceFiles", () => {
  it("collects .mts / .cts files and skips a listed folder that doesn't exist", () => {
    const files = collectSourceFiles(process.cwd(), ["testing", "no-such-folder"]);
    expect(files.some((f) => f.path.endsWith("model-lock.mjs"))).toBe(true);
    expect(files.some((f) => f.path.endsWith("model-lock.d.mts"))).toBe(false);
    const root = mkdtempSync(join(tmpdir(), "model-lock-"));
    try {
      mkdirSync(join(root, "netlify", "functions"), { recursive: true });
      writeFileSync(join(root, "netlify", "functions", "job.mts"), "client.messages.parse({ model: process.env.M });");
      writeFileSync(join(root, "netlify", "functions", "old.cts"), "client.messages.create({ model: 'x' });");
      const found = collectSourceFiles(root, ["netlify", "app"]);
      expect(found.map((f) => f.path).sort()).toEqual(["netlify/functions/job.mts", "netlify/functions/old.cts"]);
      expect(findUnlockedModelCalls(found).map((h) => h.reason)).toEqual(["outside-lock", "outside-lock"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("the foundation itself", () => {
  it("calls the Anthropic SDK only through the model lock", () => {
    const files = collectSourceFiles(process.cwd(), ["llm", "assistant", "ui", "deck-kit", "docs-kit", "access", "session", "undo", "brand", "theme"]);
    // The scan must actually see the one SDK call site, or it proves nothing.
    expect(files.some((f) => f.path.endsWith("assistant/step.ts"))).toBe(true);
    const r = findUnlockedModelCalls(files);
    expect(r, formatUnlockedModelCalls(r)).toEqual([]);
  });
});
