"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconButton } from "../ui/IconButton";
import { UnreadBadge } from "../ui/UnreadBadge";
import { useFitInViewport } from "../ui/useFitInViewport";
import { alertStamp, type AlertsFeed } from "./client";

// The header bell (DESIGN-CONVENTIONS §3 "In-app alerts", v0.39.0): the
// unread count, a popover listing the most recent alerts, Mark All Read, and
// the door to the full list. Opening an alert marks it read. Until the feed
// has loaded the bell renders nothing rather than a wrong count. The same
// count shows in the tab title and on the tab's icon (UnreadBadge; owner
// ruling 2026-10-22, Mike: "1-yes, 2-yes") — the count only, never an
// alert's text. A disclosure: Escape closes it and focus returns to the bell.

export const BELL_PREVIEW = 8;

export type AlertsBellProps = {
  /** The hub's one feed (`createAlertsFeed`). */
  feed: AlertsFeed;
  /** The popover's heading; default "Alerts". */
  title?: string;
  /** Where "Manage Alerts" leads; default "/alerts". */
  manageHref?: string;
  /** What an empty list says. */
  emptyText?: ReactNode;
  /** Further links at the popover's foot (a "Open My Tasks"). */
  links?: { href: string; label: string }[];
  /** How many rows the popover shows; default BELL_PREVIEW. */
  preview?: number;
  /** Formats an alert's time; default `alertStamp` (Central). */
  stamp?: (iso: string) => string;
};

export function AlertsBell({
  feed,
  title = "Alerts",
  manageHref = "/alerts",
  emptyText = "No alerts yet.",
  links = [],
  preview = BELL_PREVIEW,
  stamp = alertStamp,
}: AlertsBellProps) {
  const { alerts, unread, loaded } = feed.useHubAlerts();
  // The button and the open list share one name: the title, with the unread
  // count while there is one (owner ruling 2026-11-13: the popover names the
  // count too).
  const name = unread > 0 ? `${title} — ${unread} unread` : title;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useFitInViewport<HTMLDivElement>(open);
  const panelId = useId();

  function closeToBell() {
    setOpen(false);
    wrapRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!loaded) return null;

  return (
    <div
      ref={wrapRef}
      className="relative"
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.stopPropagation();
          closeToBell();
        }
      }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (open && next && !e.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <UnreadBadge count={unread} />
      <IconButton
        label={name}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <span aria-hidden className="text-base leading-none">
          🔔
        </span>
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand-danger px-1 text-center text-[10px] font-bold leading-4 text-white dark:text-zinc-900"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </IconButton>
      <span aria-live="polite" className="sr-only">
        {title}: {unread} unread
      </span>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label={name}
          className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-brand-navy dark:text-white">{title}</p>
            <button
              type="button"
              onClick={() => void feed.markAllAlertsRead()}
              disabled={unread === 0}
              className="text-xs font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark All Read
            </button>
          </div>
          {alerts.length === 0 ? (
            <p className="mt-2 text-xs text-brand-muted">{emptyText}</p>
          ) : (
            <ul className="relative mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
              {alerts.slice(0, preview).map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    onClick={() => {
                      setOpen(false);
                      if (!a.read) void feed.setAlertsRead([a.id], true);
                    }}
                    className={`block rounded-md px-2 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                      a.read ? "text-brand-muted" : "font-medium text-zinc-900 dark:text-zinc-100"
                    }`}
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
                    <span className="block text-[11px] font-normal text-brand-muted">{stamp(a.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
            <Link href={manageHref} onClick={() => setOpen(false)} className="text-xs font-medium text-brand hover:underline">
              {alerts.length > preview ? `Manage All Alerts (${alerts.length})` : "Manage Alerts"}
            </Link>
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-xs font-medium text-brand hover:underline">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
