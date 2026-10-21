// Session-expiry warning, the pure half (owner ruling 2026-10-21, Mike: "add
// the warning", UX audit Q6; WCAG 2.2.6). The hubs' Auth.js session is a
// rolling cookie: every request through the proxy re-issues it, so it ends
// `idle timeout` after the LAST request any tab of the hub made. The page
// can't ask the server how long is left — GET /api/auth/session re-issues the
// cookie too, so asking would itself keep the session alive. Instead each tab
// notes when it last talked to the server (page loads and same-origin
// fetches, which Next's client navigation and Server Actions are), shares the
// latest time with the hub's other tabs through localStorage, and warns a
// couple of minutes before that time plus the idle timeout.

/** localStorage key holding the latest request time (ms) across the hub's tabs. */
export const LAST_ACTIVE_KEY = "sequel.session.lastActive";

/** How long before the end the warning shows, unless the app says otherwise. */
export const DEFAULT_WARN_BEFORE_SECONDS = 120;

/** Static files and images never pass the session proxy, so they don't extend it. */
const NOT_THROUGH_PROXY = /^\/(_next\/(static|image)|favicon\.ico)/;

/** True when a resource-timing entry is a request that extended the session. */
export function extendsSession(
  entry: { name: string; initiatorType: string; responseStatus?: number },
  origin: string,
): boolean {
  if (entry.initiatorType !== "fetch" && entry.initiatorType !== "xmlhttprequest") return false;
  // A failed request is not activity (owner ruling 2026-10-21, Mike: "3-No" to
  // "Should a failed same-origin fetch … count as activity?"): a 4xx or 5xx
  // reply, or a request that never got one (status 0), leaves the countdown
  // alone, so a page polling after its session ended still reaches the
  // signed-out screen. A browser that doesn't report the status counts the
  // request, as before.
  const status = entry.responseStatus;
  if (typeof status === "number" && (status === 0 || status >= 400)) return false;
  let url: URL;
  try {
    url = new URL(entry.name);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  // /api/auth/* skips the proxy. Of those routes only the session read is known
  // to re-issue the cookie (csrf, providers and the rest are not), so only it
  // counts; leaving the others out can only make the warning come early.
  if (url.pathname.startsWith("/api/auth/")) return url.pathname === "/api/auth/session";
  return !NOT_THROUGH_PROXY.test(url.pathname);
}

/** When the warning should show, in ms since the epoch. */
export function warningAt(lastActive: number, idleTimeoutMs: number, warnBeforeMs: number): number {
  return lastActive + idleTimeoutMs - Math.min(warnBeforeMs, idleTimeoutMs);
}

/** When the session ends, in ms since the epoch. */
export function endsAt(lastActive: number, idleTimeoutMs: number): number {
  return lastActive + idleTimeoutMs;
}

/** "1:59" — minutes and seconds left, never negative. */
export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** The warning's sentence, read once when it opens (the countdown itself is not announced). */
export function expiryWarningText(msLeft: number): string {
  const minutes = Math.max(1, Math.round(msLeft / 60_000));
  return `You've been inactive for a while. For your security you'll be signed out in about ${minutes} ${
    minutes === 1 ? "minute" : "minutes"
  }.`;
}

/** Reads the shared latest request time; 0 when absent or storage is blocked. */
export function readLastActive(storage: Pick<Storage, "getItem"> | null | undefined): number {
  try {
    const n = Number(storage?.getItem(LAST_ACTIVE_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Records a request time if it is later than the one stored. */
export function writeLastActive(storage: Pick<Storage, "getItem" | "setItem"> | null | undefined, at: number): void {
  try {
    if (at > readLastActive(storage)) storage?.setItem(LAST_ACTIVE_KEY, String(at));
  } catch {
    // Private window or blocked storage: this tab still warns on its own clock.
  }
}
