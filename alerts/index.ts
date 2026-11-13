// In-app alerts, the pure half (DESIGN-CONVENTIONS §3 "In-app alerts are a
// per-person inbox over a shared record", v0.39.0). Established in the Missed
// Punch Hub, carried to the Market Expansion Hub's task alerts, and lifted
// from there: one shared alert per event addressed to its recipients; read /
// removed are per-person receipts on it, so clearing an alert never deletes
// it or changes anyone else's list.
//
// Pure and client-safe. A hub keeps its own alert shape (what the alert is
// about), which extends `HubAlertBase`, and its own store, which the receipt
// write reaches through the two-method `AlertStore` seam.

/** The fields every alert carries. A hub's alert type extends this with what
 *  the alert is about (a request id, an assignment id, a kind). */
export type HubAlertBase = {
  id: string;
  /** ISO timestamp; the list is newest first. */
  createdAt: string;
  message: string;
  /** Where the alert leads (a hub path). */
  href: string;
  /** Identity keys (sign-in emails), lower-cased. */
  recipients: string[];
  readBy: string[];
  dismissedBy: string[];
};

/** The receipt write's view of a hub's store. `putAlert` with
 *  `ifUnchangedFrom` is a conditional write: it resolves false and writes
 *  nothing when the stored alert no longer equals that copy. */
export type AlertStore<A extends HubAlertBase> = {
  getAlert(id: string): Promise<A | null>;
  putAlert(alert: A, ifUnchangedFrom?: A): Promise<boolean>;
};

/** How many alerts a feed carries at most — the bell shows the top of it,
 *  the alerts page the whole thing. */
export const ALERT_LIST_LIMIT = 200;

/** One viewer: the identity key, or every key they answer to (a person is
 *  every address their sign-in answers to — the identity first). */
export type Viewer = string | readonly string[];

export function viewerKeys(viewer: Viewer): readonly string[] {
  return typeof viewer === "string" ? [viewer] : viewer;
}

function anyOf(list: readonly string[], viewer: Viewer): boolean {
  return viewerKeys(viewer).some((e) => list.includes(e));
}

/** The viewer's own list: addressed to them, not removed by them, newest
 *  first, cut at `limit`. */
export function alertsFor<A extends HubAlertBase>(all: readonly A[], viewer: Viewer, limit = ALERT_LIST_LIMIT): A[] {
  return all
    .filter((a) => anyOf(a.recipients, viewer) && !anyOf(a.dismissedBy, viewer))
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
    .slice(0, limit);
}

export function unreadCount<A extends HubAlertBase>(visible: readonly A[], viewer: Viewer): number {
  return visible.filter((a) => !anyOf(a.readBy, viewer)).length;
}

export type Receipt = "read" | "dismissed";

/** How many conditional writes a receipt gets before it is logged as not
 *  written. */
export const RECEIPT_TRIES = 3;

/** Stamp or clear the viewer's receipt on each named alert they are a
 *  recipient of; an id that isn't theirs is skipped, never an error (so the
 *  list and a stale screen can't disagree loudly). Returns the ids changed.
 *
 *  The receipt is written onto the alert as it was read; when another write
 *  landed in between (the same person's other tab, or a receipt of another
 *  recipient) the conditional write is refused and the alert re-read, so no
 *  receipt is lost under a stale copy. A receipt still refused after
 *  RECEIPT_TRIES is logged, never dropped in silence (Sequel_Ortho #235,
 *  F5 / F14). The stamp is always the viewer's FIRST key (the identity),
 *  whichever of their addresses the alert is addressed to, because a feed
 *  client tests a receipt against the identity alone (#235, F16); clearing
 *  removes every one of their keys. Removing also counts as having read. */
export async function markAlerts<A extends HubAlertBase>(
  store: AlertStore<A>,
  viewer: Viewer,
  ids: readonly string[],
  receipt: Receipt,
  on: boolean,
  log: (line: string) => void = (line) => console.warn(line),
): Promise<string[]> {
  const changed: string[] = [];
  const mine = viewerKeys(viewer);
  const stampAs = mine[0];
  for (const id of ids) {
    let settled = false;
    for (let attempt = 0; attempt < RECEIPT_TRIES; attempt++) {
      const alert = await store.getAlert(id);
      if (!alert || !anyOf(alert.recipients, viewer)) {
        settled = true;
        break;
      }
      const key = receipt === "read" ? "readBy" : "dismissedBy";
      if (anyOf(alert[key], viewer) === on) {
        settled = true;
        break;
      }
      const next: A = { ...alert, [key]: on ? [...alert[key], stampAs] : alert[key].filter((e) => !mine.includes(e)) };
      if (receipt === "dismissed" && on && !anyOf(next.readBy, viewer)) next.readBy = [...next.readBy, stampAs];
      if (await store.putAlert(next, alert)) {
        changed.push(id);
        settled = true;
        break;
      }
    }
    if (!settled) log(`[alerts] receipt "${receipt}" not written on alert ${id} after ${RECEIPT_TRIES} tries`);
  }
  return changed;
}

/** The receipt routes' body: `{ ids, <flag>? }`, the flag defaulting to
 *  true. Non-string ids are dropped; anything that isn't an object, or has no
 *  id left, is null so the route answers 400. Pass the parsed JSON (a body
 *  that isn't JSON is the route's own 400). */
export function readReceiptBody(body: unknown, flag: "read" | "dismissed"): { ids: string[]; on: boolean } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const rec = body as Record<string, unknown>;
  const ids = Array.isArray(rec.ids) ? rec.ids.filter((v): v is string => typeof v === "string") : [];
  if (ids.length === 0) return null;
  const raw = rec[flag];
  return { ids, on: typeof raw === "boolean" ? raw : true };
}

/** How long an alert is kept once every recipient has removed it, or once
 *  it is old enough that nobody will come back for it. */
export const ALERT_RETENTION_DAYS = 90;

/** The alerts a purge may erase: older than `retentionDays`, or removed by
 *  every recipient. Everything else stays — an alert one recipient still has
 *  on their list is never erased for another's tidying (Sequel_Ortho #235,
 *  F8: a feed that lists every alert on every poll and never purges). */
export function expiredAlerts<A extends HubAlertBase>(all: readonly A[], now: Date, retentionDays = ALERT_RETENTION_DAYS): A[] {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  return all.filter((a) => {
    const at = Date.parse(a.createdAt);
    if (Number.isFinite(at) && at < cutoff) return true;
    return a.recipients.length > 0 && a.recipients.every((r) => a.dismissedBy.includes(r));
  });
}
