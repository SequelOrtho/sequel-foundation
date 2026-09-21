"use client";

import { useSyncExternalStore } from "react";

// Module-level toast store. Save paths call pushToast/toastSaved/toastError
// imperatively — they are plain functions, not hooks, so any code can fire a
// toast without threading a context through every editor. The single
// <ToastViewport> subscribes via useToasts() (useSyncExternalStore, per the
// repo convention over set-state-in-effect).

export type ToastTone = "success" | "info" | "danger";
/** A next-step link — the common case ("View project →"). */
export type ToastLinkAction = { label: string; href: string; onClick?: undefined };
/** An in-place action — Undo. Runs the callback, then the toast dismisses. */
export type ToastCallbackAction = { label: string; onClick: () => void | Promise<void>; href?: undefined };
export type ToastAction = ToastLinkAction | ToastCallbackAction;
export type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
  ttl: number;
  action?: ToastAction;
};

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function pushToast(
  message: string,
  opts: { tone?: ToastTone; ttl?: number; action?: ToastAction } = {},
): number {
  const id = nextId++;
  // Toasts carrying a next-step link get longer to be read and clicked.
  const ttl = opts.ttl ?? (opts.action ? 6000 : 3500);
  items = [
    ...items,
    { id, tone: opts.tone ?? "success", message, ttl, action: opts.action },
  ];
  emit();
  return id;
}

export function dismissToast(id: number) {
  const next = items.filter((t) => t.id !== id);
  if (next.length !== items.length) {
    items = next;
    emit();
  }
}

// Two named cases the save paths fire. Errors linger longer than confirmations.
export function toastSaved(message = "Saved", opts: { action?: ToastAction } = {}) {
  return pushToast(message, { tone: "success", action: opts.action });
}
export function toastError(message: string) {
  return pushToast(message, { tone: "danger", ttl: 6000 });
}

/** How long an Undo toast stays: long enough to notice the mistake and reach
 *  the button, short enough that the undone state is never a surprise. */
export const UNDO_TOAST_TTL = 10_000;

/**
 * Confirm a reversible action with an Undo button (DESIGN-CONVENTIONS §3):
 * "3 alerts removed from your list · Undo". The callback restores the
 * previous state; the toast dismisses once it runs. Pair it with a persistent
 * in-place affordance when the window to change one's mind is longer than
 * a toast (an inline strip, an "Entered" tab with its own Undo).
 */
export function toastUndo(
  message: string,
  onUndo: () => void | Promise<void>,
  opts: { label?: string; tone?: ToastTone; ttl?: number } = {},
) {
  return pushToast(message, {
    tone: opts.tone ?? "success",
    ttl: opts.ttl ?? UNDO_TOAST_TTL,
    action: { label: opts.label ?? "Undo", onClick: onUndo },
  });
}

// Test-only: reset between cases so the global counter/list don't leak.
export function clearAllToasts() {
  if (items.length > 0) {
    items = [];
    emit();
  }
}

// Read-only snapshot of the current stack (tests, debugging). UI code should
// subscribe via useToasts instead.
export function getToasts(): readonly ToastItem[] {
  return items;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return items;
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
