// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGN_OUT_RESUME_GRACE_MS, UnreadBadge, clearUnreadBadge, resetUnreadBadgeForTests } from "../ui/UnreadBadge";
import { sameTitleIgnoringBadge } from "../ui/tab-badge";
import { SignOutForm } from "../session";

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

describe("UnreadBadge", () => {
  it("puts the count in the title and on the icon, and takes both off at zero", async () => {
    const { rerender } = render(<UnreadBadge count={3} />);
    await flush();
    expect(document.title).toBe("(3) Alerts · Missed Punch Hub");
    expect(icon().getAttribute("href")).toMatch(/^data:image\/png/);
    expect(fakeCtx.fillText).toHaveBeenCalledWith("3", expect.any(Number), expect.any(Number));

    rerender(<UnreadBadge count={12} />);
    await flush();
    expect(document.title).toBe("(12) Alerts · Missed Punch Hub");
    expect(fakeCtx.fillText).toHaveBeenLastCalledWith("9+", expect.any(Number), expect.any(Number));

    rerender(<UnreadBadge count={0} />);
    await flush();
    expect(document.title).toBe("Alerts · Missed Punch Hub");
    expect(icon().getAttribute("href")).toBe("/icon.png?abc");
  });

  it("puts the count back when a navigation rewrites the title or the icon", async () => {
    render(<UnreadBadge count={2} />);
    await flush();
    document.title = "Decision Log · Missed Punch Hub";
    await flush();
    expect(document.title).toBe("(2) Decision Log · Missed Punch Hub");

    icon().remove();
    const fresh = document.createElement("link");
    fresh.rel = "icon";
    fresh.setAttribute("href", "/icon.png?def");
    document.head.appendChild(fresh);
    await flush();
    expect(icon().getAttribute("href")).toMatch(/^data:image\/png/);
    expect(icon().getAttribute("data-unread-original")).toBe("/icon.png?def");
  });

  it("restores the tab when it unmounts", async () => {
    const { unmount } = render(<UnreadBadge count={4} />);
    await flush();
    unmount();
    await flush();
    expect(document.title).toBe("Alerts · Missed Punch Hub");
    expect(icon().getAttribute("href")).toBe("/icon.png?abc");
  });

  it("stays cleared after clearUnreadBadge, whatever the bell says next", async () => {
    const { rerender } = render(<UnreadBadge count={5} />);
    await flush();
    act(() => clearUnreadBadge());
    await flush();
    expect(document.title).toBe("Alerts · Missed Punch Hub");
    rerender(<UnreadBadge count={6} />);
    await flush();
    expect(document.title).toBe("Alerts · Missed Punch Hub");
    expect(icon().getAttribute("href")).toBe("/icon.png?abc");
  });

  it("Sign Out takes the count off the tab", async () => {
    render(
      <>
        <UnreadBadge count={7} />
        <SignOutForm />
      </>,
    );
    await flush();
    expect(document.title).toBe("(7) Alerts · Missed Punch Hub");
    const form = document.querySelector("form") as HTMLFormElement;
    form.addEventListener("submit", (e) => e.preventDefault());
    fireEvent.submit(form);
    await flush();
    expect(document.title).toBe("Alerts · Missed Punch Hub");
  });

  it("a Sign Out that never leaves the page gives the count back at a later input (review r2, F13)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { rerender } = render(
        <>
          <UnreadBadge count={2} />
          <SignOutForm />
        </>,
      );
      await flush();
      const form = document.querySelector("form") as HTMLFormElement;
      form.addEventListener("submit", (e) => e.preventDefault()); // the person chose Stay
      fireEvent.submit(form);
      await flush();
      expect(document.title).toBe("Alerts · Missed Punch Hub");
      rerender(
        <>
          <UnreadBadge count={5} />
          <SignOutForm />
        </>,
      );
      await flush();
      // A double-click on Sign Out, or typing while the sign-out is still leaving: stays off.
      fireEvent.pointerDown(form.querySelector("button") as HTMLButtonElement);
      fireEvent.keyDown(document.body, { key: "a" });
      await flush();
      expect(document.title).toBe("Alerts · Missed Punch Hub");
      // Later, still on the page: the sign-out was cancelled, so the tab follows the bell again.
      vi.setSystemTime(Date.now() + SIGN_OUT_RESUME_GRACE_MS + 1);
      fireEvent.pointerDown(form.querySelector("button") as HTMLButtonElement); // Sign Out itself never resumes
      await flush();
      expect(document.title).toBe("Alerts · Missed Punch Hub");
      fireEvent.pointerDown(document.body);
      await flush();
      expect(document.title).toBe("(5) Alerts · Missed Punch Hub");
      expect(icon().getAttribute("href")).toMatch(/^data:image\/png/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the signed-out screen's clear is for good: input does not bring the count back", async () => {
    render(<UnreadBadge count={2} />);
    await flush();
    act(() => clearUnreadBadge());
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: "a" });
    await flush();
    expect(document.title).toBe("Alerts · Missed Punch Hub");
  });

  // Counts every write to document.title (the setter still runs, so observers fire).
  function countTitleWrites(): string[] {
    const proto = Object.getOwnPropertyDescriptor(Document.prototype, "title")!;
    const writes: string[] = [];
    Object.defineProperty(document, "title", {
      configurable: true,
      get: () => proto.get!.call(document),
      set: (v: string) => {
        writes.push(v);
        proto.set!.call(document, v);
      },
    });
    return writes;
  }

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).title;
  });

  it("stands aside instead of spinning when a page keeps putting back a bare title (review F3)", async () => {
    render(<UnreadBadge count={1} />);
    await flush();
    const writes = countTitleWrites();
    // A title holder that ignores the badge: it puts back the bare title every time.
    const obs = new MutationObserver(() => {
      if (document.title !== "Alerts · Missed Punch Hub") document.title = "Alerts · Missed Punch Hub";
    });
    obs.observe(document.head, { subtree: true, childList: true, characterData: true });
    document.title = "Alerts · Missed Punch Hub";
    for (let i = 0; i < 40; i++) await flush();
    const badged = writes.filter((w) => w.startsWith("(1) ")).length;
    expect(badged).toBeLessThanOrEqual(20); // the write budget
    expect(badged).toBeGreaterThan(0);
    const settled = writes.length;
    for (let i = 0; i < 10; i++) await flush();
    expect(writes.length).toBe(settled); // the loop has ended
    expect(document.title).toBe("Alerts · Missed Punch Hub");
    obs.disconnect();
  });

  it("settles at once beside a title holder that compares through stripBadge", async () => {
    render(<UnreadBadge count={1} />);
    await flush();
    const writes = countTitleWrites();
    const obs = new MutationObserver(() => {
      if (!sameTitleIgnoringBadge(document.title, "Alerts · Missed Punch Hub")) document.title = "Alerts · Missed Punch Hub";
    });
    obs.observe(document.head, { subtree: true, childList: true, characterData: true });
    document.title = "Alerts · Missed Punch Hub";
    for (let i = 0; i < 10; i++) await flush();
    expect(document.title).toBe("(1) Alerts · Missed Punch Hub");
    expect(writes.length).toBeLessThanOrEqual(3);
    obs.disconnect();
  });

  it("clearUnreadBadge takes the count off even after a fight spent the budget (review F8)", async () => {
    render(<UnreadBadge count={1} />);
    await flush();
    // Spend the budget with a holder that keeps adding a stale count back.
    const obs = new MutationObserver(() => {
      if (!document.title.startsWith("(9) ")) document.title = "(9) Alerts · Missed Punch Hub";
    });
    obs.observe(document.head, { subtree: true, childList: true, characterData: true });
    document.title = "Alerts · Missed Punch Hub";
    for (let i = 0; i < 40; i++) await flush();
    obs.disconnect();
    act(() => clearUnreadBadge());
    await flush();
    expect(document.title).toBe("Alerts · Missed Punch Hub");
  });

  it("the clear's own budget bounds a fight with a page that keeps putting a count back (review F14)", async () => {
    render(<UnreadBadge count={1} />);
    await flush();
    const writes = countTitleWrites();
    const obs = new MutationObserver(() => {
      if (!document.title.startsWith("(9) ")) document.title = "(9) Alerts · Missed Punch Hub";
    });
    obs.observe(document.head, { subtree: true, childList: true, characterData: true });
    act(() => clearUnreadBadge());
    for (let i = 0; i < 60; i++) await flush();
    const settled = writes.length;
    expect(settled).toBeLessThanOrEqual(2 * 20 + 45); // strips stay within their budget
    for (let i = 0; i < 10; i++) await flush();
    expect(writes.length).toBe(settled); // the loop has ended
    obs.disconnect();
  });

  it("draws the icon once per count change, not again for its own title write (review F15)", async () => {
    let loads = 0;
    class CountingImage extends InstantImage {
      set src(v: string) {
        loads += 1;
        super.src = v;
      }
    }
    vi.stubGlobal("Image", CountingImage);
    const { rerender } = render(<UnreadBadge count={0} />);
    await flush();
    rerender(<UnreadBadge count={3} />);
    for (let i = 0; i < 5; i++) await flush();
    expect(document.title).toBe("(3) Alerts · Missed Punch Hub");
    expect(loads).toBe(1);
  });

  it("a page with no title shows just the count, stably", async () => {
    document.title = "";
    render(<UnreadBadge count={3} />);
    for (let i = 0; i < 10; i++) await flush();
    expect(document.title).toBe("(3)");
  });

  it("works without a canvas: the title still carries the count", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<UnreadBadge count={2} />);
    await flush();
    expect(document.title).toBe("(2) Alerts · Missed Punch Hub");
    expect(icon().getAttribute("href")).toBe("/icon.png?abc");
  });
});
