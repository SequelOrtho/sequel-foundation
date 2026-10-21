"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { buttonClasses } from "../ui/Button";
import { isSigningOutHere, onSessionMessage } from "./channel";
import {
  DEFAULT_WARN_BEFORE_SECONDS,
  LAST_ACTIVE_KEY,
  endsAt,
  expiryWarningText,
  extendsSession,
  formatCountdown,
  readLastActive,
  warningAt,
  writeLastActive,
} from "./expiry";
import { signInHref } from "./policy";

// Notices when the session behind an open page has ended — signed out in
// another tab, or expired while the tab sat idle — and says so with a way
// back, instead of letting the next click fail (DESIGN-CONVENTIONS §4
// "Signing out"). Render it only for a signed-in visitor (next to SignOutForm).
//
// Two signals, both event-driven (no polling, so the idle timeout still means
// idle): a BroadcastChannel message from a tab that signed out, and a session
// check when the tab becomes visible again (at most once a minute).
//
// With `idleTimeoutSeconds` (the app's session lifetime) it also warns a
// couple of minutes before the session would end for inactivity, with a
// "Stay Signed In" button (owner ruling 2026-10-21, Mike: "add the warning";
// WCAG 2.2.6). How the end is worked out without asking the server is in
// ./expiry.ts. When the countdown runs out the signed-out dialog takes over
// without a server call, so an abandoned tab never keeps a session alive.

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
  idleTimeoutSeconds,
  warnBeforeSeconds = DEFAULT_WARN_BEFORE_SECONDS,
}: {
  // null turns the on-focus check off (the cross-tab signal still works).
  sessionUrl?: string | null;
  check?: SessionCheck;
  // The session's idle lifetime (Auth.js `session.maxAge`, in seconds). Set it
  // to turn the expiry warning on; it needs `sessionUrl` for Stay Signed In.
  idleTimeoutSeconds?: number;
  warnBeforeSeconds?: number;
}) {
  const [ended, setEnded] = useState(false);
  const [warnUntil, setWarnUntil] = useState<number | null>(null);
  const [staying, setStaying] = useState(false);
  const lastCheck = useRef(0);
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const warnOverlayRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<(at: number) => void>(() => {});
  const warnOn = !!sessionUrl && !!idleTimeoutSeconds && idleTimeoutSeconds > 0;

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

  // Expiry warning: note this tab's requests, share them, and time the warning.
  useEffect(() => {
    if (!warnOn || !idleTimeoutSeconds) return;
    const idleMs = idleTimeoutSeconds * 1000;
    const warnMs = warnBeforeSeconds * 1000;
    const storage = safeLocalStorage();
    // When this page's clock started (≈ performance.timeOrigin): the page load
    // reached the server then.
    const origin = Date.now() - performance.now();
    let local = origin;
    writeLastActive(storage, local);
    const latest = () => Math.max(local, readLastActive(storage));

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      const last = latest();
      const at = warningAt(last, idleMs, warnMs);
      const now = Date.now();
      if (now >= endsAt(last, idleMs)) {
        setWarnUntil(null);
        setEnded(true);
        return;
      }
      if (now >= at) {
        setWarnUntil(endsAt(last, idleMs));
        timer = setTimeout(schedule, endsAt(last, idleMs) - now + 50);
        return;
      }
      setWarnUntil(null);
      // Re-check at the warning time (timers in background tabs can fire late;
      // the comparison above corrects for that).
      timer = setTimeout(schedule, at - now);
    };

    const seen = (at: number) => {
      if (at <= local) return;
      local = at;
      writeLastActive(storage, at);
      schedule();
    };
    activityRef.current = seen;
    let observer: PerformanceObserver | undefined;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as PerformanceResourceTiming[]) {
          if (extendsSession(e, window.location.origin)) seen(origin + e.startTime);
        }
      });
      observer.observe({ type: "resource", buffered: false });
    } catch {
      // No PerformanceObserver: the warning runs on the page-load time alone,
      // which can only make it show early, never late.
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVE_KEY) schedule();
    };
    window.addEventListener("storage", onStorage);
    schedule();
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, [warnOn, idleTimeoutSeconds, warnBeforeSeconds]);

  useModal(ended, overlayRef, buttonRef);
  useModal(!ended && warnUntil !== null, warnOverlayRef, stayRef);

  async function staySignedIn() {
    if (!sessionUrl) return;
    setStaying(true);
    try {
      // Reading the session re-issues the cookie: that is what keeps it.
      const res = await fetch(sessionUrl, { cache: "no-store", credentials: "same-origin" });
      if (!(await check(res))) setEnded(true);
      else activityRef.current(Date.now()); // closes the warning, restarts the clock
    } catch {
      // Offline: leave the warning up so the person can try again.
    } finally {
      setStaying(false);
    }
  }

  if (!ended && warnUntil !== null) {
    return (
      <ModalShell overlayRef={warnOverlayRef} id="session-expiring" title="Your session is about to end"
        body={<ExpiryBody until={warnUntil} />}>
        <button ref={stayRef} type="button" onClick={staySignedIn} disabled={staying}
          className={buttonClasses({ size: "md" })}>
          {staying ? "Staying Signed In…" : "Stay Signed In"}
        </button>
      </ModalShell>
    );
  }
  if (!ended) return null;
  const href = signInHref(window.location.pathname + window.location.search);
  return (
    <ModalShell overlayRef={overlayRef} id="session-ended" title="You’ve been signed out"
      body="Your session ended, here or in another tab. Sign in again to pick up on this page.">
      <a ref={buttonRef} href={href} className={buttonClasses({ size: "md" })}>
        Sign In Again
      </a>
    </ModalShell>
  );
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// The dialogs are modal: everything else on the page goes inert while one
// shows, so Tab and a screen reader stay in it instead of walking controls
// that no longer work (UX audit 2026-10-21, FND-11). The overlay renders
// straight into <body> so its siblings are exactly "the rest of the page".
function useModal(open: boolean, overlayRef: RefObject<HTMLElement | null>, focusRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const overlay = overlayRef.current;
    const made: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === overlay || el.hasAttribute("inert")) continue;
      el.setAttribute("inert", "");
      made.push(el);
    }
    const before = document.activeElement as HTMLElement | null;
    focusRef.current?.focus();
    return () => {
      made.forEach((el) => el.removeAttribute("inert"));
      // Back to where the person was (the warning closes on Stay Signed In).
      if (before && before.isConnected && before !== document.body) before.focus();
    };
  }, [open, overlayRef, focusRef]);
}

function ModalShell({ overlayRef, id, title, body, children }: {
  overlayRef: RefObject<HTMLDivElement | null>;
  id: string;
  title: string;
  body: ReactNode;
  children: ReactNode;
}) {
  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 text-left shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold text-brand-navy dark:text-zinc-100">
          {title}
        </h2>
        <div id={`${id}-body`} className="mt-2 text-sm text-brand-muted">
          {body}
        </div>
        <div className="mt-5 flex justify-end">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// The sentence is read once when the dialog opens; the ticking clock beside it
// is hidden from screen readers so it doesn't announce every second.
function ExpiryBody({ until }: { until: number }) {
  const [opened] = useState(() => until - Date.now());
  const [left, setLeft] = useState(opened);
  useEffect(() => {
    const t = setInterval(() => setLeft(until - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return (
    <>
      <p>{expiryWarningText(opened)}</p>
      <p aria-hidden className="mt-2 text-2xl font-semibold tabular-nums text-brand-navy dark:text-zinc-100">
        {formatCountdown(left)}
      </p>
    </>
  );
}
