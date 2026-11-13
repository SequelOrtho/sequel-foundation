import { entraCredentialIssues, entraUnset } from "./entra-config";

// Microsoft Graph, app-only (client-credentials), for the family: send one
// email, write or remove one all-day calendar event. No SDK — plain fetch
// keeps a Netlify bundle lean. Lifted in v0.39.0 from the three copies the
// hubs carried (project-insights lib/notify/graph.ts → scheduler-hub
// lib/graph/client.ts → incident-event-hub and Sequel_Ortho lib/graph/client.ts).
//
// It uses the SAME Entra app registration as sign-in (AUTH_MICROSOFT_ENTRA_ID_*)
// — one app, no separate mailer registration. Which permission model a hub
// runs under (tenant-wide Graph Mail.Send with admin consent — Scheduler,
// Incident, Market Expansion by owner ruling — or Exchange RBAC for
// Applications scoped to one mailbox, the sequel-app-template default) is the
// hub's own decision and is recorded in its CLAUDE.md; this client is the
// same either way. The sender must be a user or shared mailbox: Graph
// sendMail can't send as an M365 group.
//
// Every call reports an outcome instead of throwing, so one bad mailbox never
// breaks the save that triggered it. Only the error CODE of a Graph / Entra
// error body ever reaches a log: the free text can quote a recipient
// ("Recipient 'x@y' is not resolved") or tenant detail (Sequel_Ortho #236, F1).

export type GraphCreds = { tenantId: string; clientId: string; clientSecret: string };

export type GraphOutcome<T = void> =
  | { ok: true; value: T }
  | { ok: false; status: number; noAccess?: boolean; message: string };

const GRAPH = "https://graph.microsoft.com/v1.0";

/** One budget for the token request AND the send together. An email is
 *  awaited inside the request that saved the record it is about, and a
 *  Netlify function has about ten seconds in all, so a slow Microsoft must
 *  cost the save a bounded wait and then read as "not sent" — never a 504 on
 *  a save that succeeded (Sequel_Ortho #236, F3). */
export const SEND_BUDGET_MS = 6_000;
/** A token is reused until this long before it expires. */
export const TOKEN_SKEW_MS = 60_000;

const clean = (code: string) => code.replace(/[^\w.-]/g, "").slice(0, 64) || "unknown";

/** The error code of a Graph / Entra error body, and nothing else. An
 *  unreadable body reads as "unknown". */
export function errorCodeOf(body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { code?: unknown } | string; error_codes?: unknown };
    if (typeof json.error === "string") return clean(json.error);
    if (json.error && typeof json.error === "object" && typeof json.error.code === "string") return clean(json.error.code);
    if (Array.isArray(json.error_codes) && json.error_codes.length) return `AADSTS${String(json.error_codes[0])}`.replace(/[^\w]/g, "");
  } catch {
    // not JSON
  }
  return "unknown";
}

// Tenant id lives inside the Entra issuer URL:
//   https://login.microsoftonline.com/<tenant-id>/v2.0
export function tenantFromIssuer(issuer: string | undefined): string | null {
  if (!issuer) return null;
  const m = issuer.match(/login\.microsoftonline\.com\/([^/]+)/i);
  return m ? m[1] : null;
}

/** The app-only credentials from the sign-in registration's variables, or
 *  why they can't be used. A placeholder or malformed value fails loudly
 *  here, naming the variable, instead of surfacing later as an opaque
 *  "Invalid URL" / timeout. Never echoes a value. */
