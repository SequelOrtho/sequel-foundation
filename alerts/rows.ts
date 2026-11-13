// In-app alerts: the pure helpers the feed, the bell and the list share,
// with no module directive, so a server component (a hub's /alerts page
// reading `?tab=`) and the feed route can import them without pulling in a
// client reference (DESIGN-CONVENTIONS §3 "In-app alerts", v0.39.0).
// Re-exported from "@sequel/foundation/alerts" (server and client) and from
// "…/alerts/ui" (client).

import type { HubAlertBase, Viewer } from "./index";

/** What the feed carries to the browser: one row per alert on the viewer's
 *  list with THEIR read flag. Never the other recipients, their receipts or
 *  any address — the feed route turns the stored alerts into rows with
 *  `rowsFor` before answering. */
export type AlertRow = {
  id: string;
  createdAt: string;
  message: string;
  href: string;
  read: boolean;
};

export const POLL_MS = 60_000;
export const POLL_IDLE_MS = 10 * 60_000;

/** True while someone has clicked or typed in this tab recently, visible or not. */
export function pollAllowed(now: number, input: number): boolean {
  return now - input < POLL_IDLE_MS;
}

/** The feed's rows for one viewer, on the server: a receipt list becomes a
 *  flag and the recipients and receipts are left behind. `viewer` is the
 *  identity key (or every key the person answers to, as `alertsFor` takes). */
export function rowsFor<A extends HubAlertBase>(alerts: readonly A[], viewer: Viewer): AlertRow[] {
  const keys = typeof viewer === "string" ? [viewer] : viewer;
  return alerts.map((a) => ({
    id: a.id,
    createdAt: a.createdAt,
    message: a.message,
    href: a.href,
    read: keys.some((k) => a.readBy.includes(k)),
  }));
}

/** True for a row the feed may show: the fields the bell and the list
 *  render, each of the type they expect. */
export function isAlertRow(v: unknown): v is AlertRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.createdAt === "string" && typeof r.message === "string" && typeof r.href === "string" && typeof r.read === "boolean";
}

export type AlertTab = "unread" | "all";

export const ALERT_TABS: readonly AlertTab[] = ["unread", "all"];

/** The `?tab=` word, held to the allow-list; anything else is "unread". */
export function pickAlertTab(raw: string | string[] | null | undefined): AlertTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "all" ? "all" : "unread";
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
