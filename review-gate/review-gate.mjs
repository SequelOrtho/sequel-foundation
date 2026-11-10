#!/usr/bin/env node
// The review gate. A hub's pull request can merge with no independent review,
// because the review is a skill a session may or may not run (it happened in
// outreach-directory, 2026-11-06). This sets the commit status
// `independent-review` on a pull request's head: green only when a review
// record — the PR comment the sequel-hub-independent-review skill posts,
// marked `<!-- sequel-review v1 -->` — covers that exact commit and shows a
// finished, passing review.
//
// What it does not do: the tier and the verdict are the record's own claims.
// The gate catches a review that was forgotten, cut short or left stale, not a
// false record from someone allowed to post one. To make it block the merge
// button, require the status in the branch protection of the default branch.
//
// Run by .github/workflows/review-gate.yml (a reusable workflow a hub calls),
// always from the commit of that workflow the hub pinned — never from the
// pull request. Built and reviewed in outreach-directory (pull requests 5 and
// 6 there) and moved here unchanged in behavior; docs/REVIEW-GATE.md has the
// rules in prose. `reviewGate` and its helpers are pure and tested
// (tests/review-gate.test.ts); every rule fails closed — what can't be read is
// a reason for red.

export const MARKER = "<!-- sequel-review v1 -->";
export const CONTEXT = "independent-review";
export const PASSING = ["clear", "clear-with-advisories"];
/**
 * Who may post a record that counts: someone with write access to the
 * repository (owner ruling 2026-11-10, asked whether read-only members and
 * collaborators should count: "write access only"). GitHub's "member" or
 * "collaborator" label is not enough: either can be read-only.
 */
export const TRUSTED_PERMISSIONS = ["admin", "maintain", "write"];
const LENSES = ["access", "data", "runtime", "correctness", "conventions"];

// The marker at the start of a line, whatever follows it on that line. Before
// it, any whitespace is allowed (JavaScript's \s: spaces of every kind, tabs,
// form feeds, the byte-order mark) and any character that draws nothing:
// Unicode's own list of them (Default_Ignorable_Code_Point: zero-width spaces
// and joiners, direction marks, embeddings and isolates, the word joiner, a
// soft hyphen, the combining grapheme joiner, every variation selector, the
// blank filler letters) plus the blank Braille cell. Not the whole "format"
// category, which also holds signs that draw a glyph (U+0600, U+06DD): those
// are visible text.
// Visible text before the marker on its line makes it a mention.
//
// (Owner, 2026-11-10: "the marker rule is fine".)
//
// This is the one rule for "which comment is a record", chosen deliberately
// after three narrower ones each fixed a case and opened another: it leans to
// red. A record pasted under a heading, with words after the marker, or
// inside a code block is still the newest record — and if it can't be read,
// the status is red. The price: a writer who shows the marker at the start of
// a line in an ordinary comment turns the status red until that comment is
// edited or deleted. Only a mention inside a sentence or backticks, and a
// "> " quote, are not records. A newer record is never skipped for an older one.
const MARKER_LINE = /^[\s\p{Default_Ignorable_Code_Point}\u2800]*<!-- sequel-review v1 -->/mu;

/** Whether a comment claims to be a review record, readable or not (see MARKER_LINE). */
export const hasMarker = (body) => typeof body === "string" && MARKER_LINE.test(body.replace(/\r\n/g, "\n"));

/**
 * The record JSON inside one comment body, or null when there is none that
 * can be read: the first fenced json block after the marker line.
 */
export function recordIn(body) {
  if (!hasMarker(body)) return null;
  const text = body.replace(/\r\n/g, "\n");
  const m = text.slice(text.search(MARKER_LINE)).match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) return null;
  try {
    const rec = JSON.parse(m[1]);
    return rec && typeof rec === "object" && !Array.isArray(rec) && rec.schema === "sequel-review/v1" ? rec : null;
  } catch {
    return null;
  }
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const isSha = (s) => typeof s === "string" && FULL_SHA.test(s);
const isShortSha = (s) => typeof s === "string" && /^[0-9a-f]{7,39}$/i.test(s);
/**
 * The same commit: two full 40-character ids, equal. A short id is never a
 * match — seven characters are 28 bits, and whoever can push to the pull
 * request's branch can make an unreviewed commit that shares them.
 */
