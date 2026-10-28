// The Ask the Hub conversation on the wire (DESIGN-CONVENTIONS §3 "Ask the
// Hub", AI-CRAFT §2.6). Pure and hub-free: lifted from Missed Punch Hub's
// lib/assistant/core/conversation.ts, itself a cut-down copy of the Project
// Hub's lib/assistant/conversation.ts — the two working hubs agree on every
// line here.
//
// The server keeps no conversation: the browser holds it for the tab and posts
// it with each step. So every step re-checks what it is handed: only the block
// shapes the loop produces, roles alternating, a question of bounded length,
// and no more than MAX_STEPS model calls per question. Claude's thinking
// blocks are passed back untouched (a tool loop must return them as given).
// Earlier questions are sent compacted to their question and answer text.

export const MAX_STEPS = 8;
export const MAX_QUESTION_CHARS = 2000;
export const MAX_MESSAGES = 80;
/** Tool calls one assistant turn may ask for; a model turn asks for a handful. */
export const MAX_TOOL_CALLS = 8;
/** The request body cap the route enforces before parsing. */
export const MAX_BODY_CHARS = 400_000;
/** A tool result handed to the model, after the tool trims its own rows. */
export const MAX_TOOL_RESULT_CHARS = 16_000;

export type TextBlock = { type: "text"; text: string };
export type ThinkingBlock = { type: "thinking"; thinking: string; signature: string };
export type RedactedThinkingBlock = { type: "redacted_thinking"; data: string };
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type AssistantBlock = TextBlock | ThinkingBlock | RedactedThinkingBlock | ToolUseBlock;
export type UserMessage = { role: "user"; content: string | ToolResultBlock[] };
export type AssistantMessage = { role: "assistant"; content: AssistantBlock[] };
export type Message = UserMessage | AssistantMessage;

type Parsed = { ok: true; messages: Message[] } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** One assistant block, normalised to the fields the API takes back; null if it isn't one the loop makes. */
export function toAssistantBlock(raw: unknown): AssistantBlock | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case "text":
      return isStr(raw.text) ? { type: "text", text: raw.text } : null;
    case "thinking":
      return isStr(raw.thinking) && isStr(raw.signature) ? { type: "thinking", thinking: raw.thinking, signature: raw.signature } : null;
    case "redacted_thinking":
      return isStr(raw.data) ? { type: "redacted_thinking", data: raw.data } : null;
    case "tool_use":
      return isStr(raw.id) && isStr(raw.name) && isObj(raw.input)
        ? { type: "tool_use", id: raw.id, name: raw.name, input: raw.input }
        : null;
    default:
      return null;
  }
}

function toToolResult(raw: unknown): ToolResultBlock | null {
  if (!isObj(raw) || raw.type !== "tool_result" || !isStr(raw.tool_use_id) || !isStr(raw.content)) return null;
  if (raw.content.length > MAX_TOOL_RESULT_CHARS + 200) return null;
  return { type: "tool_result", tool_use_id: raw.tool_use_id, content: raw.content, ...(raw.is_error === true ? { is_error: true } : {}) };
}

const isQuestion = (m: Message): m is UserMessage & { content: string } => m.role === "user" && typeof m.content === "string";

/** Model calls made so far for the question being answered (assistant turns after the last question). */
export function stepsSinceQuestion(messages: readonly Message[]): number {
  let steps = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isQuestion(messages[i])) return steps;
    if (messages[i].role === "assistant") steps++;
  }
  return steps;
}

/**
 * The record ids the person typed in their questions in this conversation —
 * every match of `pattern` (a global RegExp, e.g. Missed Punch's
 * /\bmp_[A-Za-z0-9]+/g) in a question, never in a tool result or an answer. A
 * hub shows a record's free text (a reason, a note) only for one of these, so
 * the model can't fan out across a list and read every person's reason.
 */
export function namedIds(messages: readonly Message[], pattern: RegExp): Set<string> {
  const re = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  const ids = new Set<string>();
  for (const m of messages) if (isQuestion(m)) for (const id of m.content.match(re) ?? []) ids.add(id);
  return ids;
}

