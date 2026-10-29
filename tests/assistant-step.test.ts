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
  toolTimeLeft,
  memoryRateStoreForDevOnly,
  type AssistantToolDefinition,
} from "../assistant/server";
import { ASSISTANT_PRIVACY_PROMPT, MAX_BODY_CHARS, MAX_STEPS, MAX_TOOL_CALLS, MAX_TOOL_RESULT_CHARS, parseConversation, type Message } from "../assistant";
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runAssistantStep", () => {
  it("makes exactly one model call: the hub prompt, then the privacy block (cached), then the context uncached", async () => {
    const { client, create } = fakeClient();
    const out = await runAssistantStep({ messages: [q("What's mine?")], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client });
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0][0] as Record<string, unknown>;
    expect(body.system).toEqual([
      { type: "text", text: SYSTEM.prompt },
      { type: "text", text: ASSISTANT_PRIVACY_PROMPT, cache_control: { type: "ephemeral" } },
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
    expect(runTool).toHaveBeenCalledWith("my_things", { a: 1 }, { signal: expect.any(AbortSignal) });
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
    expect(runTool).toHaveBeenCalledWith("my_things", {}, { signal: expect.any(AbortSignal) });
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

  // Round-2 review, item 6: a forged name is refused before any label, so no
  // forged text reaches the log line or the progress line.
  it("never hands a forged tool name to the hub's label or progress functions", async () => {
    const { client } = fakeClient();
    const toolLabel = vi.fn((name: string) => name);
    const progressFor = vi.fn(() => undefined);
    const messages: Message[] = [q("q"), { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "x\nstop=forged", input: {} }] }];
    const out = await runAssistantStep({ messages, tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client, toolLabel, progressFor });
    expect(out.toolsUsed).toEqual(["unknown"]);
    expect(toolLabel).not.toHaveBeenCalled();
    expect(progressFor).not.toHaveBeenCalled();
  });

  // Round-2 review, item 1: a hub result over the cap would make the next
  // step's parse refuse the whole conversation (422); a non-string one threw
  // in the link scan and failed the step (500).
  it("holds a tool result to the cap the next step's parse accepts, and reads a non-string result as a failed lookup", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = Array.from({ length: 2000 }, (_, i) => ({ id: i, link: `/things/${i}`, note: "x".repeat(20) }));
    const results: unknown[] = [
      { content: JSON.stringify({ rows }) },
      { content: "y".repeat(MAX_TOOL_RESULT_CHARS + 500) },
      { content: { rows: [1] } },
      undefined,
    ];
    const tools: AssistantToolDefinition[] = [0, 1, 2, 3].map((i) => ({ ...TOOLS[0], name: `t${i}` }));
    const runTool = vi.fn(async (name: string) => results[Number(name.slice(1))] as never);
    const call: Message = { role: "assistant", content: tools.map((t) => ({ type: "tool_use" as const, id: `id_${t.name}`, name: t.name, input: {} })) };
    const { client } = fakeClient();
    const out = await runAssistantStep({ messages: [q("q"), call], tools, runTool, system: SYSTEM, client });
    const blocks = (out.turns[0] as { content: { content: string; is_error?: boolean }[] }).content;
    expect(blocks.every((b) => b.content.length <= MAX_TOOL_RESULT_CHARS)).toBe(true);
    expect(JSON.parse(blocks[0].content).more).toMatch(/more not shown/);
    expect(blocks[0].is_error).toBeUndefined();
    expect(JSON.parse(blocks[1].content).error).toMatch(/too long/);
    expect(blocks[2]).toMatchObject({ content: TOOL_FAILED_RESULT, is_error: true });
    expect(blocks[3]).toMatchObject({ content: TOOL_FAILED_RESULT, is_error: true });
    // The next step's parse takes the turn back.
    expect(parseConversation([q("q"), call, out.turns[0], { role: "assistant", content: [{ type: "tool_use", id: "n1", name: "t0", input: {} }] }]).ok).toBe(true);
  });

  // Round-2 review, item 2: eight 10 s tools plus the model call ran ~85 s,
  // past the host's 60 s cap. The tools now share the step budget.
  it("holds the tools to the step budget: cuts off a slow one, skips the rest, and leaves the model call its floor", async () => {
    vi.useFakeTimers();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const signals: AbortSignal[] = [];
    const runTool = vi.fn((_name: string, _input: unknown, ctx: { signal: AbortSignal }) => {
      signals.push(ctx.signal);
      return new Promise<{ content: string }>((r) => setTimeout(() => r({ content: '{"ok":1}' }), 25_000));
    });
    const call: Message = {
      role: "assistant",
      content: ["a", "b", "c"].map((id) => ({ type: "tool_use" as const, id, name: "my_things", input: {} })),
    };
    const { client, create } = fakeClient();
    const running = runAssistantStep({ messages: [q("q"), call], tools: TOOLS, runTool, system: SYSTEM, client });
    await vi.advanceTimersByTimeAsync(STEP_BUDGET_MS);
    const out = await running;
    const blocks = (out.turns[0] as { content: { content: string; is_error?: boolean }[] }).content;
    expect(runTool).toHaveBeenCalledTimes(2); // the third had no time left to start
    expect(blocks[0]).toEqual({ type: "tool_result", tool_use_id: "a", content: '{"ok":1}' });
    expect(blocks[1]).toMatchObject({ content: TOOL_FAILED_RESULT, is_error: true });
    expect(blocks[2]).toMatchObject({ content: TOOL_FAILED_RESULT, is_error: true });
    expect(signals[0].aborted).toBe(false);
    expect(signals[1].aborted).toBe(true);
    expect(err.mock.calls.flat().join(" ")).toContain("ToolTimeoutError");
    // Tools ended by STEP_BUDGET_MS - MIN_CALL_MS, so the model call gets the floor and the step ends inside the budget.
    expect(create.mock.calls[0][1]).toMatchObject({ timeout: MIN_CALL_MS, maxRetries: 0 });
  });

  // Round-2 review, item 3: the hub can thread `req.signal` through.
  it("passes the hub's abort signal to the tools and the model call", async () => {
    const { client, create } = fakeClient();
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const runTool = vi.fn(async (_n: string, _i: unknown, ctx: { signal: AbortSignal }) => {
      seen = ctx.signal;
      controller.abort();
      return { content: "{}" };
    });
    const messages: Message[] = [q("q"), { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "my_things", input: {} }] }];
    await runAssistantStep({ messages, tools: TOOLS, runTool, system: SYSTEM, client, signal: controller.signal });
    expect(seen?.aborted).toBe(true); // the tool's signal follows the hub's
    expect((create.mock.calls[0][1] as { signal?: AbortSignal }).signal).toBe(controller.signal);

    const plain = fakeClient();
    await runAssistantStep({ messages: [q("q")], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client: plain.client });
    const plainOpts = plain.create.mock.calls[0][1] as { timeout: number; signal?: AbortSignal };
    expect(plainOpts).toMatchObject({ maxRetries: 0 });
    expect(plainOpts.timeout).toBeGreaterThan(STEP_BUDGET_MS - 1000);
    expect("signal" in plainOpts).toBe(false);
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

  it("leaves the tools the step budget less the model call's floor", () => {
    expect(toolTimeLeft(0)).toBe(STEP_BUDGET_MS - MIN_CALL_MS);
    expect(toolTimeLeft(STEP_BUDGET_MS - MIN_CALL_MS)).toBe(0);
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

  // Round-2 review, item 8: a declared length over the cap is refused before the body is read.
  it("refuses a declared Content-Length over the cap without reading the body", async () => {
    const text = vi.fn(async () => "{}");
    const req = { headers: new Headers({ "content-length": String(MAX_BODY_CHARS + 1) }), text } as unknown as Request;
    expect(await readStepRequest(req)).toMatchObject({ ok: false, status: 413 });
    expect(text).not.toHaveBeenCalled();
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

  // Round-2 review, item 7: one person, one bucket, however the address is cased or padded.
  it("keys the bucket by the trimmed, lower-cased sign-in", async () => {
    const store = memoryRateStoreForDevOnly();
    const env = { AI_RATE_ASSISTANT_PER_IDENTITY: "2", AI_RATE_SALT: "test-salt" };
    const now = new Date("2026-10-28T12:00:00Z");
    expect(await checkAssistantBudget(store, "pat@example.com", { saltFallback: "x", env, now })).toEqual({ allowed: true });
    expect(await checkAssistantBudget(store, " Pat@Example.COM ", { saltFallback: "x", env, now })).toEqual({ allowed: true });
    expect((await checkAssistantBudget(store, "PAT@example.com", { saltFallback: "x", env, now })).allowed).toBe(false);
  });

  it("gives each dev-only memory store its own counts", async () => {
    const env = { AI_RATE_ASSISTANT_PER_IDENTITY: "1", AI_RATE_SALT: "s" };
    const now = new Date("2026-10-28T12:00:00Z");
    const a = memoryRateStoreForDevOnly();
    expect((await checkAssistantBudget(a, "pat@example.com", { saltFallback: "x", env, now })).allowed).toBe(true);
    expect((await checkAssistantBudget(a, "pat@example.com", { saltFallback: "x", env, now })).allowed).toBe(false);
    expect((await checkAssistantBudget(memoryRateStoreForDevOnly(), "pat@example.com", { saltFallback: "x", env, now })).allowed).toBe(true);
  });

  it("fails closed when the store throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: FixedWindowStore = { bump: async () => Promise.reject(new Error("down")) };
    expect(await checkAssistantBudget(broken, "pat@example.com", { saltFallback: "x", env: {} })).toMatchObject({ allowed: false });
  });
});
