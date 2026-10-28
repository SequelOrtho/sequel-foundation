"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "../ui/Button";
import { inputClasses } from "../ui/input-class";
import { useRememberedState } from "../ui/useRememberedState";
import { consumeLlmStream } from "../llm/stream-client";
import { compactHistory, exchanges, MAX_QUESTION_CHARS, MAX_STEPS, type Message } from "./conversation";
import { renderAnswer, type Inline } from "./render";
import {
  ASK_BUTTON_CLASS,
  conversationKey,
  EMPTY_CONVERSATION,
  readStoredConversation,
  redactionNotice,
  stepErrorMessage,
  STEP_TIMEOUT_MS,
} from "./panel-copy";

// The family Ask the Hub panel (foundation AI-CRAFT §2.6, DESIGN-CONVENTIONS §3
// "Ask the Hub"), lifted from the Missed Punch Hub, itself a cut-down copy of
// the Project Hub's components/AskHub.tsx. A header button opens a side panel
// where the signed-in person asks a question; the hub's step route answers
// only from what this person may open. The browser drives the loop one step
// at a time and keeps the conversation for this tab only, under the
// remembered-view prefix (`sf.view.assistant.<role>`), so Sign Out, the
// signed-out screen and a role switch clear it. It reads; it never changes
// anything.
//
// The panel is a native modal <dialog> docked to the right: Escape, ✕ and a
// backdrop click close it, focus returns to the button, and a
// browser-initiated close is mirrored back into state. It is not the
// foundation Dialog, which centres a fixed-width card: this panel docks full
// height on the right (full width on a phone) beside the page.
//
// What the hub passes in: the role (the storage key), the starter questions,
// the intro line under the heading (say what it never does, in the hub's own
// words), the textarea placeholder and the button's tooltip.

/** What one step of the hub's route streams back as its result. */
export type AskHubStepAnswer = { turns: Message[]; done: boolean; links: string[]; redactions?: string[] };

export type AskHubPanelProps = {
  /** The active role: the conversation is kept per role, so a role switch starts clean. */
  role: string;
  /** Starter questions shown on an empty conversation (sentence case — they are questions). */
  starters: readonly string[];
  /** The line under the heading: answers come only from what you can open, and what it never does. */
  intro: ReactNode;
  /** The textarea's placeholder ("Ask about your missed punches, approvals or how to do something"). */
  placeholder: string;
  /** The header button's tooltip. */
  buttonTitle: string;
  /** The hub's step route. */
  endpoint?: string;
};

