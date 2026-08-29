// Deterministic input gate — runs BEFORE any request reaches an LLM endpoint.
// A prototype assumes benevolent intent; production receives 40-page pastes,
// accidental credential spills, and adversarial probes. The gate is plain code
// (no model in the loop), so its behavior is testable and identical on every
// infrastructure: validate size, normalize control characters, and redact
// high-confidence secrets/PII before the text leaves our perimeter.
//
// Scope discipline: this is the domain-free floor every app applies. Per-user
// rate limits and org-level policy checks are app concerns (they need the
// app's identity model); prompt-injection *resistance* is a prompt-design and
// output-validation concern (see llm/output.ts and docs/AI-CRAFT.md). The gate
// never edits meaning — it only rejects (empty / too long) or redacts patterns
// that are near-certainly sensitive.

// Character cap for user-supplied prompt text. ~32k chars ≈ 8k tokens — ample
// for any legitimate typed request, and it stops the pasted-a-whole-contract
// failure mode (unbounded context, latency, and spend) deterministically.
// Apps with a real long-document feature pass their own maxChars per call.
export const LLM_INPUT_MAX_CHARS = Number(process.env.LLM_INPUT_MAX_CHARS ?? 32_000);

export type LlmRedactionKind = "api-key" | "jwt" | "card" | "ssn";

export type LlmInputGateResult =
  | { ok: true; text: string; redactions: LlmRedactionKind[] }
  | { ok: false; reason: "empty" | "too_long"; message: string };

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// High-precision patterns only: every entry either has an unmistakable prefix
// or a checksum verify step. Recall is deliberately sacrificed for precision —
// a gate that redacts phone numbers or invoice IDs trains users to distrust it.
const SECRET_PATTERNS: Array<{
  kind: LlmRedactionKind;
  re: RegExp;
  verify?: (match: string) => boolean;
}> = [
  // Anthropic/OpenAI-style secret keys, AWS access key ids, GitHub tokens.
  { kind: "api-key", re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { kind: "api-key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "api-key", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  // Three-part JWTs (header.payload.signature, base64url).
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\b/g },
  // 13–19 digit runs (spaces/dashes allowed) that pass Luhn — card numbers.
  { kind: "card", re: /\b\d(?:[ -]?\d){12,18}\b/g, verify: (m) => luhnValid(m.replace(/\D/g, "")) },
  // Dashed-form SSNs only (bare 9-digit runs are too ambiguous).
  { kind: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
];

// Redact high-confidence secrets/PII, returning the scrubbed text and the
// kinds found (deduped) so the caller can tell the user what was removed —
// per the §3 feedback rule, a silent edit to someone's input is never OK.
export function redactSecrets(text: string): { text: string; redactions: LlmRedactionKind[] } {
  const found = new Set<LlmRedactionKind>();
  let out = text;
  for (const { kind, re, verify } of SECRET_PATTERNS) {
    out = out.replace(re, (match) => {
      if (verify && !verify(match)) return match;
      found.add(kind);
      return `[redacted ${kind}]`;
    });
  }
  return { text: out, redactions: [...found] };
}

// The gate. Order matters: normalize → validate size → redact, so the length
// check sees what the model would see and redaction placeholders can't push a
// valid input over the cap.
export function gateLlmInput(
  raw: string,
  opts?: { maxChars?: number },
): LlmInputGateResult {
  const maxChars = opts?.maxChars ?? LLM_INPUT_MAX_CHARS;

  // Strip control characters except \n and \t (they carry structure users
  // typed); normalize CRLF so length and caching behave identically per OS.
  // eslint-disable-next-line no-control-regex
  const text = raw
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim();

  if (text.length === 0) {
    return { ok: false, reason: "empty", message: "Enter a prompt before sending." };
  }
  if (text.length > maxChars) {
    return {
      ok: false,
      reason: "too_long",
      message: `That input is ${text.length.toLocaleString()} characters — the limit is ${maxChars.toLocaleString()}. Trim it to the relevant excerpt and try again.`,
    };
  }

  const { text: scrubbed, redactions } = redactSecrets(text);
  return { ok: true, text: scrubbed, redactions };
}
