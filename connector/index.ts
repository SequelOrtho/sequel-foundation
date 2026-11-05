// @sequel/foundation/connector — the Claude connector: a hub as a remote MCP
// server and its own OAuth server, read-only, for Hub roles only. This barrel
// is pure (no node built-ins), so a proxy or a client screen may import it.
// Token crypto, the grant orchestration, the member check and the
// AsyncLocalStorage scope live in "@sequel/foundation/connector/server".

export * from "./config";
export * from "./paths";
export * from "./state";
export * from "./consent";
export * from "./ended-reasons";
export * from "./mcp";
export * from "./guide";
export type {
  ConnectorAuditEvent,
  EndedGrant,
  GrantPatch,
  GrantRecord,
  GrantStore,
  GrantSummary,
  IdentityAdapter,
  NewGrant,
  NoticeAdapter,
  TokenError,
  TokenPair,
  TokenResult,
  VerifiedToken,
} from "./grants";
export type { ClaudeMemberCheck, ClaudeMembership } from "./members";
