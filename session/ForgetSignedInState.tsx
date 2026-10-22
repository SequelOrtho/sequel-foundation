"use client";

import { useEffect } from "react";
import { clearUnreadBadge } from "../ui/UnreadBadge";
import { clearRememberedViews } from "../ui/remembered-view";

// Mount on the hub's sign-in page, in the signed-out branch (DESIGN-CONVENTIONS
// §4 "Signing out"). Owner ruling 2026-10-22 (Mike, "yes" to "Should an idle
// sign-out that lands on the sign-in page also clear filters?"): a session that
// ended without Sign Out or the signed-out screen (the idle timeout bouncing a
// page load to /auth/signin) still forgets this tab's list filters and unread
// count, so the next person on a shared computer starts clean. Renders nothing.

export function ForgetSignedInState(): null {
  useEffect(() => {
    clearRememberedViews();
    clearUnreadBadge();
  }, []);
  return null;
}
