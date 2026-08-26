"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { clickStartsNavigation } from "./nav-progress";
import { pushToast } from "./toast/store";

// The header brand link — logo + app title as one <Link href="/"> on every
// page (DESIGN-CONVENTIONS §5). Departing to Home announces itself with the
// family-standard "Bringing you back to Home…" toast: the §3 feedback stance
// applied to the one navigation whose destination is always nameable. The
// toast fires only for clicks that actually leave the current page in this
// tab — modified/middle clicks open a new tab and re-clicks on Home itself go
// nowhere, so both stay silent (clickStartsNavigation, shared with
// NavProgress).

export const HOME_TOAST_MESSAGE = "Bringing you back to Home…";

// Imperative variant for headers that can't render <HomeLink> as-is (a brand
// link with its own click orchestration): call from the click handler after
// the same should-this-navigate check.
export function toastHomeNav(message: string = HOME_TOAST_MESSAGE): number {
  return pushToast(message, { tone: "info" });
}

export function HomeLink({
  href = "/",
  ariaLabel,
  className,
  toastMessage = HOME_TOAST_MESSAGE,
  children,
}: {
  href?: string;
  /** Accessible name when the children are a bare logo image with no text. */
  ariaLabel?: string;
  className?: string;
  toastMessage?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={className}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        const a = e.currentTarget;
        if (
          clickStartsNavigation({
            href: a.getAttribute("href"),
            targetAttr: a.getAttribute("target"),
            hasDownload: a.hasAttribute("download"),
            button: e.button,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            defaultPrevented: e.defaultPrevented,
            currentHref: window.location.href,
          })
        ) {
          toastHomeNav(toastMessage);
        }
      }}
    >
      {children}
    </Link>
  );
}
