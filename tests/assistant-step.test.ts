import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkAssistantBudget,
  readStepRequest,
  runAssistantStep,
  stepLogLine,
  stepRequestOptions,
  STEP_BUDGET_MS,
  TOOL_FAILED_RESULT,
  TOOL_REFUSED_RESULT,
  withinToolCap,
  MIN_CALL_MS,
  type AssistantToolDefinition,
} from "../assistant/server";
import { MAX_BODY_CHARS, MAX_STEPS, MAX_TOOL_CALLS, type Message } from "../assistant";
import type { FixedWindowStore, LlmTraceRecord } from "../llm";

// The family step loop and its server helpers (AI-CRAFT §2.6). A fake client
// stands in for the SDK. Wrong versions these catch: two model calls in one
// step, a last step that still offers tools, a tool error's message (which can
// carry the data it read) reaching the model or the log, the question reaching
// the trace, an unscreened question reaching the model, and a budget that
// opens when its store fails.

const TOOLS: AssistantToolDefinition[] = [
  { name: "my_things", description: "The viewer's own things.", input_schema: { type: "object", properties: {} } },
];
const SYSTEM = { prompt: "You answer questions about this hub.", context: "Role: member. Today: 2026-10-28." };

function fakeClient(content: unknown[] = [{ type: "text", text: "All done." }], stop = "end_turn") {
  const create = vi.fn(async (_body: Record<string, unknown>, _opts?: unknown) => ({
    content,
    stop_reason: stop,
    usage: { input_tokens: 10, output_tokens: 5 },
  }));
  return { client: { messages: { create } } as never, create };
}

const q = (text: string): Message => ({ role: "user", content: text });

afterEach(() => vi.restoreAllMocks());

