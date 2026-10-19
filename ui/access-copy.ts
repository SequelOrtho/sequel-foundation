// Copy for the family's "you can't open this" pages (DESIGN-CONVENTIONS §4
// "No access, not found, and errors"). Pure, so the notices, tests and any
// server code that needs the same sentence share one source. Owner rulings
// (Oct 2026): the wording names the hub and points at its System
// Administrator generically (no names); a record whose existence is
// privileged gets the neutral not-found sentence, which reads the same
// whether the record is missing or hidden from the viewer's role.

export const DEFAULT_ADMIN_LABEL = "System Administrator";

export type AccessCopyOptions = {
  /** The viewer's current role as the hub labels it ("PI Manager (EPMO)"). */
  roleLabel?: string | null;
  /** What the hub calls its administrator ("System Admin"). */
  adminLabel?: string;
};

function contactLine(appName: string, adminLabel = DEFAULT_ADMIN_LABEL): string {
  return `If you think you should have access, contact the ${appName} ${adminLabel}.`;
}

/** A signed-in role that lacks the page or module (HTTP 403). */
export function noAccessMessage(appName: string, opts: AccessCopyOptions = {}): string {
  const role = opts.roleLabel ? ` (${opts.roleLabel})` : "";
  return `Your role in ${appName}${role} doesn’t include this page or the information on it. ${contactLine(appName, opts.adminLabel)}`;
}

/** A missing record, or one whose existence is privileged (HTTP 404). */
export function notFoundMessage(appName: string, opts: Pick<AccessCopyOptions, "adminLabel"> = {}): string {
  return `It may have been moved or removed, or it may not be open to your role in ${appName}. ${contactLine(appName, opts.adminLabel)}`;
}

/** An uncaught error while rendering the page. */
export function pageErrorMessage(appName: string, opts: Pick<AccessCopyOptions, "adminLabel"> = {}): string {
  return `${appName} couldn’t load this page. Try again in a moment. If it keeps happening, contact the ${appName} ${opts.adminLabel ?? DEFAULT_ADMIN_LABEL}.`;
}

export const NO_ACCESS_HEADING = "You don’t have access to this page";
export const NOT_FOUND_HEADING = "This page isn’t available";
export const PAGE_ERROR_HEADING = "Something went wrong";
