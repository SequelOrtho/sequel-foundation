"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { dismissToast, toastError, toastSaved, toastUndo } from "./toast/store";
import { undoTicketExpired, UNDO_WINDOW_MINUTES, type UndoTicket } from "../undo/window";

// Undo for deletes (DESIGN-CONVENTIONS §3 "Deletes can be undone for 30
// minutes"). A delete route answers `{ undo: UndoTicket }`; the surface calls
// `offer(ticket)`, which fires the Undo toast (10 s) and opens an inline
// UndoStrip that keeps the same Undo on screen until the 30-minute window
// closes. The server is the authority on the window — the strip only hides
// itself when it ends.

/** The family restore route every hub mounts. */
export const UNDO_RESTORE_PATH = "/api/undo";

/** POST the ticket to the hub's restore route; throws the route's message on refusal. */
export async function postUndo(ticket: Pick<UndoTicket, "id">, path: string = UNDO_RESTORE_PATH): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: ticket.id }),
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  throw new Error(typeof body?.error === "string" ? body.error : "Undo failed — please try again.");
}

export type UndoDeleteState = {
  ticket: UndoTicket | null;
  busy: boolean;
  /** Offer Undo for a delete that just succeeded. Replaces any earlier strip. */
  offer: (ticket: UndoTicket, message?: string) => void;
  undo: (ticket?: UndoTicket) => Promise<void>;
  dismiss: () => void;
};

export function useUndoDelete(opts: {
  /** Defaults to POST /api/undo. */
  restore?: (ticket: UndoTicket) => Promise<void>;
  /** Re-fetch or router.refresh() so the restored record reappears. */
  onRestored?: (ticket: UndoTicket) => void;
} = {}): UndoDeleteState {
  const [ticket, setTicket] = useState<UndoTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const toastId = useRef<number | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    if (!ticket) return;
    const ms = new Date(ticket.expiresAt).getTime() - Date.now();
    const handle = setTimeout(() => setTicket((cur) => (cur?.id === ticket.id ? null : cur)), Math.max(0, ms));
    return () => clearTimeout(handle);
  }, [ticket]);

  const clearToast = () => {
    if (toastId.current != null) dismissToast(toastId.current);
    toastId.current = null;
  };

  const undo = useCallback(async (t?: UndoTicket) => {
    const target = t;
    if (!target) return;
    clearToast();
    setBusy(true);
    try {
      await (optsRef.current.restore ?? postUndo)(target);
      setTicket((cur) => (cur?.id === target.id ? null : cur));
      toastSaved(`${target.label} restored`);
      optsRef.current.onRestored?.(target);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Undo failed — please try again.");
      if (undoTicketExpired(target)) setTicket((cur) => (cur?.id === target.id ? null : cur));
    } finally {
      setBusy(false);
    }
  }, []);

  const offer = useCallback(
    (t: UndoTicket, message?: string) => {
      clearToast();
      setTicket(t);
      toastId.current = toastUndo(message ?? `${t.label} deleted`, () => undo(t));
    },
    [undo],
  );

  const dismiss = useCallback(() => setTicket(null), []);

  return { ticket, busy, offer, undo: (t?: UndoTicket) => undo(t ?? ticket ?? undefined), dismiss };
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** The inline strip that keeps Undo on screen past the toast. Renders nothing without a ticket. */
export function UndoStrip({
  state,
  undoLabel = "Undo Delete",
  className = "",
}: {
  state: Pick<UndoDeleteState, "ticket" | "busy" | "undo" | "dismiss">;
  undoLabel?: string;
  className?: string;
}) {
  const { ticket, busy } = state;
  if (!ticket) return null;
  return (
    <Callout tone="info" className={className}>
      <span className="flex flex-wrap items-center gap-2">
        <span>
          {ticket.label} deleted. You can undo this until {timeOf(ticket.expiresAt)} ({UNDO_WINDOW_MINUTES} minutes
          from the delete).
        </span>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void state.undo(ticket)}>
          {undoLabel}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={state.dismiss}>
          Dismiss
        </Button>
      </span>
    </Callout>
  );
}
