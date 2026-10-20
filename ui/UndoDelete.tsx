"use client";

import { useSyncExternalStore } from "react";
import { Button } from "./Button";
import { dismissToast, toastError, toastSaved, toastUndo, useToasts } from "./toast/store";
import { undoTicketExpired, UNDO_WINDOW_MINUTES, type UndoTicket } from "../undo/window";

// Undo for deletes (DESIGN-CONVENTIONS §3 "Deletes can be undone for 30
// minutes"). A delete route answers `{ undo: UndoTicket }`; the surface calls
// `offerUndo(ticket)`, which fires the Undo toast (10 s) and keeps the same
// Undo on screen in the toast stack (`UndoStrip`, rendered by the
// ToastViewport every hub already mounts) until the 30-minute window closes.
// The offer lives in a module-level store like the toasts, so it survives the
// client navigation most deletes end with ("back to the list"). The server is
// the authority on the window — the strip only hides itself when it ends.

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

export type UndoOfferOptions = {
  /** Toast wording; defaults to "<label> deleted". */
  message?: string;
  /** Defaults to POST /api/undo. */
  restore?: (ticket: UndoTicket) => Promise<void>;
  /** Re-fetch or router.refresh() so the restored record reappears. */
  onRestored?: (ticket: UndoTicket) => void;
};

export type UndoOffer = { ticket: UndoTicket; busy: boolean; toastId: number };

type Entry = UndoOffer & { opts: UndoOfferOptions; timer: ReturnType<typeof setTimeout> | null };

let entry: Entry | null = null;
let snapshot: UndoOffer | null = null;
const inflight = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  snapshot = entry && { ticket: entry.ticket, busy: entry.busy, toastId: entry.toastId };
  for (const l of listeners) l();
}

function clear(id?: string) {
  if (!entry || (id && entry.ticket.id !== id)) return;
  if (entry.timer) clearTimeout(entry.timer);
  dismissToast(entry.toastId);
  entry = null;
  emit();
}

/** Offer Undo for a delete that just succeeded. Replaces any earlier offer
 *  (the strip holds the latest delete; an earlier one stays undoable on the
 *  server until its own window ends). */
export function offerUndo(ticket: UndoTicket, opts: UndoOfferOptions = {}) {
  clear();
  const toastId = toastUndo(opts.message ?? `${ticket.label} deleted`, () => undoDelete(ticket));
  const ms = new Date(ticket.expiresAt).getTime() - Date.now();
  const timer = setTimeout(() => clear(ticket.id), Math.max(0, ms));
  entry = { ticket, busy: false, toastId, opts, timer };
  emit();
}

/** Run the restore for the current offer (or the given ticket). Runs once per
 *  ticket at a time, however many buttons are clicked. */
export async function undoDelete(ticket: UndoTicket | undefined = entry?.ticket): Promise<void> {
  if (!ticket || inflight.has(ticket.id)) return;
  inflight.add(ticket.id);
  const opts = entry?.ticket.id === ticket.id ? entry.opts : {};
  if (entry?.ticket.id === ticket.id) {
    dismissToast(entry.toastId);
    entry = { ...entry, busy: true };
    emit();
  }
  try {
    await (opts.restore ?? postUndo)(ticket);
  } catch (err) {
    toastError(err instanceof Error ? err.message : "Undo failed — please try again.");
    if (undoTicketExpired(ticket)) clear(ticket.id);
    else if (entry?.ticket.id === ticket.id) {
      entry = { ...entry, busy: false };
      emit();
    }
    return;
  } finally {
    inflight.delete(ticket.id);
  }
  clear(ticket.id);
  toastSaved(`${ticket.label} restored`);
  // The record is back; a failing refresh must not read as a failed undo.
  try {
    opts.onRestored?.(ticket);
  } catch (err) {
    console.error("undo: onRestored failed", err);
  }
}

/** Hide the strip. The delete stays undoable on the server until its window ends. */
export function dismissUndo() {
  clear();
}

/** Test-only: reset between cases. */
export function clearUndoOffer() {
  inflight.clear();
  clear();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
const getSnapshot = () => snapshot;

export function useUndoOffer(): UndoOffer | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Keeps Undo on screen past the toast. The ToastViewport renders it once the
 * Undo toast has gone, so no hub mounts it by hand; it renders nothing
 * without an offer.
 */
export function UndoStrip({ hideWhileToastShows = false }: { hideWhileToastShows?: boolean }) {
  const offer = useUndoOffer();
  const toasts = useToasts();
  if (!offer) return null;
  if (hideWhileToastShows && toasts.some((t) => t.id === offer.toastId)) return null;
  const { ticket, busy } = offer;
  return (
    <div
      role="region"
      aria-label="Undo delete"
      className="flex max-w-md flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-white px-4 py-2 text-sm text-zinc-900 shadow-lg dark:bg-zinc-900 dark:text-zinc-100"
    >
      <span>
        {ticket.label} deleted. You can undo this until {timeOf(ticket.expiresAt)} ({UNDO_WINDOW_MINUTES} minutes
        from the delete).
      </span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void undoDelete(ticket)}>
        Undo Delete
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={dismissUndo}>
        Dismiss
      </Button>
    </div>
  );
}
