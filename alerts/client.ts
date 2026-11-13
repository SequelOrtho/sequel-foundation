"use client";

import { useSyncExternalStore } from "react";
import type { HubAlertBase } from "./index";

// The in-app alerts feed for the signed-in person, the client half
// (DESIGN-CONVENTIONS §3 "In-app alerts"; the Missed Punch Hub's
// lib/alerts-store.ts was the family reference, the Market Expansion Hub's
// the copy this is lifted from, v0.39.0). One shared alert per event, with
// per-person receipts: read / unread / removed change only the reader's own
// list, never the alert for anyone else or the record it points at. The bell
// and the alerts page share one feed, so the count never disagrees with the
// list. It polls every minute while someone has clicked or typed in this tab
// in the last ten minutes, visible or not (owner ruling 2026-10-22, "4-agree
// with your recommendation"), so a forgotten tab still reaches the idle
// sign-out, and it fails soft: a failed read keeps the last snapshot.
//
// A hub makes ONE feed per app (`createAlertsFeed`) in a module of its own
// and imports it everywhere; the feed holds module state, so two feeds for
// the same endpoint would poll twice and disagree.

export type AlertRow = {
  id: string;
  createdAt: string;
  message: string;
  href: string;
  read: boolean;
};

export type AlertsSnapshot = { alerts: AlertRow[]; unread: number; loaded: boolean };

export const POLL_MS = 60_000;
export const POLL_IDLE_MS = 10 * 60_000;

/** True while someone has clicked or typed in this tab recently, visible or not. */
export function pollAllowed(now: number, input: number): boolean {
  return now - input < POLL_IDLE_MS;
}

/** The feed's rows for one viewer: a receipt list becomes a flag. The viewer
 *  is the identity key the server stamps receipts under. */
export function rowsFor<A extends HubAlertBase>(alerts: readonly A[], viewer: string): AlertRow[] {
  return alerts.map((a) => ({
    id: a.id,
    createdAt: a.createdAt,
    message: a.message,
    href: a.href,
    read: a.readBy.includes(viewer),
  }));
}

export type AlertsFeedOptions = {
  /** GET: `{ alerts, viewer }` — the viewer's alerts and the identity key
   *  their receipts are stamped under. Default "/api/alerts". */
  feedPath?: string;
  /** POST `{ ids, read }`. Default "/api/alerts/read". */
  readPath?: string;
  /** POST `{ ids, dismissed }`. Default "/api/alerts/dismiss". */
  dismissPath?: string;
};

export type AlertsFeed = {
  /** Subscribe a component to the feed (polling starts with the first
   *  subscriber and stops with the last). */
  useHubAlerts(): AlertsSnapshot;
  /** Re-read the feed now. Never throws; a failed read keeps what is shown. */
  refreshAlerts(): Promise<void>;
  /** Mark alerts read or unread for the signed-in person (optimistic;
   *  rolled back when the server refuses). */
  setAlertsRead(ids: readonly string[], read: boolean): Promise<boolean>;
  markAllAlertsRead(): Promise<boolean>;
  /** Take alerts off the signed-in person's own list. Returns the rows taken
   *  out so the caller can offer Undo (`restoreAlerts`). */
  removeAlerts(ids: readonly string[]): Promise<{ ok: boolean; removed: AlertRow[] }>;
  /** Put removed alerts back (the Undo). */
  restoreAlerts(rows: readonly AlertRow[]): Promise<boolean>;
  /** Test-only: forget the snapshot. */
  resetForTests(): void;
};

const EMPTY: AlertsSnapshot = { alerts: [], unread: 0, loaded: false };
const INPUT_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function createAlertsFeed(options: AlertsFeedOptions = {}): AlertsFeed {
  const feedPath = options.feedPath ?? "/api/alerts";
  const readPath = options.readPath ?? "/api/alerts/read";
  const dismissPath = options.dismissPath ?? "/api/alerts/dismiss";

  let snapshot: AlertsSnapshot = EMPTY;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastInput = 0;
  let paused = false;

  function commit(alerts: AlertRow[]) {
    snapshot = { alerts, unread: alerts.filter((a) => !a.read).length, loaded: true };
    for (const l of listeners) l();
  }

  async function refreshAlerts(): Promise<void> {
    try {
      const res = await fetch(feedPath, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { alerts?: HubAlertBase[]; viewer?: string };
      if (!Array.isArray(body.alerts) || typeof body.viewer !== "string") return;
      commit(rowsFor(body.alerts, body.viewer));
    } catch {
      // keep the last snapshot
    }
  }

  async function post(path: string, body: unknown): Promise<boolean> {
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function setAlertsRead(ids: readonly string[], read: boolean): Promise<boolean> {
    const wanted = new Set(ids);
    const before = snapshot.alerts;
    const touched = before.filter((a) => wanted.has(a.id) && a.read !== read).map((a) => a.id);
    if (touched.length === 0) return true;
    commit(before.map((a) => (wanted.has(a.id) ? { ...a, read } : a)));
    const ok = await post(readPath, { ids: touched, read });
    if (!ok) commit(before);
    return ok;
  }

  function markAllAlertsRead(): Promise<boolean> {
    return setAlertsRead(
      snapshot.alerts.filter((a) => !a.read).map((a) => a.id),
      true,
    );
  }

  async function removeAlerts(ids: readonly string[]): Promise<{ ok: boolean; removed: AlertRow[] }> {
    const wanted = new Set(ids);
    const before = snapshot.alerts;
    const removed = before.filter((a) => wanted.has(a.id));
    if (removed.length === 0) return { ok: true, removed };
    commit(before.filter((a) => !wanted.has(a.id)));
    const ok = await post(dismissPath, { ids: removed.map((a) => a.id), dismissed: true });
    if (!ok) commit(before);
    return { ok, removed: ok ? removed : [] };
  }

  async function restoreAlerts(rows: readonly AlertRow[]): Promise<boolean> {
    if (rows.length === 0) return true;
    const before = snapshot.alerts;
    const present = new Set(before.map((a) => a.id));
    const merged = [...before, ...rows.filter((r) => !present.has(r.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    commit(merged);
    const ok = await post(dismissPath, { ids: rows.map((a) => a.id), dismissed: false });
    if (!ok) commit(before);
    return ok;
  }

  function tick() {
    const ok = pollAllowed(Date.now(), lastInput);
    paused = !ok;
    if (ok) void refreshAlerts();
  }

  function onInput() {
    lastInput = Date.now();
    if (paused) tick();
  }

  function onVisibility() {
    if (document.visibilityState === "visible") onInput();
  }

  function subscribe(cb: () => void) {
    listeners.add(cb);
    if (listeners.size === 1) {
      lastInput = Date.now();
      paused = false;
      void refreshAlerts();
      timer = setInterval(tick, POLL_MS);
      for (const e of INPUT_EVENTS) document.addEventListener(e, onInput, { passive: true, capture: true });
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      listeners.delete(cb);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
        for (const e of INPUT_EVENTS) document.removeEventListener(e, onInput, { capture: true });
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }

  const getSnapshot = () => snapshot;
  const getServerSnapshot = () => EMPTY;

  return {
    useHubAlerts: () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
    refreshAlerts,
    setAlertsRead,
    markAllAlertsRead,
    removeAlerts,
    restoreAlerts,
    resetForTests: () => {
      snapshot = EMPTY;
    },
  };
}

const STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** An alert's time, Central, short ("Nov 13, 9:05 AM"); "" for a bad date. */
export function alertStamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : STAMP.format(d);
}
