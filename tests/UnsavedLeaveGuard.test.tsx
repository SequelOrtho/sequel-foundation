// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnsavedLeaveGuard, inAppLeaveHref, type UnsavedLeaveGuardHandle } from "../ui/UnsavedLeaveGuard";

// The in-app half of the unsaved-changes guard (DESIGN-CONVENTIONS §3
// "Unsaved edits ask before you leave"). A small editor stands in for a hub's:
// one value, a Save, and the guard wired the way the convention says.

const navigate = vi.fn();
const saved = vi.fn();

function Editor({ saveWorks = true, busy = false }: { saveWorks?: boolean; busy?: boolean }) {
  const [value, setValue] = useState("a");
  const [base, setBase] = useState("a");
  const [saving, setSaving] = useState(false);
  const guard = useRef<UnsavedLeaveGuardHandle>(null);
  const dirty = value !== base;
  async function save(leave?: () => void) {
    setSaving(true);
    await Promise.resolve();
    setSaving(false);
    if (!saveWorks) return false;
    saved(value);
    setBase(value);
    if (leave) leave();
    else void guard.current?.release();
    return true;
  }
  return (
    <>
      <a href="/elsewhere?tab=all">Elsewhere</a>
      <a href="/elsewhere" target="_blank" rel="noreferrer">
        Elsewhere in a new tab
      </a>
      <a href="#main">Skip to main content</a>
      <main id="main" tabIndex={-1} />
      <button type="button" onClick={() => setValue("b")}>
        Edit
      </button>
      <button type="button" onClick={() => setValue("a")}>
        Undo
      </button>
      <button type="button" onClick={() => void save()}>
        Save
      </button>
      <UnsavedLeaveGuard
        ref={guard}
        dirty={dirty}
        busy={busy || saving}
        what="this record"
        changes={dirty ? ["Changed the value"] : []}
        saveLabel="Save and Leave"
        saving={saving}
        onSave={(leave) => save(leave)}
        navigate={navigate}
      />
    </>
  );
}

const pressBack = () => act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
const click = (name: string) => fireEvent.click(screen.getByRole("link", { name }));
let here = "";

beforeEach(() => {
  here = window.location.href;
  // The browser's report of a step back comes at once here, so no test leaves a release waiting.
  vi.spyOn(window.history, "back").mockImplementation(() => void window.dispatchEvent(new PopStateEvent("popstate")));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockReset();
  saved.mockReset();
  window.history.replaceState(null, "", here);
});