export const sameSha = (a, b) => isSha(a) && isSha(b) && a.toLowerCase() === b.toLowerCase();
const shortFor = (short, full) => isShortSha(short) && isSha(full) && full.toLowerCase().startsWith(short.toLowerCase());

const deltaCounts = (d) => d.reviewed === true || (d.kind === "merge-main" && d.reviewed === false);

/**
 * Whether the record vouches for `head` (skill §4a), and if not, why.
 * - Every change the record lists after its review must itself be reviewed,
 *   or be a clean merge of main. All of them, not only the last: an
 *   unreviewed fix followed by a merge of main is still an unreviewed fix.
 * - The record must then name the head, in full: as `headSha`, or as the `to`
 *   of a delta. (Other ids in the record may be short; only the one that
 *   claims the head has to be exact.)
 *   (The skill moves `headSha` and writes the delta together, so `headSha`
 *   naming the head never excuses an unreviewed delta.)
 * @returns {null | string} null when it covers the head, else the reason.
 */
export function coverageIssue(rec, head) {
  if (rec.deltas !== undefined && !Array.isArray(rec.deltas)) return "the record's deltas can't be read";
  const deltas = rec.deltas ?? [];
  if (deltas.some((d) => !d || typeof d !== "object")) return "the record's deltas can't be read";
  if (!deltas.every(deltaCounts)) return "a change after the review is recorded as not reviewed";
  if (sameSha(rec.headSha, head) || deltas.some((d) => sameSha(d.to, head))) return null;
  if (shortFor(rec.headSha, head) || deltas.some((d) => shortFor(d.to, head))) {
    return "the record names its commit by a short id; headSha (or the delta that ends at the head) must be the full 40 characters";
  }
  const named = isSha(rec.headSha) || isShortSha(rec.headSha) ? rec.headSha.slice(0, 7) : "no commit";
  return `the record covers ${named}; the head is ${head.slice(0, 7)}`;
}

const lensesOf = (r) => (r && typeof r === "object" && Array.isArray(r.lenses) ? r.lenses : null);
const RISK = ["access", "data", "runtime"];
const SEVERITIES = ["blocker", "should-fix", "advisory"];
// A blocker or should-fix is settled only in one of these states (skill, record format).
const SETTLED = ["fixed", "superseded", "accepted-risk"];

/**
 * How many reviewer agents triage names for these lenses — the skill's own
 * rule (scripts/triage.mjs): tier 1 one agent; tier 2 one for the risk lenses
 * and one for the behavior lenses, where each is named; tier 3 one per lens.
 */
export function agentsNamed(tier, lenses) {
  if (tier <= 0) return 0;
  if (tier === 1) return 1;
  if (tier === 2) return Number(lenses.some((l) => RISK.includes(l))) + Number(lenses.some((l) => !RISK.includes(l)));
  return lenses.length;
}

/**
 * Why a record does not show a finished, passing review, or null.
 */
