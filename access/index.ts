// No-role sign-in policy (DESIGN-CONVENTIONS §4 "No role, no entry"). Server
// only (node:crypto). Import from "@sequel/foundation/access".
export {
  NO_ROLE_PATH,
  NO_ROLE_REQUEST_PATH,
  NO_ROLE_PASS_TTL_MS,
  NO_ROLE_UNAVAILABLE_REDIRECT,
  ACCESS_REQUEST_NOTIFY_INTERVAL_MS,
  ACCESS_TIME_ZONE,
  noRoleMessage,
  noRoleReasonFrom,
  noRoleStatus,
  isNoRolePath,
  signNoRolePass,
  readNoRolePass,
  noRoleRedirect,
  recordNoRoleAttempt,
  requestAccess,
  requestOutcomeFrom,
  pendingAccessRequests,
  accessRequestEmail,
  uniqueEmails,
} from "./no-role";
export type {
  NoRoleReason,
  NoRolePass,
  AccessRequestRow,
  AccessRequestStore,
  AccessRequestMail,
  AccessMailOutcome,
  RequestAccessOutcome,
} from "./no-role";
export { NoRoleNotice } from "./NoRoleNotice";
