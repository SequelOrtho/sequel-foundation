import { createHmac, timingSafeEqual } from "node:crypto";

// No-role sign-in policy (DESIGN-CONVENTIONS §4 "No role, no entry"): under
// AUTH_MODE=entra, a person Microsoft signs in who has no role in the app is
// refused with HTTP 403 and the family message below, the attempt is logged
// (an admin queue of people waiting for a role), and a "Request access"
// button emails the app's administrators — at most once a day per person.
//
// Shape: everything here is pure or a seam. Each app owns its role lookup
// (what counts as "has a role" differs per hub), its storage (one
// AccessRequestStore on its own stack) and its mail transport (its Graph
// sender behind NOTIFY_MODE). The rules — the wording, the pass, the
// throttle, the email — are identical across the fleet.
//
// Why a pass: the refusal happens in Auth.js's signIn callback, before any
// session exists, so the 403 page cannot ask "who is this?". The callback
// hands the page a short-lived HMAC-signed pass (keyed by AUTH_SECRET) naming
// the refused identity; the page needs it only to offer "Request access".
// Nothing in it is secret (the person's own email and name) — the signature
// only stops a forged pass from emailing admins on someone else's behalf.

export const NO_ROLE_PATH = "/auth/no-access";
export const NO_ROLE_REQUEST_PATH = "/auth/no-access/request";

// The family wording, verbatim (owner, Oct 2026). appName is the hub's full
// display name, e.g. "Sequel Scheduler Hub".
export function noRoleMessage(appName: string): string {
  return `Your account doesn’t have a role in ${appName} yet. Contact the System Administrator to request access, then sign in again.`;
}

// "no-role" is the policy refusal (403). "unavailable" is the role lookup
// failing (database down): the gate fails closed, but must not tell a
// legitimate user they have no role — that is a 503 with a retry message.
export type NoRoleReason = "no-role" | "unavailable";

export function noRoleReasonFrom(raw: string | null | undefined): NoRoleReason {
  return raw === "unavailable" ? "unavailable" : "no-role";
}

export function noRoleStatus(reason: NoRoleReason): 403 | 503 {
  return reason === "unavailable" ? 503 : 403;
}

// The page itself, not its POST sub-route — the proxy answers this path with
// the status above so the refusal is a real 403, not a 200 page saying no.
export function isNoRolePath(pathname: string): boolean {
  return pathname === NO_ROLE_PATH || pathname === `${NO_ROLE_PATH}/`;
}

// ---------------------------------------------------------------------------
// The pass

export type NoRolePass = { email: string; name: string | null; at: Date };

// Long enough to read the page and press the button; short enough that a
// leaked URL is soon useless.
export const NO_ROLE_PASS_TTL_MS = 60 * 60_000;

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64url = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const sign = (body: string, secret: string) =>
  createHmac("sha256", `sequel-no-role-v1:${secret}`).update(body).digest("base64url");

export function signNoRolePass(
  who: { email: string; name?: string | null },
  secret: string,
  now: Date = new Date(),
): string {
  if (!secret) throw new Error("signNoRolePass: secret is required (AUTH_SECRET)");
  const body = b64url(
    JSON.stringify({ e: who.email.trim().toLowerCase(), n: who.name?.trim() || null, t: now.getTime() }),
  );
  return `${body}.${sign(body, secret)}`;
}

// Null for anything missing, forged, malformed or expired — the page then
// renders the message without the button.
export function readNoRolePass(
  token: string | null | undefined,
  secret: string | null | undefined,
  now: Date = new Date(),
  ttlMs: number = NO_ROLE_PASS_TTL_MS,
): NoRolePass | null {
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(body, secret));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const raw = JSON.parse(unb64url(body)) as { e?: unknown; n?: unknown; t?: unknown };
    if (typeof raw.e !== "string" || !raw.e.includes("@") || typeof raw.t !== "number") return null;
    const age = now.getTime() - raw.t;
    if (age < 0 || age > ttlMs) return null;
    return { email: raw.e, name: typeof raw.n === "string" && raw.n ? raw.n : null, at: new Date(raw.t) };
  } catch {
    return null;
  }
}