/** The tool calls the last assistant turn asked for, if the conversation ends on one. */
export function pendingToolCalls(messages: readonly Message[]): ToolUseBlock[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return [];
  return last.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

export function parseConversation(raw: unknown): Parsed {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Ask a question first." };
  if (raw.length > MAX_MESSAGES) return { ok: false, error: "This conversation is too long. Start a new one." };
  const messages: Message[] = [];
  for (const [i, m] of raw.entries()) {
    if (!isObj(m)) return { ok: false, error: "The conversation could not be read." };
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (m.role !== expected) return { ok: false, error: "The conversation could not be read." };
    if (m.role === "user") {
      if (isStr(m.content)) {
        const text = m.content.trim();
        if (!text) return { ok: false, error: "Ask a question first." };
        if (text.length > MAX_QUESTION_CHARS) return { ok: false, error: `Keep a question under ${MAX_QUESTION_CHARS} characters.` };
        messages.push({ role: "user", content: text });
      } else if (Array.isArray(m.content) && m.content.length > 0 && i > 0) {
        const blocks = m.content.map(toToolResult);
        if (blocks.some((b) => b == null)) return { ok: false, error: "The conversation could not be read." };
        messages.push({ role: "user", content: blocks as ToolResultBlock[] });
      } else {
        return { ok: false, error: "The conversation could not be read." };
      }
    } else {
      if (!Array.isArray(m.content) || m.content.length === 0) return { ok: false, error: "The conversation could not be read." };
      const blocks = m.content.map(toAssistantBlock);
      if (blocks.some((b) => b == null)) return { ok: false, error: "The conversation could not be read." };
      // A forged turn could ask for thousands of lookups in one step.
      const callIds = (blocks as AssistantBlock[]).filter((b): b is ToolUseBlock => b.type === "tool_use").map((b) => b.id);
      if (callIds.length > MAX_TOOL_CALLS || new Set(callIds).size !== callIds.length) {
        return { ok: false, error: "The conversation could not be read." };
      }
      messages.push({ role: "assistant", content: blocks as AssistantBlock[] });
    }
  }
  const last = messages[messages.length - 1];
  const endsOnQuestion = isQuestion(last);
  const endsOnToolCall = last.role === "assistant" && pendingToolCalls(messages).length > 0;
  if (!endsOnQuestion && !endsOnToolCall) return { ok: false, error: "There is nothing to answer." };
  if (stepsSinceQuestion(messages) >= MAX_STEPS) {
    return { ok: false, error: "That question took too many steps. Try a narrower one." };
  }
  return { ok: true, messages };
}

/** The answer text of an assistant turn. */
export function answerText(m: AssistantMessage): string {
  return m.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
}

/**
 * Earlier questions shrink to their question and answer text; the question
 * still being answered keeps every turn (its thinking and tool results). A
 * question left without an answer is dropped.
 */
export function compactHistory(messages: readonly Message[]): Message[] {
  const lastQ = messages.map((m, i) => (isQuestion(m) ? i : -1)).filter((i) => i >= 0).pop() ?? 0;
  const out: Message[] = [];
  for (let i = 0; i < lastQ; i++) {
    const m = messages[i];
    if (!isQuestion(m)) continue;
    const answer = answerAfter(messages, i, lastQ);
    if (answer) out.push(m, { role: "assistant", content: [{ type: "text", text: answer }] });
  }
  return [...out, ...messages.slice(lastQ)];
}

/**
 * The answer given to the question at `i`, before index `end`: the text of an
 * assistant turn that asked for no tools. A turn that asked for tools is
 * narration ("Let me check."), never the answer, so a question whose last step
 * failed counts as unanswered.
 */
function answerAfter(messages: readonly Message[], i: number, end: number): string {
  let answer = "";
  for (let j = i + 1; j < end && !isQuestion(messages[j]); j++) {
    const n = messages[j];
    if (n.role === "assistant" && !n.content.some((b) => b.type === "tool_use")) answer = answerText(n) || answer;
  }
  return answer;
}

/** JSON within the result cap: long lists are cut (and say so) rather than
 *  the text being chopped mid-record. */
export function fit(value: unknown): string {
  let text = JSON.stringify(value);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  if (value && typeof value === "object") {
    const obj = { ...(value as Record<string, unknown>) };
    const listKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (listKey) {
      const list = obj[listKey] as unknown[];
      for (let n = list.length - 1; n > 0; n = Math.floor(n * 0.75)) {
        text = JSON.stringify({ ...obj, [listKey]: list.slice(0, n), more: `${list.length - n} more not shown — narrow the question` });
        if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
      }
    }
  }
  return JSON.stringify({ error: "The answer was too long to read. Narrow the question." });
}

/** One question asked so far, with its answer once there is one (the panel's log). */
export type Exchange = { question: string; answer: string | null };

/** The questions asked so far, each with its answer once there is one. */
export function exchanges(messages: readonly Message[]): Exchange[] {
  const out: Exchange[] = [];
  for (const m of messages) {
    if (m.role === "user" && typeof m.content === "string") out.push({ question: m.content, answer: null });
    else if (m.role === "assistant" && out.length > 0 && !m.content.some((b) => b.type === "tool_use")) {
      out[out.length - 1].answer = answerText(m) || null;
    }
  }
  return out;
}
