"use client";

import type { ReactNode } from "react";
import { buttonClasses } from "../ui/Button";
import { clearUnreadBadge } from "../ui/UnreadBadge";
import { announceSignOut } from "./channel";
import { SIGN_OUT_PATH } from "./policy";

// The header's Sign Out control (DESIGN-CONVENTIONS §4 "Signing out"). A plain
// HTML form POST to the hub's /auth/sign-out route, never a Server Action, so it
// works from any page, before hydration, across a deploy, and after the session
// has already expired. `children` render before the button (the signed-in
// email). Submitting tells the hub's other open tabs (SessionWatch) and takes
// the unread count off this tab (UnreadBadge).

export function SignOutForm({
  children,
  label = "Sign Out",
  action = SIGN_OUT_PATH,
  className = "flex items-center gap-2",
  buttonClassName = buttonClasses({ variant: "ghost", size: "sm", className: "whitespace-nowrap" }),
}: {
  children?: ReactNode;
  label?: string;
  action?: string;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <form method="post" action={action} className={className} onSubmit={() => {
        clearUnreadBadge({ untilInput: true });
        announceSignOut();
      }}>
      {children}
      <button type="submit" className={buttonClassName}>
        {label}
      </button>
    </form>
  );
}
