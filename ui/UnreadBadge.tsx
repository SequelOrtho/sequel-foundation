"use client";

import { useEffect } from "react";
import { badgeText, badgeTitle, iconBadgeGeometry, ICON_BADGE_MAX } from "./tab-badge";

// The unread count in the browser tab (DESIGN-CONVENTIONS §3 "In-app alerts";
// owner ruling 2026-10-22, Mike: "1-yes, 2-yes"). Mount <UnreadBadge count={n}/>
// beside the header bell, fed by the same feed as the bell, and the tab shows
//   - the count in front of the title: "(3) Alerts · Missed Punch Hub" — the
//     part every browser shows and screen readers announce, and
//   - the count drawn on the tab's icon: the hub's icon with a red "3" (one
//     digit, then "9+") — the part you see when tabs are too narrow for titles.
// It renders nothing. Count only, never content (ruling "6-yes"). Sign Out and
// the signed-out screen clear it (SignOutForm / SessionWatch call
// clearUnreadBadge); see clearUnreadBadge for how long each keeps it off.
//
// Next rewrites the title on every navigation and re-renders the <head> icon
// links, so one MutationObserver on <head> puts the count back whenever either
// changes. A page that holds its own title (a DocumentTitle that restores a
// title it didn't set) must compare titles through `stripBadge`, or the two
// take turns rewriting it; the write budget below stops such a loop from
// spinning the page.
//
// One <UnreadBadge> per page (the bell's); with two, the last count set wins.
// A Sign Out that never leaves the page (the person chose Stay on an
// unsaved-changes prompt) keeps the count off until their next click or
// keystroke elsewhere on the page at least ten seconds later; a double-click or
// typing while the sign-out is still leaving never brings it back.
//
// The installed-app taskbar badge (navigator.setAppBadge) is not used: the hubs
// are not installable apps (owner ruling 2026-10-22, "3-lets hold off on this
// for now as what we get from 1 and 2 is good enough").

const ORIGINAL = "data-unread-original";
const BADGED = "data-unread-badged";
const ICON_SIZE = 32;
/** Fill of the favicon's count circle: the family danger red (palette `danger`). */
export const ICON_BADGE_FILL = "#e51919";
/** At most this many writes per second; past it the badge stands aside. */
const WRITE_BUDGET = 20;
/**
 * After Sign Out is pressed, input this soon is the sign-out still leaving (a
 * double-click, typing during a slow sign-out), never a cancelled one.
 */
export const SIGN_OUT_RESUME_GRACE_MS = 10_000;
/** Marks the Sign Out form, whose own clicks never bring the count back. */
export const SIGN_OUT_FORM_ATTR = "data-sign-out";

let mounted = 0;
let wanted = 0;
let suppressed = false;
let paused = false; // Sign Out submitted; lifted by the next input if the page stays
let pausedAt = 0;
let resumeListening = false;
let lastTitle: string | null = null; // the title this module last wrote
let observer: MutationObserver | null = null;
let scheduled = false;
let drawToken = 0;
let writes: number[] = [];
let strips: number[] = []; // the clear's own budget, so a spent one never keeps a count up
const drawn = new Map<string, string>(); // `${src}|${text}` → data URL

function current(): number {
  return suppressed || paused ? 0 : wanted;
}

function spend(log: number[]): number[] | null {
  const now = Date.now();
  const recent = log.filter((t) => now - t < 1000);
  if (recent.length >= WRITE_BUDGET) return null;
  recent.push(now);
  return recent;
}

function withinBudget(): boolean {
  const next = spend(writes);
  if (next) writes = next;
  return next !== null;
}

function withinStripBudget(): boolean {
  const next = spend(strips);
  if (next) strips = next;
  return next !== null;
}

function iconLinks(doc: Document): HTMLLinkElement[] {
  return Array.from(doc.head?.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]') ?? []);
}

function applyTitle(doc: Document) {
  const next = badgeTitle(doc.title, current());
  // Taking the count off after Sign Out has a budget of its own: a loop that
  // spent the main one must not leave the last person's count in the tab, and a
  // page that keeps putting a count back still can't spin the tab.
  if (doc.title === next) return;
  if (suppressed || paused ? withinStripBudget() : withinBudget()) {
    lastTitle = next;
    doc.title = next;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("icon did not load"));
    img.src = src;
  });
}

/** The hub's icon with the count circle drawn on it, as a PNG data URL; null where the browser can't draw. */
async function drawIcon(doc: Document, src: string, text: string): Promise<string | null> {
  const key = `${src}|${text}`;
  const hit = drawn.get(key);
  if (hit) return hit;
  const canvas = doc.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return null;
  try {
    const img = await loadImage(src);
    ctx.drawImage(img, 0, 0, ICON_SIZE, ICON_SIZE);
  } catch {
    // No icon to draw on: the circle alone still says there is something unread.
  }
  const { cx, cy, r, font } = iconBadgeGeometry(ICON_SIZE);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = ICON_BADGE_FILL;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${text.length > 1 ? Math.round(font * 0.75) : font}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 1);
  let url: string;
  try {
    url = canvas.toDataURL("image/png");
  } catch {
    return null; // a cross-origin icon taints the canvas; leave the icon alone
  }
  drawn.set(key, url);
  return url;
}

