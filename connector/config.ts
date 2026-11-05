// The Claude connector's fixed settings: lifetimes, Claude's callbacks, the
// off switch, the fixed origin and the discovery documents. Pure: no database,
// no auth, no node built-ins, so a client page can read the lifetimes too.

export type Env = Record<string, string | undefined>;

/** A sign-in code lives five minutes and works once. */
export const CODE_TTL_MS = 5 * 60_000;
/** An access token works for an hour; Claude then refreshes it. */
export const ACCESS_TTL_MS = 60 * 60_000;
/** A connection unused for a week ends. */
export const REFRESH_IDLE_MS = 7 * 24 * 60 * 60_000;
/** Every connection ends two weeks after the person allowed it. */
export const GRANT_MAX_MS = 14 * 24 * 60 * 60_000;
/** Claude asking twice at once with the same refresh token: the late one is refused, not treated as theft. */
export const REFRESH_GRACE_MS = 60_000;

export type ConnectorLifetimes = {
  codeTtlMs: number;
  accessTtlMs: number;
  refreshIdleMs: number;
  grantMaxMs: number;
  refreshGraceMs: number;
};

export const DEFAULT_LIFETIMES: ConnectorLifetimes = {
  codeTtlMs: CODE_TTL_MS,
  accessTtlMs: ACCESS_TTL_MS,
  refreshIdleMs: REFRESH_IDLE_MS,
  grantMaxMs: GRANT_MAX_MS,
  refreshGraceMs: REFRESH_GRACE_MS,
};

const DAY_MS = 24 * 60 * 60_000;
/** A lifetime in whole days, for copy ("7 days without use"). */
export const lifetimeDays = (ms: number): number => Math.round(ms / DAY_MS);

/**
 * Claude's own OAuth callbacks: the only places a sign-in code is ever sent.
 * No override and no localhost callbacks, so a code goes to Claude and
 * nowhere else.
 */
export const CLAUDE_CALLBACKS: readonly string[] = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

export function isClaudeCallback(uri: unknown): uri is string {
  return typeof uri === "string" && CLAUDE_CALLBACKS.includes(uri);
}

const ON = ["true", "1", "on", "yes"];

/**
 * Off unless CONNECTOR_ENABLED is true, 1, on or yes. It also needs an
 * AUTH_SECRET to sign client ids with. A hub adds its own conditions (Ask the
 * Hub on, for one). Read at request time; a changed value takes a redeploy.
 */
export function connectorEnabled(env: Env = process.env): boolean {
  const raw = (env.CONNECTOR_ENABLED ?? "").trim().toLowerCase();
  if (!ON.includes(raw)) return false;
  return Boolean((env.AUTH_SECRET ?? "").trim());
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * An override origin the connector may use: plain http on this machine (a
 * local probe) or https on a `*.netlify.app` host (a draft deploy). Anything
 * else, a custom domain included, is refused: Cloudflare fronts the custom
 * domains and refuses Claude's servers.
 */
export function allowedOverrideOrigin(value: string | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === "http:" && LOCAL_HOSTS.includes(url.hostname)) return url.origin;
  if (url.protocol === "https:" && /^[a-z0-9-]+(--[a-z0-9-]+)?\.netlify\.app$/.test(url.hostname)) return url.origin;
  return null;
}

/**
 * Where Claude's servers reach the hub: the issuer, the metadata, the
 * register and token endpoints and the MCP endpoint. The site's own
 * `https://<SITE_NAME>.netlify.app` address (else `defaultSite`), never the
 * request's host. CONNECTOR_ORIGIN overrides it only as `allowedOverrideOrigin` allows.
 */
export function connectorOrigin(defaultSite: string, env: Env = process.env): string {
  const override = allowedOverrideOrigin(env.CONNECTOR_ORIGIN);
  if (override) return override;
  const name = env.SITE_NAME?.trim().toLowerCase();
  const site = name && /^[a-z0-9-]+$/.test(name) ? name : defaultSite;
  return `https://${site}.netlify.app`;
}

