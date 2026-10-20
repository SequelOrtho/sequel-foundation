// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoStrip, useUndoDelete } from "../ui/UndoDelete";
import { ToastViewport } from "../ui/toast/ToastViewport";
import { clearAllToasts, getToasts } from "../ui/toast/store";
import type { UndoTicket } from "../undo";

afterEach(() => {
  cleanup();
  clearAllToasts();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Harness({ ticket, restore, onRestored }: { ticket: UndoTicket; restore?: (t: UndoTicket) => Promise<void>; onRestored?: () => void }) {
  const u = useUndoDelete({ restore, onRestored });
  return (
    <>
      <button onClick={() => u.offer(ticket)}>delete</button>
      <UndoStrip state={u} />
      <ToastViewport />
    </>
  );
}

const ticketIn = (ms: number): UndoTicket => ({ id: "snap-1", label: "Routing rule “Falls”", expiresAt: new Date(Date.now() + ms).toISOString() });

describe("useUndoDelete + UndoStrip", () => {
  it("offers Undo in a toast and an inline strip; Undo restores once and clears both", async () => {
    const restore = vi.fn().mockResolvedValue(undefined);
    const onRestored = vi.fn();
    render(<Harness ticket={ticketIn(30 * 60_000)} restore={restore} onRestored={onRestored} />);
    fireEvent.click(screen.getByText("delete"));
    expect(getToasts().map((t) => t.message)).toEqual(["Routing rule “Falls” deleted"]);
    expect(screen.getByText(/You can undo this until .* \(30 minutes from the delete\)/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo Delete" }));
    });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Undo Delete" })).toBeNull();
    expect(getToasts().map((t) => t.message)).toEqual(["Routing rule “Falls” restored"]);
  });

  it("shows the route's refusal and keeps the strip while the window is open", async () => {
    const restore = vi.fn().mockRejectedValue(new Error("This delete can't be undone."));
    render(<Harness ticket={ticketIn(30 * 60_000)} restore={restore} />);
    fireEvent.click(screen.getByText("delete"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo Delete" }));
    });
    expect(getToasts().some((t) => t.tone === "danger" && t.message === "This delete can't be undone.")).toBe(true);
    expect(screen.getByRole("button", { name: "Undo Delete" })).toBeTruthy();
  });

  it("hides the strip when the window closes, and Dismiss hides it at once", () => {
    vi.useFakeTimers();
    render(<Harness ticket={ticketIn(5_000)} />);
    fireEvent.click(screen.getByText("delete"));
    expect(screen.getByRole("button", { name: "Undo Delete" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5_001);
    });
    expect(screen.queryByRole("button", { name: "Undo Delete" })).toBeNull();
    cleanup();
    render(<Harness ticket={ticketIn(60_000)} />);
    fireEvent.click(screen.getByText("delete"));
    const strip = screen.getByText(/You can undo this until/).closest("[role=status]") as HTMLElement;
    fireEvent.click(within(strip).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("button", { name: "Undo Delete" })).toBeNull();
  });

  it("posts the ticket id to /api/undo by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness ticket={ticketIn(30 * 60_000)} />);
    fireEvent.click(screen.getByText("delete"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo Delete" }));
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/undo", expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "snap-1" }) }));
  });
});
