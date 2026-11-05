// Optional check: is the person a member of the company's Claude
// organization? It reads Anthropic's Compliance API member list
// (Claude Enterprise). Claude's sign-in does not say which Claude account is
// connecting, so a seat proves membership, not which account connected; keep
// a company-account confirmation on the consent page beside it.
//
// The users list needs the key scope `read:compliance_user_data`, which also
// reads the organization's chats and files. Many hubs will leave it off: with
// no key or org id every answer is "not-configured" and callers let people
// through on the hub's own checks. A list that can't be read answers
// "unavailable": refuse NEW connections on it, never end an existing one.

export type ClaudeMembership = "member" | "not-member" | "unavailable" | "not-configured";

export type ClaudeMemberCheck = {
  readonly configured: boolean;
  membership(emails: readonly string[], now?: number): Promise<ClaudeMembership>;
  /** Forget the cached list (tests, or after a config change). */
  reset(): void;
};

export type ClaudeMemberCheckOptions = {
  apiKey?: string | null;
  orgId?: string | null;
  fetchImpl?: typeof fetch;
  /** Where refusals are logged. Never given the key or an email. Default console.error. */
  log?: (line: string) => void;
  apiBase?: string;
  cacheMs?: number;
  recheckMs?: number;
  failedMs?: number;
  timeoutMs?: number;
  maxPages?: number;
};

export const MEMBER_CACHE_MS = 10 * 60_000;
export const MEMBER_RECHECK_MS = 60_000;
export const MEMBER_FAILED_MS = 30_000;
export const MEMBER_TIMEOUT_MS = 8_000;
export const MEMBER_MAX_PAGES = 20;
const PAGE_LIMIT = 1000;

type PageBody = { data?: unknown; has_more?: unknown; next_page?: unknown };

/** Takes the key, key-shaped text and emails out of a log line, and cuts it short. */
export function redactMemberLog(text: string, key: string): string {
  return (key ? text.split(key).join("[key]") : text)
    .replace(/sk-ant-[\w-]+/g, "[key]")
    .replace(/[\w.+-]+@[\w.-]+/g, "[email]")
    .slice(0, 200);
}

export function createClaudeMemberCheck(opts: ClaudeMemberCheckOptions = {}): ClaudeMemberCheck {
  const key = opts.apiKey?.trim() ?? "";
  const org = opts.orgId?.trim() ?? "";
  const configured = Boolean(key && org);
  const log = opts.log ?? ((line: string) => console.error(line));
  const api = opts.apiBase ?? "https://api.anthropic.com";
  const cacheMs = opts.cacheMs ?? MEMBER_CACHE_MS;
  const recheckMs = opts.recheckMs ?? MEMBER_RECHECK_MS;
  const failedMs = opts.failedMs ?? MEMBER_FAILED_MS;
  const timeoutMs = opts.timeoutMs ?? MEMBER_TIMEOUT_MS;
  const maxPages = opts.maxPages ?? MEMBER_MAX_PAGES;

  let cache: { at: number; emails: Set<string> } | null = null;
  let failedAt: number | null = null;
  let inFlight: Promise<Set<string> | null> | null = null;

  // Bearer first (the documented example), x-api-key once on a 401 (the
  // header list). `redirect: "error"`: a redirect would carry the key away.
  async function getPage(url: URL, signal: AbortSignal, fetchImpl: typeof fetch): Promise<Response> {
    const base = { "anthropic-version": "2023-06-01" };
    const init = { signal, cache: "no-store", redirect: "error" } as const;
    const res = await fetchImpl(url, { ...init, headers: { ...base, Authorization: `Bearer ${key}` } });
    if (res.status !== 401) return res;
    return fetchImpl(url, { ...init, headers: { ...base, "x-api-key": key } });
  }

  async function refusalDetail(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: { type?: unknown; message?: unknown } };
      const type = typeof body.error?.type === "string" ? body.error.type : "";
      const msg = typeof body.error?.message === "string" ? redactMemberLog(body.error.message, key) : "";
      return [type, msg].filter(Boolean).join(": ");
    } catch {
      return "";
    }
  }

  // Every page or none: judging on part of the list would end members' connections.
  async function fetchMembers(fetchImpl: typeof fetch): Promise<Set<string> | null> {
    const signal = AbortSignal.timeout(timeoutMs);
    const emails = new Set<string>();
    let page: string | null = null;
    for (let i = 0; i < maxPages; i += 1) {
      const url = new URL(`${api}/v1/compliance/organizations/${encodeURIComponent(org)}/users`);
      url.searchParams.set("limit", String(PAGE_LIMIT));
      if (page) url.searchParams.set("page", page);
      const res = await getPage(url, signal, fetchImpl);
      if (!res.ok) {
        const detail = await refusalDetail(res);
        log(`[connector] Claude member list answered ${res.status}${detail ? ` (${detail})` : ""}`);
        return null;
      }
      const body = (await res.json()) as PageBody;
      if (!Array.isArray(body.data) || typeof body.has_more !== "boolean") {
        log("[connector] Claude member list page not in the expected shape");
        return null;
      }
      for (const u of body.data as { email?: unknown }[]) {
        if (u && typeof u.email === "string" && u.email.trim()) emails.add(u.email.trim().toLowerCase());
      }
      if (!body.has_more) {
        if (emails.size === 0) {
          log("[connector] Claude member list came back empty");
          return null;
        }
        return emails;
      }
      if (typeof body.next_page !== "string" || !body.next_page) {
        log("[connector] Claude member list says there is more but gives no next page");
        return null;
      }
      page = body.next_page;
    }
    log("[connector] Claude member list too long to read");
    return null;
  }

  return {
    configured,
    reset() {
      cache = null;
      failedAt = null;
      inFlight = null;
    },
    async membership(emails, now = Date.now()) {
      if (!configured) return "not-configured";
      const wanted = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
      const has = (set: Set<string>) => wanted.some((e) => set.has(e));
      // A miss from a list older than `recheckMs` reads it again (someone just added).
      if (cache && now - cache.at < cacheMs && (has(cache.emails) || now - cache.at < recheckMs)) {
        return has(cache.emails) ? "member" : "not-member";
      }
      if (failedAt != null && now - failedAt >= 0 && now - failedAt < failedMs) return "unavailable";
      inFlight ??= fetchMembers(opts.fetchImpl ?? fetch)
        .catch((err: unknown) => {
          log(`[connector] Claude member list failed ${err instanceof Error ? err.name : "error"}`);
          return null;
        })
        .finally(() => {
          inFlight = null;
        });
      const fresh = await inFlight;
      if (!fresh) {
        failedAt = now;
        return "unavailable";
      }
      failedAt = null;
      cache = { at: now, emails: fresh };
      return has(fresh) ? "member" : "not-member";
    },
  };
}

/** The check from CLAUDE_COMPLIANCE_API_KEY and CLAUDE_ORG_ID. */
export function claudeMemberCheckFromEnv(
  env: Record<string, string | undefined> = process.env,
  opts: Omit<ClaudeMemberCheckOptions, "apiKey" | "orgId"> = {},
): ClaudeMemberCheck {
  return createClaudeMemberCheck({ ...opts, apiKey: env.CLAUDE_COMPLIANCE_API_KEY, orgId: env.CLAUDE_ORG_ID });
}
