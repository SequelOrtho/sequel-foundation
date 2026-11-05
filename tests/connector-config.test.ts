import { describe, expect, it } from "vitest";
import {
  allowedOverrideOrigin,
  authorizationServerMetadata,
  bearerChallenge,
  CLAUDE_CALLBACKS,
  connectorEnabled,
  connectorOrigin,
  DEFAULT_LIFETIMES,
  isClaudeCallback,
  isConnectorOpenRequest,
  mcpResource,
  protectedResourceMetadata,
  resourceMetadataUrl,
} from "../connector";

describe("connectorEnabled", () => {
  it("is on only with a yes value and an AUTH_SECRET", () => {
    for (const v of ["true", "1", "on", "YES", " yes "]) expect(connectorEnabled({ CONNECTOR_ENABLED: v, AUTH_SECRET: "x" })).toBe(true);
    for (const v of [undefined, "", "false", "0", "off", "maybe"]) expect(connectorEnabled({ CONNECTOR_ENABLED: v, AUTH_SECRET: "x" })).toBe(false);
    expect(connectorEnabled({ CONNECTOR_ENABLED: "true" })).toBe(false);
    expect(connectorEnabled({ CONNECTOR_ENABLED: "true", AUTH_SECRET: "  " })).toBe(false);
  });
});

describe("connectorOrigin", () => {
  it("uses the site's netlify.app address, never a custom domain", () => {
    expect(connectorOrigin("hub")).toMatch(/^https:\/\/[a-z0-9-]+\.netlify\.app$/);
    expect(connectorOrigin("hub", {})).toBe("https://hub.netlify.app");
    expect(connectorOrigin("hub", { SITE_NAME: "Project-Insights" })).toBe("https://project-insights.netlify.app");
    expect(connectorOrigin("hub", { SITE_NAME: "evil.com/x" })).toBe("https://hub.netlify.app");
    expect(connectorOrigin("hub", { CONNECTOR_ORIGIN: "https://sequelorthoprojects.com" })).toBe("https://hub.netlify.app");
    expect(connectorOrigin("hub", { CONNECTOR_ORIGIN: "https://abc--hub.netlify.app/x" })).toBe("https://abc--hub.netlify.app");
    expect(connectorOrigin("hub", { CONNECTOR_ORIGIN: "http://localhost:3000" })).toBe("http://localhost:3000");
  });
  it("refuses credentials, http off this machine and odd hosts", () => {
    expect(allowedOverrideOrigin("https://u:p@hub.netlify.app")).toBeNull();
    expect(allowedOverrideOrigin("http://hub.netlify.app")).toBeNull();
    expect(allowedOverrideOrigin("https://hub.netlify.app.evil.com")).toBeNull();
    expect(allowedOverrideOrigin("not a url")).toBeNull();
  });
});

describe("Claude callbacks", () => {
  it("accepts exactly Claude's two callbacks", () => {
    expect(CLAUDE_CALLBACKS).toHaveLength(2);
    for (const c of CLAUDE_CALLBACKS) expect(isClaudeCallback(c)).toBe(true);
    expect(isClaudeCallback("https://claude.ai/api/mcp/auth_callback/x")).toBe(false);
    expect(isClaudeCallback("http://localhost/cb")).toBe(false);
    expect(isClaudeCallback(42)).toBe(false);
  });
});

describe("metadata", () => {
  const o = { origin: "https://hub.netlify.app/", appUrl: "https://hub.com", resourceName: "Hub", documentationPath: "/connector" };
  it("names the MCP resource and the issuer on the netlify.app origin, consent on the app", () => {
    expect(mcpResource(o.origin)).toBe("https://hub.netlify.app/api/mcp");
    expect(resourceMetadataUrl(o.origin)).toBe("https://hub.netlify.app/.well-known/oauth-protected-resource/api/mcp");
    const pr = protectedResourceMetadata(o);
    expect(pr).toMatchObject({ resource: "https://hub.netlify.app/api/mcp", authorization_servers: ["https://hub.netlify.app"], resource_documentation: "https://hub.com/connector" });
    const as = authorizationServerMetadata(o);
    expect(as.issuer).toBe("https://hub.netlify.app");
    expect(as.authorization_endpoint).toBe("https://hub.com/connect/authorize");
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });
  it("adds invalid_token to the challenge only when a token was given", () => {
    expect(bearerChallenge(o.origin, false)).not.toContain("invalid_token");
    expect(bearerChallenge(o.origin, true)).toContain('error="invalid_token"');
  });
  it("keeps the lifetimes in order", () => {
    const l = DEFAULT_LIFETIMES;
    expect(l.codeTtlMs).toBeLessThan(l.accessTtlMs);
    expect(l.accessTtlMs).toBeLessThan(l.refreshIdleMs);
    expect(l.refreshIdleMs).toBeLessThan(l.grantMaxMs);
  });
});

describe("isConnectorOpenRequest", () => {
  it("lets through exact paths and methods only", () => {
    expect(isConnectorOpenRequest("POST", "/api/mcp")).toBe(true);
    expect(isConnectorOpenRequest("post", "/api/connector/token")).toBe(true);
    expect(isConnectorOpenRequest("GET", "/.well-known/oauth-protected-resource/api/mcp")).toBe(true);
    expect(isConnectorOpenRequest("GET", "/api/connector/token")).toBe(false);
    expect(isConnectorOpenRequest("POST", "/api/connector/authorize")).toBe(false);
    expect(isConnectorOpenRequest("GET", "/connect/authorize")).toBe(false);
    expect(isConnectorOpenRequest("POST", "/api/mcp/x")).toBe(false);
    expect(isConnectorOpenRequest("GET", "constructor")).toBe(false);
  });
});
