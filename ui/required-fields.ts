// Pure required-field validation for the family's save-time check
// (DESIGN-CONVENTIONS §3 "Required fields"). Every hub asks the same question
// before a save — "is every required field filled, and well-formed?" — and
// every hub should answer it with the same words. Runs client-side on the
// Save click (inline errors + a summary); the server's zod schema stays the
// backstop and is never replaced by this.

export type RequiredRule = {
  /** The form key (also the error-map key). */
  key: string;
  /** Human label as shown on the field — the message is built from it. */
  label: string;
  /** Raw form value — strings from inputs, ids from selects, null/undefined for nothing. */
  value: unknown;
  /** Extra format check beyond "present". */
  kind?: "text" | "email" | "number" | "select";
  /** For kind "number": lowest acceptable value (inclusive). */
  min?: number;
  /** For kind "number": highest acceptable value (inclusive). */
  max?: number;
};

export type RequiredCheck = {
  /** key → message for every rule that failed, in rule order. */
  errors: Record<string, string>;
  /** Key of the first failing rule — where focus should go. */
  firstKey: string | null;
  ok: boolean;
};

// Deliberately simple: one "@", something either side, a dot in the domain.
// Anything stricter rejects real addresses; the mail server is the real check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL_EXAMPLE = "name@sequelortho.com";

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "number") return Number.isNaN(v);
  return false;
}

/** The standard message for a missing required field. */
export function requiredMessage(label: string): string {
  return `${label} is required`;
}

export function checkRequired(rules: RequiredRule[]): RequiredCheck {
  const errors: Record<string, string> = {};
  for (const r of rules) {
    const msg = ruleMessage(r);
    if (msg) errors[r.key] = msg;
  }
  const keys = Object.keys(errors);
  return { errors, firstKey: keys[0] ?? null, ok: keys.length === 0 };
}

function ruleMessage(r: RequiredRule): string | null {
  if (isBlank(r.value)) {
    if (r.kind === "select") return `${r.label} is required — choose one`;
    return requiredMessage(r.label);
  }
  if (r.kind === "email") {
    const s = String(r.value).trim();
    if (!EMAIL_RE.test(s)) return `Enter a valid email address, like ${EMAIL_EXAMPLE}`;
  }
  if (r.kind === "number") {
    const n = typeof r.value === "number" ? r.value : Number(String(r.value).trim());
    if (!Number.isFinite(n)) return `${r.label} must be a number`;
    if (r.min != null && n < r.min) return `${r.label} must be at least ${r.min}`;
    if (r.max != null && n > r.max) return `${r.label} must be no more than ${r.max}`;
  }
  return null;
}

/** One-line summary for the top-of-form callout: names what's missing. */
export function requiredSummary(check: RequiredCheck, labels: Record<string, string>): string {
  const names = Object.keys(check.errors).map((k) => labels[k] ?? k);
  if (names.length === 0) return "";
  if (names.length === 1) return `Fix ${names[0]} to save.`;
  return `Fix these fields to save: ${names.join(", ")}.`;
}