export function recordIssue(rec) {
  if (!Number.isInteger(rec.tier) || rec.tier < 0 || rec.tier > 3) return "the record has no tier (0 to 3)";
  if (typeof rec.verdict !== "string") return "the record has no verdict";
  if (rec.verdict === "blocked") return "the review is blocked";
  if (rec.verdict === "escalated") return "the review is escalated and waits on the owner";
  if (!PASSING.includes(rec.verdict)) return "the record's verdict is not one the gate knows";

  // Findings the record itself has not settled. Anything unreadable counts as unsettled.
  if (rec.findings !== undefined && !Array.isArray(rec.findings)) return "the record's findings can't be read";
  for (const f of rec.findings ?? []) {
    if (!f || typeof f !== "object" || !SEVERITIES.includes(f.severity)) return "a finding in the record can't be read";
    if (f.severity !== "advisory" && !SETTLED.includes(f.status)) return "a blocker or should-fix finding is not settled";
  }

  // The lenses triage named, and who read them.
  if (!Array.isArray(rec.triageLenses)) return "the record does not list triageLenses (the lenses triage named)";
  const named = rec.triageLenses;
  if (named.some((l) => !LENSES.includes(l)) || new Set(named).size !== named.length) return "the record's triageLenses can't be read";
  if (!Array.isArray(rec.reviewers)) return "the record does not list its reviewers";
  const read = rec.reviewers.map(lensesOf);
  if (read.some((l) => l === null || l.length === 0 || l.some((x) => !LENSES.includes(x)))) return "a reviewer in the record names no known lens";
  if (rec.tier === 0) return named.length === 0 ? null : "tier 0 names no lenses, but the record lists some";
  // Triage always names correctness once any reviewer runs, and access at tier 3.
  if (!named.includes("correctness")) return `tier ${rec.tier} always names the correctness lens; triageLenses lacks it`;
  if (rec.tier === 3 && !named.includes("access")) return "tier 3 always names the access lens; triageLenses lacks it";
  const missing = named.filter((l) => !read.some((r) => r.includes(l)));
  if (missing.length) return `no reviewer read: ${missing.join(", ")}`;
  if (rec.tier === 3) {
    // One fresh agent per lens: a reviewer reading several lenses is the
    // single-worker review the skill forbids, and a repeat stands in for nobody.
    if (read.some((r) => r.length !== 1)) return "tier 3 needs one reviewer per lens";
    if (new Set(read.map((r) => r[0])).size !== read.length) return "a lens was read twice in place of another reviewer";
  }
  const need = agentsNamed(rec.tier, named);
  if (rec.reviewers.length < need) return `${rec.reviewers.length} of ${need} reviewers ran`;
  return null;
}

/** Text fit for a status description: one line, no control characters, at most 140 characters. */
export function tidy(text) {
  const clean = String(text).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 139)}…` : clean;
}

/**
 * The status for a pull request head.
 * @param {{ head: string, repo: string, pr: number, comments: { body?: unknown, trusted: boolean, url?: string, updatedAt?: string }[] }} input
 *   comments in the order they were created, `updatedAt` = when each was last edited; `trusted` = posted by someone with write access to the repository.
 * @returns {{ state: "success" | "failure", description: string, targetUrl?: string }}
 */
export function reviewGate({ head, repo, pr, comments }) {
  const fail = (why, url) => ({ state: "failure", description: tidy(`Independent review: ${why}.`), ...(url ? { targetUrl: url } : {}) });
  if (!isSha(head)) return fail("the pull request's head commit can't be read");
  // Every comment that claims to be a record, readable or not; then only the trusted ones.
  const claims = comments.filter((c) => c && hasMarker(c.body));
  const trusted = claims.filter((c) => c.trusted === true);
  if (trusted.length === 0) {
    return fail(claims.length ? "the only record was not posted by someone with write access to this repository" : "no review record on this pull request");
  }
  // The newest record decides: a later record replaces an earlier one, in
  // either direction — and one that can't be read is red, never skipped.
  // "Newest" is the one edited last, not the one created last: the skill
  // edits its record in place each round, so with two record comments a later
  // "blocked" may be written into the older of them. Comments arrive in the
  // order they were created: when the edit times can't all be read, the last
  // created decides; among records edited in the same second, the later
  // created of them (">=", scanning from the first).
  const editedAt = trusted.map((c) => Date.parse(c.updatedAt));
  const timed = editedAt.every((t) => Number.isFinite(t));
  let pick = trusted.length - 1;
  if (timed) {
    pick = 0;
    for (let i = 1; i < trusted.length; i++) if (editedAt[i] >= editedAt[pick]) pick = i;
  }
  const newest = trusted[pick];
  const url = newest.url;
  const rec = recordIn(newest.body);
  const link = typeof url === "string" && url.startsWith("https://") ? url : undefined;
  // A status belongs to a commit, not a pull request: a record copied from
  // another pull request must not vouch for this one.
  if (!rec) return fail("the newest review record can't be read (it needs one fenced json block with schema sequel-review/v1)", link);
  if (typeof rec.repo !== "string" || rec.repo.toLowerCase() !== String(repo).toLowerCase() || rec.pr !== pr) {
    return fail("the record is for another pull request", link);
  }
  const issue = coverageIssue(rec, head) ?? recordIssue(rec);
  if (issue) return fail(issue, link);
  const n = rec.reviewers.length;
  return {
    state: "success",
    description: tidy(`Independent review: ${rec.verdict}, tier ${rec.tier}, ${n} reviewer${n === 1 ? "" : "s"}, on ${head.slice(0, 7)}.`),
    ...(link ? { targetUrl: link } : {}),
  };
}

/** An API answer that was not 2xx. `status` is the HTTP status. */
export class ApiError extends Error {
  constructor(what, status) {
    super(`${what} -> ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Whether a comment's author may post a record that counts: they have write
 * access to this repository (`permissionOf(login)` → "admin" | "maintain" |
 * "write" | "triage" | "read" | "none"). What GitHub calls the author's
 * association is not used: a member or a collaborator can be read-only.
 * "Not a collaborator" (the lookup answers 404) is a no. Any other failure of
 * the lookup is NOT a no — it is "could not find out", and it is thrown, so
 * the run ends in an error status instead of quietly ignoring the newest record.
 */
