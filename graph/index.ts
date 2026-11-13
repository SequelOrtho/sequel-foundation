// Microsoft Graph, app-only, for the family (v0.39.0). Server only (it reads
// process.env and talks to Microsoft); import from "@sequel/foundation/graph".
// The Entra settings check is pure and shared with a hub's sign-in setup.
export {
  SEND_BUDGET_MS,
  TOKEN_SKEW_MS,
  errorCodeOf,
  tenantFromIssuer,
  readGraphCreds,
  getGraphToken,
  resetGraphTokenCache,
  sendMail,
  allDayEventBody,
  createCalendarEvent,
  deleteCalendarEvent,
} from "./client";
export type { GraphCreds, GraphOutcome, GraphCallOptions, GraphMail, AllDayEvent } from "./client";
export { entraCredentialIssues, entraSignInIssues, entraUnset } from "./entra-config";
export type { EntraIssue } from "./entra-config";
