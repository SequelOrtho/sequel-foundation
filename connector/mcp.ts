// The connector's MCP server: JSON-RPC 2.0 over the Streamable HTTP
// transport, stateless, JSON answers only (no SSE). Pure: the hub hands it
// the tools for the person (already inside their scope) and a budget check.
// Every tool is read-only, so nothing can be changed from Claude.

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const RPC = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

/** What a tool run hands back: JSON text (links inside are made absolute) and whether it failed. */
export type ConnectorToolResult = { content: string; isError?: boolean };

/** One read-only tool, supplied by the hub. */
export type ConnectorTool = {
  name: string;
  title?: string;
  description: string;
  /** A JSON Schema object for the arguments. */
  inputSchema: Record<string, unknown>;
  run: (input: Record<string, unknown>) => Promise<ConnectorToolResult>;
};

export type ServerInfo = { name: string; title?: string; version: string };

export type McpDeps = {
  /** The tools this person's connection offers. */
  tools: readonly ConnectorTool[];
  /** Counts the call and checks the person's budget. False = refused for now. Default: always allowed. */
  beforeCall?: () => Promise<boolean>;
  /** The hub's public address, for absolute links. */
  appUrl: string;
  serverInfo: ServerInfo;
  /** What the model is told about the server on initialize. */
  instructions?: string;
  /** The busy line when `beforeCall` refuses. */
  busyMessage?: string;
};

type Id = string | number;
type RpcRequest = { jsonrpc: "2.0"; id?: Id | null; method: string; params?: unknown };

export type RpcResponse =
  | { jsonrpc: "2.0"; id: Id | null; result: unknown }
  | { jsonrpc: "2.0"; id: Id | null; error: { code: number; message: string } };

const err = (id: Id | null, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

function asRequest(msg: unknown): RpcRequest | null {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return null;
  const m = msg as Record<string, unknown>;
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return null;
  if ("id" in m && m.id !== null && typeof m.id !== "string" && typeof m.id !== "number") return null;
  return m as RpcRequest;
}

/** A JSON-RPC message with no id is a notification: it gets no answer (HTTP 202). */
export function isNotification(msg: unknown): boolean {
  const r = asRequest(msg);
  return r != null && !("id" in r);
}

/** A refusal for the whole request (the call runs nothing). */
export function refuseRpc(msg: unknown, message: string, code: number = RPC.invalidRequest): RpcResponse {
  const r = asRequest(msg);
  return err(r?.id ?? null, code, message);
}

/** Hub paths in a tool's JSON made absolute, so a link in Claude opens the hub. */
export function absoluteLinks(text: string, appUrl: string): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return text;
  }
  const base = appUrl.replace(/\/+$/, "");
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        out[k] = (k === "link" || k === "href") && typeof x === "string" && x.startsWith("/") && !x.startsWith("//") ? `${base}${x}` : walk(x);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** tools/list: every tool marked read-only. */
export function toolList(tools: readonly ConnectorTool[]) {
  return tools.map((t) => {
    const title = t.title ?? t.name;
    return {
      name: t.name,
      title,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    };
  });
}

const DEFAULT_BUSY = "The Hub is busy for you right now. Try again in a few minutes.";

/** Answers one JSON-RPC request (never a notification). */
export async function handleRpc(msg: unknown, deps: McpDeps): Promise<RpcResponse> {
  const req = asRequest(msg);
  if (!req) return err(null, RPC.invalidRequest, "Not a JSON-RPC 2.0 request.");
  const id = req.id ?? null;
  const params = (req.params && typeof req.params === "object" ? req.params : {}) as Record<string, unknown>;
  switch (req.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : LATEST_PROTOCOL_VERSION;
      const result: Record<string, unknown> = { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: deps.serverInfo };
      if (deps.instructions) result.instructions = deps.instructions;
      return { jsonrpc: "2.0", id, result };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: toolList(deps.tools) } };
    case "tools/call": {
      const name = params.name;
      const tool = typeof name === "string" ? deps.tools.find((t) => t.name === name) : undefined;
      if (!tool) return err(id, RPC.invalidParams, "That tool isn't available to you.");
      const args = params.arguments ?? {};
      if (typeof args !== "object" || Array.isArray(args) || args === null) return err(id, RPC.invalidParams, "Tool arguments must be an object.");
      if (deps.beforeCall && !(await deps.beforeCall())) {
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify({ error: deps.busyMessage ?? DEFAULT_BUSY }) }], isError: true },
        };
      }
      const out = await tool.run(args as Record<string, unknown>);
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: absoluteLinks(out.content, deps.appUrl) }], isError: out.isError ?? false } };
    }
    default:
      return err(id, RPC.methodNotFound, `Unknown method: ${req.method}`);
  }
}

/** The HTTP answer for a POSTed body: 202 for a notification, 400 for a batch or junk, else 200 with the response. */
export type McpHttpAnswer = { status: 200 | 202 | 400; body: RpcResponse | null };

/**
 * Handles a POST body already parsed as JSON (`undefined` when it didn't
 * parse). A batch is refused: the transport answers one message at a time.
 */
export async function answerMcp(body: unknown, deps: McpDeps): Promise<McpHttpAnswer> {
  if (body === undefined) return { status: 400, body: err(null, RPC.parse, "The body is not JSON.") };
  if (Array.isArray(body)) return { status: 400, body: err(null, RPC.invalidRequest, "Batches are not supported. Send one message at a time.") };
  if (isNotification(body)) return { status: 202, body: null };
  if (!asRequest(body)) return { status: 400, body: err(null, RPC.invalidRequest, "Not a JSON-RPC 2.0 request.") };
  return { status: 200, body: await handleRpc(body, deps) };
}