/** The connector's routes. A hub may move them; most keep the defaults. */
export type ConnectorPaths = {
  mcp: string;
  consent: string;
  token: string;
  register: string;
  resourceMetadata: string;
  asMetadata: string;
};

export const DEFAULT_CONNECTOR_PATHS: ConnectorPaths = {
  mcp: "/api/mcp",
  consent: "/connect/authorize",
  token: "/api/connector/token",
  register: "/api/connector/register",
  resourceMetadata: "/.well-known/oauth-protected-resource",
  asMetadata: "/.well-known/oauth-authorization-server",
};

export type MetadataOptions = {
  /** `connectorOrigin(...)`: the issuer and Claude-facing endpoints. */
  origin: string;
  /** Where people's browsers open the hub (the consent page needs the sign-in cookie). */
  appUrl: string;
  /** The hub's name, shown by Claude ("Sequel Project Hub"). */
  resourceName: string;
  /** A page of the hub that explains the connector, relative to appUrl. */
  documentationPath?: string;
  paths?: ConnectorPaths;
  scopes?: string[];
};

const trim = (u: string) => u.replace(/\/+$/, "");

/** The MCP endpoint's canonical URL: every token's audience (`resource`). */
export function mcpResource(origin: string, paths: ConnectorPaths = DEFAULT_CONNECTOR_PATHS): string {
  return `${trim(origin)}${paths.mcp}`;
}

/** RFC 9728 metadata for the MCP endpoint, at its path-suffixed address. */
export function resourceMetadataUrl(origin: string, paths: ConnectorPaths = DEFAULT_CONNECTOR_PATHS): string {
  return `${trim(origin)}${paths.resourceMetadata}${paths.mcp}`;
}

/** RFC 9728: the MCP endpoint and the server that issues its tokens. */
export function protectedResourceMetadata(o: MetadataOptions) {
  const paths = o.paths ?? DEFAULT_CONNECTOR_PATHS;
  return {
    resource: mcpResource(o.origin, paths),
    authorization_servers: [trim(o.origin)],
    bearer_methods_supported: ["header"],
    scopes_supported: o.scopes ?? ["hub.read"],
    resource_name: o.resourceName,
    ...(o.documentationPath ? { resource_documentation: `${trim(o.appUrl)}${o.documentationPath}` } : {}),
  };
}

/** RFC 8414: the hub's own OAuth server for the connector. */
export function authorizationServerMetadata(o: MetadataOptions) {
  const paths = o.paths ?? DEFAULT_CONNECTOR_PATHS;
  const origin = trim(o.origin);
  return {
    issuer: origin,
    authorization_endpoint: `${trim(o.appUrl)}${paths.consent}`,
    token_endpoint: `${origin}${paths.token}`,
    registration_endpoint: `${origin}${paths.register}`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: o.scopes ?? ["hub.read"],
    authorization_response_iss_parameter_supported: true,
    ...(o.documentationPath ? { service_documentation: `${trim(o.appUrl)}${o.documentationPath}` } : {}),
  };
}

/** RFC 9728 §5.1: the WWW-Authenticate value for an MCP call without a good token. */
export function bearerChallenge(origin: string, tokenGiven: boolean, paths: ConnectorPaths = DEFAULT_CONNECTOR_PATHS): string {
  const params = [`resource_metadata="${resourceMetadataUrl(origin, paths)}"`];
  if (tokenGiven) params.push(`error="invalid_token"`, `error_description="The access token is not valid or has expired."`);
  return `Bearer ${params.join(", ")}`;
}

/** Browser origins the MCP endpoint answers (Claude's servers send none). */
export function allowedMcpOrigins(origin: string, appUrl: string): string[] {
  return ["https://claude.ai", "https://claude.com", trim(origin), trim(appUrl)];
}
