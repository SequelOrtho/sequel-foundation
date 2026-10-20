// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearUndoOffer, offerUndo, undoDelete, type UndoOfferOptions } from "../ui/UndoDelete";
import { ToastViewport } from "../ui/toast/ToastViewport";
import { clearAllToasts, getToasts, UNDO_TOAST_TTL } from "../ui/toast/store";
import type { UndoTicket } from "../undo";

afterEach(() => {
  cleanup();
  act(() => {
    clearUndoOffer();
    clearAllToasts();
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ticketIn = (ms: number, id = "snap-1"): UndoTicket => ({
  id,
  label: "Routing rule “Falls”",
  expiresAt: new Date(Date.now() + ms).toISOString(),
});

/** Offer Undo and let the 10-second toast run out, so the docked strip shows. */
function offerAndWaitOutToast(ticket: UndoTicket, opts?: UndoOfferOptions) {
  act(() => offerUndo(ticket, opts));
  act(() => {
    vi.advanceTimersByTime(UNDO_TOAST_TTL + 1);
  });
}

describe("offerUndo + the docked UndoStrip", () => {
  it("shows the Undo toast first, then keeps Undo on screen in the toast stack; Undo restores once and clears both", async () => {
    vi.useFakeTimers();
    const restore = vi.fn().mockResolvedValue(undefined);
    const onRestored = vi.fn();
    render(<ToastViewport />);
    act(() => offerUndo(ticketIn(30 * 60_000), { restore, onRestored }));
    expect(getToasts().map((t) => t.message)).toEqual(["Routing rule “Falls” deleted"]);
    expect(screen.queryByRole("region", { name: "Undo delete" })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(UNDO_TOAST_TTL + 1);
    });
    expect(screen.getByText(/You can undo this until .* \(30 minutes from the delete\)/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo Delete" }));
    });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Undo delete" })).toBeNull();
    expect(getToasts().map((t) => t.message)).toEqual(["Routing rule “Falls” restored"]);
  });

  it("keeps the offer after the page that deleted unmounts (a delete that goes back to the list)", () => {
    vi.useFakeTimers();
    function DetailPage() {
      return <button onClick={() => offerUndo(ticketIn(30 * 60_000))}>delete</button>;
    }
    const { rerender } = render(
      <>
        <DetailPage />
        <ToastViewport />
      </>,
    );
    fireEvent.click(screen.getByText("delete"));
    rerender(<ToastViewport />);
    act(() => {
      vi.advanceTimersByTime(UNDO_TOAST_TTL + 1);
    });
    expect(screen.getByRole("button", { name: "Undo Delete" })).toBeTruthy();
  });

  it("a refresh that fails after the restore still reads as restored", async () => {
    const restore = vi.fn().mockResolvedValue(undefined);
    const onRestored = vi.fn(() => {
      throw new Error("refresh failed");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ticket = ticketIn(30 * 60_000);
    act(() => offerUndo(ticket, { restore, onRestored }));
    await act(async () => {
      await undoDelete(ticket);
    });
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(getToasts().map((t) => [t.tone, t.message])).toEqual([["success", "Routing rule “Falls” restored"]]);
  });

  it("restores once however many Undo buttons are clicked", async () => {
    let finish: () => void = () => {};
    const restore = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const ticket = ticketIn(30 * 60_000);
    act(() => offerUndo(ticket, { restore }));
    await act(async () => {
      const a = undoDelete(ticket);
      const b = undoDelete(ticket);
      finish();
      await Promise.all([a, b]);
    });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(getToasts().filter((t) => t.tone === "danger")).toEqual([]);
  });

  it("shows the route's refusal and keeps the strip while the window is open", async () => {
    vi.useFakeTimers();
    const restore = vi.fn().mockRejectedValue(new Error("This delete can't be undone."));
    render(<ToastViewport />);
    offerAndWaitOutToast(ticketIn(30 * 60_000), { restore });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo Delete" }));
    });
    expect(getToasts().some((t) => t.tone === "danger" && t.message === "This delete can't be undone.")).toBe(true);
    expect(screen.getByRole("button", { name: "Undo Delete" })).toBeTruthy();
  });

  it("hides the strip when the window closes, and Dismiss hides it at once", () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    offerAndWaitOutToast(ticketIn(UNDO_TOAST_TTL + 5_000));
    expect(screen.getByRole("button", { name: "Undo Delete" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5_001);
    });
    expect(screen.queryByRole("button", { name: "Undo Delete" })).toBeNull();

    offerAndWaitOutToast(ticketIn(30 * 60_000, "snap-2"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("button", { name: "Undo Delete" })).toBeNull();
  });

  it("a newer delete replaces the earlier offer", () => {
    act(() => offerUndo(ticketIn(30 * 60_000, "first")));
    act(() => offerUndo({ ...ticketIn(30 * 60_000, "second"), label: "Task “Call vendor”" }));
    expect(getToasts().map((t) => t.message)).toEqual(["Task “Call vendor” deleted"]);
  });

  it("posts the ticket id to /api/undo by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ticket = ticketIn(30 * 60_000);
    act(() => offerUndo(ticket));
    await act(async () => {
      await undoDelete();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/undo", expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "snap-1" }) }));
  });
});
