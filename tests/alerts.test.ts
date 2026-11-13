import { describe, expect, it, vi } from "vitest";
import {
  ALERT_LIST_LIMIT,
  RECEIPT_TRIES,
  alertsFor,
  expiredAlerts,
  markAlerts,
  readReceiptBody,
  unreadCount,
  pickAlertTab,
  rowsFor,
  type AlertStore,
  type HubAlertBase,
} from "../alerts";

// In-app alerts, the pure half (DESIGN-CONVENTIONS §3): a shared alert per
// event with per-person receipts — one person's receipts never change
// another's list, removing never deletes the alert, and a receipt is written
// under the identity whichever address the alert is addressed to.

type A = HubAlertBase & { kind: string };

const mk = (id: string, recipients: string[], over: Partial<A> = {}): A => ({
  id,
  createdAt: `2026-11-13T1${id.slice(-1)}:00:00.000Z`,
  kind: "assigned",
  message: `Alert ${id}`,
  href: "/my-tasks",
  recipients,
  readBy: [],
  dismissedBy: [],
  ...over,
});

/** A store with a conditional write, and a way to make writes lose. */
function memoryStore(rows: A[], loseFirst = 0): AlertStore<A> & { rows: Map<string, A> } {
  const map = new Map(rows.map((r) => [r.id, r]));
  let losses = loseFirst;
  return {
    rows: map,
    getAlert: async (id) => map.get(id) ?? null,
    putAlert: async (alert, ifUnchangedFrom) => {
      if (losses > 0) {
        losses--;
        return false;
      }
      if (ifUnchangedFrom && map.get(alert.id) !== ifUnchangedFrom) return false;
      map.set(alert.id, alert);
      return true;
    },
  };
}

describe("alertsFor / unreadCount", () => {
  it("lists the viewer's alerts, newest first, removed ones left out, cut at the limit", () => {
    const all = [mk("a1", ["ana@x.co", "mike@x.co"]), mk("a2", ["ana@x.co"], { dismissedBy: ["ana@x.co"] }), mk("a3", ["pat@x.co"]), mk("a4", ["ana@x.co"], { readBy: ["ana@x.co"] })];
    const mine = alertsFor(all, "ana@x.co");
    expect(mine.map((a) => a.id)).toEqual(["a4", "a1"]);
    expect(unreadCount(mine, "ana@x.co")).toBe(1);
    expect(alertsFor(all, "ana@x.co", 1).map((a) => a.id)).toEqual(["a4"]);
    expect(ALERT_LIST_LIMIT).toBe(200);
  });
  it("a viewer is every address they answer to", () => {
    const all = [mk("a1", ["ana.alt@x.co"]), mk("a2", ["ana@x.co"], { readBy: ["ana@x.co"] })];
    const mine = alertsFor(all, ["ana@x.co", "ana.alt@x.co"]);
    expect(mine.map((a) => a.id)).toEqual(["a2", "a1"]);
    expect(unreadCount(mine, ["ana@x.co", "ana.alt@x.co"])).toBe(1);
  });
});

describe("rowsFor / pickAlertTab from the pure barrel", () => {
  it("are importable without a client directive and read the identity's receipts", () => {
    const rows = rowsFor([mk("a1", ["ana@x.co", "mike@x.co"], { readBy: ["ana@x.co"] })], "ana@x.co");
    expect(rows).toEqual([{ id: "a1", createdAt: "2026-11-13T11:00:00.000Z", message: "Alert a1", href: "/my-tasks", read: true }]);
    expect(pickAlertTab(["all"])).toBe("all");
    expect(pickAlertTab(undefined)).toBe("unread");
  });
});

describe("markAlerts", () => {
  it("stamps the identity, skips ids that aren't the viewer's, and removing also reads", async () => {
    const store = memoryStore([mk("a1", ["ana.alt@x.co", "mike@x.co"]), mk("a3", ["pat@x.co"])]);
    const changed = await markAlerts(store, ["ana@x.co", "ana.alt@x.co"], ["a1", "a3", "missing"], "dismissed", true);
    expect(changed).toEqual(["a1"]);
    expect(store.rows.get("a1")).toMatchObject({ readBy: ["ana@x.co"], dismissedBy: ["ana@x.co"], recipients: ["ana.alt@x.co", "mike@x.co"] });
    expect(store.rows.get("a3")!.dismissedBy).toEqual([]);
    // Already so: nothing changes. Clearing removes every one of the viewer's keys.
    expect(await markAlerts(store, ["ana@x.co", "ana.alt@x.co"], ["a1"], "dismissed", true)).toEqual([]);
    store.rows.set("a1", { ...store.rows.get("a1")!, readBy: ["ana@x.co", "ana.alt@x.co", "mike@x.co"] });
    await markAlerts(store, ["ana@x.co", "ana.alt@x.co"], ["a1"], "read", false);
    expect(store.rows.get("a1")!.readBy).toEqual(["mike@x.co"]);
  });
  it("a lost conditional write is re-read and retried; one still refused after the tries is logged, never dropped silently", async () => {
    const log = vi.fn();
    const twice = memoryStore([mk("a1", ["ana@x.co"])], 2);
    expect(await markAlerts(twice, "ana@x.co", ["a1"], "read", true, log)).toEqual(["a1"]);
    expect(log).not.toHaveBeenCalled();
    const always = memoryStore([mk("a1", ["ana@x.co"])], RECEIPT_TRIES);
    expect(await markAlerts(always, "ana@x.co", ["a1"], "read", true, log)).toEqual([]);
    expect(log).toHaveBeenCalledWith(`[alerts] receipt "read" not written on alert a1 after ${RECEIPT_TRIES} tries`);
  });
});

describe("readReceiptBody", () => {
  it("keeps string ids, defaults the flag to true, and refuses anything without an id", () => {
    expect(readReceiptBody({ ids: ["a", 1, "b"] }, "read")).toEqual({ ids: ["a", "b"], on: true });
    expect(readReceiptBody({ ids: ["a"], dismissed: false }, "dismissed")).toEqual({ ids: ["a"], on: false });
    expect(readReceiptBody({ ids: [] }, "read")).toBeNull();
    expect(readReceiptBody(null, "read")).toBeNull();
    expect(readReceiptBody([], "read")).toBeNull();
    expect(readReceiptBody("x", "read")).toBeNull();
  });
});

describe("expiredAlerts", () => {
  it("names alerts past the retention or removed by every recipient, and nothing one recipient still holds", () => {
    const now = new Date("2026-11-13T12:00:00.000Z");
    const old = mk("a1", ["ana@x.co"], { createdAt: "2026-08-01T00:00:00.000Z" });
    const allGone = mk("a2", ["ana@x.co", "mike@x.co"], { dismissedBy: ["mike@x.co", "ana@x.co"] });
    const oneLeft = mk("a3", ["ana@x.co", "mike@x.co"], { dismissedBy: ["mike@x.co"] });
    const fresh = mk("a4", ["ana@x.co"], { createdAt: "2026-11-13T11:00:00.000Z" });
    const nobody = mk("a5", []);
    const bad = mk("a6", ["ana@x.co"], { createdAt: "not a date" });
    expect(expiredAlerts([old, allGone, oneLeft, fresh, nobody, bad], now).map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(expiredAlerts([fresh], now, 0).map((a) => a.id)).toEqual(["a4"]);
  });
});
