import { describe, it, expect, vi, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { assistantModelIssue, runAssistantStep, type AssistantToolDefinition } from "../assistant/server";
import {
  AssistantModelNotApprovedError,
  MODEL_NOT_APPROVED_MESSAGE,
  MODEL_NOT_APPROVED_STATUS,
  modelApproved,
  modelNotApprovedLogLine,
  stepErrorMessage,
  type Message,
} from "../assistant";
import { LlmStreamError } from "../llm/stream-client";
import { llmErrorEvent } from "../llm/http";
import { LLM_FALLBACK_MODEL, LLM_MODEL_PROSE, withModelFallback } from "../llm/models";
import type { LlmTraceRecord } from "../llm";

// Rule 5 for the patient-data hubs (AI-CRAFT §2.6): Ask the Hub pinned to an
// approved-model list. Wrong versions these catch: a refused step that still
// runs a tool or calls the model, a fallback onto an unlisted model, an
// LLM_MODEL_PROSE override that escapes the list, a refusal the panel shows
// as "didn't answer just now", the question reaching the log or the trace,
// and a hub with no list that changes behaviour.

const TOOLS: AssistantToolDefinition[] = [
  { name: "my_things", description: "The viewer's own things.", input_schema: { type: "object", properties: {} } },
];
const SYSTEM = { prompt: "You answer questions about this hub.", context: "Role: member." };
const ZDR = ["claude-opus-5", "claude-opus-4-8"] as const;
const QUESTION = "Which of Jane Doe's visits were cancelled?";

function fakeClient() {
  const create = vi.fn(async (_body: Record<string, unknown>, _opts?: unknown) => ({
    content: [{ type: "text", text: "All done." }],
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 5 },
  }));
  return { client: { messages: { create } } as never, create };
}