describe("runAssistantStep", () => {
  it("makes exactly one model call, with the cached prompt first and the context uncached", async () => {
    const { client, create } = fakeClient();
    const out = await runAssistantStep({ messages: [q("What's mine?")], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client });
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0][0] as Record<string, unknown>;
    expect(body.system).toEqual([
      { type: "text", text: SYSTEM.prompt, cache_control: { type: "ephemeral" } },
      { type: "text", text: SYSTEM.context },
    ]);
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body.tools).toEqual(TOOLS);
    expect(create.mock.calls[0][1]).toMatchObject({ maxRetries: 0 });
    expect(out.done).toBe(true);
    expect(out.turns).toEqual([{ role: "assistant", content: [{ type: "text", text: "All done." }] }]);
  });

  it("runs the pending tool calls through the hub's runner first and collects the Hub links they returned", async () => {
    const { client } = fakeClient();
    const runTool = vi.fn(async () => ({ content: JSON.stringify({ items: [{ link: "/things/1" }, { link: "https://x.example" }] }) }));
    const progress = vi.fn();
    const messages: Message[] = [q("What's mine?"), { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "my_things", input: { a: 1 } }] }];
    const out = await runAssistantStep({ messages, tools: TOOLS, runTool, system: SYSTEM, client, progress, progressFor: () => "Reading your things…" });
    expect(runTool).toHaveBeenCalledWith("my_things", { a: 1 });
    expect(progress).toHaveBeenCalledWith("Reading your things…");
    expect(out.links).toEqual(["/things/1"]);
    expect(out.toolsUsed).toEqual(["my_things"]);
    expect(out.turns[0]).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1" }] });
  });

  it("tells the model a failed lookup failed, logging the error class only", async () => {
    const { client, create } = fakeClient();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const runTool = vi.fn(async () => {
      throw new TypeError("row for Jane Doe: reason 'surgery'");
    });
    const messages: Message[] = [q("q"), { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "my_things", input: {} }] }];
    const out = await runAssistantStep({ messages, tools: TOOLS, runTool, system: SYSTEM, client });
    expect(out.turns[0]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: TOOL_FAILED_RESULT, is_error: true }] });
    expect(out.toolsUsed).toEqual(["my_things"]);
    const logged = err.mock.calls.flat().join(" ");
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("Jane");
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain("surgery");
  });

  it("refuses a forged tool name without calling the hub's runner, and labels it unknown", async () => {
    const { client } = fakeClient();
    const runTool = vi.fn(async () => ({ content: JSON.stringify({ secret: "leak", link: "/things/9" }) }));
    const messages: Message[] = [
      q("q"),
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "forged_tool", input: {} },
          { type: "tool_use", id: "t2", name: "my_things", input: {} },
        ],
      },
    ];
    const out = await runAssistantStep({ messages, tools: TOOLS, runTool, system: SYSTEM, client });
    expect(runTool).toHaveBeenCalledTimes(1);
    expect(runTool).toHaveBeenCalledWith("my_things", {});
    expect(out.turns[0]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: TOOL_REFUSED_RESULT, is_error: true },
        { type: "tool_result", tool_use_id: "t2", content: JSON.stringify({ secret: "leak", link: "/things/9" }) },
      ],
    });
    expect(TOOL_REFUSED_RESULT).toContain("isn't available to you");
    expect(out.toolsUsed).toEqual(["unknown", "my_things"]);
  });

  it("offers no tools on the last step the loop allows", async () => {
    const { client, create } = fakeClient();
    const messages: Message[] = [q("q")];
    for (let i = 0; i < MAX_STEPS - 1; i++) {
      messages.push({ role: "assistant", content: [{ type: "tool_use", id: `t${i}`, name: "my_things", input: {} }] });
      if (i < MAX_STEPS - 2) messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "{}" }] });
    }
    await runAssistantStep({ messages, tools: TOOLS, runTool: async () => ({ content: "{}" }), system: SYSTEM, client });
    expect(create.mock.calls[0][0]).toMatchObject({ tool_choice: { type: "none" } });
  });

  it("trims a reply asking for too many lookups, and keeps the reply when the model returns nothing", async () => {
    const many = Array.from({ length: MAX_TOOL_CALLS + 3 }, (_, i) => ({ type: "tool_use", id: `t${i}`, name: "my_things", input: {} }));
    const { client } = fakeClient(many, "tool_use");
    const out = await runAssistantStep({ messages: [q("q")], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client });
    expect(out.done).toBe(false);
    expect((out.turns[0] as { content: unknown[] }).content).toHaveLength(MAX_TOOL_CALLS);

    const empty = fakeClient([]);
    const out2 = await runAssistantStep({ messages: [q("q")], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client: empty.client });
    expect(out2.done).toBe(true);
    expect((out2.turns[0] as { content: { text: string }[] }).content[0].text).toMatch(/couldn't put an answer together/);
  });

  it("traces counts only — never the question", async () => {
    const { client } = fakeClient();
    const records: LlmTraceRecord[] = [];
    await runAssistantStep({ messages: [q("my secret question")], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client, traceSink: (r) => void records.push(r) });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ feature: "assistant", inputChars: null, inputPreview: null, outcome: "ok", inputTokens: 10 });
    expect(JSON.stringify(records)).not.toContain("secret");
  });

  it("traces and rethrows a failed model call", async () => {
    const create = vi.fn(async () => {
      throw new Error("boom");
    });
    const records: LlmTraceRecord[] = [];
    await expect(
      runAssistantStep({ messages: [q("q")], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client: { messages: { create } } as never, traceSink: (r) => void records.push(r) }),
    ).rejects.toThrow("boom");
    expect(records[0]).toMatchObject({ outcome: "error" });
  });
});