function applyIcons(doc: Document) {
  const text = badgeText(current(), ICON_BADGE_MAX);
  const token = ++drawToken;
  for (const link of iconLinks(doc)) {
    const href = link.getAttribute("href") ?? "";
    // A link we didn't badge (new, or Next put the original back) carries the original.
    if (link.getAttribute(BADGED) !== href) {
      link.setAttribute(ORIGINAL, href);
      link.removeAttribute(BADGED);
    }
    const original = link.getAttribute(ORIGINAL) ?? href;
    if (!text) {
      if (link.hasAttribute(BADGED)) {
        link.removeAttribute(BADGED);
        link.setAttribute("href", original);
      }
      continue;
    }
    void drawIcon(doc, original, text).then((url) => {
      if (!url || token !== drawToken || !link.isConnected) return;
      if (link.getAttribute("href") === url) return;
      if (!withinBudget()) return;
      link.setAttribute(BADGED, url);
      link.setAttribute("href", url);
    });
  }
}

function apply(doc: Document = document) {
  applyTitle(doc);
  applyIcons(doc);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    if (mounted > 0 || suppressed || paused) apply();
  });
}

function isOwnWrite(r: MutationRecord): boolean {
  // Our icon writes change only `href` on a link we marked.
  if (r.type === "attributes") {
    const el = r.target as Element;
    return el.getAttribute?.(BADGED) === el.getAttribute?.("href");
  }
  // Our title write, while the title still reads what we wrote.
  const titleEl = r.target.nodeName === "TITLE" ? r.target : r.target.parentNode;
  return titleEl?.nodeName === "TITLE" && lastTitle !== null && document.title === lastTitle;
}

function onHeadChange(records: MutationRecord[]) {
  if (records.some((r) => !isOwnWrite(r))) schedule();
}

function start() {
  if (observer || typeof MutationObserver === "undefined" || !document.head) return;
  observer = new MutationObserver(onHeadChange);
  observer.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["href"] });
}

function stop() {
  observer?.disconnect();
  observer = null;
}

/** Set the count the tab shows (UnreadBadge calls this; exported for stores outside React). */
export function setUnreadCount(count: number): void {
  wanted = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  if (typeof document !== "undefined") apply();
}

/**
 * Take the count off the tab. The signed-out screen calls it with no options:
 * the count stays off for good on this page, so a shared computer's next
 * person never sees the last person's count. Sign Out calls it with
 * `{ untilInput: true }`: the count stays off while the sign-out leaves the
 * page, and comes back only at a click or keystroke away from the Sign Out
 * form more than SIGN_OUT_RESUME_GRACE_MS later — that is, only when the
 * sign-out was cancelled and the page stayed. SignOutForm and SessionWatch
 * already call it.
 */
export function clearUnreadBadge(options: { untilInput?: boolean } = {}): void {
  if (options.untilInput) {
    paused = true;
    pausedAt = Date.now();
    if (!resumeListening && typeof document !== "undefined") {
      resumeListening = true;
      const resume = (event: Event) => {
        // Input on Sign Out itself, or soon after it, is the sign-out still leaving.
        const target = event.target as Element | null;
        if (target?.closest?.(`[${SIGN_OUT_FORM_ATTR}]`)) return;
        if (Date.now() - pausedAt < SIGN_OUT_RESUME_GRACE_MS) return;
        document.removeEventListener("pointerdown", resume, true);
        document.removeEventListener("keydown", resume, true);
        resumeListening = false;
        paused = false;
        apply();
      };
      document.addEventListener("pointerdown", resume, true);
      document.addEventListener("keydown", resume, true);
    }
  } else {
    suppressed = true;
  }
  if (typeof document !== "undefined") apply();
}

/** Test seam: forget every module state. */
export function resetUnreadBadgeForTests(): void {
  stop();
  mounted = 0;
  wanted = 0;
  suppressed = false;
  paused = false;
  pausedAt = 0;
  lastTitle = null;
  scheduled = false;
  writes = [];
  strips = [];
  drawn.clear();
}

/** Shows `count` in the tab title and on the tab's icon while mounted. Renders nothing. */
export function UnreadBadge({ count }: { count: number }) {
  useEffect(() => {
    mounted += 1;
    start();
    return () => {
      mounted -= 1;
      if (mounted <= 0) {
        mounted = 0;
        wanted = 0;
        apply();
        stop();
      }
    };
  }, []);
  useEffect(() => {
    setUnreadCount(count);
  }, [count]);
  return null;
}
