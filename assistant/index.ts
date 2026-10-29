// Ask the Hub — the pure, hub-free half (DESIGN-CONVENTIONS §3 "Ask the Hub",
// AI-CRAFT §2.6). Client-safe: no SDK, no Node built-ins, no React. The
// server step loop, rate budget and request reader are
// `@sequel/foundation/assistant/server`; the panel is
// `@sequel/foundation/assistant/panel`. Tools, prompts, role rules and guide
// text stay in each hub.
export {
  MAX_STEPS,
  MAX_QUESTION_CHARS,
  MAX_MESSAGES,
  MAX_TOOL_CALLS,
  MAX_BODY_CHARS,
  MAX_TOOL_RESULT_CHARS,
  toAssistantBlock,
  stepsSinceQuestion,
  namedIds,
  pendingToolCalls,
  parseConversation,
  answerText,
  compactHistory,
  exchanges,
  fit,
  capToolResult,
} from "./conversation";
export type {
  TextBlock,
  ThinkingBlock,
  RedactedThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  AssistantBlock,
  UserMessage,
  AssistantMessage,
  Message,
  Exchange,
} from "./conversation";
export { isHubPath, linksInToolResult, renderAnswer } from "./render";
export type { Inline, Block } from "./render";
export { assistantEnabled, ASSISTANT_ON_WORDS } from "./enabled";
export {
  EMPTY_CONVERSATION,
  conversationKey,
  STEP_TIMEOUT_MS,
  STEP_RETRY_LATER,
  STEP_TOO_LONG,
  stepErrorMessage,
  redactionNotice,
  readStoredConversation,
  ASK_BUTTON_CLASS,
} from "./panel-copy";
export type { StoredConversation } from "./panel-copy";
