// Signing out and ended sessions (DESIGN-CONVENTIONS §4). proxy.ts and route
// handlers import the pure half from "@sequel/foundation/session/policy"
// (no React); layouts and headers import the components from here.
export * from "./policy";
export { announceSignOut, onSessionMessage, isSigningOutHere } from "./channel";
export type { SessionMessage } from "./channel";
export { SignOutForm } from "./SignOutForm";
export { SessionWatch, authjsSessionCheck } from "./SessionWatch";
export type { SessionCheck } from "./SessionWatch";
export { SignedInNotice, MicrosoftSignOutOffer } from "./SignedInNotice";
// The idle-timeout warning's pure half (owner ruling 2026-10-21, "add the warning").
export { DEFAULT_WARN_BEFORE_SECONDS, LAST_ACTIVE_KEY, expiryWarningText, formatCountdown } from "./expiry";
