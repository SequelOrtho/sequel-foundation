"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { buttonClasses } from "../ui/Button";
import { announceSignOut, isSigningOutHere, onSessionMessage } from "./channel";
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
import { SIGN_OUT_PATH, safeCallbackUrl, signInHref } from "./policy";

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
// How long Stay Signed In waits for an answer before treating it as failed.
const STAY_TIMEOUT_MS = 10_000;

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
  // Why it ended: "confirmed" (another tab signed out, or the server said so —
  // the cookie is already gone) or "countdown" (this tab's own estimate).
  const [endedBy, setEndedBy] = useState<"confirmed" | "countdown">("confirmed");
  const countdownLast = useRef(0);
  const [warnUntil, setWarnUntil] = useState<number | null>(null);
  const [staying, setStaying] = useState(false);
  const [stayFailed, setStayFailed] = useState(false);
  const lastCheck = useRef(0);
  const endedRef = useRef(false);
  const stayInFlight = useRef(false);
  const scheduleRef = useRef<() => void>(() => {});
  const buttonRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDialogElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const warnOverlayRef = useRef<HTMLDialogElement>(null);
  const activityRef = useRef<(at: number) => void>(() => {});
  const warnOn = !!sessionUrl && !!idleTimeoutSeconds && idleTimeoutSeconds > 0;

  useEffect(() => {
    endedRef.current = ended;
  }, [ended]);

  useEffect(() => {
    const end = () => {
      if (isSigningOutHere()) return;
      setEndedBy("confirmed");
      setEnded(true);
    };
    const stop = onSessionMessage(end);
    const onVisible = async () => {
      if (!sessionUrl || document.visibilityState !== "visible") return;
      // Once the signed-out screen shows, this tab asks the server nothing more:
      // a session read re-issues the cookie, so asking would keep alive a
      // session the screen says has ended (PR review, round 2).
      if (endedRef.current) return;
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
        // A Stay Signed In still on its way (a cold start) decides: its answer
        // reschedules, or ends it if the session is gone. It gives up after
        // STAY_TIMEOUT_MS, so a hung request can't hold the end off.
        if (stayInFlight.current) return;
        setWarnUntil(null);
        setStayFailed(false);
        if (!endedRef.current) {
          countdownLast.current = last;
          setEndedBy("countdown");
        }
        setEnded(true);
        return;
      }
      if (now >= at) {
        setWarnUntil(endsAt(last, idleMs));
        timer = setTimeout(schedule, endsAt(last, idleMs) - now + 50);
        return;
      }
      setWarnUntil(null);
      setStayFailed(false);
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
    scheduleRef.current = schedule;
    let observer: PerformanceObserver | undefined;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as PerformanceResourceTiming[]) {
          // Dated by its age, not from the page's time origin: performance.now()
          // stops while the computer sleeps, so origin + startTime would date a
          // request made after a night's sleep hours too early.
          if (extendsSession(e, window.location.origin)) seen(Date.now() - (performance.now() - e.startTime));
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
    // A download link (ExportBar's <a download>) goes through the proxy but
    // leaves no fetch entry, so its click is counted here.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[download]") as HTMLAnchorElement | null;
      if (!a) return;
      try {
        if (new URL(a.href, window.location.href).origin === window.location.origin) seen(Date.now());
      } catch {
        // Not a URL: nothing was requested.
      }
    };
    document.addEventListener("click", onClick, true);
    schedule();
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("click", onClick, true);
    };
  }, [warnOn, idleTimeoutSeconds, warnBeforeSeconds]);

  useModal(ended, overlayRef, buttonRef);
  useModal(!ended && warnUntil !== null, warnOverlayRef, stayRef);

  async function staySignedIn() {
    if (!sessionUrl) return;
    setStaying(true);
    setStayFailed(false);
    stayInFlight.current = true;
    try {
      // Reading the session re-issues the cookie: that is what keeps it. Only a
      // real answer counts — a 5xx or 429 (a cold start, a blip) may not have
      // re-issued it, so the warning stays up with a Try Again.
      const controller = new AbortController();
      const giveUp = setTimeout(() => controller.abort(), STAY_TIMEOUT_MS);
      const res = await fetch(sessionUrl, { cache: "no-store", credentials: "same-origin", signal: controller.signal }).finally(
        () => clearTimeout(giveUp),
      );
      if (res.ok || res.status === 401) {
        if (await check(res)) activityRef.current(Date.now()); // closes the warning, restarts the clock
        else {
          setEndedBy("confirmed");
          setEnded(true);
        }
      } else {
        setStayFailed(true);
      }
    } catch {
      setStayFailed(true); // offline: leave the warning up so the person can try again
    } finally {
      stayInFlight.current = false;
      setStaying(false);
      scheduleRef.current(); // if the countdown ran out meanwhile, it ends now
    }
  }

  if (!ended && warnUntil !== null) {
    return (
      <ModalShell overlayRef={warnOverlayRef} id="session-expiring" title="Your session is about to end"
        body={<ExpiryBody until={warnUntil} failed={stayFailed} />}>
        <button ref={stayRef} type="button" onClick={staySignedIn} disabled={staying}
          className={buttonClasses({ size: "md" })}>
          {staying ? "Staying Signed In…" : stayFailed ? "Try Again" : "Stay Signed In"}
        </button>
      </ModalShell>
    );
  }
  if (!ended) return null;
  const here = window.location.pathname + window.location.search;
  if (endedBy === "confirmed") {
    // Another tab or the server already ended it: the cookie is gone, so this
    // is the plain sign-in link, as in v0.28.0.
    return (
      <ModalShell overlayRef={overlayRef} id="session-ended" conceal title="You’ve been signed out"
        body="Your session ended, here or in another tab. Sign in again to pick up on this page.">
        <a ref={buttonRef as RefObject<HTMLAnchorElement | null>} href={signInHref(here)} className={buttonClasses({ size: "md" })}>
          Sign In Again
        </a>
      </ModalShell>
    );
  }
  // The countdown only estimates the server's clock, so a cookie may still be
  // alive behind this screen; on a shared computer the next person must not
  // find it there. Sign In Again signs out for real first (the plain sign-out
  // POST, then the sign-in page with this page as callbackUrl) — unless a tab
  // has made a request since (the person signed in again elsewhere), when it is
  // the plain sign-in link, so it never ends that new session.
  const back = safeCallbackUrl(here, "");
  return (
    <ModalShell overlayRef={overlayRef} id="session-ended" conceal title="You’ve been signed out"
      body="Your session ended, here or in another tab. Sign in again to pick up on this page.">
      <form
        method="post"
        action={SIGN_OUT_PATH}
        onSubmit={(e) => {
          if (readLastActive(safeLocalStorage()) > countdownLast.current) {
            e.preventDefault();
            window.location.assign(signInHref(here));
            return;
          }
          announceSignOut();
        }}
      >
        {back ? <input type="hidden" name="callbackUrl" value={back} /> : null}
        <button ref={buttonRef as RefObject<HTMLButtonElement | null>} type="submit" className={buttonClasses({ size: "md" })}>
          Sign In Again
        </button>
      </form>
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

// The dialogs are modal, on the native <dialog> opened with showModal() (UX
// audit 2026-10-21, FND-11; PR review F1). That puts them in the browser's top
// layer ABOVE any modal already open — a ui/Dialog the person left up stays
// underneath, hidden by the signed-out screen, instead of painting over it and
// keeping Sign In Again from being clicked (a z-index can't reach the top
// layer). showModal also makes the rest of the page inert and keeps Tab inside.
// Without showModal (old browsers, test environments) the page's other <body>
// children are marked inert by hand. Escape never closes these two: the
// signed-out screen has no way back but signing in, and the warning closes on
// Stay Signed In; a browser that closes one anyway (Chrome lets a second
// Escape through) gets it reopened.
function useModal(open: boolean, dialogRef: RefObject<HTMLDialogElement | null>, focusRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const before = document.activeElement as HTMLElement | null;
    const made: Element[] = [];
    const native = typeof dialog.showModal === "function";
    const show = () => {
      if (native) {
        if (dialog.open) dialog.close(); // opened non-modal somehow: reopen as modal, on top
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    };
    show();
    if (!native) {
      for (const el of Array.from(document.body.children)) {
        if (el === dialog || el.hasAttribute("inert")) continue;
        el.setAttribute("inert", "");
        made.push(el);
      }
    }
    const onCancel = (e: Event) => e.preventDefault();
    let closing = false;
    const onClose = () => {
      if (!closing) show();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    focusRef.current?.focus();
    return () => {
      closing = true;
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
      if (native && dialog.open && typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      made.forEach((el) => el.removeAttribute("inert"));
      // Back to where the person was (the warning closes on Stay Signed In).
      if (before && before.isConnected && before !== document.body) before.focus();
    };
  }, [open, dialogRef, focusRef]);
}

function ModalShell({ overlayRef, id, title, body, conceal = false, children }: {
  overlayRef: RefObject<HTMLDialogElement | null>;
  /** Hide the page behind the dialog, not just dim it. */
  conceal?: boolean;
  id: string;
  title: string;
  body: ReactNode;
  children: ReactNode;
}) {
  // The <dialog> itself is the full-screen ground (opaque when concealing), so
  // nothing beneath it shows through whatever else sits in the top layer.
  // `hidden open:flex`: invisible until it is actually open.
  return createPortal(
    <dialog
      ref={overlayRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-conceal={conceal || undefined}
      className={`fixed inset-0 m-0 hidden h-full max-h-none w-full max-w-none items-center justify-center border-0 p-4 backdrop:bg-transparent open:flex ${
        conceal ? "bg-zinc-100 dark:bg-zinc-950" : "bg-black/40"
      }`}
    >
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 text-left text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-brand-navy dark:text-zinc-100">
          {title}
        </h2>
        <div id={`${id}-body`} className="mt-2 text-sm text-brand-muted">
          {body}
        </div>
        <div className="mt-5 flex justify-end">{children}</div>
      </div>
    </dialog>,
    document.body,
  );
}

// The sentence is read once when the dialog opens; the ticking clock beside it
// is hidden from screen readers so it doesn't announce every second.
function ExpiryBody({ until, failed }: { until: number; failed: boolean }) {
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
      {/* Kept in the page (empty) so the failure is announced when it appears. */}
      <p role="status" className={failed ? "mt-2 text-brand-danger" : ""}>
        {failed ? "We couldn’t reach the server to keep you signed in. Try again." : ""}
      </p>
    </>
  );
}