const q = (text: string): Message => ({ role: "user", content: text });
const pending: Message[] = [q(QUESTION), { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "my_things", input: {} }] }];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("approved models (AI-CRAFT §2.6 rule 5)", () => {
  it("AC1: runs a listed model as usual", async () => {
    expect(LLM_MODEL_PROSE).toBe("claude-opus-5");
    const { client, create } = fakeClient();
    const runTool = vi.fn(async () => ({ content: "{}" }));
    const out = await runAssistantStep({ messages: pending, tools: TOOLS, runTool, system: SYSTEM, client, allowedModels: ZDR });
    expect(runTool).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect((create.mock.calls[0][0] as { model: string }).model).toBe("claude-opus-5");
    expect(out.done).toBe(true);
  });

  it("AC2: an unlisted primary makes no model call, runs no tool and ends in the refusal", async () => {
    const { client, create } = fakeClient();
    const runTool = vi.fn(async () => ({ content: "{}" }));
    const records: LlmTraceRecord[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const step = runAssistantStep({
      messages: pending,
      tools: TOOLS,
      runTool,
      system: SYSTEM,
      client,
      allowedModels: ["claude-opus-4-8"],
      traceSink: (r) => void records.push(r),
    });
    await expect(step).rejects.toBeInstanceOf(AssistantModelNotApprovedError);
    await expect(step).rejects.toMatchObject({ status: 503, message: MODEL_NOT_APPROVED_MESSAGE, model: "claude-opus-5" });
    expect(create).not.toHaveBeenCalled();
    expect(runTool).not.toHaveBeenCalled();
    expect(records).toEqual([]);
    // One log line, naming the configured model only — never the question.
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0]).toEqual([modelNotApprovedLogLine("claude-opus-5")]);
    expect(err.mock.calls.flat().join(" ")).not.toContain("Jane");
  });

  it("AC2: the refusal travels as a 503 event the panel shows as written", () => {
    const event = llmErrorEvent(new AssistantModelNotApprovedError("claude-fable-5"));
    expect(event).toEqual({ status: MODEL_NOT_APPROVED_STATUS, error: MODEL_NOT_APPROVED_MESSAGE });
    expect(event.status).toBe(503);
    expect(event.error).not.toContain("fable");
    expect(stepErrorMessage(new LlmStreamError(event.error, event.status))).toBe(MODEL_NOT_APPROVED_MESSAGE);
    // Any other 503 (a missing key) stays the generic line.
    expect(stepErrorMessage(new LlmStreamError("AI service is not configured (missing API key).", 503))).toMatch(/didn't answer just now/);
  });

  it("AC2: assistantModelIssue gives a route the same refusal early", () => {
    expect(assistantModelIssue(undefined)).toBeNull();
    expect(assistantModelIssue(ZDR)).toBeNull();
    expect(assistantModelIssue(["claude-opus-4-8"])).toEqual({ status: 503, error: MODEL_NOT_APPROVED_MESSAGE });
    expect(assistantModelIssue([], "presentation")).toEqual({ status: 503, error: MODEL_NOT_APPROVED_MESSAGE });
    expect(modelApproved("claude-fable-5", ZDR)).toBe(false);
    expect(modelApproved("claude-fable-5", undefined)).toBe(true);
  });

  it("AC3: an unlisted fallback is never tried; the primary's error stands", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const unavailable = Object.create(Anthropic.NotFoundError.prototype) as Error;
    const create = vi.fn(async () => {
      throw unavailable;
    });
    const step = runAssistantStep({
      messages: [q(QUESTION)],
      tools: TOOLS,
      runTool: vi.fn(),
      system: SYSTEM,
      client: { messages: { create } } as never,
      allowedModels: ["claude-opus-5"],
    });
    await expect(step).rejects.toBe(unavailable);
    expect(create).toHaveBeenCalledTimes(1);
    expect((create.mock.calls[0] as unknown as [{ model: string }])[0].model).toBe("claude-opus-5");
  });

  it("AC3: a listed fallback still rescues an unavailable primary", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.create(Anthropic.NotFoundError.prototype) as Error)
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: {} });
    await runAssistantStep({ messages: [q("q")], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client: { messages: { create } } as never, allowedModels: ZDR });
    expect(create.mock.calls.map((c) => (c[0] as { model: string }).model)).toEqual(["claude-opus-5", LLM_FALLBACK_MODEL]);
  });

  it("AC3: withModelFallback's fallback: false keeps the primary's error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const unavailable = Object.create(Anthropic.NotFoundError.prototype) as Error;
    const call = vi.fn().mockRejectedValue(unavailable);
    await expect(withModelFallback("claude-opus-5", call, { fallback: false })).rejects.toBe(unavailable);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("AC4: an LLM_MODEL_PROSE override to an unlisted model is refused", async () => {
    vi.stubEnv("LLM_MODEL_PROSE", "claude-fable-5");
    vi.resetModules();
    const server = await import("../assistant/server");
    const { client, create } = fakeClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      server.runAssistantStep({ messages: [q(QUESTION)], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client, allowedModels: ZDR }),
    ).rejects.toMatchObject({ name: "AssistantModelNotApprovedError", status: 503, model: "claude-fable-5" });
    expect(create).not.toHaveBeenCalled();
    expect(server.assistantModelIssue(ZDR)).toEqual({ status: 503, error: MODEL_NOT_APPROVED_MESSAGE });
  });

  it("AC4: an LLM_MODEL_FALLBACK override to an unlisted model is never tried", async () => {
    vi.stubEnv("LLM_MODEL_FALLBACK", "claude-fable-5");
    vi.resetModules();
    const server = await import("../assistant/server");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const create = vi.fn(async () => {
      throw Object.create(Anthropic.NotFoundError.prototype) as Error;
    });
    await expect(
      server.runAssistantStep({ messages: [q("q")], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client: { messages: { create } } as never, allowedModels: ZDR }),
    ).rejects.toBeDefined();
    expect(create).toHaveBeenCalledTimes(1);
    expect((create.mock.calls[0] as unknown as [{ model: string }])[0].model).toBe("claude-opus-5");
  });

  it("AC5: no list = unchanged — any configured model runs and the fallback rescues", async () => {
    vi.stubEnv("LLM_MODEL_PROSE", "claude-fable-5");
    vi.resetModules();
    const server = await import("../assistant/server");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.create(Anthropic.BadRequestError.prototype) as Error)
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: {} });
    const out = await server.runAssistantStep({ messages: [q("q")], tools: TOOLS, runTool: vi.fn(), system: SYSTEM, client: { messages: { create } } as never });
    expect(create.mock.calls.map((c) => (c[0] as { model: string }).model)).toEqual(["claude-fable-5", "claude-opus-4-8"]);
    expect(out.done).toBe(true);
  });

  it("AC6: the step trace never carries the question", async () => {
    const { client } = fakeClient();
    const records: LlmTraceRecord[] = [];
    await runAssistantStep({
      messages: pending,
      tools: TOOLS,
      runTool: vi.fn(async () => ({ content: "{}" })),
      system: SYSTEM,
      client,
      allowedModels: ZDR,
      traceSink: (r) => void records.push(r),
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ inputPreview: null, inputChars: null, model: "claude-opus-5" });
    expect(JSON.stringify(records[0])).not.toContain("Jane");
  });
});
