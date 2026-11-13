// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsBell, AlertsManager, createAlertsFeed, pickAlertTab, pollAllowed, rowsFor, POLL_IDLE_MS } from "../alerts/ui";
import type { HubAlertBase } from "../alerts";
import { resetUnreadBadgeForTests } from "../testing/unread-badge";

// The client half (DESIGN-CONVENTIONS §3 "In-app alerts"): the bell and the
// list read one feed, read / unread / removed are the viewer's own receipts,
// a refused receipt rolls back, and Remove offers Undo.

const VIEWER = "ana@sequelortho.com";
const feed = createAlertsFeed();

function alert(over: Partial<HubAlertBase> = {}): HubAlertBase {
  return { id: "al_1", createdAt: "2026-11-13T15:00:00.000Z", message: "mike assigned you Work Item: RACI matrix.", href: "/my-tasks", recipients: [VIEWER], readBy: [], dismissedBy: [], ...over };
}
const jsonResponse = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response;
const calls = (fetchMock: ReturnType<typeof vi.fn>, url: string) => fetchMock.mock.calls.filter(([u]) => u === url) as [string, RequestInit][];
const bodyOf = (c: [string, RequestInit]) => JSON.parse(c[1].body as string);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  feed.resetForTests();
  resetUnreadBadgeForTests();
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({ alerts: [alert(), alert({ id: "al_2", readBy: [VIEWER], message: "ana marked Work Item: Champions done." })], viewer: VIEWER }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the feed", () => {
  it("turns receipts into the viewer's read flag and polls only after recent input", () => {
    expect(rowsFor([alert(), alert({ id: "al_2", readBy: [VIEWER] })], VIEWER).map((r) => r.read)).toEqual([false, true]);
    expect(pollAllowed(1_000_000, 1_000_000 - POLL_IDLE_MS + 1)).toBe(true);
    expect(pollAllowed(1_000_000, 1_000_000 - POLL_IDLE_MS)).toBe(false);
    expect(pickAlertTab("all")).toBe("all");
    expect(pickAlertTab("x")).toBe("unread");
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
  it("shows the tab's rows, bulk-marks a selection, and Remove offers Undo", async () => {
    render(<AlertsManager feed={feed} tab="all" emptyHint="See My Tasks." />);
    await screen.findByRole("link", { name: /RACI matrix/ });
    expect(screen.getAllByRole("listitem").length).toBe(2);
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
  });
  it("the unread tab's empty state carries the hub's hint", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ alerts: [alert({ readBy: [VIEWER] })], viewer: VIEWER }));
    render(<AlertsManager feed={feed} tab="unread" emptyHint="See My Tasks." />);
    expect((await screen.findByText(/Nothing unread\./)).textContent).toContain("See My Tasks.");
  });
});