export async function trustedAuthor(comment, permissionOf) {
  const login = comment?.user?.login;
  if (typeof login !== "string" || !login) return false;
  try {
    return TRUSTED_PERMISSIONS.includes(await permissionOf(login));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return false;
    throw err;
  }
}

const MAX_PAGES = 30;
const READ_ATTEMPTS = 4;
// The job is killed at 5 minutes (review-gate.yml, timeout-minutes). Reads stop well before
// that, so there is always time left to post the error status.
export const RUN_BUDGET_MS = 180_000;
/** Worth another try: GitHub being unwell (5xx), rate limiting (429), or no answer at all (network, timeout). */
const transient = (err) => !(err instanceof ApiError) || err.status >= 500 || err.status === 429;
export const COULD_NOT_CHECK = "Independent review: the gate could not check this pull request (see the workflow run); re-run it.";

/**
 * Read the pull request and its comments, decide, and post the one status.
 * `request(path, init)` talks to `/repos/<repo>/…` and returns parsed JSON; it
 * throws ApiError on a non-2xx answer. Returns what it decided (with
 * `posted: false` when the head already carries exactly that status), or null
 * when the pull request is not an open pull request into the default branch
 * of this repository.
 *
 * Reads are tried again a few times when GitHub is unwell. Once the head is
 * known, a failure anywhere posts an `error` status on it before the error is
 * re-thrown: a required check must not stay green from an earlier run because
 * this one could not finish; reading stops after RUN_BUDGET_MS so that post
 * still fits inside the job's time limit. What that cannot cover is stated in
 * docs/REVIEW-GATE.md — a run that never learns the head (the pull request can't be
 * read at all), whose error post itself fails, or whose job is killed has
 * posted nothing, and the earlier status stays until the workflow is re-run.
 */
