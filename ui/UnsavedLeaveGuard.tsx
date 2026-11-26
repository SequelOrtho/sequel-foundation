"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

// Asks before a person leaves unsaved edits for another page of the app
// (DESIGN-CONVENTIONS §3 "Unsaved edits ask before you leave"; owner report
// 2026-11-26, Mike, of the Missed Punch Hub's team editor: a Team Member
// removed there was never saved because nothing asked; "Deletes (all changes)
// must prompt saves", then "Fix both" to moving the guard here). useUnsavedGuard
// covers closing or reloading the tab; a link in the app (the header, a
// breadcrumb, a toast) and the browser's Back button change the page without
// unloading it, so the browser never asks. While there are unsaved edits, both
// are held and this dialog offers to save and leave, to leave without saving,
// or to keep editing.
//
// A link: a plain click is stopped before the router sees it. A click that
// opens another tab, a download and a link to another site are left alone
// (the page stays, or the browser's own prompt answers). A link to a place on
// the same page (the skip link) is followed without a new history entry.
//
// Back: while there are unsaved edits, and only then, the page has a second
// history entry for itself, so one press of Back lands on the first, still on
// this page. That press is kept from the router, the second entry is put back
// and the dialog opens; leaving goes back past every entry for the page, and a
// held link replaces the second entry. The entry is taken away again as soon as
// nothing is unsaved (a save, or the edits undone by hand), so the history is
// as it was before the edit: `release()` does it and resolves once it is gone,
// and the editor waits for that before a navigation of its own.
//
// Not held (owner, 2026-11-26, Mike: "2-fine"): a jump of several pages through
// the browser's history menu; a tab opened straight onto the page has no
// earlier page, so leaving by Back stays on it; after a save the extra entry
// remains as a Forward entry.
//
// Lifted from the Missed Punch Hub, where it was reviewed through
// missed-punch-hub#83; the app's router (Next's App Router) keeps a page it
// has left and can bring it back as it was, state included, so nothing is left
// set here when a leave goes by a link.

/** Where a click would take the page inside the app, or null when it would not leave it. */
export function inAppLeaveHref(e: MouseEvent, here: { origin: string; pathname: string; search: string; href: string }): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!a || a.hasAttribute("download") || (a.target && a.target !== "_self")) return null;
  let url: URL;
  try {
    url = new URL(a.getAttribute("href") ?? "", here.href);
  } catch {
    return null;
  }
  // A path that starts "//" would read as another site if handed to the router: left to the browser.
  if (url.origin !== here.origin || url.pathname.startsWith("//")) return null;
  // The same page (the skip link, an anchor on it): nothing is lost.
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The fragment of a plain click on a link to a place on this same page (the skip link), or null. */
export function samePageFragment(e: MouseEvent, here: { origin: string; pathname: string; search: string; href: string }): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!a || a.hasAttribute("download") || (a.target && a.target !== "_self")) return null;
  let url: URL;
  try {
    url = new URL(a.getAttribute("href") ?? "", here.href);
  } catch {
    return null;
  }
  return url.origin === here.origin && url.pathname === here.pathname && url.search === here.search && url.hash ? url.hash : null;
}

/** A page's address without its fragment: a move within the page is not a move off it. */
const pageOf = (l: { origin: string; pathname: string; search: string }) => `${l.origin}${l.pathname}${l.search}`;

/** How long a move to a fragment made here may take to be reported. */
const FRAGMENT_WAIT_MS = 500;

/** Leaving by Back steps over this many entries for the same page at most (fragment entries made before the first edit). */
const LEAVE_STEPS = 10;

/** The dialog was opened by the browser's Back button, not by a link. */
const BACK = Symbol("back");

export type UnsavedLeaveGuardHandle = {
  /** Take the extra history entry away, if it is there. Resolves once the history is as it was before the first edit. */
  release: () => Promise<void>;
};

/** How long `release` waits for the browser to report the step back before it carries on regardless. */
const RELEASE_WAIT_MS = 1000;

