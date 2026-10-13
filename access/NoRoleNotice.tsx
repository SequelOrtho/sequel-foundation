import { Button, buttonClasses } from "../ui/Button";
import { Callout } from "../ui/Callout";
import {
  NO_ROLE_REQUEST_PATH,
  noRoleMessage,
  type NoRoleReason,
  type RequestAccessOutcome,
} from "./no-role";

// Body of the no-role 403 page (DESIGN-CONVENTIONS §4 "No role, no entry").
// Hook-free, so a server page renders it directly. "Request access" is a
// plain form POST to the app's request route (works without JS); the route
// redirects back here with the outcome.

const OUTCOME_TEXT: Record<RequestAccessOutcome, { tone: "success" | "info" | "danger" | "warning"; text: string }> = {
  sent: {
    tone: "success",
    text: "Request sent. The System Administrators have been emailed — sign in again once you hear back.",
  },
  recorded: {
    tone: "success",
    text: "Request recorded. A System Administrator will review it — sign in again once you hear back.",
  },
  already: {
    tone: "info",
    text: "You have already requested access in the last day. A System Administrator will review it — sign in again once you hear back.",
  },
  failed: {
    tone: "danger",
    text: "We couldn’t send your request just now. Try again in a few minutes, or contact the System Administrator directly.",
  },
  expired: {
    tone: "warning",
    text: "This page has expired. Sign in again to request access.",
  },
};

export function NoRoleNotice({
  appName,
  reason = "no-role",
  pass,
  outcome,
  email,
  requestAction = NO_ROLE_REQUEST_PATH,
  signInHref = "/auth/signin",
}: {
  appName: string;
  reason?: NoRoleReason;
  pass?: string | null; // the signed pass, posted back with the request
  outcome?: RequestAccessOutcome | null;
  email?: string | null; // who was refused (from the verified pass)
  requestAction?: string;
  signInHref?: string;
}) {
  if (reason === "unavailable") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">We couldn’t check your access</h1>
        <Callout tone="warning">
          {appName} couldn’t confirm your role just now. Try signing in again in a few minutes.
        </Callout>
        <div>
          <a href={signInHref} className={buttonClasses({ variant: "primary" })}>
            Sign in again
          </a>
        </div>
      </div>
    );
  }
  const showRequest = Boolean(pass) && outcome !== "sent" && outcome !== "recorded" && outcome !== "already";
  const result = outcome ? OUTCOME_TEXT[outcome] : null;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Access needed</h1>
      <Callout tone="warning">{noRoleMessage(appName)}</Callout>
      {email && (
        <p className="text-sm text-brand-muted">
          Signed in with Microsoft as <span className="font-medium">{email}</span>.
        </p>
      )}
      {result && <Callout tone={result.tone}>{result.text}</Callout>}
      <div className="flex flex-wrap items-center gap-3">
        {showRequest && (
          <form method="post" action={requestAction}>
            <input type="hidden" name="t" value={pass ?? ""} />
            <Button type="submit" variant="primary">
              Request access
            </Button>
          </form>
        )}
        <a href={signInHref} className={buttonClasses({ variant: showRequest ? "outline" : "primary" })}>
          Sign in again
        </a>
      </div>
    </div>
  );
}