export function readGraphCreds(env: Record<string, string | undefined> = process.env): GraphCreds | { error: string } {
  const issues = entraCredentialIssues(env);
  if (issues.length && !entraUnset(env)) {
    return { error: `Entra settings need fixing — ${issues.map((i) => i.message).join(" ")}` };
  }
  const tenantId = tenantFromIssuer(env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);
  const clientId = env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim();
  const clientSecret = env.AUTH_MICROSOFT_ENTRA_ID_SECRET?.trim();
  const missing = [
    !tenantId && "tenant (from AUTH_MICROSOFT_ENTRA_ID_ISSUER)",
    !clientId && "AUTH_MICROSOFT_ENTRA_ID_ID",
    !clientSecret && "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  ].filter(Boolean);
  if (missing.length) return { error: `Graph not configured — missing: ${missing.join(", ")}` };
  return { tenantId: tenantId!, clientId: clientId!, clientSecret: clientSecret! };
}

type CachedToken = { key: string; token: string; expiresAt: number };
let cached: CachedToken | null = null;

/** Forget the cached app token, and the refusal throttle with it; tests
 *  call it between cases. A refused Graph call goes through
 *  `forgetRefusedGraphToken` instead. */
export function resetGraphTokenCache(): void {
  cached = null;
  lastRefusalReset = 0;
}

/** A 401 / 403 from Graph may mean the cached app token has gone stale (a
 *  rotated secret, a consent granted since — Sequel_Ortho #236, F7).
 *  Forgetting it lets the next call request a fresh one — but a permission
 *  that is simply missing would then cost an extra token request on every
 *  refusal, so the forget is throttled to once a minute (Sequel_Ortho #236,
 *  F11; v0.39.2 — the mail path and the hubs' directory searches share it). */
export const REFUSAL_RESET_INTERVAL_MS = 60_000;

let lastRefusalReset = 0;

/** Forgets the cached Graph token, at most once per REFUSAL_RESET_INTERVAL_MS.
 *  Returns whether it did. */
export function forgetRefusedGraphToken(now = Date.now()): boolean {
  if (now - lastRefusalReset < REFUSAL_RESET_INTERVAL_MS) return false;
  lastRefusalReset = now;
  cached = null;
  return true;
}

/** An app-only token, reused across calls until shortly before it expires
 *  (one token round trip per function instance, not per email). Throws on a
 *  refused request — with the status and the error code only. */
export async function getGraphToken(
  creds: GraphCreds,
  fetchImpl: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(SEND_BUDGET_MS),
  now = Date.now(),
): Promise<string> {
  const key = `${creds.tenantId}|${creds.clientId}|${creds.clientSecret}`;
  if (cached && cached.key === key && cached.expiresAt - TOKEN_SKEW_MS > now) return cached.token;
  const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Graph token request failed (${res.status}): ${errorCodeOf(detail)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: unknown };
  if (!json.access_token) throw new Error("Graph token response had no access_token");
  const ttl = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in * 1000 : 0;
  cached = ttl > TOKEN_SKEW_MS ? { key, token: json.access_token, expiresAt: now + ttl } : null;
  return json.access_token;
}

/** Options every Graph call takes. `docsHint` names the hub's runbook in a
 *  403's message ("… with admin consent (docs/entra-setup.md, \"Task emails\")"). */
export type GraphCallOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  docsHint?: string;
};

async function failure(res: Response, permission: string, docsHint: string | undefined): Promise<GraphOutcome<never>> {
  const code = errorCodeOf(await res.text().catch(() => ""));
  // 403 = the permission isn't granted / consented yet (or still propagating);
  // 404 MailboxNotEnabledForRESTAPI / ErrorInvalidUser = no Exchange mailbox.
  const noAccess = res.status === 403 || (res.status === 404 && /MailboxNotEnabled|ErrorInvalidUser/i.test(code));
  const hint =
    res.status === 403
      ? ` — check the Entra app has the ${permission} APPLICATION permission with admin consent${docsHint ? ` (${docsHint})` : ""}`
      : "";
  return { ok: false, status: res.status, noAccess, message: `Graph ${res.status} ${code}${hint}` };
}

function thrown(err: unknown): GraphOutcome<never> {
  return { ok: false, status: 0, message: err instanceof Error ? err.message : String(err) };
}

