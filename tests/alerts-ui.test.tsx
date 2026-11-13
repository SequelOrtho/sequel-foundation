// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsBell, AlertsManager, createAlertsFeed, pickAlertTab, pollAllowed, POLL_IDLE_MS } from "../alerts/ui";
import { rowsFor, isAlertRow, type AlertRow, type HubAlertBase } from "../alerts";
import { resetUnreadBadgeForTests } from "../testing/unread-badge";

// The client half (DESIGN-CONVENTIONS §3 "In-app alerts"): the bell and the
// list read one feed, read / unread / removed are the viewer's own receipts,
// a refused receipt rolls back, and Remove offers Undo.

const VIEWER = "ana@sequelortho.com";
const feed = createAlertsFeed();

function alert(over: Partial<HubAlertBase> = {}): HubAlertBase {
  return { id: "al_1", createdAt: "2026-11-13T15:00:00.000Z", message: "mike assigned you Work Item: RACI matrix.", href: "/my-tasks", recipients: [VIEWER], readBy: [], dismissedBy: [], ...over };
}
/** What the hub's feed route answers: rows made on the server. */
const feedBody = (...alerts: HubAlertBase[]) => ({ alerts: rowsFor(alerts, VIEWER) });
const jsonResponse = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response;
const calls = (fetchMock: ReturnType<typeof vi.fn>, url: string) => fetchMock.mock.calls.filter(([u]) => u === url) as [string, RequestInit][];
const bodyOf = (c: [string, RequestInit]) => JSON.parse(c[1].body as string);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  feed.resetForTests();
  resetUnreadBadgeForTests();
  fetchMock = vi.fn().mockResolvedValue(jsonResponse(feedBody(alert(), alert({ id: "al_2", readBy: [VIEWER], message: "ana marked Work Item: Champions done." }))));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the feed", () => {
  it("turns receipts into the viewer's read flag on the server, carrying no recipient or receipt, and polls only after recent input", () => {
    const rows = rowsFor([alert({ recipients: [VIEWER, "mike@sequelortho.com"], readBy: ["mike@sequelortho.com"] }), alert({ id: "al_2", readBy: ["ana.alt@sequelortho.com"] })], [VIEWER, "ana.alt@sequelortho.com"]);
    expect(rows.map((r) => r.read)).toEqual([false, true]);
    expect(Object.keys(rows[0]).sort()).toEqual(["createdAt", "href", "id", "message", "read"]);
    expect(JSON.stringify(rows)).not.toMatch(/mike@|ana\.alt|recipients|readBy|dismissedBy/);
    expect(isAlertRow(rows[0])).toBe(true);
    expect(isAlertRow(alert())).toBe(false);
    expect(pollAllowed(1_000_000, 1_000_000 - POLL_IDLE_MS + 1)).toBe(true);
    expect(pollAllowed(1_000_000, 1_000_000 - POLL_IDLE_MS)).toBe(false);
    expect(pickAlertTab("all")).toBe("all");
    expect(pickAlertTab("x")).toBe("unread");
  });
  it("ignores a feed answer that is not rows (the old `{ alerts, viewer }` shape included) and keeps the last snapshot", async () => {
    await feed.refreshAlerts();
    fetchMock.mockResolvedValueOnce(jsonResponse({ alerts: [alert({ id: "al_9" })], viewer: VIEWER }));
    await feed.refreshAlerts();
    fetchMock.mockResolvedValueOnce(jsonResponse({ alerts: "x" }));
    await feed.refreshAlerts();
    render(<AlertsBell feed={feed} />);
    expect(await screen.findByRole("button", { name: "Alerts — 1 unread" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Alerts — 1 unread" }));
    expect(screen.queryByText(/al_9/)).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBe(2);
  });
  it("a poll answered after a receipt write began is dropped, and a rollback undoes only its own write", async () => {
    await feed.refreshAlerts();
    // A poll in flight, served before the remove lands.
    let answerPoll: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answerPoll = resolve)));
    const stale = feed.refreshAlerts();
    const { ok } = await feed.removeAlerts(["al_1"]);
    expect(ok).toBe(true);
    answerPoll(jsonResponse(feedBody(alert(), alert({ id: "al_2", readBy: [VIEWER] }))));
    await stale;
    // al_1 is still off the list: a second remove finds nothing to post.
    expect((await feed.removeAlerts(["al_1"])).removed).toEqual([]);
    expect(calls(fetchMock, "/api/alerts/dismiss").length).toBe(1);
    // The server now agrees; mounting the list polls once more.
    fetchMock.mockResolvedValue(jsonResponse(feedBody(alert({ id: "al_2", readBy: [VIEWER], message: "ana marked Work Item: Champions done." }))));
    render(<AlertsManager feed={feed} tab="all" />);
    await screen.findByRole("link", { name: /Champions/ });
    expect(screen.queryByRole("link", { name: /RACI matrix/ })).toBeNull();
    // Two writes at once: the second's refusal puts back only its own change.
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    const refused = feed.setAlertsRead(["al_2"], false);
    const restored = feed.restoreAlerts([{ id: "al_1", createdAt: "2026-11-13T15:00:00.000Z", message: "mike assigned you Work Item: RACI matrix.", href: "/my-tasks", read: false }]);
    expect(await refused).toBe(false);
    expect(await restored).toBe(true);
    expect(await screen.findByRole("link", { name: /RACI matrix/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Champions/ }).className).toContain("text-brand-muted");
  });
  it("a refused receipt rolls back", async () => {
    await feed.refreshAlerts();
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    expect(await feed.setAlertsRead(["al_1"], true)).toBe(false);
    render(<AlertsBell feed={feed} />);
    expect(await screen.findByRole("button", { name: "Alerts — 1 unread" })).toBeTruthy();
  });
  it("remove returns the rows for Undo and restore puts them back", async () => {
    await feed.refreshAlerts();
    const { ok, removed } = await feed.removeAlerts(["al_1"]);
    expect(ok).toBe(true);
    expect(removed.map((r) => r.id)).toEqual(["al_1"]);
    expect(bodyOf(calls(fetchMock, "/api/alerts/dismiss")[0])).toEqual({ ids: ["al_1"], dismissed: true });
    expect(await feed.restoreAlerts(removed)).toBe(true);
    expect(bodyOf(calls(fetchMock, "/api/alerts/dismiss").at(-1)!)).toEqual({ ids: ["al_1"], dismissed: false });
    // Removing counted as having read, so the row comes back read — as the
    // next poll shows it — and the count stays at zero until it is re-read.
    render(<AlertsBell feed={feed} />);
    expect(await screen.findByRole("button", { name: "Alerts" })).toBeTruthy();
  });
});