describe("step helpers", () => {
  it("gives a model call what is left of the step budget, never less than the floor, and never a retry", () => {
    expect(stepRequestOptions(0)).toEqual({ timeout: STEP_BUDGET_MS, maxRetries: 0 });
    expect(stepRequestOptions(STEP_BUDGET_MS - 1000)).toEqual({ timeout: MIN_CALL_MS, maxRetries: 0 });
    expect(stepRequestOptions(10_000).timeout).toBe(STEP_BUDGET_MS - 10_000);
  });

  it("logs the step, the tools and the stop reason only", () => {
    expect(stepLogLine(2, ["a", "b"], "end_turn")).toBe("[assistant] step=2 tools=a,b stop=end_turn");
    expect(stepLogLine(1, [], null)).toBe("[assistant] step=1 tools=- stop=-");
  });

  it("keeps at most MAX_TOOL_CALLS tool calls and every text block", () => {
    const blocks = [
      { type: "text" as const, text: "x" },
      ...Array.from({ length: MAX_TOOL_CALLS + 1 }, (_, i) => ({ type: "tool_use" as const, id: `t${i}`, name: "n", input: {} })),
    ];
    const kept = withinToolCap(blocks);
    expect(kept.filter((b) => b.type === "tool_use")).toHaveLength(MAX_TOOL_CALLS);
    expect(kept[0]).toEqual({ type: "text", text: "x" });
  });
});

describe("readStepRequest", () => {
  const post = (body: string) => new Request("http://hub.test/api/assistant/step", { method: "POST", body });

  it("refuses a body over the cap before parsing it (413)", async () => {
    expect(await readStepRequest(post("x".repeat(MAX_BODY_CHARS + 1)))).toMatchObject({ ok: false, status: 413 });
  });

  it("refuses unreadable JSON and a conversation the loop never sends (422)", async () => {
    expect(await readStepRequest(post("{not json"))).toMatchObject({ ok: false, status: 422 });
    expect(await readStepRequest(post(JSON.stringify({ messages: [{ role: "system", content: "x" }] })))).toMatchObject({ ok: false, status: 422 });
  });

  it("screens every question the person typed and reports what it took out", async () => {
    const body = JSON.stringify({
      messages: [{ role: "user", content: "My SSN is 123-45-6789 — is that on my record?" }],
    });
    const out = await readStepRequest(post(body));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(JSON.stringify(out.messages)).not.toContain("123-45-6789");
    expect(out.redactions).toContain("ssn");
  });

  it("passes a clean conversation through unchanged", async () => {
    const messages: Message[] = [q("What's mine?"), { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "my_things", input: {} }] }];
    const out = await readStepRequest(post(JSON.stringify({ messages })));
    expect(out).toEqual({ ok: true, messages, redactions: [] });
  });
});

describe("checkAssistantBudget", () => {
  function memoryStore(): FixedWindowStore {
    const rows = new Map<string, { count: number; windowStart: Date }>();
    return {
      async bump(key, now, windowMs) {
        const cur = rows.get(key);
        const live = cur && now.getTime() - cur.windowStart.getTime() < windowMs;
        const next = live ? { count: cur.count + 1, windowStart: cur.windowStart } : { count: 1, windowStart: now };
        rows.set(key, next);
        return next;
      },
    };
  }

  it("allows the per-person budget from the environment, then answers with a retry-after", async () => {
    const store = memoryStore();
    const env = { AI_RATE_ASSISTANT_PER_IDENTITY: "2", AI_RATE_SALT: "test-salt" };
    const now = new Date("2026-10-28T12:00:00Z");
    for (let i = 0; i < 2; i++) expect(await checkAssistantBudget(store, "pat@example.com", { saltFallback: "x", env, now })).toEqual({ allowed: true });
    const third = await checkAssistantBudget(store, "pat@example.com", { saltFallback: "x", env, now });
    expect(third.allowed).toBe(false);
    expect(await checkAssistantBudget(store, "lee@example.com", { saltFallback: "x", env, now })).toEqual({ allowed: true });
  });

  it("fails closed when the store throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: FixedWindowStore = { bump: async () => Promise.reject(new Error("down")) };
    expect(await checkAssistantBudget(broken, "pat@example.com", { saltFallback: "x", env: {} })).toMatchObject({ allowed: false });
  });
});