// What the signIn callback returns. Auth.js treats a string as a redirect
// and resolves a relative one against AUTH_URL.
export function noRoleRedirect(pass: string): string {
  return `${NO_ROLE_PATH}?t=${encodeURIComponent(pass)}`;
}

export const NO_ROLE_UNAVAILABLE_REDIRECT = `${NO_ROLE_PATH}?reason=unavailable`;

// ---------------------------------------------------------------------------
// The log and the request

export type AccessRequestRow = {
  email: string; // lower-cased sign-in identity
  name: string | null;
  attempts: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  requestedAt: Date | null; // last press of "Request access"
  notifiedAt: Date | null; // last admin email actually claimed
};

// The one seam each app implements on its stack (Prisma: an AccessRequest
// model keyed by email — see DESIGN-CONVENTIONS §4 for the reference).
export interface AccessRequestStore {
  // Upsert by email: create with attempts 1, else attempts+1 and
  // lastAttemptAt/name refreshed.
  recordAttempt(attempt: { email: string; name: string | null; at: Date }): Promise<void>;
  // Atomically stamp requestedAt=now and, when notifiedAt is null or older
  // than `notifyAfter`, notifiedAt=now. True only when notifiedAt was
  // stamped — the caller then sends the email. The row exists (an attempt
  // was recorded first); create it if not.
  claimRequest(request: { email: string; name: string | null; now: Date; notifyAfter: Date }): Promise<boolean>;
  // Undo a claim whose email could not be sent, so the person can retry.
  releaseRequest(email: string, notifiedAt: Date): Promise<void>;
}

// One admin email a day per person, however often they press the button.
export const ACCESS_REQUEST_NOTIFY_INTERVAL_MS = 24 * 60 * 60_000;

// Log a refused sign-in. Never throws: a logging failure must not turn a
// 403 into a 500. The console line is the floor when the store is down.
export async function recordNoRoleAttempt(
  store: AccessRequestStore,
  attempt: { email: string; name?: string | null; at?: Date },
  appName: string,
): Promise<void> {
  const at = attempt.at ?? new Date();
  const email = attempt.email.trim().toLowerCase();
  console.warn(`[access] no-role sign-in refused app="${appName}" email="${email}" at=${at.toISOString()}`);
  try {
    await store.recordAttempt({ email, name: attempt.name?.trim() || null, at });
  } catch (err) {
    console.error("[access] could not record the no-role attempt", err);
  }
}

export type AccessRequestMail = { to: string[]; subject: string; html: string; text: string };

// "sent" = delivered; "logged" = the app's mail mode is off (the request is
// on the queue, nobody was emailed); "failed" = the transport errored.
export type AccessMailOutcome = "sent" | "logged" | "failed";

export type RequestAccessOutcome =
  | "sent" // admins emailed now
  | "recorded" // on the queue; mail is off or there is no admin address
  | "already" // already requested within the interval — no second email
  | "failed" // could not send; the claim was released so a retry works
  | "expired"; // the pass is missing, forged or stale — sign in again

