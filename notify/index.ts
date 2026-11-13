import { forgetRefusedGraphToken, getGraphToken, readGraphCreds, SEND_BUDGET_MS, sendMail, type GraphCreds } from "../graph/client";

// The family email seam (v0.39.0; the Scheduler Hub's pattern, as carried by
// the Market Expansion Hub's lib/notify/mail.ts):
//
//   NOTIFY_MODE unset / off  — log what would be sent (subject and a
//                              recipient COUNT, never an address) and send
//                              nothing, so local development and CI need no
//                              Graph secrets;
//   NOTIFY_MODE=graph        — send through Microsoft Graph as NOTIFY_FROM
//                              with the sign-in registration's app-only
//                              credentials.
//
// Never throws: a mail failure must never break the save that triggered it.
// No log line carries a recipient address — counts only (Sequel_Ortho #235,
// F9 / P1) — and only the error CODE of a Graph / Entra body (#236, F1). A
// hub passes a short `ref` (a task id, a request id) so a logged subject that
// quotes free text can still be traced without the text (#236, P2).

export type EmailMessage = {
  to: string[];
  cc?: string[];
  subject: string;
  /** The plain-text half, for a hub that keeps one; not sent by Graph. */
  text?: string;
  html: string;
  replyTo?: string[];
};

export type DeliveryMode = "off" | "graph";

/** `graph` in any case, with surrounding whitespace, is graph; anything else
 *  — unset, empty, off, a typo — is off (Sequel_Ortho #236, P1). */
export function resolveDeliveryMode(raw: string | undefined): DeliveryMode {
  return raw?.trim().toLowerCase() === "graph" ? "graph" : "off";
}

