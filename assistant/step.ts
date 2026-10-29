import type Anthropic from "@anthropic-ai/sdk";
import { getClient } from "../llm/client";
import { LLM_FALLBACK_MODEL, modelFor, withModelFallback, type LlmTaskClass } from "../llm/models";
import { consoleTraceSink, emitLlmTrace, startLlmTrace, type LlmTraceSink } from "../llm/trace";
import {
  capToolResult,
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
import {
  AssistantModelNotApprovedError,
  MODEL_NOT_APPROVED_MESSAGE,
  MODEL_NOT_APPROVED_STATUS,
  modelApproved,
  modelNotApprovedLogLine,
} from "./approved-models";

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

/**
 * Time a tool may still take, `elapsedMs` into the step: the step budget less
 * the model call's floor, so the tools and the model call together end inside
 * STEP_BUDGET_MS. A tool is started only while at least MIN_CALL_MS of this
 * is left; otherwise it is answered with TOOL_FAILED_RESULT unrun.
 */
export function toolTimeLeft(elapsedMs: number): number {
  return STEP_BUDGET_MS - MIN_CALL_MS - elapsedMs;
}

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

/**
 * What the loop hands the hub's runner with each call. `signal` aborts when the
 * tool's share of the step budget runs out or the hub's own `signal` (the
 * request's) aborts — a runner may pass it to its database or fetch calls.
 */
export type ToolRunContext = { signal: AbortSignal };

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
  runTool: (name: string, input: unknown, context: ToolRunContext) => Promise<ToolRun>;
  /**
   * Optional: the request's abort signal (`req.signal`). It aborts the tool
   * runs and the model call when the browser goes away.
   */
  signal?: AbortSignal;
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
  /**
   * The Anthropic client; defaults to the foundation's `getClient()`. The
   * loop imports that seam by relative path, so a hub's
   * `vi.mock("@sequel/foundation/llm")` does not reach it: a hub passes its
   * own client seam here (`client: getClient()` from its `@/lib/llm/client`
   * shim), and its tests mock that seam or pass a fake.
   */
  client?: Pick<Anthropic, "messages">;
  /**
   * Optional: the only models this step may call (exact ids). A patient-data
   * hub passes its zero-data-retention list (AI-CRAFT §2.6 rule 5). When the
   * configured model (`modelFor(taskClass)`, which an LLM_MODEL_* override can
   * change) is not on it, the step runs no tool and makes no model call and
   * throws AssistantModelNotApprovedError (`streamJob` sends it as
   * `{ status: 503, error: MODEL_NOT_APPROVED_MESSAGE }`); the fallback model
   * is tried only when it is on the list too. Omitted = every model, as before.
   */
  allowedModels?: readonly string[];
};

export type StepResult = {
  turns: Message[];
  /** No more tool calls: the last turn is the answer. */
  done: boolean;
  /** Hub links the tools returned this step (the answer may link only these). */
  links: string[];
  toolsUsed: string[];
};

/**
 * For a hub route that wants to refuse before reading the request: the
 * refusal `runAssistantStep` would end the step with, or null when the
 * configured model for `taskClass` is on `allowed` (or no list is given).
 */
export function assistantModelIssue(
  allowed: readonly string[] | undefined,
  taskClass: LlmTaskClass = "prose",
): { status: number; error: string } | null {
  return modelApproved(modelFor(taskClass), allowed)
    ? null
    : { status: MODEL_NOT_APPROVED_STATUS, error: MODEL_NOT_APPROVED_MESSAGE };
}

export async function runAssistantStep(opts: StepOptions): Promise<StepResult> {
  const { messages } = opts;
  const primary = modelFor(opts.taskClass ?? "prose");
  // Rule 5 (AI-CRAFT §2.6): an unlisted model is refused before any tool reads
  // data or any model call is made. The log names the configured model only.
  if (!modelApproved(primary, opts.allowedModels)) {
    console.error(modelNotApprovedLogLine(primary));
    throw new AssistantModelNotApprovedError(primary);
  }
  const fallbackAllowed = modelApproved(LLM_FALLBACK_MODEL, opts.allowedModels);
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
      // Refused here too, whatever the hub's runner does: a name this step
      // did not offer never reaches runTool, its progress line or the log as
      // written (AC2 — defence in depth).
      if (!opts.tools.some((t) => t.name === call.name)) {
        toolsUsed.push("unknown");
        results.push({ type: "tool_result", tool_use_id: call.id, content: TOOL_REFUSED_RESULT, is_error: true });
        continue;
      }
      toolsUsed.push(label(call.name));
      // The step budget binds the tools too: a tool starts only with time left
      // for it and the model call after it, and is cut off when that runs out.
      const timeLeft = toolTimeLeft(Date.now() - startedAt);
      if (timeLeft < MIN_CALL_MS) {
        results.push({ type: "tool_result", tool_use_id: call.id, content: TOOL_FAILED_RESULT, is_error: true });
        continue;
      }
      const line = opts.progressFor?.(call.name);
      if (line) progress(line);
      let content: string;
      let isError: boolean;
      try {
        const run = await runWithin(timeLeft, opts.signal, (signal) => opts.runTool(call.name, call.input, { signal }));
        // A hub runner is typed to return a string, but nothing stops one
        // returning something else; a result over the cap would make the next
        // step's parse refuse the whole conversation.
        if (run && typeof run.content === "string") {
          content = capToolResult(run.content);
          isError = run.isError === true;
        } else {
          console.error(`[assistant] tool ${label(call.name)} failed: not a string result`);
          content = TOOL_FAILED_RESULT;
          isError = true;
        }
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
        { ...stepRequestOptions(Date.now() - startedAt), ...(opts.signal ? { signal: opts.signal } : {}) },
      ),
      { fallback: fallbackAllowed },
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

/** Thrown when a tool runs past its share of the step budget. */
export class ToolTimeoutError extends Error {
  constructor() {
    super("tool timed out");
    this.name = "ToolTimeoutError";
  }
}

/**
 * Runs `fn` against a deadline of `ms`, handing it a signal that aborts at the
 * deadline or when `outer` aborts. A late result is dropped (and a late
 * rejection swallowed); the step goes on without it.
 */
async function runWithin<T>(ms: number, outer: AbortSignal | undefined, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onOuterAbort = () => controller.abort(outer?.reason);
  if (outer?.aborted) controller.abort(outer.reason);
  else outer?.addEventListener("abort", onOuterAbort, { once: true });
  const stopped = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new ToolTimeoutError());
      reject(new ToolTimeoutError());
    }, ms);
    controller.signal.addEventListener("abort", () => reject(controller.signal.reason ?? new ToolTimeoutError()), { once: true });
  });
  const work = Promise.resolve().then(() => fn(controller.signal));
  work.catch(() => {});
  stopped.catch(() => {});
  try {
    return await Promise.race([work, stopped]);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}
