import { describe, expect, it } from "vitest";
import { entraCredentialIssues, entraSignInIssues, entraUnset } from "../graph/entra-config";

const TENANT = "11111111-2222-3333-4444-555555555555";
const good = {
  AUTH_MICROSOFT_ENTRA_ID_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "Abc8Q~x.yz_123-456~SECRET",
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: `https://login.microsoftonline.com/${TENANT}/v2.0`,
};
const vars = (issues: { variable: string }[]) => issues.map((i) => i.variable);

describe("Entra settings check", () => {
  it("passes real-looking values", () => {
    expect(entraCredentialIssues(good)).toEqual([]);
    expect(entraSignInIssues({ ...good, AUTH_ALLOWED_TENANTS: TENANT })).toEqual([]);
  });

  it("catches the <tenant-id> placeholder left in the issuer (2026-10-12 go-live)", () => {
    const issues = entraCredentialIssues({
      ...good,
      AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/<tenant-id>/v2.0",
    });
    expect(vars(issues)).toEqual(["AUTH_MICROSOFT_ENTRA_ID_ISSUER"]);
    expect(issues[0].message).toMatch(/placeholder/);
    expect(entraCredentialIssues({ ...good, AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/tenant-id/v2.0" })[0].message).toMatch(/placeholder/);
  });

  it("catches /common/, a bad shape, quotes and line breaks", () => {
    expect(entraCredentialIssues({ ...good, AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/common/v2.0" })[0].message).toMatch(/common/);
    expect(entraCredentialIssues({ ...good, AUTH_MICROSOFT_ENTRA_ID_ISSUER: `https://login.microsoftonline.com/${TENANT}` })[0].message).toMatch(/must look like/);
    expect(entraCredentialIssues({ ...good, AUTH_MICROSOFT_ENTRA_ID_SECRET: '"Abc8Q~x"' })[0].message).toMatch(/quote marks/);
    expect(entraCredentialIssues({ ...good, AUTH_MICROSOFT_ENTRA_ID_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\n" })[0].message).toMatch(/line break/);
    expect(entraCredentialIssues({ ...good, AUTH_MICROSOFT_ENTRA_ID_ID: "my-app" })[0].message).toMatch(/GUID/);
  });

  it("flags an allowed-tenants placeholder that would refuse every sign-in", () => {
    expect(vars(entraSignInIssues({ ...good, AUTH_ALLOWED_TENANTS: "<tenant-id>" }))).toEqual(["AUTH_ALLOWED_TENANTS"]);
  });

  it("never echoes the secret in a message", () => {
    const secret = '"Super~Secret.Value"';
    const msgs = entraCredentialIssues({ ...good, AUTH_MICROSOFT_ENTRA_ID_SECRET: secret }).map((i) => i.message).join(" ");
    expect(msgs).not.toContain("Super");
  });

  it("knows the demo posture (nothing set)", () => {
    expect(entraUnset({})).toBe(true);
    expect(entraUnset(good)).toBe(false);
  });
});
