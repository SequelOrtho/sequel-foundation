import type Anthropic from "@anthropic-ai/sdk";
import { getClient } from "../llm/client";
import { modelFor, withModelFallback, type LlmTaskClass } from "../llm/models";
import { consoleTraceSink, emitLlmTrace, startLlmTrace, type LlmTraceSink } from "../llm/trace";
import {
  MAX_STEPS,
  MAX_TOOL_CALLS,
  pendingToolCalls,
  stepsSinceQuestion,
  toAssistantBlock,
  type AssistantBlock,
  type AssistantMessage,
  type Message,
  type ToolResultBlock,
  type UserMessage,
} from "./conversation";
import { linksInToolResult } from "./render";

// One step of the family Ask the Hub loop (foundation AI-CRAFT §2.6), lifted
// from the Missed Punch Hub's copy of the Project Hub loop. The browser drives
// the loop and keeps the conversation; each step (1) runs the tool calls
// Claude's last turn asked for, through the hub's own runner, then (2) makes
// exactly ONE Claude call. Nothing is stored: the trace carries counts only (no
// input preview) and the one log line names the step, the tools and the stop
// reason — never the question, the answer or any tool data.
//
// What stays in the hub: the tool list (already filtered for the viewer), the
// runner (which reads through each page's own rule and refuses a tool the
// viewer isn't offered), the system prompt and the viewer context line.

/** Room for thinking plus a short answer; the steps run inside the host's 60 s cap. */
export const STEP_MAX_TOKENS = 8_000;
/**
 * The whole step (its tool reads and the model call) gets STEP_BUDGET_MS, well
 * inside the browser's 55 s and the host's 60 s cap, so a slow model ends in
 * the stream's own timeout event rather than a cut connection. The SDK
 * timeout is per attempt, so the call never retries, and a fallback model call
 * gets only what is left of the same budget.
 */
export const STEP_BUDGET_MS = 45_000;
/** The least a model call is given, so a step whose tools ran long still gets an answer attempt. */
export const MIN_CALL_MS = 5_000;
/** Reasoning effort: a short read-only answer. */
export const STEP_EFFORT = "low" as const;
/** What a failed tool read tells the model (never the error itself). */
export const TOOL_FAILED_RESULT = JSON.stringify({ error: "That lookup failed. Try again in a moment." });
/** The result for a tool call naming a tool this step did not offer (a forged history): the loop refuses it without calling the hub's runner. */
export const TOOL_REFUSED_RESULT = JSON.stringify({ error: "That tool isn't available to you." });
/** The reply when the model returned nothing usable. */
export const EMPTY_REPLY_TEXT = "I couldn't put an answer together. Try asking another way.";

/** Options for one model call that started `elapsedMs` into the step. */
export function stepRequestOptions(elapsedMs: number): { timeout: number; maxRetries: 0 } {
  return { timeout: Math.max(MIN_CALL_MS, STEP_BUDGET_MS - elapsedMs), maxRetries: 0 };
}

/** The step's one log line: the step, the tools by label and why it stopped. */
export function stepLogLine(step: number, tools: readonly string[], stop: string | null | undefined): string {
  return `[assistant] step=${step} tools=${tools.join(",") || "-"} stop=${stop ?? "-"}`;
}

/**
 * Keeps at most MAX_TOOL_CALLS tool calls from a reply, so the next step's
 * parse (which refuses more, against a forged history) accepts the model's own
 * turn. No result is owed for a dropped call; the model asks again next step.
 */
export function withinToolCap(blocks: AssistantBlock[]): AssistantBlock[] {
  let calls = 0;
  return blocks.filter((b) => b.type !== "tool_use" || ++calls <= MAX_TOOL_CALLS);
}

/** A tool definition as the Messages API takes it. */
export type AssistantToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/** What the hub's runner hands back for one call: the JSON the model reads. */
export type ToolRun = { content: string; isError?: boolean };

export type StepOptions = {
  /** The conversation the browser posted (already parsed and gated). */
  messages: readonly Message[];
  /** The tools this viewer is offered — the hub filters by role. */
  tools: readonly AssistantToolDefinition[];
  /**
   * Runs one tool call under the signed-in viewer. The hub binds the viewer,
   * its store and anything else in a closure. A forged history can ask for
   * anything: the loop answers a name not in `tools` with TOOL_REFUSED_RESULT
   * and never calls this, and the hub should still refuse a name it does not
   * offer this viewer. A throw is caught here and the model is told the
   * lookup failed.
   */
  runTool: (name: string, input: unknown) => Promise<ToolRun>;
  /**
   * The cached system prompt (static — no per-request data, AI-CRAFT §2.4) and
   * an optional uncached context block (the viewer's role, today's date).
   */
  system: { prompt: string; context?: string };
  /** A safe label for a tool name in the log; an unknown name should read "unknown". */
  toolLabel?: (name: string) => string;
  /** A progress line to show while a tool runs ("Reading your requests…"). */
  progressFor?: (name: string) => string | undefined;
  progress?: (label: string) => void;
  /** Trace feature name (default "assistant"). */
  feature?: string;
  taskClass?: LlmTaskClass;
  maxTokens?: number;
  traceSink?: LlmTraceSink;
  /** For tests; defaults to the foundation client seam. */
  client?: Pick<Anthropic, "messages">;
};

