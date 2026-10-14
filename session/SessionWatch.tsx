"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClasses } from "../ui/Button";
import { isSigningOutHere, onSessionMessage } from "./channel";
import { signInHref } from "./policy";

// Notices when the session behind an open page has ended — signed out in
// another tab, or expired while the tab sat idle — and says so with a way
// back, instead of letting the next click fail (DESIGN-CONVENTIONS §4
// "Signing out"). Render it only for a signed-in visitor (next to SignOutForm).
//
// Two signals, both event-driven (no polling, so the idle timeout still means
// idle): a BroadcastChannel message from a tab that signed out, and a session
// check when the tab becomes visible again (at most once a minute).

export type SessionCheck = (response: Response) => Promise<boolean>;

// Auth.js: GET /api/auth/session answers `null` when signed out.
export const authjsSessionCheck: SessionCheck = async (res) => {
  if (res.status === 401) return false;
  if (!res.ok) return true;
  const body: unknown = await res.json().catch(() => undefined);
  if (body === undefined) return true; // unreadable → don't cry wolf
  return !!body && typeof body === "object" && "user" in body;
};

const RECHECK_MS = 60_000;

export function SessionWatch({
  sessionUrl = "/api/auth/session",
  check = authjsSessionCheck,
}: {
  // null turns the on-focus check off (the cross-tab signal still works).
  sessionUrl?: string | null;
  check?: SessionCheck;
}) {
  const [ended, setEnded] = useState(false);
  const lastCheck = useRef(0);
  const buttonRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const end = () => {
      if (!isSigningOutHere()) setEnded(true);
    };
    const stop = onSessionMessage(end);
    const onVisible = async () => {
      if (!sessionUrl || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheck.current < RECHECK_MS) return;
      lastCheck.current = now;
      try {
        const res = await fetch(sessionUrl, { cache: "no-store", credentials: "same-origin" });
        if (!(await check(res))) end();
      } catch {
        // Offline or a blip: say nothing; the next action will tell.
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionUrl, check]);

  useEffect(() => {
    if (ended) buttonRef.current?.focus();
  }, [ended]);

  if (!ended) return null;
  const href = signInHref(window.location.pathname + window.location.search);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-ended-title"
        aria-describedby="session-ended-body"
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 text-left shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 id="session-ended-title" className="text-lg font-semibold text-brand-navy dark:text-zinc-100">
          You’ve been signed out
        </h2>
        <p id="session-ended-body" className="mt-2 text-sm text-brand-muted">
          Your session ended, here or in another tab. Sign in again to pick up on this page.
        </p>
        <div className="mt-5 flex justify-end">
          <a ref={buttonRef} href={href} className={buttonClasses({ size: "md" })}>
            Sign In Again
          </a>
        </div>
      </div>
    </div>
  );
}
