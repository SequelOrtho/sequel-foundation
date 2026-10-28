import { checkRateBudget, type FixedWindowStore, type RateDecision } from "../llm/rate-limit";

// Ask the Hub's rate budget (foundation AI-CRAFT §2.2 and §2.6; the Project
// Hub's numbers). Each step of the tool loop is one model call and counts
// once, so a question costs up to MAX_STEPS. Identities are HMAC-hashed by the
// foundation core before they reach the store. The hub supplies the store (a
// Postgres table, or a document store's `rate` namespace); a store that throws
// fails closed — declining a model call is safe.

function envNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const ASSISTANT_RATE_ROUTE = "assistant";

/** Steps per person per window (`AI_RATE_ASSISTANT_PER_IDENTITY`, default 120). */
export const assistantPerIdentity = (env: NodeJS.ProcessEnv = process.env) =>
  envNumber(env, "AI_RATE_ASSISTANT_PER_IDENTITY", 120);
/** Steps per window, everyone combined — the spend ceiling (`AI_RATE_ASSISTANT_GLOBAL`, default 1200). */
export const assistantGlobal = (env: NodeJS.ProcessEnv = process.env) => envNumber(env, "AI_RATE_ASSISTANT_GLOBAL", 1200);
/** The window (`AI_RATE_WINDOW_MS`, default 10 minutes). */
export const assistantWindowMs = (env: NodeJS.ProcessEnv = process.env) => envNumber(env, "AI_RATE_WINDOW_MS", 10 * 60_000);

/** `AI_RATE_SALT`, else `AUTH_SECRET`, else the hub's own fixed fallback. */
export function assistantRateSalt(fallback: string, env: NodeJS.ProcessEnv = process.env): string {
  return env.AI_RATE_SALT || env.AUTH_SECRET || fallback;
}

/**
 * Check and count one Ask the Hub step for this person (a lower-cased sign-in
 * address). A blocked answer carries `retryAfterSeconds` for the 429's
 * Retry-After header.
 */
export function checkAssistantBudget(
  store: FixedWindowStore,
  identity: string,
  opts: { saltFallback: string; now?: Date; env?: NodeJS.ProcessEnv },
): Promise<RateDecision> {
  const env = opts.env ?? process.env;
  return checkRateBudget(
    store,
    {
      route: ASSISTANT_RATE_ROUTE,
      identity,
      perIdentity: assistantPerIdentity(env),
      global: assistantGlobal(env),
      windowMs: assistantWindowMs(env),
      salt: assistantRateSalt(opts.saltFallback, env),
    },
    opts.now ?? new Date(),
  );
}
