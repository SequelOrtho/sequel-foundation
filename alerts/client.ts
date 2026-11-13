"use client";

import { useSyncExternalStore } from "react";
import { isAlertRow, type AlertRow } from "./index";
import { pollAllowed, POLL_MS } from "./rows";

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

export type { AlertRow } from "./index";
export { rowsFor } from "./index";
export { POLL_MS, POLL_IDLE_MS, pollAllowed, alertStamp } from "./rows";

export type AlertsSnapshot = { alerts: AlertRow[]; unread: number; loaded: boolean };

export type AlertsFeedOptions = {
  /** GET: `{ alerts: AlertRow[] }` — the viewer's own rows, each with
   *  their read flag, made on the server with `rowsFor` (the feed never
   *  carries the other recipients or their receipts). Default "/api/alerts". */
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
  // Counts the receipt writes begun, and how many are still on their way.
  // A poll that began or ended while a write was pending, or after one
  // began, is dropped: it may have been served before that receipt landed
  // and would put back the row the viewer just removed or marked, until the
  // next poll; the next tick (a minute at most) reads the feed again.
  let writes = 0;
  let pending = 0;

  function commit(alerts: AlertRow[]) {
    snapshot = { alerts, unread: alerts.filter((a) => !a.read).length, loaded: true };
    for (const l of listeners) l();
  }

  async function refreshAlerts(): Promise<void> {
    const begunAfter = writes;
    if (pending > 0) return;
    try {
      const res = await fetch(feedPath, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { alerts?: unknown };
      if (!Array.isArray(body.alerts) || !body.alerts.every(isAlertRow)) return;
      if (writes !== begunAfter || pending > 0) return;
      commit(body.alerts);
    } catch {
      // keep the last snapshot
    }
  }

  const byNewest = (a: AlertRow, b: AlertRow) => b.createdAt.localeCompare(a.createdAt);

  async function post(path: string, body: unknown): Promise<boolean> {
    writes++;
    pending++;
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return res.ok;
    } catch {
      return false;
    } finally {
      pending--;
    }
  }

  async function setAlertsRead(ids: readonly string[], read: boolean): Promise<boolean> {
    const wanted = new Set(ids);
    const before = snapshot.alerts;
    const touched = new Set(before.filter((a) => wanted.has(a.id) && a.read !== read).map((a) => a.id));
    if (touched.size === 0) return true;
    commit(before.map((a) => (touched.has(a.id) ? { ...a, read } : a)));
    const ok = await post(readPath, { ids: [...touched], read });
    // A rollback undoes this write on the snapshot as it is NOW, never by
    // putting back `before`, which would drop another write made meanwhile.
    if (!ok) commit(snapshot.alerts.map((a) => (touched.has(a.id) ? { ...a, read: !read } : a)));
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
    if (!ok) {
      const now = new Set(snapshot.alerts.map((a) => a.id));
      commit([...snapshot.alerts, ...removed.filter((r) => !now.has(r.id))].sort(byNewest));
    }
    return { ok, removed: ok ? removed : [] };
  }

  async function restoreAlerts(rows: readonly AlertRow[]): Promise<boolean> {
    if (rows.length === 0) return true;
    const before = snapshot.alerts;
    const present = new Set(before.map((a) => a.id));
    // Removing also counted as having read (the receipt rule), so a row
    // comes back read, as the next poll would show it.
    const back = rows.filter((r) => !present.has(r.id)).map((r) => ({ ...r, read: true }));
    commit([...before, ...back].sort(byNewest));
    const ok = await post(dismissPath, { ids: rows.map((a) => a.id), dismissed: false });
    if (!ok) {
      const putBack = new Set(back.map((r) => r.id));
      commit(snapshot.alerts.filter((a) => !putBack.has(a.id)));
    }
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
