// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toast } from "../ui/Toast";
import { ToastViewport } from "../ui/toast/ToastViewport";
import { clearAllToasts, getToasts, toastSaved, toastUndo } from "../ui/toast/store";

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
