import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetGraphTokenCache } from "../graph";
import { deliverEmail, graphSendIssue, parseAddressList, resolveDeliveryMode, withinAllowedDomains } from "../notify";

// The family email seam (v0.39.0): off logs a subject and a count, graph
// sends as NOTIFY_FROM; no log line carries an address, and a failure is an
// outcome, never a throw.

const ENV = {
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0",
  AUTH_MICROSOFT_ENTRA_ID_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "sec",
  NOTIFY_FROM: "noreply@sequelortho.com",
  NOTIFY_MODE: "graph",
};
const message = { to: ["ana@sequelortho.com"], subject: "New task for you: RACI", html: "<p>x</p>", replyTo: ["mike@sequelortho.com"] };

let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  resetGraphTokenCache();
});

const logged = () => [...info.mock.calls, ...warn.mock.calls].map((c) => String(c[0]));
const noAddress = () => {
  for (const line of logged()) expect(line).not.toMatch(/@/);
};
const token = () => new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
const sent = () => new Response("", { status: 202 });

describe("resolveDeliveryMode / lists", () => {
  it("only graph is graph — in any case, with whitespace; anything else is off", () => {
    expect(resolveDeliveryMode(undefined)).toBe("off");
    expect(resolveDeliveryMode("off")).toBe("off");
    expect(resolveDeliveryMode("on")).toBe("off");
    expect(resolveDeliveryMode("graph")).toBe("graph");
    expect(resolveDeliveryMode(" Graph ")).toBe("graph");
    expect(resolveDeliveryMode("GRAPH")).toBe("graph");
  });
  it("parses address lists and holds addresses to the allowed domains", () => {
    expect(parseAddressList(" a@x.co, ,b@x.co ")).toEqual(["a@x.co", "b@x.co"]);
    expect(withinAllowedDomains(["a@x.co", "b@y.co"], undefined)).toEqual(["a@x.co", "b@y.co"]);
    expect(withinAllowedDomains(["a@x.co", "B@Y.CO", "bad"], "y.co, Z.co")).toEqual(["B@Y.CO"]);
    // The domain is what follows the one "@": a second "@", a display-name
    // form or a space is not one address inside the list.
    expect(withinAllowedDomains(["x@y.co@evil.co", "Ana <ana@y.co>", "a b@y.co", "@y.co", '"a@y.co"@evil.co', "ok@y.co"], "y.co")).toEqual(["ok@y.co"]);
  });
  it("graphSendIssue names the setting to fix", () => {
    expect(graphSendIssue({})).toBe("NOTIFY_MODE=graph but NOTIFY_FROM is not set");
    expect(graphSendIssue({ NOTIFY_FROM: "x@y.co" })).toMatch(/Graph not configured/);
    expect(graphSendIssue(ENV)).toBeNull();
  });
});

describe("deliverEmail", () => {
  it("off: logs the subject, the ref and a count, never an address, and sends nothing", async () => {
    const fetchMock = vi.fn();
    expect(await deliverEmail(message, { env: {}, ref: "as_1", fetchImpl: fetchMock })).toBe("logged");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged()).toEqual(['[notify:off] would email "New task for you: RACI" [as_1] to 1 recipient(s)']);
    noAddress();
  });
  it("graph with no NOTIFY_FROM reports failed, names the variable, never throws", async () => {
    expect(await deliverEmail(message, { env: { NOTIFY_MODE: "graph" } })).toBe("failed");
    expect(logged()[0]).toMatch(/NOTIFY_FROM is not set/);
    noAddress();
  });
  it("graph: one token request, the send as NOTIFY_FROM with reply-to, one shared budget signal, a count-only log", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(sent());
    expect(await deliverEmail(message, { env: ENV, fetchImpl: fetchMock, tag: "[mail]" })).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenCall, sendCall] = fetchMock.mock.calls as [string, RequestInit][];
    expect(sendCall[0]).toBe("https://graph.microsoft.com/v1.0/users/noreply%40sequelortho.com/sendMail");
    expect(tokenCall[1].signal).toBe(sendCall[1].signal);
    expect(JSON.parse(String(sendCall[1].body)).message.replyTo).toEqual([{ emailAddress: { address: "mike@sequelortho.com" } }]);
    expect(logged()).toEqual(['[mail] sent "New task for you: RACI" to 1 recipient(s)']);
    noAddress();
    // A second email reuses the token: one more call, not two.
    fetchMock.mockResolvedValueOnce(sent());
    expect(await deliverEmail(message, { env: ENV, fetchImpl: fetchMock })).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("a Graph refusal logs the status, the error code and the runbook, never the body's text; a 403 forgets the token", async () => {
    const refused = () => new Response(JSON.stringify({ error: { code: "ErrorAccessDenied", message: "denied for ana@sequelortho.com" } }), { status: 403 });
    const fetchMock = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(refused()).mockResolvedValueOnce(token()).mockResolvedValueOnce(sent());
    expect(await deliverEmail(message, { env: ENV, fetchImpl: fetchMock, docsHint: "docs/entra-setup.md" })).toBe("failed");
    expect(logged()[0]).toMatch(/not sent: "New task for you: RACI" to 1 recipient\(s\) — Graph 403 ErrorAccessDenied — .*docs\/entra-setup\.md/);
    noAddress();
    expect(await deliverEmail(message, { env: ENV, fetchImpl: fetchMock })).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it("a refused token request and a network error both read as failed", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_client", error_description: "x ana@sequelortho.com" }), { status: 401 }));
    expect(await deliverEmail(message, { env: ENV, fetchImpl: fetchMock })).toBe("failed");
    expect(logged()[0]).toMatch(/Graph token request failed \(401\): invalid_client$/);
    expect(await deliverEmail(message, { env: ENV, fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNRESET")) })).toBe("failed");
    noAddress();
  });
  it("with AUTH_ALLOWED_EMAIL_DOMAINS set, outside recipients are left out with a count-only warning; nobody left sends nothing", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(sent());
    const env = { ...ENV, AUTH_ALLOWED_EMAIL_DOMAINS: "sequelortho.com" };
    expect(await deliverEmail({ ...message, to: ["ana@sequelortho.com", "x@gmail.com"], cc: ["y@gmail.com"] }, { env, fetchImpl: fetchMock })).toBe("sent");
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).message.toRecipients).toEqual([{ emailAddress: { address: "ana@sequelortho.com" } }]);
    expect(String(warn.mock.calls[0][0])).toBe('[notify:email] "New task for you: RACI": 2 recipient(s) outside AUTH_ALLOWED_EMAIL_DOMAINS left out');
    expect(await deliverEmail({ ...message, to: ["x@gmail.com"] }, { env, fetchImpl: fetchMock })).toBe("logged");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    noAddress();
  });
});
