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

describe("the foundation itself", () => {
  it("calls the Anthropic SDK only through the model lock", () => {
    const files = collectSourceFiles(process.cwd(), ["llm", "assistant", "ui", "deck-kit", "docs-kit", "access", "session", "undo", "brand", "theme"]);
    // The scan must actually see the one SDK call site, or it proves nothing.
    expect(files.some((f) => f.path.endsWith("assistant/step.ts"))).toBe(true);
    const r = findUnlockedModelCalls(files);
    expect(r, formatUnlockedModelCalls(r)).toEqual([]);
  });
});