export function UnsavedLeaveGuard({
  ref,
  dirty,
  busy,
  what,
  changes,
  saveLabel,
  saving,
  onSave,
  navigate,
}: {
  ref?: Ref<UnsavedLeaveGuardHandle>;
  /** True while there are unsaved edits. */
  dirty: boolean;
  /** True while a request of the editor's is on its way: links are not held then, Back still is. */
  busy: boolean;
  /** What is being edited, for the dialog's sentence: `the team "Urgent Care"`. */
  what: string;
  /** The unsaved edits, one line each. */
  changes: string[];
  saveLabel: string;
  saving: boolean;
  /** Save; when it worked, call `leave` instead of the editor's own next step. Resolves once the save has answered. */
  onSave: (leave: () => void) => Promise<unknown>;
  /** Go to a page of the app (the router's push or replace). */
  navigate: (href: string, how: "push" | "replace") => void;
}) {
  const [target, setTarget] = useState<string | typeof BACK | null>(null);
  // The extra history entry is in place (see the header comment).
  const held = useRef(false);
  // The page the two entries are for: a press that lands anywhere else is the router's.
  const heldAt = useRef("");
  // Leaving by going back past the entries for this page: those steps are not held.
  const leaving = useRef(false);
  const leaveSteps = useRef(0);
  // A move to a place on this page that this component made itself is being reported.
  const ownFragment = useRef(false);
  // A release under way: its step back is neither held nor the router's.
  // `late`: the wait ran out before the browser reported the step, which is still to come.
  const releasing = useRef<{ promise: Promise<void>; done: () => void; late: boolean } | null>(null);

  const release = useCallback((): Promise<void> => {
    // The editor is moving on by itself (a save, a delete): a question still open is void.
    setTarget(null);
    if (releasing.current) {
      // The step still to come takes away whatever entry was added since.
      if (releasing.current.late) held.current = false;
      return releasing.current.promise;
    }
    if (!held.current) return Promise.resolve();
    held.current = false;
    let done = () => {};
    const promise = new Promise<void>((resolve) => {
      // Whoever waits carries on after the wait, but the step is still owed: when it
      // comes it is this release's, never a press of Back.
      const timer = setTimeout(() => {
        if (releasing.current) releasing.current.late = true;
        resolve();
      }, RELEASE_WAIT_MS);
      done = () => {
        clearTimeout(timer);
        releasing.current = null;
        resolve();
      };
    });
    releasing.current = { promise, done, late: false };
    window.history.back();
    return promise;
  }, []);
  useImperativeHandle(ref, () => ({ release }), [release]);

  useEffect(() => {
    if (!dirty || busy) return;
    const onClick = (e: MouseEvent) => {
      const fragment = samePageFragment(e, window.location);
      if (fragment !== null) {
        // A link to a place on this page (the skip link) goes there without a new history
        // entry, which would sit on top of the extra one and be read as a press of Back.
        e.preventDefault();
        if (window.location.hash !== fragment) {
          // Browsers report a move to a fragment like a history step: that report is not a press of Back.
          ownFragment.current = true;
          setTimeout(() => (ownFragment.current = false), FRAGMENT_WAIT_MS);
          window.location.replace(fragment);
        }
        // Already there, nothing moves and nothing is reported: focus goes
        // to the place by hand, as the link would take it.
        let id = fragment.slice(1);
        try {
          id = decodeURIComponent(id);
        } catch {
          // A fragment that is not valid text: looked up as written.
        }
        document.getElementById(id)?.focus();
        return;
      }
      const to = inAppLeaveHref(e, window.location);
      if (to === null) return;
      // Held before the router's own click handler sees it.
      e.preventDefault();
      e.stopPropagation();
      setTarget(to);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, busy]);

  // The extra entry is there exactly while something is unsaved.
  useEffect(() => {
    if (dirty) {
      if (held.current || leaving.current) return;
      held.current = true;
      heldAt.current = pageOf(window.location);
      const add = () => {
        if (held.current) window.history.pushState(null, "", window.location.href);
      };
      // After a release still on its way, so the two never cross.
      if (releasing.current) void releasing.current.promise.then(add);
      else add();
      return;
    }
    // Saved, or undone by hand. A leave through the dialog has dealt with the entry itself.
    if (!leaving.current) void release();
  }, [dirty, release]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (ownFragment.current && !releasing.current && !leaving.current && pageOf(window.location) === heldAt.current) {
        ownFragment.current = false;
        return;
      }
      if (releasing.current?.late && pageOf(window.location) !== heldAt.current) {
        // The step that was owed lands on this page. This one landed elsewhere, so it is
        // not that step: the wait is over, and the router shows where it went.
        releasing.current.done();
        held.current = false;
        leaving.current = false;
        return;
      }
      if (releasing.current) {
        // The step back over the extra entry: same page, nothing for the router to do.
        e.stopImmediatePropagation();
        const late = releasing.current.late;
        releasing.current.done();
        // An entry added for a new edit while the step was owed has just been stepped back over: put it back.
        if (late && held.current) window.history.pushState(null, "", window.location.href);
        return;
      }
      if (leaving.current) {
        if (pageOf(window.location) === heldAt.current && leaveSteps.current < LEAVE_STEPS) {
          // Still an entry for this page (a fragment entry from before the first edit): keep going.
          e.stopImmediatePropagation();
          leaveSteps.current += 1;
          window.history.back();
          return;
        }
        leaving.current = false;
        return;
      }
      if (!held.current) return;
      if (pageOf(window.location) !== heldAt.current) {
        // A jump of several pages: not held, and the router shows where it landed.
        held.current = false;
        return;
      }
      // Back from the extra entry lands on this same page: the router has nothing to do.
      e.stopImmediatePropagation();
      window.history.pushState(null, "", window.location.href);
      setTarget(BACK);
    };
    // Capture, so it runs before the router's own listener on the window.
    window.addEventListener("popstate", onPop, true);
    return () => window.removeEventListener("popstate", onPop, true);
  }, []);

  /** Leave for where the held click or Back press was going. */
  const leaveTo = (to: string | typeof BACK) => () => {
    const wasHeld = held.current;
    held.current = false;
    if (to === BACK) {
      leaving.current = true;
      leaveSteps.current = 0;
      window.history.go(wasHeld ? -2 : -1);
      return;
    }
    // In place of the extra entry, so Back from the next page comes here in one press. Nothing
    // is left set: the router may keep this page and bring it back as it was, and a flag left
    // from this leave would then act on the Back that returned to it.
    navigate(to, wasHeld ? "replace" : "push");
  };

  const shown = changes.slice(0, 5);
  return (
    <Dialog
      open={target !== null}
      onClose={() => {
        if (!saving) setTarget(null);
      }}
      title="Leave without saving?"
      description={`Your changes to ${what} have not been saved. If you leave now they are lost.`}
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={() => setTarget(null)}>
            Keep Editing
          </Button>
          <Button
            variant="danger"
            disabled={saving || busy}
            onClick={() => {
              const to = target;
              setTarget(null);
              if (to !== null) leaveTo(to)();
            }}
          >
            Leave Without Saving
          </Button>
          <Button
            busy={saving}
            busyLabel="Saving…"
            // Another request of the editor's (a delete) is on its way: no save may cross it.
            disabled={busy && !saving}
            onClick={() => {
              const to = target;
              if (to === null) return;
              // Closed either way: a save that fails shows why on the form.
              void onSave(leaveTo(to)).finally(() => setTarget(null));
            }}
          >
            {saveLabel}
          </Button>
        </>
      }
    >
      {shown.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {shown.map((c) => (
            <li key={c}>{c}</li>
          ))}
          {changes.length > shown.length && <li>and {changes.length - shown.length} more</li>}
        </ul>
      )}
    </Dialog>
  );
}
