import type { ReactNode } from "react";
import { buttonClasses } from "./Button";
import { Callout } from "./Callout";
import {
  NO_ACCESS_HEADING,
  NOT_FOUND_HEADING,
  PAGE_ERROR_HEADING,
  noAccessMessage,
  notFoundMessage,
  pageErrorMessage,
} from "./access-copy";

// Bodies of the family's "you can't open this" pages (DESIGN-CONVENTIONS §4
// "No access, not found, and errors"). Hook-free, so a server boundary
// (app/forbidden.tsx, app/not-found.tsx) renders them directly and a client
// error boundary (app/error.tsx, app/global-error.tsx) passes `onRetry`.
// Links are plain <a> so they work even when the client bundle failed.

function Frame({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-8" data-access-notice>
      <h1 className="text-xl font-semibold text-brand-navy">{heading}</h1>
      {children}
    </div>
  );
}

/** A signed-in role that lacks the page or module. Render from app/forbidden.tsx (HTTP 403). */
export function NoAccessNotice({
  appName,
  roleLabel,
  adminLabel,
  homeHref = "/",
  homeLabel = "Go to Home",
}: {
  appName: string;
  /** The viewer's current role as the hub labels it — omit where naming it would itself say too much. */
  roleLabel?: string | null;
  adminLabel?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <Frame heading={NO_ACCESS_HEADING}>
      <Callout tone="warning">{noAccessMessage(appName, { roleLabel, adminLabel })}</Callout>
      <div>
        <a href={homeHref} className={buttonClasses({ variant: "primary" })}>
          {homeLabel}
        </a>
      </div>
    </Frame>
  );
}

/**
 * A missing record — or one whose existence is privileged, so missing and
 * hidden must read the same. Render from app/not-found.tsx (HTTP 404).
 */
export function NotFoundNotice({
  appName,
  adminLabel,
  homeHref = "/",
  homeLabel = "Go to Home",
  secondary,
}: {
  appName: string;
  adminLabel?: string;
  homeHref?: string;
  homeLabel?: string;
  /** An extra next step the hub offers everywhere ("Open My Requests"). Never record-specific. */
  secondary?: { href: string; label: string };
}) {
  return (
    <Frame heading={NOT_FOUND_HEADING}>
      <Callout tone="info">{notFoundMessage(appName, { adminLabel })}</Callout>
      <div className="flex flex-wrap items-center gap-3">
        <a href={homeHref} className={buttonClasses({ variant: "primary" })}>
          {homeLabel}
        </a>
        {secondary && (
          <a href={secondary.href} className={buttonClasses({ variant: "outline" })}>
            {secondary.label}
          </a>
        )}
      </div>
    </Frame>
  );
}

/** An uncaught render error. Render from app/error.tsx and app/global-error.tsx ("use client"). */
export function PageErrorNotice({
  appName,
  adminLabel,
  onRetry,
  digest,
  homeHref = "/",
  homeLabel = "Go to Home",
}: {
  appName: string;
  adminLabel?: string;
  /** The boundary's `reset` (or a reload) — omit to show Home only. */
  onRetry?: () => void;
  /** Next's error digest, shown so a report can be matched to the server log. */
  digest?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <Frame heading={PAGE_ERROR_HEADING}>
      <Callout tone="danger">{pageErrorMessage(appName, { adminLabel })}</Callout>
      <div className="flex flex-wrap items-center gap-3">
        {onRetry && (
          <button type="button" onClick={onRetry} className={buttonClasses({ variant: "primary" })}>
            Try Again
          </button>
        )}
        <a href={homeHref} className={buttonClasses({ variant: onRetry ? "outline" : "primary" })}>
          {homeLabel}
        </a>
      </div>
      {digest && <p className="text-xs text-brand-muted">Reference: {digest}</p>}
    </Frame>
  );
}
