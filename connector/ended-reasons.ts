// Why a Claude connection ended, in the words a notice uses. Pure. The hub
// supplies its own name and its administrator's label.

/** Every reason a connection can end with (stored as `revokedReason`). */
export const END_REASONS = [
  "person",
  "admin",
  "admin-person",
  "role-removed",
  "role-gone",
  "code-reused",
  "refresh-reused",
  "sign-in-not-allowed",
  "not-claude-member",
] as const;
export type EndReason = (typeof END_REASONS)[number];
export const isEndReason = (v: unknown): v is EndReason => typeof v === "string" && (END_REASONS as readonly string[]).includes(v);

/** The ends nobody's hand was on: the hub audits them with no actor. */
export const SYSTEM_END_REASONS: readonly EndReason[] = ["code-reused", "refresh-reused", "sign-in-not-allowed", "not-claude-member", "role-gone"];

export type EndNotice = {
  why: string;
  advice: string;
  /** False when the hub's connections page may be a 404 for the person:
   * ending every connection is the first step of switching the connector off. */
  connectionsPage: boolean;
};

export type NoticeWords = {
  /** "Sequel Project Hub". */
  hubName: string;
  /** "System Admin", "System Administrator". */
  adminLabel: string;
};

/**
 * What to tell the person when a connection ends without them ending it.
 * Their own end needs no notice (null).
 */
export function noticeFor(reason: EndReason, words: NoticeWords): EndNotice | null {
  const contact = `contact the ${words.hubName} ${words.adminLabel}`;
  const admin = words.adminLabel;
  switch (reason) {
    case "person":
      return null;
    case "admin":
      return {
        why: `a ${admin} ended every Claude connection to the Hub.`,
        advice: "Connect again from Claude when the Hub offers it again.",
        connectionsPage: false,
      };
    case "admin-person":
      return { why: `a ${admin} ended your connections.`, advice: `If you don't know why, ${contact}.`, connectionsPage: true };
    case "role-removed":
      return { why: `a ${admin} changed your Hub roles.`, advice: `If you think you should have access, ${contact}.`, connectionsPage: true };
    case "role-gone":
      return {
        why: "the Hub role it used is no longer yours.",
        advice: `Connect again from Claude to choose one of your current roles. If you have no Hub role, ${contact}.`,
        connectionsPage: true,
      };
    case "code-reused":
    case "refresh-reused":
      return {
        why: "the Hub saw the same sign-in used twice, which can mean someone else had a copy of it.",
        advice: `Connect again from Claude if you still need it. If you didn't just connect, ${contact}.`,
        connectionsPage: true,
      };
    case "sign-in-not-allowed":
      return { why: "your sign-in is no longer allowed to use the Hub.", advice: `If you think it should be, ${contact}.`, connectionsPage: true };
    case "not-claude-member":
      return {
        why: "you're no longer a member of the company's Claude organization.",
        advice: `If you think you should be, ${contact}.`,
        connectionsPage: true,
      };
  }
}

/** The consent page's company-account checkbox, for a given company name. */
export const companyAccountLabel = (company: string): string =>
  `I'm connecting from my ${company} company Claude account, not a personal Claude account.`;
