import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allDayEventBody,
  createCalendarEvent,
  deleteCalendarEvent,
  errorCodeOf,
  forgetRefusedGraphToken,
  getGraphToken,
  REFUSAL_RESET_INTERVAL_MS,
  readGraphCreds,
  resetGraphTokenCache,
  sendMail,
  tenantFromIssuer,
} from "../graph";

// The family Graph client (v0.39.0, lifted from the hubs' copies). Settings
// are read through the Entra sanity check, the token is app-only and cached,
// and every call is an outcome, never a throw — with the error CODE only.

const env = {
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0",
  AUTH_MICROSOFT_ENTRA_ID_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "sec",
};
const creds = { tenantId: "11111111-2222-3333-4444-555555555555", clientId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", clientSecret: "sec" };

afterEach(() => {
  vi.restoreAllMocks();
  resetGraphTokenCache();
});

const body = (fetchMock: ReturnType<typeof vi.fn>, n = 0) => JSON.parse(String((fetchMock.mock.calls[n] as [string, RequestInit])[1].body));

describe("errorCodeOf", () => {
  it("keeps only the error code of a Graph or Entra body, never its text", () => {
    expect(errorCodeOf(JSON.stringify({ error: { code: "ErrorInvalidRecipients", message: "Recipient 'ana@sequelortho.com' is not resolved" } }))).toBe("ErrorInvalidRecipients");
    expect(errorCodeOf(JSON.stringify({ error: "invalid_client", error_description: "AADSTS7000215: secret for app aaaa" }))).toBe("invalid_client");
    expect(errorCodeOf(JSON.stringify({ error_codes: [7000215] }))).toBe("AADSTS7000215");
    expect(errorCodeOf("Recipient 'ana@sequelortho.com' is not resolved")).toBe("unknown");
    expect(errorCodeOf("")).toBe("unknown");
    expect(errorCodeOf(JSON.stringify({ error: { code: "x y@z.com <b>" } }))).toBe("xyz.comb");
  });
});

describe("tenantFromIssuer / readGraphCreds", () => {
  it("reads the tenant out of a v2.0 issuer and null otherwise", () => {
    expect(tenantFromIssuer(env.AUTH_MICROSOFT_ENTRA_ID_ISSUER)).toBe("11111111-2222-3333-4444-555555555555");
    expect(tenantFromIssuer(undefined)).toBeNull();
    expect(tenantFromIssuer("not a url")).toBeNull();
  });
  it("names every missing variable", () => {
    const out = readGraphCreds({});
    expect("error" in out && out.error).toMatch(/tenant.*AUTH_MICROSOFT_ENTRA_ID_ID.*AUTH_MICROSOFT_ENTRA_ID_SECRET/);
  });
  it("refuses a placeholder or a /common/ issuer through the Entra check, naming the variable and never a value", () => {
    const placeholder = readGraphCreds({ ...env, AUTH_MICROSOFT_ENTRA_ID_ID: "<client-id>" });
    expect("error" in placeholder && placeholder.error).toContain("AUTH_MICROSOFT_ENTRA_ID_ID");
    expect("error" in placeholder && placeholder.error).not.toContain("sec");
    const common = readGraphCreds({ ...env, AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/common/v2.0" });
    expect("error" in common && common.error).toContain("AUTH_MICROSOFT_ENTRA_ID_ISSUER");
  });
  it("returns the tenant, client id and secret for well-formed settings", () => {
    expect(readGraphCreds(env)).toEqual(creds);
  });
});

describe("getGraphToken", () => {
  it("a refused token request throws with the status and the error code only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_client", error_description: "AADSTS7000215: secret; recipient ana@sequelortho.com" }), { status: 401 }),
    );
    await expect(getGraphToken(creds, fetchMock)).rejects.toThrow(/^Graph token request failed \(401\): invalid_client$/);
  });
  it("posts the client-credentials grant with the shared budget signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }));
    const signal = AbortSignal.timeout(5_000);
    expect(await getGraphToken(creds, fetchMock, signal)).toBe("tok");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/oauth2/v2.0/token");
    expect(init.signal).toBe(signal);
    expect(String(init.body)).toContain("grant_type=client_credentials");
  });
  it("reuses a token until a minute before it expires; other credentials never share it; no expires_in is not cached", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 })));
    const signal = AbortSignal.timeout(5_000);
    expect(await getGraphToken(creds, fetchMock, signal, 0)).toBe("tok");
    expect(await getGraphToken(creds, fetchMock, signal, 1_000)).toBe("tok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getGraphToken(creds, fetchMock, signal, 3600_000 - 30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await getGraphToken({ ...creds, clientSecret: "other" }, fetchMock, signal, 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    resetGraphTokenCache();
    const noTtl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ access_token: "tok" }), { status: 200 })));
    await getGraphToken(creds, noTtl);
    await getGraphToken(creds, noTtl);
    expect(noTtl).toHaveBeenCalledTimes(2);
  });
});