export async function requestAccess(opts: {
  store: AccessRequestStore;
  pass: NoRolePass;
  appName: string;
  adminEmails: () => Promise<string[]>;
  send: (mail: AccessRequestMail) => Promise<AccessMailOutcome>;
  reviewUrl?: string; // where an admin assigns roles, absolute
  now?: Date;
  intervalMs?: number;
  timeZone?: string;
}): Promise<RequestAccessOutcome> {
  const now = opts.now ?? new Date();
  const { email, name } = opts.pass;
  let claimed: boolean;
  try {
    claimed = await opts.store.claimRequest({
      email,
      name,
      now,
      notifyAfter: new Date(now.getTime() - (opts.intervalMs ?? ACCESS_REQUEST_NOTIFY_INTERVAL_MS)),
    });
  } catch (err) {
    console.error("[access] could not record the access request", err);
    return "failed";
  }
  if (!claimed) return "already";

  let to: string[];
  try {
    to = uniqueEmails(await opts.adminEmails());
  } catch (err) {
    console.error("[access] could not list administrators", err);
    await safeRelease(opts.store, email, now);
    return "failed";
  }
  if (to.length === 0) {
    console.warn(`[access] access request from ${email} for "${opts.appName}" — no administrator address to email`);
    return "recorded";
  }

  const mail = { to, ...accessRequestEmail({ appName: opts.appName, email, name, at: now, reviewUrl: opts.reviewUrl, timeZone: opts.timeZone }) };
  let outcome: AccessMailOutcome;
  try {
    outcome = await opts.send(mail);
  } catch (err) {
    console.error("[access] access-request email failed", err);
    outcome = "failed";
  }
  if (outcome === "failed") {
    await safeRelease(opts.store, email, now);
    return "failed";
  }
  return outcome === "sent" ? "sent" : "recorded";
}

async function safeRelease(store: AccessRequestStore, email: string, at: Date) {
  try {
    await store.releaseRequest(email, at);
  } catch (err) {
    console.error("[access] could not release the access-request claim", err);
  }
}

export function uniqueEmails(list: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const raw of list) {
    const e = raw?.trim().toLowerCase();
    if (e && e.includes("@")) seen.add(e);
  }
  return [...seen].sort();
}

// The query value the request route redirects back with; anything unknown
// reads as no outcome (the button shows).
export function requestOutcomeFrom(raw: string | null | undefined): RequestAccessOutcome | null {
  return raw === "sent" || raw === "recorded" || raw === "already" || raw === "failed" || raw === "expired"
    ? raw
    : null;
}

// The admin queue: people refused for lack of a role who still have none,
// most recent first. `hasRole` is the app's own check against its role data.
export function pendingAccessRequests<R extends Pick<AccessRequestRow, "email" | "lastAttemptAt">>(
  rows: readonly R[],
  hasRole: (email: string) => boolean,
): R[] {
  return rows.filter((r) => !hasRole(r.email)).sort((a, b) => b.lastAttemptAt.getTime() - a.lastAttemptAt.getTime());
}

// ---------------------------------------------------------------------------
// The admin email

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The family's three entities are all US Central.
export const ACCESS_TIME_ZONE = "America/Chicago";

export function accessRequestEmail(opts: {
  appName: string;
  email: string;
  name: string | null;
  at: Date;
  reviewUrl?: string;
  timeZone?: string;
}): { subject: string; html: string; text: string } {
  const who = opts.name ? `${opts.name} (${opts.email})` : opts.email;
  const when = opts.at.toLocaleString("en-US", {
    timeZone: opts.timeZone ?? ACCESS_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const subject = `Access request: ${opts.name ?? opts.email} — ${opts.appName}`;
  const lines = [
    `${who} signed in to ${opts.appName} with Microsoft but has no role, and is asking for access.`,
    `Requested: ${when}`,
    opts.reviewUrl
      ? `To grant access, assign a role here: ${opts.reviewUrl}`
      : `To grant access, assign them a role in ${opts.appName}.`,
    `They will be let in the next time they sign in. If they should not have access, no action is needed.`,
  ];
  const html = [
    `<p><strong>${escapeHtml(who)}</strong> signed in to ${escapeHtml(opts.appName)} with Microsoft but has no role, and is asking for access.</p>`,
    `<p>Requested: ${escapeHtml(when)}</p>`,
    opts.reviewUrl
      ? `<p><a href="${escapeHtml(opts.reviewUrl)}">Assign a role</a></p>`
      : `<p>To grant access, assign them a role in ${escapeHtml(opts.appName)}.</p>`,
    `<p>They will be let in the next time they sign in. If they should not have access, no action is needed.</p>`,
    `<p style="color:#6b7280;font-size:12px">You receive this because you are a System Administrator of ${escapeHtml(opts.appName)}. Each person can trigger at most one of these a day.</p>`,
  ].join("\n");
  return { subject, html, text: lines.join("\n\n") };
}
