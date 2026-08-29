import { createHmac } from "node:crypto";

// Identity-aware fixed-window rate limiting for AI routes — the AI-CRAFT §2.2
// convention as code (an unmetered AI route is an open invoice; a PUBLIC one
// is an open invoice anyone can sign). Canonical copy of the core proven in
// the Incident Hub (incident-event-hub#45); the storage is a one-method seam
// each app implements on its own stack, so the rules are identical on
// Postgres/Neon and Azure SQL / MS SQL.
//
// Shape: two budgets per route — one per identity (a user id/email on authed
// routes, a client IP on public ones) and one global ceiling that bounds
// spend even against a distributed script. Identity keys are HMAC-SHA256
// hashes: no raw user id or IP ever reaches the rate table, which keeps the
// limiter compatible with the strictest privacy posture in the fleet
// (anonymous intake: nothing at rest can link a request to a person).
//
// Failure posture: fail CLOSED. Every metered AI surface in the family is an
// optional assist over a deterministic path, so declining the model call on a
// store error is safe — and failing open would let induced store errors
// bypass the ceiling.

export const RATE_WINDOW_MS_DEFAULT = 10 * 60_000;

export type RateWindowRow = { count: number; windowStart: Date };

// The one method an app implements on its stack: atomically count a hit
// against `key` for the window containing `now` (start a fresh window when
// the stored one is older than `windowMs`) and return the in-window total.
// Reference implementations in docs/AI-CRAFT.md §2.2 — Prisma
// (incident-event-hub `lib/ai-rate-limit-store.ts`) and the MS SQL sketch.
export interface FixedWindowStore {
  bump(key: string, now: Date, windowMs: number): Promise<RateWindowRow>;
}

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateBudget = {
  route: string; // one bucket family per AI surface
  identity: string; // user id/email (authed) or client IP (public) — hashed before storage
  perIdentity: number; // max hits per identity per window
  global?: number; // max hits per route per window, all identities combined
  windowMs?: number;
  salt?: string; // HMAC salt; any stable secret (rows hold only counters regardless)
};

// Netlify puts the real client IP in x-nf-client-connection-ip; generic
// proxies (Azure Front Door / App Service included) use x-forwarded-for.
// A missing IP shares one "unknown" bucket — still bounded by the global cap.
export function clientIpFrom(headers: Headers): string {
  const nf = headers.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

// The stored key for one identity — HMAC so the raw identity never touches
// the database, scoped per route so buckets don't bleed across features.
export function identityRateKey(route: string, identity: string, salt = "sequel-ai-rate-v1"): string {
  const digest = createHmac("sha256", salt).update(`${route}:${identity}`).digest("hex");
  return `${route}:i:${digest.slice(0, 32)}`;
}

export function globalRateKey(route: string): string {
  return `${route}:global`;
}

// Seconds until the window rolls over (floor 1 — a Retry-After of 0 is noise).
export function retryAfterSeconds(
  windowStart: Date,
  now: Date,
  windowMs = RATE_WINDOW_MS_DEFAULT,
): number {
  return Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000));
}

// Check-and-count one request against both budgets. Both buckets are counted
// before either is judged, so a blocked request still burns budget —
// retry-hammering doesn't reset the clock's fairness.
export async function checkRateBudget(
  store: FixedWindowStore,
  budget: RateBudget,
  now = new Date(),
): Promise<RateDecision> {
  const windowMs = budget.windowMs ?? RATE_WINDOW_MS_DEFAULT;
  try {
    const bumps: Array<Promise<RateWindowRow>> = [
      store.bump(identityRateKey(budget.route, budget.identity, budget.salt), now, windowMs),
    ];
    if (budget.global != null) {
      bumps.push(store.bump(globalRateKey(budget.route), now, windowMs));
    }
    const [identity, global] = await Promise.all(bumps);

    if (identity.count > budget.perIdentity) {
      return { allowed: false, retryAfterSeconds: retryAfterSeconds(identity.windowStart, now, windowMs) };
    }
    if (budget.global != null && global && global.count > budget.global) {
      return { allowed: false, retryAfterSeconds: retryAfterSeconds(global.windowStart, now, windowMs) };
    }
    return { allowed: true };
  } catch (err) {
    // Fail closed (see header): no ceiling check, no model call.
    console.error("[llm-rate-limit] store unavailable — declining AI call", err);
    return { allowed: false, retryAfterSeconds: 60 };
  }
}
