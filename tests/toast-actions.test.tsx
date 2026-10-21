// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toast } from "../ui/Toast";
import { ToastViewport } from "../ui/toast/ToastViewport";
import { clearAllToasts, getToasts, pushToast, toastError, toastSaved, toastUndo } from "../ui/toast/store";

afterEach(() => {
  cleanup();
  clearAllToasts();
});

describe("Toast actions", () => {
  it("renders a link action as a link and a callback action as a button", () => {
    render(<Toast message="Saved" action={{ label: "View project →", href: "/projects/9" }} />);
    expect(screen.getByRole("link", { name: "View project →" }).getAttribute("href")).toBe("/projects/9");
    cleanup();
    const onClick = vi.fn();
    render(<Toast message="Removed" action={{ label: "Undo", onClick }} />);
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("an Undo toast in the viewport runs the callback and dismisses itself", () => {
    const onUndo = vi.fn();
    render(<ToastViewport />);
    act(() => {
      toastUndo("2 alerts removed from your list", onUndo);
      toastSaved("Something else", { action: { label: "Open", href: "/x" } });
    });
    expect(getToasts()).toHaveLength(2);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(getToasts().map((t) => t.message)).toEqual(["Something else"]);
    expect(screen.getByRole("link", { name: "Open" })).toBeTruthy();
  });

});

// UX audit 2026-10-21, FND-6 / FND-7.
describe("ToastViewport announcements and timing", () => {
  it("keeps both live regions in the page before any toast, errors in the assertive one", () => {
    render(<ToastViewport />);
    const status = screen.getByRole("status");
    const alert = screen.getByRole("alert");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(status.textContent).toBe("");
    act(() => {
      toastSaved("Saved");
      toastError("Save failed");
    });
    expect(screen.getByRole("status").textContent).toContain("Saved");
    expect(screen.getByRole("status").textContent).not.toContain("Save failed");
    expect(screen.getByRole("alert").textContent).toContain("Save failed");
  });

  it("stops the clock while hovered or focused and resumes with the time left", () => {
    vi.useFakeTimers();
    try {
      render(<ToastViewport />);
      act(() => {
        pushToast("Next one", { ttl: 3000, action: { label: "Next Pending Request →", href: "/next" } });
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      const link = screen.getByRole("link", { name: "Next Pending Request →" });
      act(() => {
        link.focus();
      });
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(getToasts()).toHaveLength(1); // focus inside: never dismissed
      act(() => {
        link.blur();
      });
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(getToasts()).toHaveLength(1); // ~1000 ms were left
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(getToasts()).toHaveLength(0);

      act(() => {
        pushToast("Hover me", { ttl: 1000 });
      });
      const chip = screen.getByText("Hover me").closest("[data-tone]")!.parentElement!;
      act(() => {
        fireEvent.mouseEnter(chip);
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(getToasts()).toHaveLength(1);
      act(() => {
        fireEvent.mouseLeave(chip);
      });
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      expect(getToasts()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives Dismiss a 24 px target", () => {
    render(<Toast message="Saved" onDismiss={() => {}} />);
    expect(screen.getByRole("button", { name: "Dismiss" }).className).toMatch(/h-6 w-6/);
  });
});
