// Entra settings sanity check — pure, no I/O. Catches the setup mistakes that
// otherwise fail silently or with a misleading error: a placeholder left in
// (`<tenant-id>` in the issuer made Graph calls throw "Invalid URL" with no
// Microsoft error code — 2026-10-12 go-live), quote marks or line breaks
// pasted with a value, a malformed issuer, a client ID that isn't a GUID.
//
// Lifted from the Scheduler Hub and the Market Expansion Hub (each hub's
// lib/auth/entra-config.ts, identical copies) in v0.39.0. Used by a hub's
// sign-in setup (lib/auth/index.ts registers the Microsoft provider only when
// the credentials pass; /auth/signin lists the problems instead of offering a
// button that would fail) and by the Graph transport here (readGraphCreds).
// Messages name the variable and the fix, never a value — the secret in
// particular is never echoed.

export type EntraIssue = { variable: string; message: string };

type Env = Record<string, string | undefined>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const ISSUER = /^https:\/\/login\.microsoftonline\.com\/([^/]+)\/v2\.0\/?$/i;
// Template text people leave behind (only checked on non-secret values: a
// random secret could legitimately contain any of these letters).
const PLACEHOLDER_WORDS = /tenant[-_ ]?id|client[-_ ]?id|your[-_ ]|placeholder|x{4,}|changeme/i;

const ISSUER_FORMAT = "https://login.microsoftonline.com/<Directory (tenant) ID>/v2.0";

function shapeIssue(variable: string, raw: string, opts: { secret?: boolean } = {}): EntraIssue | null {
  if (/[<>]/.test(raw) || (!opts.secret && PLACEHOLDER_WORDS.test(raw))) {
    return { variable, message: `${variable} still contains a placeholder — replace it with the real value.` };
  }
  if (/^\s*["']|["']\s*$/.test(raw)) {
    return { variable, message: `${variable} is wrapped in quote marks — remove them.` };
  }
  if (/\s/.test(raw.trim()) || /[\r\n]/.test(raw)) {
    return { variable, message: `${variable} contains a space or line break — re-paste it as one line.` };
  }
  return null;
}

// The three values sign-in and Graph both need. Empty list = usable.
export function entraCredentialIssues(env: Env = process.env): EntraIssue[] {
  const id = env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const secret = env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  const issuer = env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  const issues: EntraIssue[] = [];

  if (!id?.trim()) issues.push({ variable: "AUTH_MICROSOFT_ENTRA_ID_ID", message: "AUTH_MICROSOFT_ENTRA_ID_ID is not set." });
  else {
    const shape = shapeIssue("AUTH_MICROSOFT_ENTRA_ID_ID", id);
    if (shape) issues.push(shape);
    else if (!GUID.test(id.trim())) {
      issues.push({
        variable: "AUTH_MICROSOFT_ENTRA_ID_ID",
        message: "AUTH_MICROSOFT_ENTRA_ID_ID should be the Application (client) ID — a GUID like 1234abcd-….",
      });
    }
  }

  if (!secret?.trim()) {
    issues.push({ variable: "AUTH_MICROSOFT_ENTRA_ID_SECRET", message: "AUTH_MICROSOFT_ENTRA_ID_SECRET is not set." });
  } else {
    const shape = shapeIssue("AUTH_MICROSOFT_ENTRA_ID_SECRET", secret, { secret: true });
    if (shape) issues.push(shape);
  }

  if (!issuer?.trim()) {
    issues.push({ variable: "AUTH_MICROSOFT_ENTRA_ID_ISSUER", message: `AUTH_MICROSOFT_ENTRA_ID_ISSUER is not set — use ${ISSUER_FORMAT}.` });
  } else {
    const shape = shapeIssue("AUTH_MICROSOFT_ENTRA_ID_ISSUER", issuer);
    const m = issuer.trim().match(ISSUER);
    if (shape) issues.push({ ...shape, message: `${shape.message} Format: ${ISSUER_FORMAT}.` });
    else if (!m) {
      issues.push({ variable: "AUTH_MICROSOFT_ENTRA_ID_ISSUER", message: `AUTH_MICROSOFT_ENTRA_ID_ISSUER must look like ${ISSUER_FORMAT}.` });
    } else if (/^(common|organizations|consumers)$/i.test(m[1])) {
      issues.push({
        variable: "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
        message: "AUTH_MICROSOFT_ENTRA_ID_ISSUER must name your tenant, not /common/ — use the Directory (tenant) ID.",
      });
    } else if (!GUID.test(m[1]) && !DOMAIN.test(m[1])) {
      issues.push({
        variable: "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
        message: "The tenant in AUTH_MICROSOFT_ENTRA_ID_ISSUER should be the Directory (tenant) ID (a GUID).",
      });
    }
  }
  return issues;
}

// Everything sign-in needs, including the tenant allow-list: a placeholder
// there refuses every sign-in with "not permitted", which reads like a
// permissions problem rather than a typo.
export function entraSignInIssues(env: Env = process.env): EntraIssue[] {
  const issues = entraCredentialIssues(env);
  const tenants = env.AUTH_ALLOWED_TENANTS;
  if (tenants?.trim()) {
    for (const t of tenants.split(",").map((s) => s.trim()).filter(Boolean)) {
      const shape = shapeIssue("AUTH_ALLOWED_TENANTS", t);
      if (shape || !GUID.test(t)) {
        issues.push({
          variable: "AUTH_ALLOWED_TENANTS",
          message: "AUTH_ALLOWED_TENANTS should be the Directory (tenant) ID (a GUID) — otherwise every sign-in is refused.",
        });
        break;
      }
    }
  }
  return issues;
}

// True when nothing Entra is set at all (a fresh setup) — callers show the
// plain "not configured yet" notice rather than a list of three "not set"s.
export function entraUnset(env: Env = process.env): boolean {
  return !env.AUTH_MICROSOFT_ENTRA_ID_ID && !env.AUTH_MICROSOFT_ENTRA_ID_SECRET && !env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
}
