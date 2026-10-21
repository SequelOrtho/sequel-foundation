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