describe("forgetRefusedGraphToken", () => {
  it("forgets the cached token at most once a minute, and resetGraphTokenCache clears the throttle", async () => {
    const tokenRes = () => new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    const fetchMock = vi.fn().mockImplementation(async () => tokenRes());
    await getGraphToken(creds, fetchMock);
    expect(forgetRefusedGraphToken(1_000_000)).toBe(true);
    await getGraphToken(creds, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // A second refusal inside the minute keeps the token: no extra request.
    expect(forgetRefusedGraphToken(1_000_000 + REFUSAL_RESET_INTERVAL_MS - 1)).toBe(false);
    await getGraphToken(creds, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(forgetRefusedGraphToken(1_000_000 + REFUSAL_RESET_INTERVAL_MS)).toBe(true);
    await getGraphToken(creds, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    resetGraphTokenCache();
    expect(forgetRefusedGraphToken(1_000_000 + REFUSAL_RESET_INTERVAL_MS + 1)).toBe(true);
  });
});

describe("sendMail", () => {
  it("posts as the sender with the recipients, cc, reply-to and saveToSentItems false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 202 }));
    const out = await sendMail(
      "tok",
      "noreply@sequelortho.com",
      { to: ["ana@sequelortho.com"], cc: ["cc@sequelortho.com"], subject: "S", html: "<p>t</p>", replyTo: ["mike@sequelortho.com"] },
      { fetchImpl: fetchMock },
    );
    expect(out).toEqual({ ok: true, value: undefined });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.microsoft.com/v1.0/users/noreply%40sequelortho.com/sendMail");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(body(fetchMock)).toEqual({
      message: {
        subject: "S",
        body: { contentType: "HTML", content: "<p>t</p>" },
        toRecipients: [{ emailAddress: { address: "ana@sequelortho.com" } }],
        ccRecipients: [{ emailAddress: { address: "cc@sequelortho.com" } }],
        replyTo: [{ emailAddress: { address: "mike@sequelortho.com" } }],
      },
      saveToSentItems: false,
    });
  });
  it("leaves cc and replyTo out when there are none", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 202 }));
    await sendMail("tok", "noreply@sequelortho.com", { to: ["ana@sequelortho.com"], subject: "S", html: "" }, { fetchImpl: fetchMock });
    expect(body(fetchMock).message).not.toHaveProperty("replyTo");
    expect(body(fetchMock).message).not.toHaveProperty("ccRecipients");
  });
  it("a 403 is a noAccess outcome naming the Mail.Send application permission and the hub's runbook, with the error code only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "ErrorAccessDenied", message: "Access is denied for ana@sequelortho.com" } }), { status: 403 }),
    );
    const out = await sendMail("tok", "noreply@sequelortho.com", { to: ["a@b.c"], subject: "S", html: "" }, { fetchImpl: fetchMock, docsHint: 'docs/entra-setup.md, "Task emails"' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(403);
      expect(out.noAccess).toBe(true);
      expect(out.message).toBe('Graph 403 ErrorAccessDenied — check the Entra app has the Mail.Send APPLICATION permission with admin consent (docs/entra-setup.md, "Task emails")');
    }
  });
  it("a 404 for a mailbox with no Exchange licence is noAccess too; a network error is status 0", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "MailboxNotEnabledForRESTAPI" } }), { status: 404 }));
    const out = await sendMail("tok", "x@sequelortho.com", { to: ["a@b.c"], subject: "S", html: "" }, { fetchImpl: fetchMock });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.noAccess).toBe(true);
    const down = await sendMail("tok", "x@sequelortho.com", { to: ["a@b.c"], subject: "S", html: "" }, { fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNRESET")) });
    expect(down).toEqual({ ok: false, status: 0, message: "ECONNRESET" });
  });
});

describe("calendar events", () => {
  const event = { subject: "Out of office", body: "", startDate: "2026-11-16", endDateExclusive: "2026-11-18", showAs: "oof" as const };
  it("an all-day event is private, UTC-anchored and reminder-free", () => {
    expect(allDayEventBody(event)).toMatchObject({ isAllDay: true, sensitivity: "private", isReminderOn: false, start: { dateTime: "2026-11-16T00:00:00", timeZone: "UTC" } });
  });
  it("create posts the event with its transaction id and returns the id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "ev1" }), { status: 201 }));
    const out = await createCalendarEvent("tok", "ana@sequelortho.com", event, "tx-1", { fetchImpl: fetchMock });
    expect(out).toEqual({ ok: true, value: "ev1" });
    expect(body(fetchMock).transactionId).toBe("tx-1");
  });
  it("delete reads an already-gone event (404) as done, and a 403 names Calendars.ReadWrite", async () => {
    expect(await deleteCalendarEvent("tok", "ana@sequelortho.com", "ev1", { fetchImpl: vi.fn().mockResolvedValue(new Response("", { status: 404 })) })).toEqual({ ok: true, value: undefined });
    const out = await deleteCalendarEvent("tok", "ana@sequelortho.com", "ev1", { fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 403 })) });
    expect(!out.ok && out.message).toMatch(/Calendars\.ReadWrite APPLICATION permission/);
  });
});
