"use client";

// In-app alerts, the client half (DESIGN-CONVENTIONS §3 "In-app alerts",
// v0.39.0): the one feed a hub makes, the header bell and the full list.
// Import from "@sequel/foundation/alerts/ui"; the pure rules (the receipt
// write, the viewer's list, the purge) are at "@sequel/foundation/alerts".
export { createAlertsFeed, rowsFor, pollAllowed, alertStamp, POLL_MS, POLL_IDLE_MS } from "./client";
export type { AlertRow, AlertsSnapshot, AlertsFeed, AlertsFeedOptions } from "./client";
export { AlertsBell, BELL_PREVIEW } from "./AlertsBell";
export type { AlertsBellProps } from "./AlertsBell";
export { AlertsManager, ALERT_TABS, pickAlertTab } from "./AlertsManager";
export type { AlertsManagerProps, AlertTab } from "./AlertsManager";
