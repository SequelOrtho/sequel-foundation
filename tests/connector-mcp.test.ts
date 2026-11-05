import { describe, expect, it, vi } from "vitest";
import { absoluteLinks, answerMcp, handleRpc, isNotification, LATEST_PROTOCOL_VERSION, RPC, type McpDeps } from "../connector";

const run = vi.fn(async (input: Record<string, unknown>) => ({ content: JSON.stringify({ link: "/projects/1", echo: input, other: "/x" }) }));
const deps = (extra: Partial<McpDeps> = {}): McpDeps => ({
  tools: [{ name: "find", description: "Find", inputSchema: { type: "object" }, run }],
  appUrl: "https://hub.com/",
  serverInfo: { name: "hub", version: "1" },
  ...extra,
});

describe("MCP answers", () => {
  it("initializes with the asked version when supported", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, deps({ instructions: "hi" }));
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: "2025-06-18", instructions: "hi" } });
    const r2 = await handleRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999" } }, deps());
    expect(r2).toMatchObject({ result: { protocolVersion: LATEST_PROTOCOL_VERSION } });
  });
  it("lists every tool as read-only", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, deps());
    expect(r).toMatchObject({ result: { tools: [{ name: "find", annotations: { readOnlyHint: true, destructiveHint: false } }] } });
  });
  it("runs a tool, making links absolute", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "find", arguments: { q: "a" } } }, deps());
    if (!("result" in r)) throw new Error("expected a result");
    const text = (r.result as { content: { text: string }[] }).content[0].text;
    expect(JSON.parse(text)).toEqual({ link: "https://hub.com/projects/1", echo: { q: "a" }, other: "/x" });
  });
  it("refuses an unknown tool, bad arguments and a spent budget", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "nope" } }, deps())).toMatchObject({ error: { code: RPC.invalidParams } });
    expect(await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "find", arguments: [1] } }, deps())).toMatchObject({ error: { code: RPC.invalidParams } });
    run.mockClear();
    const busy = await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "find" } }, deps({ beforeCall: async () => false }));
    expect(busy).toMatchObject({ result: { isError: true } });
    expect(run).not.toHaveBeenCalled();
    expect(await handleRpc({ jsonrpc: "2.0", id: 1, method: "resources/list" }, deps())).toMatchObject({ error: { code: RPC.methodNotFound } });
  });
  it("answers the HTTP shapes: 202 notification, 400 batch or junk", async () => {
    expect(isNotification({ jsonrpc: "2.0", method: "notifications/initialized" })).toBe(true);
    expect(await answerMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, deps())).toEqual({ status: 202, body: null });
    expect((await answerMcp([{ jsonrpc: "2.0", id: 1, method: "ping" }], deps())).status).toBe(400);
    expect((await answerMcp(undefined, deps())).body).toMatchObject({ error: { code: RPC.parse } });
    expect((await answerMcp({ id: 1, method: "ping" }, deps())).status).toBe(400);
    expect(await answerMcp({ jsonrpc: "2.0", id: "a", method: "ping" }, deps())).toEqual({ status: 200, body: { jsonrpc: "2.0", id: "a", result: {} } });
  });
  it("leaves protocol-relative and non-JSON text alone", () => {
    expect(absoluteLinks('{"link":"//evil.com"}', "https://hub.com")).toBe('{"link":"//evil.com"}');
    expect(absoluteLinks("plain", "https://hub.com")).toBe("plain");
  });
});