describe("AlertsBell", () => {
  it("renders nothing until loaded, then names the unread count, lists the alerts and marks one read when opened", async () => {
    const { container } = render(<AlertsBell feed={feed} title="Task alerts" links={[{ href: "/my-tasks", label: "Open My Tasks" }]} />);
    expect(container.innerHTML).toBe("");
    const bell = await screen.findByRole("button", { name: "Task alerts — 1 unread" });
    expect(document.title.startsWith("(1)")).toBe(true);
    fireEvent.click(bell);
    expect(screen.getByRole("region", { name: "Task alerts" })).toBeTruthy();
    const link = screen.getByRole("link", { name: /RACI matrix/ });
    expect(link.getAttribute("href")).toBe("/my-tasks");
    expect(screen.getByRole("link", { name: "Open My Tasks" }).getAttribute("href")).toBe("/my-tasks");
    expect(screen.getByRole("link", { name: "Manage Alerts" }).getAttribute("href")).toBe("/alerts");
    fireEvent.click(link);
    await waitFor(() => expect(calls(fetchMock, "/api/alerts/read").length).toBe(1));
    expect(bodyOf(calls(fetchMock, "/api/alerts/read")[0])).toEqual({ ids: ["al_1"], read: true });
    expect(await screen.findByRole("button", { name: "Task alerts" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Task alerts" })).toBeNull();
  });
  it("Mark All Read posts every unread id; Escape closes the list and returns focus to the bell", async () => {
    render(<AlertsBell feed={feed} />);
    const bell = await screen.findByRole("button", { name: "Alerts — 1 unread" });
    expect(screen.getByText("Alerts: 1 unread")).toBeTruthy();
    fireEvent.click(bell);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark All Read" }));
    });
    expect(bodyOf(calls(fetchMock, "/api/alerts/read")[0])).toEqual({ ids: ["al_1"], read: true });
    fireEvent.keyDown(screen.getByRole("region", { name: "Alerts" }), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Alerts" })).toBeNull();
    expect(document.activeElement).toBe(bell);
  });
});

describe("AlertsManager", () => {
  it("shows the tab's rows with a glyph and an sr-only prefix on unread ones, bulk-marks a selection, and Remove offers Undo", async () => {
    render(<AlertsManager feed={feed} tab="all" emptyHint="See My Tasks." />);
    const unreadLink = await screen.findByRole("link", { name: /RACI matrix/ });
    expect(screen.getAllByRole("listitem").length).toBe(2);
    expect(unreadLink.textContent).toContain("●");
    expect(unreadLink.textContent).toContain("Unread: ");
    expect(screen.getByRole("link", { name: /Champions/ }).textContent).not.toContain("●");
    fireEvent.click(screen.getByLabelText("Select all shown"));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Mark Unread" })[0]);
    });
    expect(bodyOf(calls(fetchMock, "/api/alerts/read")[0])).toEqual({ ids: ["al_2"], read: false });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    });
    expect(bodyOf(calls(fetchMock, "/api/alerts/dismiss")[0])).toEqual({ ids: ["al_1"], dismissed: true });
    expect(screen.getAllByRole("listitem").length).toBe(1);
    // The strip keeps the same Undo on screen past the toast and says only
    // the reader's own list changed; Undo puts the row back (read).
    const strip = screen.getByRole("status", { name: "" });
    expect(strip.textContent).toContain("Alert removed from your list");
    expect(strip.textContent).toContain("Only your list changed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    });
    expect(bodyOf(calls(fetchMock, "/api/alerts/dismiss").at(-1)!)).toEqual({ ids: ["al_1"], dismissed: false });
    expect(screen.getAllByRole("listitem").length).toBe(2);
    expect(screen.queryByText("Only your list changed", { exact: false })).toBeNull();
  });
  it("Mark All Read on the list posts every unread id and is disabled once nothing is unread", async () => {
    render(<AlertsManager feed={feed} tab="all" />);
    await screen.findByRole("link", { name: /RACI matrix/ });
    const all = screen.getByRole("button", { name: "Mark All Read" });
    await act(async () => {
      fireEvent.click(all);
    });
    expect(bodyOf(calls(fetchMock, "/api/alerts/read")[0])).toEqual({ ids: ["al_1"], read: true });
    expect((screen.getByRole("button", { name: "Mark All Read" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("the unread tab's empty state carries the hub's hint", async () => {
    fetchMock.mockResolvedValue(jsonResponse(feedBody(alert({ readBy: [VIEWER] }))));
    render(<AlertsManager feed={feed} tab="unread" emptyHint="See My Tasks." />);
    expect((await screen.findByText(/Nothing unread\./)).textContent).toContain("See My Tasks.");
  });
});