export type GraphMail = {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  /** The sender is a no-reply mailbox; a Reply goes here instead (a
   *  monitored inbox, or the person whose action the email is about). */
  replyTo?: string[];
};

const recipients = (addresses: string[]) => addresses.map((address) => ({ emailAddress: { address } }));

/** POST /users/<sender>/sendMail as the app. `saveToSentItems` is always
 *  false — a shared no-reply mailbox never fills up with copies. */
export async function sendMail(token: string, sender: string, msg: GraphMail, opts: GraphCallOptions = {}): Promise<GraphOutcome> {
  const { fetchImpl = fetch, signal = AbortSignal.timeout(SEND_BUDGET_MS), docsHint } = opts;
  try {
    const res = await fetchImpl(`${GRAPH}/users/${encodeURIComponent(sender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: msg.subject,
          body: { contentType: "HTML", content: msg.html },
          toRecipients: recipients(msg.to),
          ...(msg.cc?.length ? { ccRecipients: recipients(msg.cc) } : {}),
          ...(msg.replyTo?.length ? { replyTo: recipients(msg.replyTo) } : {}),
        },
        saveToSentItems: false,
      }),
      signal,
    });
    return res.ok ? { ok: true, value: undefined } : failure(res, "Mail.Send", docsHint);
  } catch (err) {
    return thrown(err);
  }
}

// ---------------------------------------------------------------------------
// Calendar (the Scheduler Hub's "Out of office" event)

/** All-day event: inclusive dates in, Graph's exclusive end out. */
export type AllDayEvent = {
  subject: string;
  body: string;
  startDate: string; // YYYY-MM-DD
  endDateExclusive: string; // YYYY-MM-DD
  showAs: "free" | "oof" | "busy";
};

export function allDayEventBody(e: AllDayEvent) {
  return {
    subject: e.subject,
    body: { contentType: "Text", content: e.body },
    isAllDay: true,
    start: { dateTime: `${e.startDate}T00:00:00`, timeZone: "UTC" },
    end: { dateTime: `${e.endDateExclusive}T00:00:00`, timeZone: "UTC" },
    showAs: e.showAs,
    isReminderOn: false,
    // Colleagues who can see this calendar see "Out of office", never why.
    sensitivity: "private",
  };
}

/** Creates the event; `transactionId` makes a retried POST idempotent inside
 *  Graph's window. Resolves to the event id. */
export async function createCalendarEvent(
  token: string,
  mailbox: string,
  e: AllDayEvent,
  transactionId: string,
  opts: GraphCallOptions = {},
): Promise<GraphOutcome<string>> {
  const { fetchImpl = fetch, signal = AbortSignal.timeout(SEND_BUDGET_MS), docsHint } = opts;
  try {
    const res = await fetchImpl(`${GRAPH}/users/${encodeURIComponent(mailbox)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...allDayEventBody(e), transactionId }),
      signal,
    });
    if (!res.ok) return failure(res, "Calendars.ReadWrite", docsHint);
    const json = (await res.json()) as { id?: string };
    return json.id ? { ok: true, value: json.id } : { ok: false, status: res.status, message: "Graph returned no event id" };
  } catch (err) {
    return thrown(err);
  }
}

/** Deletes the event. Already gone (the person deleted it) is the outcome
 *  we wanted, so a 404 reads as ok. */
export async function deleteCalendarEvent(
  token: string,
  mailbox: string,
  eventId: string,
  opts: GraphCallOptions = {},
): Promise<GraphOutcome> {
  const { fetchImpl = fetch, signal = AbortSignal.timeout(SEND_BUDGET_MS), docsHint } = opts;
  try {
    const res = await fetchImpl(`${GRAPH}/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (res.ok || res.status === 404) return { ok: true, value: undefined };
    return failure(res, "Calendars.ReadWrite", docsHint);
  } catch (err) {
    return thrown(err);
  }
}