export async function run({ repo, number, defaultBranch, request: rawRequest, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now }) {
  const started = now();
  const outOfTime = () => now() - started > RUN_BUDGET_MS;
  // GETs are retried; the one POST is not (a status that did land must not be
  // doubled blindly). No read starts, and no retry is made, once the run's
  // time budget is spent: the run then fails into the error status below
  // while the job still has time to post it.
  const request = async (path, init) => {
    if (init?.method && init.method !== "GET") return rawRequest(path, init);
    for (let attempt = 1; ; attempt++) {
      if (outOfTime()) throw new Error("the gate ran out of time reading from GitHub");
      try {
        return await rawRequest(path, init);
      } catch (err) {
        if (attempt >= READ_ATTEMPTS || !transient(err) || outOfTime()) throw err;
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
  };
  const pr = await request(`pulls/${number}`);
  if (pr.state !== "open") {
    log(`Pull request ${number} is ${tidy(pr.state)}; nothing to set.`);
    return null;
  }
  // A status belongs to a commit, and commits are shared between pull
  // requests: only a pull request into this repository's default branch is
  // judged, whichever event started the run.
  if (!defaultBranch || pr.base?.ref !== defaultBranch || String(pr.base?.repo?.full_name).toLowerCase() !== String(repo).toLowerCase()) {
    log(`Pull request ${number} is not into ${tidy(defaultBranch)} of this repository; nothing to set.`);
    return null;
  }
  // The commit this run judges and reports on is read once, here: a push that
  // lands while it runs gets its own run (and starts with no status).
  const head = pr.head.sha;
  const post = (status) => request(`statuses/${head}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(status) });
  try {
    const raw = [];
    for (let page = 1; ; page++) {
      if (page > MAX_PAGES) throw new Error(`more than ${MAX_PAGES * 100} comments; the gate will not decide on a partial list`);
      const batch = await request(`issues/${number}/comments?per_page=100&page=${page}`);
      raw.push(...batch);
      if (batch.length < 100) break;
    }
    // Every comment that claims to be a record has its author checked, whether
    // or not the record in it can be read; each login is looked up once.
    const looked = new Map();
    const permissionOf = (login) => {
      if (!looked.has(login)) looked.set(login, request(`collaborators/${encodeURIComponent(login)}/permission`).then((p) => p?.permission));
      return looked.get(login);
    };
    const comments = [];
    for (const c of raw) {
      comments.push({ body: c?.body, url: c?.html_url, updatedAt: c?.updated_at ?? c?.created_at, trusted: hasMarker(c?.body) ? await trustedAuthor(c, permissionOf) : false });
    }
    const out = reviewGate({ head, repo, pr: Number(number), comments });
    const status = { state: out.state, context: CONTEXT, description: out.description, ...(out.targetUrl ? { target_url: out.targetUrl } : {}) };
    // GitHub keeps a limited number of statuses per commit and context, and
    // this runs on every comment: an unchanged status is not posted again.
    const existing = await request(`commits/${head}/statuses?per_page=100`);
    const current = Array.isArray(existing) ? existing.find((x) => x?.context === CONTEXT) : undefined;
    const same = current && current.state === status.state && current.description === status.description && (current.target_url ?? undefined) === status.target_url;
    if (!same) await post(status);
    log(`${CONTEXT} on ${head.slice(0, 7)}: ${out.state}${same ? " (unchanged)" : ""}. ${out.description}`);
    return { sha: head, posted: !same, ...status };
  } catch (err) {
    await post({ state: "error", context: CONTEXT, description: COULD_NOT_CHECK }).catch(() => {});
    throw err;
  }
}

async function main() {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: number, GITHUB_API_URL: api = "https://api.github.com" } = process.env;
  if (!token || !repo || !/^\d+$/.test(number ?? "") || !process.env.DEFAULT_BRANCH) {
    throw new Error("GITHUB_TOKEN, GITHUB_REPOSITORY, DEFAULT_BRANCH and a numeric PR_NUMBER are required.");
  }
  const request = async (path, init = {}) => {
    const res = await fetch(`${api}/repos/${repo}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new ApiError(`${init.method ?? "GET"} ${path.split("?")[0]}`, res.status);
    return res.json();
  };
  await run({ repo, number, defaultBranch: process.env.DEFAULT_BRANCH, request, log: console.log });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(tidy(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
}
