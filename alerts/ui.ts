"use client";

// In-app alerts, the client half (DESIGN-CONVENTIONS §3 "In-app alerts",
// v0.39.0): the one feed a hub makes, the header bell and the full list.
// Import from "@sequel/foundation/alerts/ui"; the pure rules (the receipt
// write, the viewer's list, the feed rows, the purge) and the `?tab=` helper
// a server page needs are at "@sequel/foundation/alerts".
export { createAlertsFeed } from "./client";
export type { AlertsSnapshot, AlertsFeed, AlertsFeedOptions } from "./client";
export { rowsFor, isAlertRow } from "./index";
export type { AlertRow } from "./index";
export { pollAllowed, alertStamp, POLL_MS, POLL_IDLE_MS, ALERT_TABS, pickAlertTab } from "./rows";
export type { AlertTab } from "./rows";
export { AlertsBell, BELL_PREVIEW } from "./AlertsBell";
export type { AlertsBellProps } from "./AlertsBell";
export { AlertsManager } from "./AlertsManager";
export type { AlertsManagerProps } from "./AlertsManager";
