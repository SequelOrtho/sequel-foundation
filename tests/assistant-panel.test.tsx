// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { streamJob } from "../llm/stream";
import { LlmStreamError } from "../llm/stream-client";
import { AskHubPanel, type AskHubStepAnswer } from "../assistant/AskHubPanel";
import {
  ASK_BUTTON_CLASS,
  EMPTY_CONVERSATION,
  readStoredConversation,
  redactionNotice,
  stepErrorMessage,
} from "../assistant/panel-copy";
import { exchanges } from "../assistant/conversation";
import { DEFAULT_PRIVACY_NOTE } from "../assistant/withheld";

// The family Ask the Hub panel (ported from the Missed Punch Hub's
// tests/components/ask-hub.test.tsx). Wrong versions this catches: the browser
// loop not sending the tool turns back, a link no tool returned rendering as a
// link, the conversation outliving Sign Out (it must sit under the
// remembered-view prefix the foundation clears), one role's conversation
// carried into another, Ask not saying busy, focus not returning to the
// button, and a raw browser or AI-service error on screen.

vi.mock("next/link", () => ({
  default: (p: { href: string; children: unknown; onClick?: () => void }) => (
    <a href={p.href} onClick={p.onClick}>
      {p.children as never}
    </a>
  ),
}));

const fetchMock = vi.fn();
const step = (result: AskHubStepAnswer) => streamJob(async () => result);
const answer = (text: string, extra: Partial<AskHubStepAnswer> = {}) =>
  step({ turns: [{ role: "assistant", content: [{ type: "text", text }] }], done: true, links: [], ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const STARTERS = ["What's waiting for me?", "Did my last request get approved?"];
const Panel = ({
  role = "member",
  starters = STARTERS,
  privacyNote,
}: {
  role?: string;
  starters?: string[];
  privacyNote?: string | true;
}) => (
  <AskHubPanel
    role={role}
    starters={starters}
    privacyNote={privacyNote}
    intro="Answers come only from what you can open. It never changes anything."
    placeholder="Ask a question"
    buttonTitle="Ask a question about this hub"
  />
);

const open = () => fireEvent.click(screen.getByRole("button", { name: "Ask the Hub" }));
const askTyped = (text: string) => {
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
};

describe("AskHubPanel", () => {
  it("is a filled pill that keeps its name when the label is screen-reader text below lg", () => {
    render(<Panel />);
    const button = screen.getByRole("button", { name: "Ask the Hub" });
    const classes = button.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["bg-brand", "rounded-full", "dark:text-zinc-900", "whitespace-nowrap", "shrink-0"]));
    expect(button.querySelector("span")?.className).toBe("sr-only lg:not-sr-only");
    expect(button.getAttribute("title")).toBe("Ask a question about this hub");
    expect(ASK_BUTTON_CLASS).toContain("shrink-0");
  });

  it("opens with the question box focused, the starters and the hub's intro", () => {
    render(<Panel />);
    open();
    expect(document.activeElement).toBe(screen.getByLabelText("Your question"));
    expect(screen.getByRole("button", { name: "What's waiting for me?" })).toBeTruthy();
    expect(screen.getByText(/never changes anything/)).toBeTruthy();
    expect(screen.getByLabelText("Your question").getAttribute("placeholder")).toBe("Ask a question");
  });

  it("drives the loop: posts the tool turn back, then renders the answer with only returned links", async () => {
    fetchMock
      .mockResolvedValueOnce(
        step({ turns: [{ role: "assistant", content: [{ type: "tool_use", id: "t1", name: "my_requests", input: {} }] }], done: false, links: [] }),
      )
      .mockResolvedValueOnce(
        step({
          turns: [
            { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: '{"requests":[{"link":"/requests/mp_1"}]}' }] },
            {
              role: "assistant",
              content: [{ type: "text", text: "Approved: [Tuesday](/requests/mp_1). Also [Ghost](/requests/mp_9) and [Evil](https://evil.example)." }],
            },
          ],
          done: true,
          links: ["/requests/mp_1"],
        }),
      );
    render(<Panel />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Did my last request get approved?" }));

    const link = await screen.findByRole("link", { name: "Tuesday" });
    expect(link.getAttribute("href")).toBe("/requests/mp_1");
    expect(screen.queryByRole("link", { name: "Ghost" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Evil" })).toBeNull();
    expect(screen.getByText(/Ghost/)).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/assistant/step");
    const second = JSON.parse(fetchMock.mock.calls[1][1].body).messages;
    expect(second.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    expect(second[1].content[0].type).toBe("tool_use");
  });

  it("posts to the hub's own endpoint when one is given", async () => {
    fetchMock.mockResolvedValue(answer("Hello."));
    render(
      <AskHubPanel role="member" starters={[]} intro="x" placeholder="p" buttonTitle="t" endpoint="/api/ask/step" />,
    );
    open();
    askTyped("hi");
    await screen.findByText("Hello.");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ask/step");
  });

  it("keeps the conversation under the remembered-view prefix Sign Out clears, per role", async () => {
    fetchMock.mockResolvedValue(answer("Hello."));
    const { unmount } = render(<Panel role="manager" starters={[]} />);
    open();
    askTyped("hi");
    await screen.findByText("Hello.");
    const keys = Object.keys(window.sessionStorage).filter((k) => k.includes("assistant"));
    expect(keys).toEqual(["sf.view.assistant.manager"]);
    unmount();

    render(<Panel role="member" starters={[]} />);
    open();
    expect(screen.queryByText("Hello.")).toBeNull();
  });

  it("New Conversation clears it; Enter asks", async () => {
    fetchMock.mockResolvedValue(answer("Hello."));
    render(<Panel starters={[]} />);
    open();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "hi" } });
    fireEvent.keyDown(screen.getByLabelText("Your question"), { key: "Enter" });
    await screen.findByText("Hello.");
    fireEvent.click(screen.getByRole("button", { name: "New Conversation" }));
    expect(screen.queryByText("Hello.")).toBeNull();
    expect(window.sessionStorage.getItem("sf.view.assistant.member")).toBeNull();
  });

  it("says busy on Ask while a step is on its way", async () => {
    let resolve: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    render(<Panel starters={[]} />);
    open();
    askTyped("hi");
    const busy = await screen.findByRole("button", { name: "Asking…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    resolve(answer("Done."));
    await screen.findByText("Done.");
    expect(screen.getByRole("button", { name: "Ask" }).getAttribute("aria-busy")).not.toBe("true");
  });

  it("shows the input gate's notice when part of the question was removed", async () => {
    fetchMock.mockResolvedValue(answer("Noted.", { redactions: ["ssn"] }));
    render(<Panel starters={[]} />);
    open();
    askTyped("my ssn is 123-45-6789");
    expect(await screen.findByText("Removed from your question before it was sent: a Social Security number.")).toBeTruthy();
  });

  it("shows the server's refusal and closes back to the button", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Ask the Hub is busy for you right now." }), { status: 429 }));
    render(<Panel starters={[]} />);
    const button = screen.getByRole("button", { name: "Ask the Hub" });
    button.focus();
    open();
    askTyped("hi");
    expect(await screen.findByText(/busy for you/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("never shows a browser's raw error text", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Panel starters={[]} />);
    open();
    askTyped("hi");
    expect(await screen.findByText(/didn't answer just now/)).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  // Round-2 review, item 9: focus goes back to the trigger by ref, even when
  // something else held focus as the panel opened (a click on a button that
  // doesn't take focus, Safari / Firefox on a Mac).
  it("returns focus to the Ask the Hub button on close, whatever held focus as it opened", async () => {
    render(
      <>
        <a href="/elsewhere">Elsewhere</a>
        <Panel />
      </>,
    );
    const button = screen.getByRole("button", { name: "Ask the Hub" });
    screen.getByRole("link", { name: "Elsewhere" }).focus();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  // Round-2 review, item 10: an answer landing never pulls focus off a link
  // the person moved to while it was on its way.
  it("puts focus back in the question box after an answer only if focus was still on Ask or the box", async () => {
    fetchMock.mockResolvedValueOnce(answer("See [Tuesday](/requests/mp_1).", { links: ["/requests/mp_1"] }));
    render(<Panel starters={[]} />);
    open();
    askTyped("first");
    const link = await screen.findByRole("link", { name: "Tuesday" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Your question")));

    let resolve: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    askTyped("second");
    await screen.findByRole("button", { name: "Asking…" });
    link.focus();
    resolve(answer("Second answer."));
    await screen.findByText("Second answer.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ask" }).getAttribute("aria-busy")).not.toBe("true"));
    expect(document.activeElement).toBe(link);
  });

  it("closes on a backdrop click, not on a click inside the panel", async () => {
    render(<Panel />);
    open();
    const dialog = screen.getByRole("dialog", { name: "Ask the Hub" });
    fireEvent.pointerDown(screen.getByLabelText("Your question"));
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog", { name: "Ask the Hub" })).toBeTruthy();
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ask the Hub" })).toBeNull());
  });
});

describe("panel copy", () => {
  it("maps step errors to plain words, never the service's raw text", () => {
    expect(stepErrorMessage(new TypeError("Failed to fetch"))).toMatch(/didn't answer just now/);
    expect(stepErrorMessage(new LlmStreamError("Failed (502)", 502))).toMatch(/didn't answer just now/);
    expect(stepErrorMessage(new LlmStreamError("AI service error (529).", 502))).toMatch(/didn't answer just now/);
    expect(stepErrorMessage(new LlmStreamError("The AI service did not respond within its time budget.", 504))).toMatch(/narrower question/);
    expect(stepErrorMessage(new LlmStreamError("This conversation is too long. Start a new one.", 413))).toMatch(/Start a new one/);
  });

  it("names each removed kind once and skips unknown kinds", () => {
    expect(redactionNotice(undefined)).toBeNull();
    expect(redactionNotice([])).toBeNull();
    expect(redactionNotice(["card", "card", "unknown"])).toBe("Removed from your question before it was sent: a card number.");
  });

  it("reads back only a well-formed stored conversation", () => {
    const good = { messages: [{ role: "user", content: "hi" }], links: ["/a"] };
    expect(readStoredConversation(EMPTY_CONVERSATION, good)).toEqual(good);
    expect(readStoredConversation(EMPTY_CONVERSATION, { messages: "nope" })).toEqual(EMPTY_CONVERSATION);
    expect(readStoredConversation(EMPTY_CONVERSATION, null)).toEqual(EMPTY_CONVERSATION);
  });

  it("starts clean on a stored message the panel could not render, and renders without throwing", () => {
    const bad = [
      { messages: [null], links: [] },
      { messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "plain string" }], links: [] },
      { messages: [{ role: "assistant", content: [null] }], links: [] },
      { messages: [{ role: "system", content: "x" }], links: [] },
    ];
    for (const value of bad) {
      expect(readStoredConversation(EMPTY_CONVERSATION, value)).toEqual(EMPTY_CONVERSATION);
      const read = readStoredConversation(EMPTY_CONVERSATION, value);
      expect(() => exchanges(read.messages)).not.toThrow();
    }
    const withTool = {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "x", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] },
        { role: "assistant", content: [{ type: "text", text: "done" }] },
      ],
      links: [],
    };
    expect(readStoredConversation(EMPTY_CONVERSATION, withTool)).toEqual(withTool);
  });
});

// Owner ruling 2026-10-29, Mike: "let's make sure when results are purposely
// being redacted based on rules that that is made clear to the user so it isn't
// reported as a 'bug'". The panel line is opt-in: a hub whose tools withhold
// nothing shows none.
describe("AskHubPanel privacy note", () => {
  it("shows no note unless the hub asks for one", () => {
    render(<Panel />);
    open();
    expect(screen.queryByText(DEFAULT_PRIVACY_NOTE)).toBeNull();
    expect(screen.getByLabelText("Your question").getAttribute("aria-describedby")).toBeNull();
  });

  it("privacyNote={true} shows the family sentence, muted, and describes the question box", () => {
    render(<Panel privacyNote />);
    open();
    const note = screen.getByText(DEFAULT_PRIVACY_NOTE);
    expect(note.className).toContain("text-brand-muted");
    const box = screen.getByLabelText("Your question");
    expect(box.getAttribute("aria-describedby")).toBe(note.id);
    expect(note.id).toBeTruthy();
  });

  it("a hub's own sentence replaces the family one; a blank one shows nothing", () => {
    const { unmount } = render(<Panel privacyNote="Visit notes stay out of answers on purpose. Open the visit to read them." />);
    open();
    expect(screen.getByText("Visit notes stay out of answers on purpose. Open the visit to read them.")).toBeTruthy();
    expect(screen.queryByText(DEFAULT_PRIVACY_NOTE)).toBeNull();
    unmount();
    render(<Panel privacyNote="   " />);
    open();
    expect(screen.getByLabelText("Your question").getAttribute("aria-describedby")).toBeNull();
  });
});