describe("UnsavedLeaveGuard — a link inside the app", () => {
  it("is held while there are unsaved edits; Keep Editing stays, with the edit kept", () => {
    render(<Editor />);
    click("Elsewhere");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    click("Elsewhere");
    const dialog = screen.getByRole("dialog", { name: "Leave without saving?" });
    expect(dialog.textContent).toContain("Your changes to this record have not been saved.");
    expect(dialog.textContent).toContain("Changed the value");
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep Editing" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Save and Leave saves, then goes in place of the extra history entry; a failed save stays", async () => {
    const { unmount } = render(<Editor saveWorks={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    click("Elsewhere");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save and Leave" })));
    expect(navigate).not.toHaveBeenCalled();
    unmount();
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    click("Elsewhere");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save and Leave" })));
    expect(saved).toHaveBeenCalledWith("b");
    expect(navigate).toHaveBeenCalledWith("/elsewhere?tab=all", "replace");
  });

  it("Leave Without Saving goes and saves nothing; a link that opens another tab is left alone", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    click("Elsewhere in a new tab");
    expect(screen.queryByRole("dialog")).toBeNull();
    click("Elsewhere");
    fireEvent.click(screen.getByRole("button", { name: "Leave Without Saving" }));
    expect(navigate).toHaveBeenCalledWith("/elsewhere?tab=all", "replace");
    expect(saved).not.toHaveBeenCalled();
  });

  it("offers neither a save nor a leave while another request of the editor's is on its way", () => {
    render(<Editor busy />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    pressBack();
    const dialog = screen.getByRole("dialog", { name: "Leave without saving?" });
    expect((within(dialog).getByRole("button", { name: "Save and Leave" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Leave Without Saving" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("never hands the router a path that would read as another site", () => {
    const page = { origin: "https://hub.test", pathname: "/a", search: "", href: "https://hub.test/a" };
    const target = (href: string) => {
      const a = document.createElement("a");
      a.setAttribute("href", href);
      document.body.append(a);
      let seen: string | null = "unset";
      a.addEventListener("click", (e) => {
        seen = inAppLeaveHref(e, page);
        e.preventDefault();
      });
      a.click();
      a.remove();
      return seen;
    };
    expect(target("/b?x=1#y")).toBe("/b?x=1#y");
    expect(target("/.//evil.example/x")).toBeNull();
    expect(target("//evil.example/x")).toBeNull();
    expect(target("https://evil.example/x")).toBeNull();
    expect(target("#main")).toBeNull();
  });
});

describe("UnsavedLeaveGuard — the browser's Back button", () => {
  it("is held and kept from the router, press after press; leaving goes back past both entries", () => {
    const routerSaw = vi.fn();
    window.addEventListener("popstate", routerSaw);
    const pushState = vi.spyOn(window.history, "pushState");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
    try {
      render(<Editor />);
      expect(pushState).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      expect(pushState).toHaveBeenCalledTimes(1);
      pressBack();
      expect(routerSaw).not.toHaveBeenCalled();
      expect(pushState).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByRole("button", { name: "Keep Editing" }));
      pressBack();
      fireEvent.click(screen.getByRole("button", { name: "Leave Without Saving" }));
      expect(go).toHaveBeenCalledWith(-2);
      expect(saved).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("popstate", routerSaw);
    }
  });

  it("once saved, or once the edit is undone by hand, the extra entry is taken away and Back is the router's again", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const routerSaw = vi.fn();
    window.addEventListener("popstate", routerSaw);
    try {
      render(<Editor />);
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(back).toHaveBeenCalledTimes(1);
      // The browser reports that step: the guard's own, not the router's.
      pressBack();
      expect(routerSaw).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save" })));
      expect(back).toHaveBeenCalledTimes(2);
      pressBack();
      expect(routerSaw).not.toHaveBeenCalled();
      // The history is as it was: the next press is the router's, with no question.
      pressBack();
      expect(routerSaw).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      window.removeEventListener("popstate", routerSaw);
    }
  });

  it("a step back the browser reports late is still the guard's own, and one that lands on another page is the router's", async () => {
    vi.useFakeTimers();
    vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const routerSaw = vi.fn();
    window.addEventListener("popstate", routerSaw);
    try {
      render(<Editor />);
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      await act(async () => void (await vi.advanceTimersByTimeAsync(1500)));
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
      pressBack();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(routerSaw).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      await act(async () => void (await vi.advanceTimersByTimeAsync(1500)));
      window.history.replaceState(null, "", "/somewhere-else");
      pressBack();
      expect(routerSaw).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("popstate", routerSaw);
      vi.useRealTimers();
    }
  });

  it("the skip link is followed with no question and no new history entry, and Back is still held", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const entries = window.history.length;
    click("Skip to main content");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.hash).toBe("#main");
    expect(window.history.length).toBe(entries);
    // Pressed again at the place the page is already at: nothing moves, focus goes there.
    click("Skip to main content");
    expect(document.activeElement).toBe(document.getElementById("main"));
    // The browser reports the first move like a history step; it asks nothing. A press of Back does.
    pressBack();
    expect(screen.queryByRole("dialog")).toBeNull();
    pressBack();
    expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeTruthy();
  });

  it("leaving by Back keeps going past an older entry for the same page, then hands over to the router", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    vi.spyOn(window.history, "go").mockImplementation(() => undefined);
    const routerSaw = vi.fn();
    window.addEventListener("popstate", routerSaw);
    try {
      render(<Editor />);
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      pressBack();
      fireEvent.click(screen.getByRole("button", { name: "Leave Without Saving" }));
      pressBack();
      expect(routerSaw).not.toHaveBeenCalled();
      expect(back).toHaveBeenCalledTimes(1);
      window.history.replaceState(null, "", "/somewhere-else");
      pressBack();
      expect(routerSaw).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("popstate", routerSaw);
    }
  });
});
