"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Tabs } from "../ui/Tabs";
import { toastError, toastUndo } from "../ui/toast/store";
import type { AlertsFeed } from "./client";
import type { AlertRow } from "./index";
import { alertStamp, type AlertTab } from "./rows";

// The full alerts list (DESIGN-CONVENTIONS §3 "In-app alerts", v0.39.0):
// Unread / All tabs in the URL, checkbox selection with Select all shown,
// bulk Mark Read / Mark Unread / Remove plus Mark All Read, and the same
// three per row; Remove is undoable — the toast carries Undo, and an inline
// strip keeps the same Undo on screen past the toast's lifetime — and
// changes only the reader's own list. `AlertTab`, `ALERT_TABS` and
// `pickAlertTab` live in ./rows (no "use client"), so a server page can
// read `?tab=` with them.

export { ALERT_TABS, pickAlertTab } from "./rows";
export type { AlertTab } from "./rows";

const TAB_DEFS = [
  { key: "unread", label: "Unread" },
  { key: "all", label: "All" },
] as const;

export type AlertsManagerProps = {
  feed: AlertsFeed;
  tab: AlertTab;
  /** The page's path, for the tab links; default "/alerts". */
  basePath?: string;
  /** Follows "Nothing unread." / "No alerts yet." in the empty state (a
   *  sentence pointing at the list the alerts are about). */
  emptyHint?: ReactNode;
  /** Formats an alert's time; default `alertStamp` (Central). */
  stamp?: (iso: string) => string;
  /** The Undo strip's sentence after a removal; default says only the
   *  reader's own list changed. A hub may name what else is untouched. */
  removedNote?: ReactNode;
};

const DEFAULT_REMOVED_NOTE = "Only your list changed — nobody else's alerts and nothing the alert is about were touched.";

export function AlertsManager({ feed, tab, basePath = "/alerts", emptyHint, stamp = alertStamp, removedNote = DEFAULT_REMOVED_NOTE }: AlertsManagerProps) {
  const { alerts, unread, loaded } = feed.useHubAlerts();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"read" | "unread" | "remove" | "all-read" | "undo" | null>(null);
  const [undo, setUndo] = useState<AlertRow[] | null>(null);
  const rows = tab === "unread" ? alerts.filter((a) => !a.read) : alerts;
  const picked = rows.filter((r) => selected.has(r.id));
  const allPicked = rows.length > 0 && picked.length === rows.length;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function mark(read: boolean, ids: string[]) {
    setBusy(read ? "read" : "unread");
    const ok = await feed.setAlertsRead(ids, read);
    setBusy(null);
    if (!ok) toastError("Couldn't update the alerts. Try again.");
    else setSelected(new Set());
  }

  async function markAllRead() {
    setBusy("all-read");
    const ok = await feed.markAllAlertsRead();
    setBusy(null);
    if (!ok) toastError("Couldn't update the alerts. Try again.");
    else setSelected(new Set());
  }

  // The toast carries Undo for its lifetime; the strip below keeps the same
  // Undo on screen for whoever misses it, until the next removal replaces it.
  async function restore(rows: AlertRow[]) {
    setUndo(null);
    setBusy("undo");
    const back = await feed.restoreAlerts(rows);
    setBusy(null);
    if (!back) toastError("Couldn't put the alerts back.");
  }

  async function remove(target: AlertRow[]) {
    setBusy("remove");
    const { ok, removed } = await feed.removeAlerts(target.map((r) => r.id));
    setBusy(null);
    if (!ok) {
      toastError("Couldn't remove the alerts. Try again.");
      return;
    }
    setSelected(new Set());
    setUndo(removed);
    toastUndo(removed.length === 1 ? "Alert removed from your list" : `${removed.length} alerts removed from your list`, () => void restore(removed));
  }

  return (
    <div className="mt-4">
      <Tabs basePath={basePath} tabs={[...TAB_DEFS]} active={tab} defaultTab="unread" label="Alert views" />
      {undo && undo.length > 0 && (
        <Callout tone="info" className="mt-3" title={undo.length === 1 ? "Alert removed from your list" : `${undo.length} alerts removed from your list`}>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{removedNote}</span>
            <Button type="button" size="sm" variant="outline" disabled={busy !== null && busy !== "undo"} busy={busy === "undo"} onClick={() => void restore(undo)}>
              Undo
            </Button>
          </span>
        </Callout>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allPicked}
            disabled={rows.length === 0}
            onChange={() => setSelected(allPicked ? new Set() : new Set(rows.map((r) => r.id)))}
          />
          Select all shown
        </label>
        <span className="text-xs text-brand-muted">{picked.length} selected</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={picked.length === 0 || (busy !== null && busy !== "read")}
            busy={busy === "read"}
            onClick={() => void mark(true, picked.map((r) => r.id))}
          >
            Mark Read
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={picked.length === 0 || (busy !== null && busy !== "unread")}
            busy={busy === "unread"}
            onClick={() => void mark(false, picked.map((r) => r.id))}
          >
            Mark Unread
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={picked.length === 0 || (busy !== null && busy !== "remove")}
            busy={busy === "remove"}
            onClick={() => void remove(picked)}
          >
            Remove
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unread === 0 || (busy !== null && busy !== "all-read")}
            busy={busy === "all-read"}
            onClick={() => void markAllRead()}
          >
            Mark All Read
          </Button>
        </span>
      </div>
      {!loaded ? (
        <p className="mt-4 text-sm text-brand-muted">Loading alerts…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-brand-muted">
          {tab === "unread" ? "Nothing unread." : "No alerts yet."}
          {emptyHint ? <> {emptyHint}</> : null}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-3 py-2">
              <input type="checkbox" aria-label={`Select: ${a.message}`} checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="mt-1" />
              <div className="min-w-0 flex-1">
                <Link
                  href={a.href}
                  onClick={() => {
                    if (!a.read) void feed.setAlertsRead([a.id], true);
                  }}
                  className={`text-sm hover:underline ${a.read ? "text-brand-muted" : "font-medium text-zinc-900 dark:text-zinc-100"}`}
                >
                  {!a.read && (
                    <>
                      <span aria-hidden className="mr-1 text-brand">
                        ●
                      </span>
                      <span className="sr-only">Unread: </span>
                    </>
                  )}
                  {a.message}
                </Link>
                <p className="text-xs text-brand-muted">{stamp(a.createdAt)}</p>
              </div>
              <span className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => void mark(!a.read, [a.id])}>
                  {a.read ? "Mark Unread" : "Mark Read"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void remove([a])}>
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
