import Link from "next/link";
import { buttonClasses } from "../ui/Button";
import { SignOutForm } from "./SignOutForm";

// The sign-in page's body when a session is still open (Back after signing
// out in another tab, a bookmark, a stale link): say who is signed in and offer
// Continue or Sign Out, instead of a second round-trip through Microsoft.
// DESIGN-CONVENTIONS §4 "Signing out". continueHref must already be
// sanitised (safeCallbackUrl).

export function SignedInNotice({
  appName,
  email,
  continueHref,
}: {
  appName: string;
  email: string;
  continueHref: string;
}) {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold text-brand-navy">You’re signed in to {appName}</h1>
      <p className="mt-4 text-sm text-brand-muted">
        Signed in as <span className="font-medium text-brand-navy">{email}</span>.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link href={continueHref} className={buttonClasses({ size: "lg" })}>
          Continue
        </Link>
        <SignOutForm className="contents" buttonClassName={buttonClasses({ variant: "outline", size: "lg" })} />
      </div>
    </div>
  );
}

// Shown on the signed-out page (?signedOut=1) under Entra: ending the hub
// session leaves the browser signed in to Microsoft, so a shared computer
// needs this extra step. Offered, never forced (owner decision, Oct 14 2026) —
// it signs the person out of Outlook and Teams on the web too.
export function MicrosoftSignOutOffer({ href, className = "mt-10" }: { href: string; className?: string }) {
  return (
    <p className={`text-sm text-brand-muted ${className}`.trim()}>
      Shared computer?{" "}
      <a href={href} className="font-medium text-brand underline-offset-2 hover:underline">
        Also sign out of Microsoft
      </a>
      <span className="block text-xs">This also signs you out of Outlook and Teams on the web in this browser.</span>
    </p>
  );
}
