// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionWatch, SignOutForm, authjsSessionCheck } from "../session";
import { Dialog } from "../ui/Dialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom has no BroadcastChannel; a tiny in-memory one lets tabs "talk".
class FakeChannel {
  static all = new Set<FakeChannel>();
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(public name: string) {
    FakeChannel.all.add(this);
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.all) if (c !== this && c.name === this.name) c.onmessage?.({ data } as MessageEvent);
  }
  close() {
    FakeChannel.all.delete(this);
  }
}

beforeEach(() => {
  FakeChannel.all.clear();
  vi.stubGlobal("BroadcastChannel", FakeChannel);
});

describe("SignOutForm", () => {
  it("is a plain POST form to /auth/sign-out, not a Server Action", () => {
    const { container } = render(
      <SignOutForm>
        <span>pat@x.com</span>
      </SignOutForm>,
    );
    const form = container.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/auth/sign-out");
    expect(screen.getByText("pat@x.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeTruthy();
  });
});

describe("SessionWatch", () => {
  it("shows the signed-out dialog when another tab signs out", async () => {
    render(<SessionWatch sessionUrl={null} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const otherTab = new FakeChannel("sequel-session");
    act(() => otherTab.postMessage({ type: "signed-out" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    // Another tab confirmed it: the cookie is gone, so Sign In Again is the
    // plain sign-in link, never a sign-out (PR review round 2, F10).
    const again = screen.getByRole("link", { name: "Sign In Again" });
    expect(again.getAttribute("href")).toBe("/auth/signin?callbackUrl=%2F");
    expect(again.closest("form")).toBeNull();
  });

  it("makes the rest of the page inert while the dialog shows", async () => {
    render(
      <>
        <button type="button">Save Changes</button>
        <SessionWatch sessionUrl={null} />
      </>,
    );
    const otherTab = new FakeChannel("sequel-session");
    act(() => otherTab.postMessage({ type: "signed-out" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.closest("[inert]")).toBeNull();
    expect(screen.getByText("Save Changes").closest("[inert]")).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Sign In Again" }));
    // Signed out: the previous person's page is hidden, not just dimmed.
    expect(dialog.hasAttribute("data-conceal")).toBe(true);
  });

  it("opens on top of a ui/Dialog left open, in the top layer, and can't be closed (PR review F1)", async () => {
    // jsdom has no showModal; a stand-in records the top-layer order.
    const topLayer: HTMLDialogElement[] = [];
    const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
      topLayer.push(this);
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      topLayer.splice(topLayer.indexOf(this), 1);
      this.dispatchEvent(new Event("close"));
    };
    try {
      render(
        <>
          <Dialog open title="Records" onClose={() => {}}>
            <p>Previous person’s records</p>
          </Dialog>
          <SessionWatch sessionUrl={null} />
        </>,
      );
      act(() => new FakeChannel("sequel-session").postMessage({ type: "signed-out" }));
      const ended = await screen.findByRole("alertdialog", { name: "You’ve been signed out" });
      // Shown modal after the open Dialog, so it is the topmost: above it, and
      // the one element the browser leaves interactive.
      expect(ended.tagName).toBe("DIALOG");
      expect(topLayer.at(-1)).toBe(ended);
      expect(topLayer).toHaveLength(2);
      // Escape (cancel) is refused, and a browser that closes it anyway gets it back.
      const cancel = new Event("cancel", { cancelable: true });
      ended.dispatchEvent(cancel);
      expect(cancel.defaultPrevented).toBe(true);
      act(() => (ended as HTMLDialogElement).close());
      expect(ended.hasAttribute("open")).toBe(true);
      expect(topLayer.at(-1)).toBe(ended);
      cleanup();
      expect(topLayer).toHaveLength(0);
    } finally {
      delete proto.showModal;
      delete proto.close;
    }
  });

  it("gives the page back when the dialog goes, leaving already-inert parts inert", async () => {
    const view = render(
      <>
        <button type="button">Save Changes</button>
        <SessionWatch sessionUrl={null} />
      </>,
    );
    const already = document.createElement("div");
    already.setAttribute("inert", "");
    document.body.appendChild(already);
    const otherTab = new FakeChannel("sequel-session");
    act(() => otherTab.postMessage({ type: "signed-out" }));
    await screen.findByRole("alertdialog");
    expect(screen.getByText("Save Changes").closest("[inert]")).not.toBeNull();
    view.unmount();
    expect(document.querySelector("[inert]")).toBe(already);
    already.remove();
  });

  it("checks the session when the tab becomes visible and reports an ended one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("null", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionWatch />);
    fireEvent(document, new Event("visibilitychange"));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ cache: "no-store" }));
  });

  it("stays quiet while the session is alive", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { email: "a@b" } })));
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionWatch />);
    fireEvent(document, new Event("visibilitychange"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("authjsSessionCheck reads Auth.js's null session as signed out", async () => {
    expect(await authjsSessionCheck(new Response("null"))).toBe(false);
    expect(await authjsSessionCheck(new Response("{}", { status: 401 }))).toBe(false);
    expect(await authjsSessionCheck(new Response('{"user":{}}'))).toBe(true);
    expect(await authjsSessionCheck(new Response("oops", { status: 500 }))).toBe(true);
  });
});

describe("SignedInNotice and MicrosoftSignOutOffer", () => {
  it("offers Continue to the given page and Sign Out", async () => {
    const { SignedInNotice } = await import("../session");
    render(<SignedInNotice appName="Sequel Project Hub" email="pat@x.com" continueHref="/admin/roles" />);
    expect(screen.getByText(/You’re signed in to Sequel Project Hub/)).toBeTruthy();
    expect(screen.getByText("pat@x.com")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/admin/roles");
    expect(screen.getByRole("button", { name: "Sign Out" }).closest("form")!.getAttribute("action")).toBe("/auth/sign-out");
  });
  it("links to Microsoft's sign-out and says what else it ends", async () => {
    const { MicrosoftSignOutOffer } = await import("../session");
    render(<MicrosoftSignOutOffer href="https://login.microsoftonline.com/t/oauth2/v2.0/logout" />);
    expect(screen.getByRole("link", { name: "Also sign out of Microsoft" }).getAttribute("href")).toContain("/oauth2/v2.0/logout");
    expect(screen.getByText(/Outlook and Teams/)).toBeTruthy();
  });
});

describe("SessionWatch expiry warning (owner ruling 2026-10-21, UX audit Q6)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("warns two minutes before an idle session ends, then Stay Signed In keeps it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { email: "a@b" } })));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <>
        <button>Save Changes</button>
        <SessionWatch idleTimeoutSeconds={600} />
      </>,
    );
    await act(async () => vi.advanceTimersByTime(7 * 60_000));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await act(async () => vi.advanceTimersByTime(61_000));
    const dialog = screen.getByRole("alertdialog", { name: "Your session is about to end" });
    expect(dialog.textContent).toMatch(/signed out in about 2 minutes/);
    // Still signed in: the page stays visible behind the warning.
    expect(dialog.hasAttribute("data-conceal")).toBe(false);
    const stay = screen.getByRole("button", { name: "Stay Signed In" });
    expect(document.activeElement).toBe(stay);
    expect(screen.getByText("Save Changes").closest("[inert]")).not.toBeNull();
    await act(async () => {
      fireEvent.click(stay);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ cache: "no-store" }));
    // The stay is a request like any other; the clock restarts from it.
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Save Changes").closest("[inert]")).toBeNull();
    expect(localStorage.getItem("sequel.session.lastActive")).toBe(String(Date.now()));
    await act(async () => vi.advanceTimersByTime(7 * 60_000));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("a Stay Signed In that finds the session gone shows the signed-out dialog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("null")));
    render(<SessionWatch idleTimeoutSeconds={600} />);
    await act(async () => vi.advanceTimersByTime(8 * 60_000 + 100));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stay Signed In" }));
    });
    expect(screen.getByRole("alertdialog", { name: "You’ve been signed out" })).toBeTruthy();
  });

  it("a Stay Signed In that gets a 5xx or 429 keeps the warning up with Try Again (PR review F2)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionWatch idleTimeoutSeconds={600} />);
    await act(async () => vi.advanceTimersByTime(8 * 60_000 + 100));
    const before = localStorage.getItem("sequel.session.lastActive");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stay Signed In" }));
    });
    expect(screen.getByRole("alertdialog", { name: "Your session is about to end" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/couldn’t reach the server/);
    expect(localStorage.getItem("sequel.session.lastActive")).toBe(before);
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    });
    expect(screen.getByRole("alertdialog", { name: "Your session is about to end" })).toBeTruthy();
    expect(localStorage.getItem("sequel.session.lastActive")).toBe(before);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ user: {} })));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows the signed-out dialog when the countdown runs out, without asking the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionWatch idleTimeoutSeconds={600} />);
    await act(async () => vi.advanceTimersByTime(10 * 60_000 + 100));
    expect(screen.getByRole("alertdialog", { name: "You’ve been signed out" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs from the warning into the signed-out screen without reopening it over and over (round 3)", async () => {
    // A real browser fires 'close' asynchronously. A stand-in that does the
    // same: the warning's close() must not reach the signed-out dialog and
    // close/reopen it forever (seen in Chromium before the fix).
    const calls: string[] = [];
    const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
    proto.showModal = function (this: HTMLDialogElement) {
      calls.push(`show:${this.getAttribute("aria-labelledby")}`);
      this.setAttribute("open", "");
    };
    proto.close = function (this: HTMLDialogElement) {
      calls.push(`close:${this.getAttribute("aria-labelledby")}`);
      this.removeAttribute("open");
      setTimeout(() => this.dispatchEvent(new Event("close")), 0);
    };
    try {
      render(<SessionWatch idleTimeoutSeconds={600} />);
      await act(async () => vi.advanceTimersByTime(8 * 60_000 + 100));
      expect(screen.getByRole("alertdialog", { name: "Your session is about to end" })).toBeTruthy();
      await act(async () => vi.advanceTimersByTime(2 * 60_000 + 100));
      await act(async () => vi.advanceTimersByTime(5_000));
      const ended = screen.getByRole("alertdialog", { name: "You’ve been signed out" });
      expect(ended.hasAttribute("open")).toBe(true);
      expect(calls.filter((c) => c.startsWith("show:")).length).toBe(2);
      expect(calls.filter((c) => c.startsWith("close:")).length).toBe(1);
    } finally {
      delete proto.showModal;
      delete proto.close;
    }
  });

  it("after a countdown end, Sign In Again signs out first, unless a tab signed in again since (round 2, F6/F10)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<SessionWatch idleTimeoutSeconds={600} />);
    await act(async () => vi.advanceTimersByTime(10 * 60_000 + 100));
    const again = screen.getByRole("button", { name: "Sign In Again" });
    const form = again.closest("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/auth/sign-out");
    expect(form.querySelector<HTMLInputElement>("input[name=callbackUrl]")!.value).toBe("/");
    // Submitting with nothing newer: the sign-out POST goes ahead.
    const first = new Event("submit", { cancelable: true, bubbles: true });
    form.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(false);
    // The person signs in again in another tab, which records a request.
    localStorage.setItem("sequel.session.lastActive", String(Date.now()));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, pathname: "/", search: "", assign });
    const second = new Event("submit", { cancelable: true, bubbles: true });
    form.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(true);
    expect(assign).toHaveBeenCalledWith("/auth/signin?callbackUrl=%2F");
  });

  it("a Stay Signed In that never answers gives up, and the countdown ends it (round 2, F11)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))),
    );
    render(<SessionWatch idleTimeoutSeconds={600} />);
    await act(async () => vi.advanceTimersByTime(10 * 60_000 - 1_000));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stay Signed In" }));
    });
    await act(async () => vi.advanceTimersByTime(11_000));
    expect(screen.getByRole("alertdialog", { name: "You’ve been signed out" }).hasAttribute("data-conceal")).toBe(true);
  });

  it("asks the server nothing more once the countdown has shown the signed-out screen (round 2)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: {} })));
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionWatch idleTimeoutSeconds={600} />);
    await act(async () => vi.advanceTimersByTime(10 * 60_000 + 100));
    expect(screen.getByRole("alertdialog", { name: "You’ve been signed out" })).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(2 * 60_000));
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a Stay Signed In still on its way when the countdown ends decides the outcome (round 2)", async () => {
    let answer: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    render(<SessionWatch idleTimeoutSeconds={600} />);
    await act(async () => vi.advanceTimersByTime(10 * 60_000 - 1_000));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stay Signed In" }));
    });
    await act(async () => vi.advanceTimersByTime(3_000)); // a cold start outlasts the countdown
    expect(screen.queryByRole("alertdialog", { name: "You’ve been signed out" })).toBeNull();
    await act(async () => answer(new Response(JSON.stringify({ user: {} }))));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("dates a request by its age, so a sleep doesn't make the warning early (round 2)", async () => {
    const entries: { name: string; initiatorType: string; startTime: number }[] = [];
    let notify: (list: { getEntries: () => typeof entries }) => void = () => {};
    vi.stubGlobal(
      "PerformanceObserver",
      class {
        constructor(cb: typeof notify) {
          notify = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("fetch", vi.fn());
    render(<SessionWatch idleTimeoutSeconds={600} />);
    // Five hours of sleep: the wall clock moves, performance.now() doesn't.
    const perfNow = performance.now();
    vi.setSystemTime(Date.now() + 5 * 3_600_000);
    vi.spyOn(performance, "now").mockReturnValue(perfNow + 1_000);
    act(() => notify({ getEntries: () => [{ name: `${window.location.origin}/api/x`, initiatorType: "fetch", startTime: perfNow + 900 }] }));
    expect(Number(localStorage.getItem("sequel.session.lastActive"))).toBe(Date.now() - 100);
  });

  it("counts a click on a same-origin download link as activity (round 2)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <>
        <a href="/api/export/x.xlsx" download onClick={(e) => e.preventDefault()}>
          Download
        </a>
        <SessionWatch idleTimeoutSeconds={600} />
      </>,
    );
    await act(async () => vi.advanceTimersByTime(5 * 60_000));
    fireEvent.click(screen.getByText("Download"));
    expect(localStorage.getItem("sequel.session.lastActive")).toBe(String(Date.now()));
  });

  it("another tab's activity pushes the warning back", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<SessionWatch idleTimeoutSeconds={600} />);
    await act(async () => vi.advanceTimersByTime(5 * 60_000));
    localStorage.setItem("sequel.session.lastActive", String(Date.now()));
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "sequel.session.lastActive" })));
    await act(async () => vi.advanceTimersByTime(4 * 60_000));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await act(async () => vi.advanceTimersByTime(4 * 60_000 + 100));
    expect(screen.getByRole("alertdialog", { name: "Your session is about to end" })).toBeTruthy();
  });

  it("is off without idleTimeoutSeconds or without a session URL", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<SessionWatch />);
    render(<SessionWatch sessionUrl={null} idleTimeoutSeconds={600} />);
    await act(async () => vi.advanceTimersByTime(60 * 60_000));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
