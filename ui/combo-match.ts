export type ComboOption = {
  id: number | string;
  label: string;
  sublabel?: string;
  group?: string;
  /** Extra match text, e.g. "First Last" when label is "Last, First". */
  keywords?: string;
};

// Family rule (DESIGN-CONVENTIONS §3): a dropdown with more than this many
// choices is a search problem, not a scroll problem — render it as the fuzzy
// SearchCombobox instead of a native <select>. AdaptiveSelect applies the rule
// automatically; call isSearchableSize when wiring a hand-rolled control.
export const SEARCHABLE_SELECT_THRESHOLD = 12;

export function isSearchableSize(optionCount: number): boolean {
  return optionCount > SEARCHABLE_SELECT_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Fuzzy matching. Every query token must match the option (token-AND), but a
// token matches by tiers, strongest first:
//   1. option text starts with the token          (100)
//   2. some word starts with the token             (80)
//   3. token appears as a substring                (60)
//   4. token is an in-order subsequence of a word   (30, ≥3 chars — "nyn" → "nguyen")
//   5. token is one edit away from a word/prefix    (20, ≥4 chars — "ngyuen", "nguen")
// The per-token scores sum; rankComboOptions sorts matches by that score so a
// prefix hit outranks a typo-tolerant hit. Short tokens skip the loose tiers
// so "an" can't light up half the list.
// ---------------------------------------------------------------------------

const SUBSEQUENCE_MIN = 3;
const TYPO_MIN = 4;

function haystack(o: ComboOption): string {
  return `${o.label} ${o.sublabel ?? ""} ${o.keywords ?? ""}`.toLowerCase();
}

function words(hay: string): string[] {
  return hay.split(/[^a-z0-9]+/i).filter(Boolean);
}

function isSubsequence(needle: string, word: string): boolean {
  let i = 0;
  for (const ch of word) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return i === needle.length;
}

// Damerau–Levenshtein (optimal string alignment) with an early exit past `max`.
function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev2.splice(0, prev2.length, ...prev);
    prev = cur;
  }
  return prev[b.length] <= max;
}

function tokenScore(token: string, hay: string, ws: string[]): number | null {
  if (hay.startsWith(token)) return 100;
  if (ws.some((w) => w.startsWith(token))) return 80;
  if (hay.includes(token)) return 60;
  if (token.length >= SUBSEQUENCE_MIN && ws.some((w) => w.length >= token.length && isSubsequence(token, w))) {
    return 30;
  }
  if (
    token.length >= TYPO_MIN &&
    ws.some((w) => editDistanceWithin(token, w, 1) || editDistanceWithin(token, w.slice(0, token.length), 1))
  ) {
    return 20;
  }
  return null;
}

/**
 * Fuzzy relevance of an option for a query: `null` when some token fails to
 * match at all, otherwise a positive score (higher is a better match). An empty
 * query matches everything with score 0.
 */
export function comboScore(o: ComboOption, query: string): number | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const hay = haystack(o);
  const ws = words(hay);
  let total = 0;
  for (const tok of tokens) {
    const s = tokenScore(tok, hay, ws);
    if (s == null) return null;
    total += s;
  }
  return total;
}

export function comboMatches(o: ComboOption, query: string): boolean {
  return comboScore(o, query) != null;
}

/**
 * Filter + rank options for a query. Best matches first; ties keep the
 * caller's order (so an empty query returns the list untouched).
 */
export function rankComboOptions<T extends ComboOption>(options: T[], query: string): T[] {
  if (!query.trim()) return options;
  const scored: { o: T; s: number; i: number }[] = [];
  options.forEach((o, i) => {
    const s = comboScore(o, query);
    if (s != null) scored.push({ o, s, i });
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.map((x) => x.o);
}
