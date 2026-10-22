// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnreadBadge, clearUnreadBadge, resetUnreadBadgeForTests } from "../ui/UnreadBadge";
import { SessionWatch } from "../session";

// Its own file: SignOutForm marks the page as signing out for good, after
// which SessionWatch ignores other tabs, so these can't share a module with
// the Sign Out test.

// jsdom has no canvas: a fake 2D context and an image that loads at once let
// the favicon path run end to end.
const fakeCtx = {
  beginPath() {},
  arc() {},
  fill() {},
  stroke() {},
  fillText: vi.fn(),
  drawImage() {},
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 0,
  font: "",
  textAlign: "",
  textBaseline: "",
};

class InstantImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => {});
}

function icon(): HTMLLinkElement {
  return document.head.querySelector('link[rel~="icon"]') as HTMLLinkElement;
}

beforeEach(() => {
  resetUnreadBadgeForTests();
  document.title = "Alerts · Missed Punch Hub";
  document.head.querySelectorAll("link").forEach((l) => l.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.setAttribute("href", "/icon.png?abc");
  document.head.appendChild(link);
  vi.stubGlobal("Image", InstantImage);
  let n = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => `data:image/png;base64,badge${++n}`);
  fakeCtx.fillText.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetUnreadBadgeForTests();
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

describe("the signed-out screen takes the count off (review F2)", () => {
  beforeEach(() => {
    FakeChannel.all.clear();
    vi.stubGlobal("BroadcastChannel", FakeChannel);
  });

  it("when another tab signs out", async () => {
    const { rerender } = render(
      <>
        <UnreadBadge count={3} />
        <SessionWatch sessionUrl={null} />
      </>,
    );
    await flush();
    expect(document.title).toBe("(3) Alerts · Missed Punch Hub");
    const otherTab = new FakeChannel("sequel-session");
    act(() => otherTab.postMessage({ type: "signed-out" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    await flush();
    expect(document.title).toBe("Alerts · Missed Punch Hub");
    expect(icon().getAttribute("href")).toBe("/icon.png?abc");
    rerender(
      <>
        <UnreadBadge count={4} />
        <SessionWatch sessionUrl={null} />
      </>,
    );
    await flush();
    expect(document.title).toBe("Alerts · Missed Punch Hub");
  });

  it("when the idle countdown runs out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
    try {
      render(
        <>
          <UnreadBadge count={3} />
          <SessionWatch idleTimeoutSeconds={600} />
        </>,
      );
      await act(async () => {});
      expect(document.title).toBe("(3) Alerts · Missed Punch Hub");
      await act(async () => vi.advanceTimersByTime(10 * 60_000 + 100));
      await act(async () => {});
      expect(document.querySelector("dialog[data-conceal]")).not.toBeNull();
      expect(document.title).toBe("Alerts · Missed Punch Hub");
      expect(icon().getAttribute("href")).toBe("/icon.png?abc");
    } finally {
      vi.useRealTimers();
    }
  });
});