/** A comma-separated address list from the environment, trimmed. */
export function parseAddressList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDomains(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

/** The addresses an email-domain allow-list (AUTH_ALLOWED_EMAIL_DOMAINS,
 *  comma-separated, case-insensitive) admits — every one when no list is
 *  set. The family rule since the Market Expansion Hub's task emails (owner
 *  ruling 2026-11-13, Mike: "2-limit to allowed domains"): nobody outside
 *  those domains can sign in, so nobody there holds a task or an alert, and
 *  the company mailbox never writes to an outside address a signed-in person
 *  typed. */
export function withinAllowedDomains(addresses: readonly string[], domainsConfig: string | undefined): string[] {
  const domains = parseDomains(domainsConfig);
  if (domains.length === 0) return [...addresses];
  return addresses.filter((a) => {
    // One "@" exactly, with a local part before it and no character a single
    // bare address never carries: "x@sequelortho.com@evil.com" read as
    // sequelortho.com when the domain was what followed the FIRST "@", and
    // a display-name form ("Ana <ana@evil.com>") is not an address at all.
    const at = a.lastIndexOf("@");
    if (at <= 0 || a.indexOf("@") !== at || /[\s<>,;"()]/.test(a)) return false;
    const domain = a.slice(at + 1).toLowerCase();
    return !!domain && domains.includes(domain);
  });
}

export type EmailOutcome = "logged" | "sent" | "failed";

export type GraphSendSetup = { ok: true; sender: string; creds: GraphCreds } | { ok: false; issue: string };

/** What a Graph send needs from the environment — the sender and the Entra
 *  values — or why it can't run (read once). */
export function graphSendSetup(env: Record<string, string | undefined> = process.env): GraphSendSetup {
  const sender = env.NOTIFY_FROM?.trim();
  if (!sender) return { ok: false, issue: "NOTIFY_MODE=graph but NOTIFY_FROM is not set" };
  const creds = readGraphCreds(env);
  if ("error" in creds) return { ok: false, issue: creds.error };
  return { ok: true, sender, creds };
}

/** Null when a Graph send could run, else the setting to fix — for a
 *  settings page or a health check. */
export function graphSendIssue(env: Record<string, string | undefined> = process.env): string | null {
  const setup = graphSendSetup(env);
  return setup.ok ? null : setup.issue;
}

export type DeliverOptions = {
  /** The environment to read NOTIFY_MODE, NOTIFY_FROM, the Entra values and
   *  AUTH_ALLOWED_EMAIL_DOMAINS from. Default process.env. */
  env?: Record<string, string | undefined>;
  /** A short id for the log lines (a task id), so a subject quoting free
   *  text can be traced without the text. Never an address. */
  ref?: string;
  /** The hub's runbook, named in a 403's message. */
  docsHint?: string;
  /** The log prefix; default "[notify:email]". */
  tag?: string;
  fetchImpl?: typeof fetch;
  /** The budget for the token request and the send together; default
   *  SEND_BUDGET_MS. */
  budgetMs?: number;
};

/** Sends (or, off, logs) one email. Recipients outside the allow-list are
 *  left out first; an email with nobody left is logged and counts as
 *  "logged". Never throws. */
export async function deliverEmail(message: EmailMessage, opts: DeliverOptions = {}): Promise<EmailOutcome> {
  const env = opts.env ?? process.env;
  const tag = opts.tag ?? "[notify:email]";
  const ref = opts.ref ? ` [${opts.ref}]` : "";
  const to = withinAllowedDomains(message.to, env.AUTH_ALLOWED_EMAIL_DOMAINS);
  const cc = message.cc?.length ? withinAllowedDomains(message.cc, env.AUTH_ALLOWED_EMAIL_DOMAINS) : [];
  const dropped = message.to.length - to.length + (message.cc?.length ?? 0) - cc.length;
  if (dropped > 0) console.warn(`${tag} "${message.subject}"${ref}: ${dropped} recipient(s) outside AUTH_ALLOWED_EMAIL_DOMAINS left out`);
  if (to.length === 0) {
    if (message.to.length === 0) console.info(`${tag} nothing to send for "${message.subject}"${ref}: no recipients`);
    return "logged";
  }
  const count = `${to.length + cc.length} recipient(s)`;
  if (resolveDeliveryMode(env.NOTIFY_MODE) === "off") {
    console.info(`[notify:off] would email "${message.subject}"${ref} to ${count}`);
    return "logged";
  }
  try {
    const setup = graphSendSetup(env);
    if (!setup.ok) {
      console.warn(`${tag} not sent: "${message.subject}"${ref} to ${count} — ${setup.issue}`);
      return "failed";
    }
    // The token request and the send share one budget, so a slow Microsoft
    // costs the save that triggered this at most the budget.
    const signal = AbortSignal.timeout(opts.budgetMs ?? SEND_BUDGET_MS);
    const fetchImpl = opts.fetchImpl ?? fetch;
    const token = await getGraphToken(setup.creds, fetchImpl, signal);
    const out = await sendMail(
      token,
      setup.sender,
      { to, cc: cc.length ? cc : undefined, subject: message.subject, html: message.html, replyTo: message.replyTo },
      { fetchImpl, signal, docsHint: opts.docsHint },
    );
    if (!out.ok) {
      // A 401 / 403 may mean the cached app token is no longer good for this —
      // consent granted after it was issued, or revoked since — so the next
      // send asks Entra for a fresh one; at most once a minute, so a permission
      // that is simply missing doesn't cost a token request per refusal.
      if (out.status === 401 || out.status === 403) forgetRefusedGraphToken();
      // out.message carries the status, Graph's error CODE and the permission
      // to check — never Graph's free text, which can quote a recipient.
      console.warn(`${tag} not sent: "${message.subject}"${ref} to ${count} — ${out.message}`);
      return "failed";
    }
    console.info(`${tag} sent "${message.subject}"${ref} to ${count}`);
    return "sent";
  } catch (err) {
    console.warn(`${tag} not sent: "${message.subject}"${ref} to ${count} — ${err instanceof Error ? err.message : String(err)}`);
    return "failed";
  }
}
