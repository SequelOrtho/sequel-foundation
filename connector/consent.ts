import { DEFAULT_CONNECTOR_PATHS } from "./config";

// The consent page's address and the reasons an Allow can come back to it.
// Pure, so the page (a server component) and the Allow post share them.

/** Why an Allow came back to the consent page (`?refused=`), worded on the page. */
export const CONSENT_REFUSALS = ["company", "role", "no-role", "retry", "sign-in", "claude-member", "claude-check"] as const;
export type ConsentRefusal = (typeof CONSENT_REFUSALS)[number];
export const isConsentRefusal = (v: unknown): v is ConsentRefusal =>
  typeof v === "string" && (CONSENT_REFUSALS as readonly string[]).includes(v);

/** The fields of a checked authorize request the consent page carries. */
export type ConsentParams = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string;
};

/**
 * The consent page for a checked request, on the hub's own address
 * (relative), optionally saying why an Allow came back.
 */
export function consentPath(params: ConsentParams, refused?: ConsentRefusal, base: string = DEFAULT_CONNECTOR_PATHS.consent): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    resource: params.resource,
  });
  if (params.state != null) q.set("state", params.state);
  if (refused) q.set("refused", refused);
  return `${base}?${q.toString()}`;
}

/** Appends OAuth parameters to a callback address (null and undefined left out). */
export function withParams(uri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  return url.toString();
}
