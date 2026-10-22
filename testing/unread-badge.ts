// Test-only helpers for UnreadBadge (DESIGN-CONVENTIONS §3 "In-app alerts").
// Kept off the `ui` barrel: resetting the badge in app code would let a count
// back onto a tab the signed-out screen cleared.
export { resetUnreadBadgeForTests } from "../ui/UnreadBadge";

import { rememberBadgedTitle } from "../ui/tab-badge";

/**
 * Record that UnreadBadge wrote `badgedTitle` over `pageTitle`, for a test that
 * sets a badged title by hand (no DOM, or no badge mounted) and then checks a
 * restore through `stripShownBadge`.
 */
export function rememberBadgedTitleForTests(badgedTitle: string, pageTitle: string): void {
  rememberBadgedTitle(badgedTitle, pageTitle);
}