export type StepResult = {
  turns: Message[];
  /** No more tool calls: the last turn is the answer. */
  done: boolean;
  /** Hub links the tools returned this step (the answer may link only these). */
  links: string[];
  toolsUsed: string[];
};

export async function runAssistantStep(opts: StepOptions): Promise<StepResult> {
  const { messages } = opts;
  const progress = opts.progress ?? (() => {});
  const label = opts.toolLabel ?? ((name: string) => (opts.tools.some((t) => t.name === name) ? name : "unknown"));
  const startedAt = Date.now();
  const turns: Message[] = [];
  const links: string[] = [];
  const toolsUsed: string[] = [];

  const calls = pendingToolCalls(messages);
  if (calls.length > 0) {
    const results: ToolResultBlock[] = [];
    for (const call of calls) {
      toolsUsed.push(label(call.name));
      const line = opts.progressFor?.(call.name);
      if (line) progress(line);
      let content: string;
      let isError: boolean;
      // Refused here too, whatever the hub's runner does: a name this step
      // did not offer never reaches runTool (AC2 — defence in depth).
      if (!opts.tools.some((t) => t.name === call.name)) {
        results.push({ type: "tool_result", tool_use_id: call.id, content: TOOL_REFUSED_RESULT, is_error: true });
        continue;
      }
      try {
        const run = await opts.runTool(call.name, call.input);
        content = run.content;
        isError = run.isError === true;
      } catch (err) {
        // The error class only: a message can carry the data the tool read.
        console.error(`[assistant] tool ${label(call.name)} failed: ${err instanceof Error ? err.constructor.name : "unknown"}`);
        content = TOOL_FAILED_RESULT;
        isError = true;
      }
      links.push(...linksInToolResult(content));
      results.push({ type: "tool_result", tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) });
    }
    turns.push({ role: "user", content: results } satisfies UserMessage);
  }

  const history = [...messages, ...turns];
  // The last step the loop allows must answer rather than ask for more tools.
  const lastStep = stepsSinceQuestion(history) + 1 >= MAX_STEPS;
  progress(calls.length > 0 ? "Writing the answer…" : "Thinking…");
  const client = opts.client ?? getClient();
  const primary = modelFor(opts.taskClass ?? "prose");
  const sink = opts.traceSink ?? consoleTraceSink;
  // No input: the trace never carries the question.
  const trace = startLlmTrace({ feature: opts.feature ?? "assistant" });
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: opts.system.prompt, cache_control: { type: "ephemeral" } },
    ...(opts.system.context ? [{ type: "text" as const, text: opts.system.context }] : []),
  ];
  let response: Anthropic.Message;
  try {
    const { result, model } = await withModelFallback(primary, (model) =>
      client.messages.create(
        {
          model,
          max_tokens: opts.maxTokens ?? STEP_MAX_TOKENS,
          thinking: { type: "adaptive" },
          output_config: { effort: STEP_EFFORT },
          system,
          tools: opts.tools as Anthropic.Tool[],
          ...(lastStep ? { tool_choice: { type: "none" as const } } : {}),
          messages: history as Anthropic.MessageParam[],
        },
        stepRequestOptions(Date.now() - startedAt),
      ),
    );
    response = result;
    emitLlmTrace(sink, trace.succeed({ model, viaFallback: model !== primary, usage: result.usage }));
  } catch (err) {
    emitLlmTrace(sink, trace.fail(err));
    throw err;
  }

  const content = withinToolCap(response.content.map(toAssistantBlock).filter((b): b is AssistantBlock => b != null));
  const reply: AssistantMessage = {
    role: "assistant",
    content: content.length > 0 ? content : [{ type: "text", text: EMPTY_REPLY_TEXT }],
  };
  turns.push(reply);
  const done = !reply.content.some((b) => b.type === "tool_use");
  if (process.env.NODE_ENV !== "test") {
    console.info(stepLogLine(stepsSinceQuestion([...history, reply]), toolsUsed, response.stop_reason));
  }
  return { turns, done, links: [...new Set(links)], toolsUsed };
}
