// In-app alerts: the small helpers the bell and the list share, with no
// module directive, so a server component (a hub's /alerts page reading
// `?tab=`) can import them without pulling in a client reference
// (DESIGN-CONVENTIONS §3 "In-app alerts", v0.39.0). The feed's row shape and
// `rowsFor` are in ./index with the other rules. Re-exported from
// "@sequel/foundation/alerts" (server and client) and "…/alerts/ui" (client).


export type { AlertRow } from "./index";

export const POLL_MS = 60_000;
export const POLL_IDLE_MS = 10 * 60_000;

/** True while someone has clicked or typed in this tab recently, visible or not. */
export function pollAllowed(now: number, input: number): boolean {
  return now - input < POLL_IDLE_MS;
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
