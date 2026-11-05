import { describe, expect, it, vi } from "vitest";
import { claudeMemberCheckFromEnv, createClaudeMemberCheck, redactMemberLog } from "../connector/server";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fake(pages: unknown[], first401 = false) {
  let i = 0;
  let saw401 = !first401;
  return vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    if (!saw401) {
      saw401 = true;
      expect(headers.Authorization).toMatch(/^Bearer /);
      return json(401, { error: { type: "authentication_error", message: "no" } });
    }
    return json(200, pages[i++]);
  });
}

describe("Claude member check", () => {
  it("is not configured without a key and an org", async () => {
    expect(await createClaudeMemberCheck({}).membership(["a@x.com"])).toBe("not-configured");
    expect(claudeMemberCheckFromEnv({ CLAUDE_ORG_ID: "o" }).configured).toBe(false);
  });
  it("reads every page, retries with x-api-key once, and caches", async () => {
    const fetchImpl = fake([{ data: [{ email: "A@x.com" }], has_more: true, next_page: "p2" }, { data: [{ email: "b@x.com" }], has_more: false }], true);
    const c = createClaudeMemberCheck({ apiKey: "sk-ant-secret", orgId: "org", fetchImpl, log: () => {} });
    expect(await c.membership(["a@x.com"], 0)).toBe("member");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const retryHeaders = fetchImpl.mock.calls[1][1]?.headers as Record<string, string>;
    expect(retryHeaders["x-api-key"]).toBe("sk-ant-secret");
    expect(retryHeaders.Authorization).toBeUndefined();
    expect(fetchImpl.mock.calls[0][1]?.redirect).toBe("error");
    expect(String(fetchImpl.mock.calls[2][0])).toContain("page=p2");
    expect(await c.membership(["B@x.com"], 1000)).toBe("member");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("reads a part list, an empty list or a refusal as unavailable, never as not-member", async () => {
    const log = vi.fn();
    for (const page of [{ data: [], has_more: false }, { data: [{ email: "a@x.com" }], has_more: true }, { nope: 1 }, { data: [], has_more: "no" }]) {
      const c = createClaudeMemberCheck({ apiKey: "k", orgId: "o", fetchImpl: fake([page]), log });
      expect(await c.membership(["z@x.com"], 0)).toBe("unavailable");
    }
    const refused = vi.fn(async () => json(403, { error: { type: "permission_error", message: "key sk-ant-abc lacks scope for a@x.com" } }));
    const c = createClaudeMemberCheck({ apiKey: "k", orgId: "o", fetchImpl: refused, log });
    expect(await c.membership(["a@x.com"], 0)).toBe("unavailable");
    expect(await c.membership(["a@x.com"], 10_000)).toBe("unavailable");
    expect(refused).toHaveBeenCalledTimes(1);
    const line = log.mock.calls.at(-1)?.[0] as string;
    expect(line).toContain("403");
    expect(line).not.toMatch(/sk-ant-abc|a@x\.com/);
  });
  it("re-reads a miss after the recheck window", async () => {
    const fetchImpl = fake([{ data: [{ email: "a@x.com" }], has_more: false }, { data: [{ email: "a@x.com" }, { email: "n@x.com" }], has_more: false }]);
    const c = createClaudeMemberCheck({ apiKey: "k", orgId: "o", fetchImpl, log: () => {} });
    expect(await c.membership(["n@x.com"], 0)).toBe("not-member");
    expect(await c.membership(["n@x.com"], 30_000)).toBe("not-member");
    expect(await c.membership(["n@x.com"], 61_000)).toBe("member");
  });
  it("shares one read between callers that arrive together", async () => {
    const fetchImpl = fake([{ data: [{ email: "a@x.com" }], has_more: false }]);
    const c = createClaudeMemberCheck({ apiKey: "k", orgId: "o", fetchImpl, log: () => {} });
    expect(await Promise.all([c.membership(["a@x.com"], 0), c.membership(["a@x.com"], 0)])).toEqual(["member", "member"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("redacts the key and emails from a log line", () => {
    expect(redactMemberLog("k123 sk-ant-x a@b.com", "k123")).toBe("[key] [key] [email]");
  });
});
