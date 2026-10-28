import { LlmStreamError } from "../llm/stream-client";
import type { LlmRedactionKind } from "../llm/input-gate";
import type { Message } from "./conversation";

// The Ask the Hub panel's pure half: what it stores for the tab, how it reads
// that back, and the words it shows when a step fails. Kept out of the React
// file so a hub's server code and its tests can use it without a DOM.

/** What the panel keeps for the tab: the conversation and the Hub links tools returned in it. */
export type StoredConversation = { messages: Message[]; links: string[] };
export const EMPTY_CONVERSATION: StoredConversation = { messages: [], links: [] };

/** The remembered-view key for one role's conversation; Sign Out clears every `sf.view.*` key. */
export const conversationKey = (role: string) => `assistant.${role}`;

/** The browser gives up on a step a little before the host's 60 s cap. */
export const STEP_TIMEOUT_MS = 55_000;
export const STEP_RETRY_LATER = "Ask the Hub didn't answer just now. Try again in a moment.";
export const STEP_TOO_LONG = "That took too long. Try a narrower question.";
/** Statuses a step route answers with its own plain sentence. */
const PLAIN_STATUSES = new Set([401, 413, 422, 429]);

/** What the panel says when a step fails: the route's own words, never a browser's or the AI service's raw error text. */
export function stepErrorMessage(err: unknown): string {
  if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) return STEP_TOO_LONG;
  if (err instanceof LlmStreamError) {
    if (err.status === 504) return STEP_TOO_LONG;
    if (PLAIN_STATUSES.has(err.status) && err.message && !/^Failed \(/.test(err.message)) return err.message;
  }
  return STEP_RETRY_LATER;
}

const REDACTION_WORDS: Record<LlmRedactionKind, string> = {
  "api-key": "an access key",
  jwt: "a sign-in token",
  card: "a card number",
  ssn: "a Social Security number",
};

/** The input gate's notice: what was taken out of the question before it was sent (AI-CRAFT §2.2). */
export function redactionNotice(kinds: readonly string[] | undefined): string | null {
  const words = [...new Set(kinds ?? [])].map((k) => REDACTION_WORDS[k as LlmRedactionKind]).filter(Boolean);
  if (words.length === 0) return null;
  return `Removed from your question before it was sent: ${words.join(", ")}.`;
}

/** Reads a stored conversation back (useRememberedState's `read`); anything malformed starts clean. */
export function readStoredConversation(initial: StoredConversation, value: unknown): StoredConversation {
  if (!value || typeof value !== "object") return initial;
  const v = value as Partial<StoredConversation>;
  if (!Array.isArray(v.messages) || !Array.isArray(v.links)) return initial;
  return { messages: v.messages as Message[], links: v.links.filter((l): l is string => typeof l === "string") };
}

/** The header trigger: the header's one filled control, the primary button's
 *  colours on a pill. Its own string, because buttonClasses' rounded-md would
 *  win over an added rounded-full (stylesheet order decides; no tailwind-merge).
 *  Below lg the label is screen-reader text, so the header keeps one row. */
export const ASK_BUTTON_CLASS =
  "inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 lg:px-3 dark:text-zinc-900";