function InlineText({ parts, onNavigate }: { parts: Inline[]; onNavigate: () => void }) {
  return (
    <>
      {parts.map((p, i) =>
        p.type === "link" ? (
          <Link key={i} href={p.href} onClick={onNavigate} className="font-medium text-brand underline underline-offset-2">
            {p.text}
          </Link>
        ) : p.type === "bold" ? (
          <strong key={i}>{p.text}</strong>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function Answer({ text, links, onNavigate }: { text: string; links: ReadonlySet<string>; onNavigate: () => void }) {
  return (
    <div className="space-y-2">
      {renderAnswer(text, links).map((b, i) => {
        if (b.type === "paragraph") {
          return (
            <p key={i}>
              <InlineText parts={b.inlines} onNavigate={onNavigate} />
            </p>
          );
        }
        const List = b.ordered ? "ol" : "ul";
        return (
          <List key={i} className={`${b.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
            {b.items.map((item, j) => (
              <li key={j}>
                <InlineText parts={item} onNavigate={onNavigate} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

export function AskHubPanel({
  role,
  starters,
  intro,
  placeholder,
  buttonTitle,
  endpoint = "/api/assistant/step",
}: AskHubPanelProps) {
  const [open, setOpen] = useState(false);
  const [stored, setStored, resetStored] = useRememberedState(
    conversationKey(role),
    EMPTY_CONVERSATION,
    readStoredConversation,
  );
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // The native modal dialog: the page goes inert, Tab stays inside, Escape
  // closes, and focus returns to the button (as the foundation Dialog does).
  useEffect(() => {
    const el = dialogRef.current;
    if (!el || !open) return;
    const opener = document.activeElement as HTMLElement | null;
    if (typeof el.showModal === "function") {
      if (!el.open) el.showModal();
    } else {
      el.setAttribute("open", "");
    }
    inputRef.current?.focus();
    return () => {
      if (typeof el.close === "function" && el.open) el.close();
      else el.removeAttribute("open");
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  const list = exchanges(stored.messages);
  const links = new Set(stored.links);

  useEffect(() => {
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight });
  }, [list.length, busy]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    if (q.length > MAX_QUESTION_CHARS) {
      setError(`Keep a question under ${MAX_QUESTION_CHARS} characters.`);
      return;
    }
    setError(null);
    setNotice(null);
    setQuestion("");
    setBusy(true);
    let messages = compactHistory([...stored.messages, { role: "user", content: q }]);
    let known = stored.links;
    setStored({ messages, links: known });
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        setStatus("Thinking…");
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages }),
          signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
        });
        const out = await consumeLlmStream<AskHubStepAnswer>(res, { onStatus: setStatus });
        const removed = redactionNotice(out.redactions);
        if (removed) setNotice(removed);
        messages = [...messages, ...out.turns];
        known = [...new Set([...known, ...out.links])];
        setStored({ messages, links: known });
        if (out.done) break;
      }
    } catch (err) {
      setError(stepErrorMessage(err));
    } finally {
      setBusy(false);
      setStatus(null);
      inputRef.current?.focus();
    }
  }

  function newConversation() {
    resetStored();
    setError(null);
    setNotice(null);
    setQuestion("");
    inputRef.current?.focus();
  }

  const close = () => setOpen(false);
  // Where the last press began: a text selection dragged out over the backdrop is not a backdrop click.
  const pressedOnBackdrop = useRef(false);
  const last = list[list.length - 1];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={buttonTitle} className={ASK_BUTTON_CLASS}>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M10 1.5l1.7 4.8 4.8 1.7-4.8 1.7L10 14.5l-1.7-4.8L3.5 8l4.8-1.7zM16 12.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
        </svg>
        <span className="sr-only lg:not-sr-only">Ask the Hub</span>
      </button>
      {open && (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
          onPointerDown={(e) => {
            pressedOnBackdrop.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            const fromBackdrop = pressedOnBackdrop.current;
            pressedOnBackdrop.current = false;
            if (fromBackdrop && e.target === e.currentTarget) close();
          }}
          onClose={close}
          className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-full border-0 bg-white p-0 text-left text-zinc-900 shadow-xl backdrop:bg-black/40 sm:max-w-md sm:border-l sm:border-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 sm:dark:border-zinc-700"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <div>
                <h2 id={titleId} className="text-lg font-semibold text-brand-navy dark:text-zinc-100">
                  Ask the Hub
                </h2>
                <p className="text-xs text-brand-muted">{intro}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="outline" onClick={newConversation} disabled={busy || stored.messages.length === 0}>
                  New Conversation
                </Button>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={close}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-brand-muted hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span aria-hidden>✕</span>
                </button>
              </div>
            </div>

            <div ref={logRef} className="relative flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
              {list.length === 0 && (
                <div>
                  <p className="text-brand-muted">Try one of these, or ask your own question:</p>
                  <ul className="mt-2 space-y-2">
                    {starters.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => ask(s)}
                          className="w-full rounded-md border border-zinc-200 px-3 py-2 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {list.map((x, i) => (
                <div key={i} className="space-y-2">
                  <p className="ml-8 rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                    <span className="sr-only">You asked: </span>
                    {x.question}
                  </p>
                  {x.answer && <Answer text={x.answer} links={links} onNavigate={close} />}
                </div>
              ))}
            </div>

            <div aria-live="polite" className="px-4 text-sm">
              {notice && <p className="pb-2 text-brand-muted">{notice}</p>}
              {busy && <p className="pb-2 text-brand-muted">{status ?? "Thinking…"}</p>}
              {!busy && last && !last.answer && !error && (
                <p className="pb-2 text-brand-muted">No answer came back for that one. Ask again, or try another way.</p>
              )}
              {error && <p className="pb-2 text-red-700 dark:text-red-300">{error}</p>}
              {!busy && last?.answer && <p className="sr-only">Answer ready.</p>}
            </div>

            <form
              noValidate
              className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
            >
              <label htmlFor={`${titleId}-q`} className="sr-only">
                Your question
              </label>
              <textarea
                id={`${titleId}-q`}
                ref={inputRef}
                rows={2}
                maxLength={MAX_QUESTION_CHARS}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void ask(question);
                  }
                }}
                placeholder={placeholder}
                className={inputClasses("resize-none")}
              />
              <div className="mt-2 flex justify-end">
                <Button type="submit" busy={busy} busyLabel="Asking…">
                  Ask
                </Button>
              </div>
            </form>
          </div>
        </dialog>
      )}
    </>
  );
}
