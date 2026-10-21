// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionWatch, SignOutForm, authjsSessionCheck } from "../session";

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
    expect(screen.getByRole("link", { name: "Sign In Again" }).getAttribute("href")).toBe("/auth/signin?callbackUrl=%2F");
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

  it("shows the signed-out dialog when the countdown runs out, without asking the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionWatch idleTimeoutSeconds={600} />);
    await act(async () => vi.advanceTimersByTime(10 * 60_000 + 100));
    expect(screen.getByRole("alertdialog", { name: "You’ve been signed out" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
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
