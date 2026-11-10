import { describe, expect, it } from "vitest";
import { agentsNamed, ApiError, COULD_NOT_CHECK, hasMarker, RUN_BUDGET_MS, coverageIssue, MARKER, recordIn, recordIssue, reviewGate, run as runGate, sameSha, tidy, trustedAuthor } from "../review-gate/review-gate.mjs";

// The review gate (owner, 2026-11-10): the `independent-review` status is
// green only when a review record covers the pull request's exact head and
// shows a finished, passing review. Each case names the wrong version it
// catches; most are the defects the first gate was sent back for.
const HEAD = "09e235ad9f00b68344b80e5ba52e3feac47a1eff";
const OLD = "77cf69cddcf17636012a387a209aa7329c292e09";
const ALL = ["access", "data", "runtime", "correctness", "conventions"];
const one = (l: string) => ({ lenses: [l], model: "opus" });
const FIVE = ALL.map(one);

// Shaped like the skill's own records (reference/record-format.md), plus triageLenses.
const record = (over: Record<string, unknown> = {}) => ({
  schema: "sequel-review/v1",
  repo: "sequelortho/outreach-directory",
  pr: 5,
  headSha: HEAD,
  base: "main",
  round: 1,
  tier: 3,
  triageReasons: ["CI / deploy pipeline"],
  triageLenses: ALL,
  reviewers: FIVE,
  coordinatorModel: "opus",
  verdict: "clear",
  findings: [],
  ...over,
});
const body = (rec: unknown) => `${MARKER}\n### Independent review\n\n<details><summary>Record</summary>\n\n\`\`\`json\n${JSON.stringify(rec)}\n\`\`\`\n</details>`;
const comment = (rec: unknown, trusted = true) => ({ body: body(rec), trusted });
const REPO = "SequelOrtho/outreach-directory";
const run = (comments: { body: unknown; trusted: boolean; url?: string }[], head = HEAD) => reviewGate({ head, repo: REPO, pr: 5, comments });
const gate = (over: Record<string, unknown> = {}, head = HEAD) => run([comment(record(over))], head);
const state = (over: Record<string, unknown> = {}) => gate(over).state;

describe("review gate — is there a record for this commit", () => {
  it("is red with no record, or a marker with nothing readable behind it", () => {
    expect(run([])).toEqual({ state: "failure", description: "Independent review: no review record on this pull request." });
    expect(run([{ body: "LGTM", trusted: true }, { body: null, trusted: true }]).state).toBe("failure");
    expect(run([{ body: `${MARKER}\nreviewed, trust me`, trusted: true }]).state).toBe("failure");
    expect(run([{ body: `${MARKER}\n\`\`\`json\n{not json\n\`\`\``, trusted: true }]).state).toBe("failure");
    expect(recordIn(body({ ...record(), schema: "something-else" }))).toBeNull();
    expect(recordIn(body([record()]))).toBeNull();
    expect(recordIn(body(record()).replace(/\n/g, "\r\n"))).toMatchObject({ headSha: HEAD });
  });

  it("is green for a passing record on the exact head", () => {
    expect(gate()).toEqual({ state: "success", description: "Independent review: clear, tier 3, 5 reviewers, on 09e235a." });
    expect(state({ verdict: "clear-with-advisories" })).toBe("success");
    expect(run([{ ...comment(record()), url: "https://github.com/x/y/pull/5#issuecomment-1" }]).targetUrl).toBe("https://github.com/x/y/pull/5#issuecomment-1");
    expect(run([{ ...comment(record()), url: "javascript:alert(1)" }]).targetUrl).toBeUndefined();
  });

  // The wrong version: a status is per commit, so a record copied from another
  // pull request (or another repository) with the same head turns this one green.
  it("is red for a record written for another pull request", () => {
    expect(gate({ pr: 4 }).description).toBe("Independent review: the record is for another pull request.");
    expect(state({ pr: "5" })).toBe("failure");
    expect(state({ pr: undefined })).toBe("failure");
    expect(state({ repo: "sequelortho/scheduler-hub" })).toBe("failure");
    expect(state({ repo: undefined })).toBe("failure");
    expect(state({ repo: "SEQUELORTHO/Outreach-Directory" })).toBe("success");
  });

  // The wrong version: a record for an earlier commit still passes after a push.
  it("is red when the head moved past the record, naming both commits", () => {
    const out = gate({ headSha: OLD });
    expect(out.state).toBe("failure");
    expect(out.description).toBe("Independent review: the record covers 77cf69c; the head is 09e235a.");
    expect(state({ headSha: undefined })).toBe("failure");
    expect(state({ headSha: "" })).toBe("failure");
    expect(sameSha("", "")).toBe(false);
    expect(sameSha(HEAD, HEAD.toUpperCase())).toBe(true);
  });

  // The wrong version: a 7-character prefix counts as the commit, so anyone
  // who can push to the branch can craft an unreviewed commit sharing it.
  it("matches the head by its full id only; a short id never covers a commit", () => {
    const lookalike = HEAD.slice(0, 7) + "f".repeat(33);
    expect(sameSha(HEAD.slice(0, 7), HEAD)).toBe(false);
    expect(sameSha(HEAD.slice(0, 39), HEAD)).toBe(false);
    expect(gate({ headSha: HEAD.slice(0, 7) }, lookalike).state).toBe("failure");
    expect(gate({ headSha: OLD, deltas: [{ to: HEAD.slice(0, 7), kind: "fix", reviewed: true }] }, lookalike).state).toBe("failure");
    // Even for the true head, a short id is refused, with a reason that says what to write.
    expect(gate({ headSha: HEAD.slice(0, 7) }).description).toMatch(/short id; headSha .* must be the full 40 characters/);
    expect(gate({ headSha: HEAD.slice(0, 7) }).description.length).toBeLessThanOrEqual(140);
    expect(state({ headSha: OLD, deltas: [{ to: HEAD.slice(0, 12), kind: "fix", reviewed: true }] })).toBe("failure");
    // Earlier deltas may keep short ids; only the claim on the head must be exact.
    expect(state({ headSha: HEAD, deltas: [{ from: "9ba0d3f", to: "8ddd126", kind: "fix", reviewed: true }] })).toBe("success");
    expect(run([comment(record())], "").state).toBe("failure");
  });
});

describe("review gate — changes after the review (skill §4a)", () => {
  const delta = (d: Record<string, unknown>, headSha = OLD) => ({ headSha, deltas: [{ from: OLD.slice(0, 7), to: HEAD, ...d }] });

  it("accepts a reviewed delta, or an unreviewed clean merge of main, ending at the head", () => {
    expect(state(delta({ kind: "fix", reviewed: true }))).toBe("success");
    expect(state(delta({ kind: "merge-main", reviewed: false }))).toBe("success");
    expect(state(delta({ kind: "owner-change", reviewed: true }, HEAD))).toBe("success");
  });

  // The wrong versions: any delta ending at the head counts; and the rule is
  // skipped once the record's headSha is moved to the head.
  it("is red for an unreviewed fix, wherever headSha points", () => {
    for (const headSha of [OLD, HEAD]) {
      expect(state(delta({ kind: "fix", reviewed: false }, headSha))).toBe("failure");
      expect(state(delta({ kind: "owner-change" }, headSha))).toBe("failure");
      expect(state(delta({ kind: "conflict-resolution", reviewed: "yes" }, headSha))).toBe("failure");
    }
    expect(gate(delta({ kind: "fix", reviewed: false }, HEAD)).description).toMatch(/recorded as not reviewed/);
    // Two entries end at the head; one unreviewed is enough to fail.
    const two = { headSha: HEAD, deltas: [{ to: HEAD, kind: "fix", reviewed: true }, { to: HEAD, kind: "fix", reviewed: false }] };
    expect(state(two)).toBe("failure");
  });

  // The wrong version: only the delta that ends at the head is checked, so an
  // unreviewed fix followed by a merge of main passes.
  it("is red when any earlier change in the list was not reviewed, or the list can't be read", () => {
    const mid = "1234567890abcdef1234567890abcdef12345678";
    const chain = (first: Record<string, unknown>) => ({
      headSha: HEAD,
      deltas: [{ from: OLD.slice(0, 7), to: mid.slice(0, 7), ...first }, { from: mid.slice(0, 7), to: HEAD, kind: "merge-main", reviewed: false }],
    });
    expect(state(chain({ kind: "fix", reviewed: true }))).toBe("success");
    expect(state(chain({ kind: "fix", reviewed: false }))).toBe("failure");
    expect(gate(chain({ kind: "fix", reviewed: false })).description).toBe("Independent review: a change after the review is recorded as not reviewed.");
    expect(state({ deltas: [null] })).toBe("failure");
    expect(state({ deltas: "none" })).toBe("failure");
    expect(state({ deltas: [] })).toBe("success");
    expect(coverageIssue(record({ headSha: OLD, deltas: [{ to: "abc", kind: "merge-main", reviewed: false }] }), HEAD)).not.toBeNull();
  });
});

describe("review gate — is it a finished, passing review", () => {
  // The wrong version: green for anything not literally "blocked".
  it("is red unless the verdict is one of the passing ones", () => {
    for (const verdict of ["blocked", "escalated", "Blocked", "CLEAR", "approved", "", undefined, null, 1]) expect(state({ verdict })).toBe("failure");
    expect(gate({ verdict: "escalated" }).description).toMatch(/waits on the owner/);
    for (const tier of [undefined, null, "3", 4, -1, 1.5]) expect(state({ tier })).toBe("failure");
  });

  // The wrong version: trusting "clear" while the record's own table has an unsettled blocker.
  it("is red while the record's own findings hold a blocker or should-fix that is not settled", () => {
    const f = (severity: unknown, status?: unknown) => ({ id: "F1", severity, status });
    for (const status of ["open", "disputed", "advisory", "", undefined, "Fixed"]) {
      expect(state({ findings: [f("blocker", status)] })).toBe("failure");
      expect(state({ findings: [f("should-fix", status)] })).toBe("failure");
    }
    expect(state({ findings: [f("should-fix", "fixed"), f("blocker", "superseded"), f("should-fix", "accepted-risk"), f("advisory", "open"), f("advisory", "advisory")] })).toBe("success");
    expect(state({ findings: [f("critical", "fixed")] })).toBe("failure");
    expect(state({ findings: [null] })).toBe("failure");
    expect(state({ findings: "none" })).toBe("failure");
    expect(state({ findings: undefined })).toBe("success");
  });
});

describe("review gate — did the reviewers triage named actually run", () => {
  // The wrong versions: counts read from fields no record has; a fixed minimum of two at tier 3.
  it("tier 3: one reviewer per named lens, each lens once", () => {
    expect(state({ reviewers: FIVE.slice(0, 2) })).toBe("failure");
    expect(state({ reviewers: FIVE.slice(0, 4) })).toBe("failure");
    expect(gate({ reviewers: FIVE.slice(0, 4) }).description).toBe("Independent review: no reviewer read: conventions.");
    expect(state({ reviewers: [...FIVE.slice(0, 4), one("access")] })).toBe("failure");
    expect(state({ reviewers: [...FIVE, one("access")] })).toBe("failure");
    // One worker reading every lens is not a tier-3 review.
    expect(state({ reviewers: [{ lenses: ALL, model: "opus" }] })).toBe("failure");
    expect(state({ reviewers: [{ lenses: ["access", "data"] }, one("runtime"), one("correctness"), one("conventions")] })).toBe("failure");
    // Triage may name fewer than five lenses at tier 3.
    const three = ["access", "runtime", "correctness"];
    expect(state({ triageLenses: three, reviewers: three.map(one) })).toBe("success");
    expect(state({ triageLenses: three, reviewers: three.slice(0, 2).map(one) })).toBe("failure");
  });

  // `reviewers` is the roster of the full review; agents of later rounds and
  // of delta reviews are recorded in `history` / `deltas` (docs/REVIEW-GATE.md). The
  // wrong version: a correct multi-round review that can only be written red.
  it("a multi-round record keeps the full-review roster in reviewers", () => {
    const round3 = {
      round: 3,
      reviewers: FIVE,
      deltas: [{ from: "9ba0d3f", to: "8ddd126", kind: "fix", reviewed: true, reviewers: [one("data"), one("correctness")] }, { from: "8ddd126", to: HEAD, kind: "owner-change", reviewed: true, reviewers: [{ lenses: ["correctness"], model: "sonnet" }] }],
      history: [{ round: 1, verdict: "blocked" }, { round: 2, verdict: "blocked", reviewers: [one("data")] }, { round: 3, verdict: "clear" }],
    };
    expect(state(round3)).toBe("success");
    // Appending the re-review agents to `reviewers` is the form the gate refuses.
    expect(gate({ ...round3, reviewers: [...FIVE, one("data")] }).description).toBe("Independent review: a lens was read twice in place of another reviewer.");
  });

  it("needs triageLenses, and reviewers it can read", () => {
    expect(gate({ triageLenses: undefined }).description).toMatch(/does not list triageLenses/);
    expect(state({ triageLenses: [] })).toBe("failure");
    expect(state({ triageLenses: "all" })).toBe("failure");
    expect(state({ triageLenses: [...ALL, "vibes"] })).toBe("failure");
    expect(state({ triageLenses: ["access", "access"], reviewers: [one("access"), one("access")] })).toBe("failure");
    expect(state({ reviewers: undefined })).toBe("failure");
    expect(state({ reviewers: [...FIVE.slice(0, 4), { model: "opus" }] })).toBe("failure");
    expect(state({ reviewers: [...FIVE.slice(0, 4), { lenses: [] }] })).toBe("failure");
    expect(state({ reviewers: [...FIVE.slice(0, 4), { lenses: ["style"] }] })).toBe("failure");
    expect(state({ reviewers: [...FIVE.slice(0, 4), null] })).toBe("failure");
  });

  // Triage's own roster rule (the skill's scripts/triage.mjs). The wrong
  // version: "tier 2 needs two reviewers", which fails a correct review of a
  // change that touches only behavior lenses.
  it("tier 2: one reviewer for the risk lenses and one for the behavior lenses, where each is named", () => {
    const risk = { lenses: ["access", "data", "runtime"] };
    const behavior = { lenses: ["correctness", "conventions"] };
    expect(agentsNamed(2, ALL)).toBe(2);
    expect(agentsNamed(2, ["correctness", "conventions"])).toBe(1);
    expect(agentsNamed(3, ["access", "correctness"])).toBe(2);
    expect(state({ tier: 2, reviewers: [risk, behavior] })).toBe("success");
    expect(state({ tier: 2, reviewers: [{ lenses: ALL }] })).toBe("failure");
    expect(gate({ tier: 2, reviewers: [{ lenses: ALL }] }).description).toBe("Independent review: 1 of 2 reviewers ran.");
    expect(state({ tier: 2, reviewers: [risk, { lenses: ["correctness"] }] })).toBe("failure");
    expect(state({ tier: 2, triageLenses: ["correctness"], reviewers: [{ lenses: ["correctness"] }] })).toBe("success");
    expect(state({ tier: 2, triageLenses: ["runtime", "correctness"], reviewers: [{ lenses: ["runtime", "correctness"] }] })).toBe("failure");
  });

  it("tiers 1 and 0, and the lenses triage always names", () => {
    const behavior = { lenses: ["correctness", "conventions"] };
    expect(state({ tier: 1, triageLenses: ["correctness", "conventions"], reviewers: [behavior] })).toBe("success");
    expect(state({ tier: 1, triageLenses: ["correctness"], reviewers: [] })).toBe("failure");
    expect(state({ tier: 1, triageLenses: [], reviewers: [behavior] })).toBe("failure");
    // Correctness runs whenever any reviewer runs; access always at tier 3.
    expect(state({ tier: 1, triageLenses: ["conventions"], reviewers: [{ lenses: ["conventions"] }] })).toBe("failure");
    expect(state({ tier: 3, triageLenses: ["correctness"], reviewers: [one("correctness")] })).toBe("failure");
    // Tier 0 is 0, not "missing".
    expect(gate({ tier: 0, triageLenses: [], reviewers: [] })).toEqual({ state: "success", description: "Independent review: clear, tier 0, 0 reviewers, on 09e235a." });
    expect(state({ tier: 0, triageLenses: ["correctness"], reviewers: [] })).toBe("failure");
  });
});

describe("review gate — who posted the record, and which record decides", () => {
  // The wrong version: anyone who can comment turns the gate green.
  it("ignores a record that was not posted by someone with write access", () => {
    const out = run([comment(record(), false)]);
    expect(out).toEqual({ state: "failure", description: "Independent review: the only record was not posted by someone with write access to this repository." });
    expect(run([{ body: body(record()), trusted: "yes" as never }]).state).toBe("failure");
    // An outsider's later record neither passes the gate nor overrides a trusted one.
    expect(run([comment(record({ verdict: "blocked" })), comment(record(), false)]).state).toBe("failure");
    expect(run([comment(record()), comment(record({ verdict: "blocked" }), false)]).state).toBe("success");
  });

  // The wrong version: a newer record that can't be parsed is dropped, and the
  // older passing one decides — the status goes green while the newest record
  // says blocked.
  it("is red when the newest trusted record can't be read, whatever came before", () => {
    const blocked = record({ verdict: "blocked" });
    const unreadable = [
      `${MARKER}\n\`\`\`json\n{"schema":"sequel-review/v1","verdict":"blocked",}\n\`\`\``, // trailing comma
      `${MARKER}\n~~~json\n${JSON.stringify(blocked)}\n~~~`, // another fence
      `${MARKER}\n\`\`\`\n${JSON.stringify(blocked)}\n\`\`\``, // no json tag
      body({ ...blocked, schema: undefined }),
      body({ ...blocked, schema: "sequel-review/v2" }),
      `${MARKER}\n\`\`\`json\n{"note":"something else first"}\n\`\`\`\n${body(blocked)}`,
      `${MARKER}\nround 2: blocked, record to follow`,
    ];
    for (const b of unreadable) {
      const out = run([comment(record()), { body: b, trusted: true }]);
      expect(out.state).toBe("failure");
      expect(out.description).toMatch(/newest review record can't be read/);
      expect(out.description.length).toBeLessThanOrEqual(140);
    }
    // A comment that only mentions or quotes the marker is talk, not a record.
    // The wrong version: explaining the gate in a comment turns a passing review red.
    const mentions = [`The gate looks for \`${MARKER}\` at the top of a comment.`, `> ${body(record({ verdict: "blocked" })).replace(/\n/g, "\n> ")}`, `see ${MARKER} above`];
    mentions.push(`Round 2: ${MARKER}`, `- ${MARKER}`, `## ${MARKER}`);
    for (const b of mentions) {
      expect(hasMarker(b)).toBe(false);
      expect(run([comment(record()), { body: b, trusted: true }]).state).toBe("success");
    }
    expect(run([{ body: mentions[0], trusted: true }]).description).toBe("Independent review: no review record on this pull request.");
    // But a real record posted under a line of text is still the newest record.
    // The wrong version: only a comment that STARTS with the marker counts, so
    // "Round 2:" above a blocked record leaves the older pass deciding.
    for (const lead of ["Round 2:\n\n", "## Independent review\n", "\n\n  ", "\u200b\n"]) {
      const out = run([comment(record()), { body: `${lead}${body(record({ verdict: "blocked" }))}`, trusted: true }]);
      expect(out.description).toBe("Independent review: the review is blocked.");
    }
    expect(run([{ body: `Round 2:\r\n\r\n${body(record()).replace(/\n/g, "\r\n")}`, trusted: true }]).state).toBe("success");
    // …and so is one whose marker line carries other text, or has an invisible
    // character before it. The wrong version: the marker must be ALONE on its
    // line, so these newer blocked records are skipped for the older pass.
    const blockedBody = body(record({ verdict: "blocked" }));
    const firstLines = [`${MARKER} Round 2 — blocked`, `${MARKER}<!-- round 2 -->`, `\uFEFF${MARKER}`, `\u00a0${MARKER}`, `\u200b${MARKER}`, `\t ${MARKER}  `];
    // Any whitespace or invisible character a paste can leave (the wrong version: a short hand-picked list).
    for (const ch of ["\v", "\f", "\u3000", "\u2009", "\u202f", "\u2003", "\u200c", "\u200d", "\u200e", "\u2060", "\u00ad", "\u061c", "\u202a", "\u202e", "\u2066", "\u2069", "\u034f", "\ufe0f", "\u3164", "\u{e0100}", "\u{e01ef}", "\u180b", "\u2800"]) firstLines.push(`${ch}${MARKER}`);
    for (const first of firstLines) {
      const out = run([comment(record()), { body: blockedBody.replace(MARKER, first), trusted: true }]);
      expect(out.description).toBe("Independent review: the review is blocked.");
    }
    // A format sign that draws a glyph is visible text: the line is a mention,
    // so the earlier record still decides. The wrong version: the whole Unicode
    // "format" category is allowed before the marker.
    for (const ch of ["\u0600", "\u06dd", "\u{110bd}"]) {
      expect(hasMarker(`${ch}${MARKER}`)).toBe(false);
      expect(run([comment(record()), { body: `${ch}${MARKER} broken`, trusted: true }]).state).toBe("success");
    }
    // A copy of the marker at the start of a line counts even inside a code
    // block: it leans to red (docs/REVIEW-GATE.md says to quote it with ">" or backticks).
    for (const sample of [`Format:\n\n~~~markdown\n${MARKER}\n~~~`, `Example:\n\n    ${MARKER}\n`]) {
      expect(run([comment(record()), { body: sample, trusted: true }]).description).toMatch(/newest review record can't be read/);
    }
    // The json block that counts is the first one after the marker, not one above it.
    expect(run([{ body: `\`\`\`json\n{"schema":"sequel-review/v1","verdict":"clear"}\n\`\`\`\n${body(record({ verdict: "blocked" }))}`, trusted: true }]).description).toBe("Independent review: the review is blocked.");
    // An unreadable record from an outsider changes nothing.
    expect(run([comment(record()), { body: unreadable[0], trusted: false }]).state).toBe("success");
  });

  // The skill edits its record in place each round. The wrong version: "newest"
  // means created last, so a blocked verdict written into the older of two
  // record comments is passed over for the newer comment's stale pass.
  it("with two record comments, the one edited last decides", () => {
    const at = (rec: unknown, updatedAt: string | undefined) => ({ ...comment(rec), updatedAt });
    const clear = record();
    const blocked = record({ verdict: "blocked", round: 2 });
    // A (older comment) was edited to blocked after B (newer comment) was posted clear.
    expect(run([at(blocked, "2026-11-10T12:00:00Z"), at(clear, "2026-11-10T09:00:00Z")]).description).toBe("Independent review: the review is blocked.");
    // And the other way round: the older comment edited to clear after the newer one said blocked.
    expect(run([at(clear, "2026-11-10T12:00:00Z"), at(blocked, "2026-11-10T09:00:00Z")]).state).toBe("success");
    // Equal times, or a time that can't be read: creation order decides.
    expect(run([at(clear, "2026-11-10T09:00:00Z"), at(blocked, "2026-11-10T09:00:00Z")]).state).toBe("failure");
    // With a third record, a tie between the two edited last still goes to the
    // later created of the pair. The wrong version: the scan starts from the
    // last comment with ">", so the earlier of the tied pair wins.
    const stray = { body: `${MARKER} stray`, trusted: true, updatedAt: "2026-11-10T08:59:58Z" };
    expect(run([at(clear, "2026-11-10T09:00:00Z"), at(blocked, "2026-11-10T09:00:00Z"), stray]).description).toBe("Independent review: the review is blocked.");
    expect(run([at(blocked, "2026-11-10T09:00:00Z"), at(clear, "2026-11-10T09:00:00Z"), stray]).state).toBe("success");
    expect(run([at(blocked, "2026-11-10T12:00:00Z"), at(clear, undefined)]).state).toBe("success");
    expect(run([at(blocked, "not a date"), at(clear, "2026-11-10T09:00:00Z")]).state).toBe("success");
    // An outsider's later edit decides nothing.
    expect(run([at(clear, "2026-11-10T09:00:00Z"), { ...comment(blocked, false), updatedAt: "2026-11-10T12:00:00Z" }]).state).toBe("success");
    // An unreadable record edited last is still the newest, and red.
    expect(run([{ body: `${MARKER}\nbroken`, trusted: true, updatedAt: "2026-11-10T12:00:00Z" }, at(clear, "2026-11-10T09:00:00Z")]).description).toMatch(/newest review record can't be read/);
  });

  // The wrong version: any older passing record keeps the gate green after a newer one says blocked.
  it("lets the newest trusted record decide", () => {
    expect(run([comment(record({ verdict: "blocked" })), comment(record({ round: 2 }))]).state).toBe("success");
    expect(run([comment(record()), comment(record({ verdict: "blocked", round: 2 }))]).state).toBe("failure");
    expect(run([comment(record()), comment(record({ headSha: OLD }))]).state).toBe("failure");
  });
});

// Records as they were really posted on this repository's pull requests
// (trimmed to the fields the gate reads). The wrong version: a gate that only
// passes its own fixtures.
describe("review gate — real records", () => {
  it("passes the tier-0 record of pull request 4 on its head", () => {
    const rec = { schema: "sequel-review/v1", repo: "sequelortho/outreach-directory", pr: 4, headSha: "b29601257fce5a9d645e1f408e4ac042775201d4", base: "main", round: 1, tier: 0, triageReasons: ["prose docs"], triageLenses: [], reviewers: [], verdict: "clear", findings: [], history: [] };
    expect(reviewGate({ head: rec.headSha, repo: REPO, pr: 4, comments: [comment(rec)] }).state).toBe("success");
  });

  it("passes the final record of pull request 3 on the merged head, and not on a later commit", () => {
    const rec = {
      schema: "sequel-review/v1", repo: "sequelortho/outreach-directory", pr: 3, headSha: "2b9fa9cd4ae0a833ce594a94552b556154c67421", base: "main", round: 3, tier: 3,
      triageLenses: ALL, reviewers: FIVE, reviewersNamedByTriage: 5, reviewersRan: 5, coordinatorModel: "opus", verdict: "clear",
      findings: [{ id: "F1", severity: "blocker", status: "fixed" }, { id: "F2", severity: "blocker", status: "superseded" }, { id: "F7", severity: "should-fix", status: "fixed" }, { id: "A5", severity: "advisory", status: "fixed" }],
      deltas: [{ from: "9ba0d3f", to: "8ddd126", kind: "fix", reviewed: true }, { from: "8ddd126", to: "44d2bf8", kind: "fix", reviewed: true }, { from: "44d2bf8", to: "2b9fa9c", kind: "owner-change", reviewed: true }],
    };
    expect(reviewGate({ head: rec.headSha, repo: REPO, pr: 3, comments: [comment(rec)] }).state).toBe("success");
    expect(reviewGate({ head: HEAD, repo: REPO, pr: 3, comments: [comment(rec)] }).state).toBe("failure");
    // Its round-2 state: blocked, with an open blocker.
    expect(reviewGate({ head: "8ddd12683cf3aaa7c8ca6a4e7463e5d975d2ff07", repo: REPO, pr: 3, comments: [comment({ ...rec, headSha: "8ddd12683cf3aaa7c8ca6a4e7463e5d975d2ff07", verdict: "blocked", deltas: rec.deltas.slice(0, 1) })] }).description).toBe("Independent review: the review is blocked.");
  });

  it("is red for the records of pull requests 1 and 2, written before triageLenses (and escalated)", () => {
    const rec = { schema: "sequel-review/v1", repo: "sequelortho/outreach-directory", pr: 2, headSha: HEAD, tier: 3, reviewers: FIVE, verdict: "escalated", findings: [{ id: "F1", severity: "should-fix", status: "open" }] };
    expect(reviewGate({ head: HEAD, repo: REPO, pr: 2, comments: [comment(rec)] }).state).toBe("failure");
    expect(reviewGate({ head: HEAD, repo: REPO, pr: 2, comments: [comment({ ...rec, verdict: "clear", findings: [] })] }).description).toMatch(/does not list triageLenses/);
  });
});

describe("review gate — what it writes", () => {
  // The wrong version: record text straight into the status line and the log.
  it("keeps the description to one clean line of at most 140 characters", () => {
    expect(tidy("a\nb\r\n::error::c\u0000d e")).toBe("a b ::error::c d e");
    expect(tidy("x".repeat(200))).toHaveLength(140);
    const out = gate({ headSha: "0000000\n::error::pwned" });
    expect(out.description).not.toMatch(/[\n\r]/);
    expect(out.description.length).toBeLessThanOrEqual(140);
    expect(gate({ triageLenses: ALL, reviewers: [] }).description.length).toBeLessThanOrEqual(140);
    expect(gate({ triageLenses: ALL, reviewers: [] }).description).toBe("Independent review: no reviewer read: access, data, runtime, correctness, conventions.");
    expect(recordIssue(record({ verdict: "x".repeat(500) }))).toBe("the record's verdict is not one the gate knows");
  });
});

// The part that talks to GitHub, against a stand-in for its API.
describe("review gate — reading the pull request and posting the status", () => {
  type Call = { path: string; init?: { method?: string; body?: string } };
  type Opts = {
    state?: string;
    base?: { ref: string; repo: { full_name: string } };
    comments?: unknown[];
    permission?: Record<string, string | Error>;
    existing?: unknown[];
    fail?: (path: string, init?: Call["init"]) => Error | undefined;
  };
  const api = (opts: Opts = {}) => {
    const calls: Call[] = [];
    const request = async (path: string, init?: Call["init"]) => {
      calls.push({ path, init });
      const boom = opts.fail?.(path, init);
      if (boom) throw boom;
      if (path === "pulls/5") return { state: opts.state ?? "open", head: { sha: HEAD }, base: opts.base ?? { ref: "main", repo: { full_name: REPO } } };
      const page = path.match(/^issues\/5\/comments\?per_page=100&page=(\d+)$/);
      if (page) return (opts.comments ?? []).slice((Number(page[1]) - 1) * 100, Number(page[1]) * 100);
      const who = path.match(/^collaborators\/(.+)\/permission$/);
      if (who) {
        const known: Record<string, string | Error> = { someone: "write", o: "admin", m: "write", ...opts.permission };
        const p = known[decodeURIComponent(who[1])];
        if (p === undefined) throw new ApiError(`GET ${path}`, 404);
        if (p instanceof Error) throw p;
        return { permission: p };
      }
      if (path === `commits/${HEAD}/statuses?per_page=100`) return opts.existing ?? [];
      if (path === `statuses/${HEAD}` && init?.method === "POST") return {};
      throw new Error(`unexpected ${path}`);
    };
    return { calls, request, posted: () => calls.filter((c) => c.init?.method === "POST").map((c) => ({ path: c.path, ...JSON.parse(c.init!.body!) })) };
  };
  const LINK = "https://github.com/SequelOrtho/outreach-directory/pull/5#issuecomment-9";
  const by = (author_association: string, login = "someone", rec: unknown = record()) => ({ body: body(rec), html_url: LINK, author_association, user: { login } });
  const waits: number[] = [];
  const sleep = async (ms: number) => void waits.push(ms);
  const go = (a: ReturnType<typeof api>) => runGate({ repo: REPO, number: "5", defaultBranch: "main", request: a.request, sleep });
  const GREEN = { state: "success", context: "independent-review", description: "Independent review: clear, tier 3, 5 reviewers, on 09e235a.", target_url: LINK };

  it("reads each comment's edit time from GitHub, so the record edited last decides", async () => {
    const older = { ...by("OWNER", "o", record({ verdict: "blocked", round: 2 })), created_at: "2026-11-10T08:00:00Z", updated_at: "2026-11-10T12:00:00Z" };
    const newer = { ...by("OWNER"), created_at: "2026-11-10T09:00:00Z", updated_at: "2026-11-10T09:00:00Z" };
    const a = api({ comments: [older, newer] });
    await go(a);
    expect(a.posted()).toMatchObject([{ state: "failure", description: "Independent review: the review is blocked." }]);
  });

  it("posts one status, on the head it read, with the record's link", async () => {
    const a = api({ comments: [by("MEMBER")] });
    expect(await go(a)).toEqual({ sha: HEAD, posted: true, ...GREEN });
    expect(a.posted()).toEqual([{ path: `statuses/${HEAD}`, ...GREEN }]);
    // Nothing else is written.
    expect(a.calls.filter((c) => c.init?.method && c.init.method !== "GET")).toHaveLength(1);
  });

  it("posts red with no comments, and nothing at all on a closed or merged pull request", async () => {
    const none = api();
    await go(none);
    expect(none.posted()).toMatchObject([{ state: "failure", description: "Independent review: no review record on this pull request." }]);
    const closed = api({ state: "closed", comments: [by("OWNER")] });
    expect(await go(closed)).toBeNull();
    expect(closed.posted()).toEqual([]);
  });

  // A status belongs to a commit, and two pull requests can share one. The
  // wrong version: a comment on a pull request into another branch (the
  // comment trigger has no branch filter) sets the status of the shared head.
  it("sets nothing for a pull request that is not into this repository's default branch", async () => {
    for (const base of [{ ref: "release", repo: { full_name: REPO } }, { ref: "main", repo: { full_name: "someone/fork" } }]) {
      const a = api({ base, comments: [by("OWNER")] });
      expect(await go(a)).toBeNull();
      expect(a.posted()).toEqual([]);
      expect(a.calls.map((c) => c.path)).toEqual(["pulls/5"]);
    }
    const noDefault = api({ comments: [by("OWNER")] });
    expect(await runGate({ repo: REPO, number: "5", defaultBranch: "", request: noDefault.request, sleep })).toBeNull();
    expect(noDefault.posted()).toEqual([]);
  });

  // Owner ruling 2026-11-10: "write access only". The wrong versions: anyone
  // who can comment turns the gate green; or GitHub's label for the author
  // (owner / member / collaborator) is trusted, though a member or a
  // collaborator can be read-only.
  it("counts a record only from someone with write access to the repository", async () => {
    for (const p of ["admin", "maintain", "write"]) {
      for (const assoc of ["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR", "NONE"]) {
        const a = api({ comments: [by(assoc, "writer")], permission: { writer: p } });
        await go(a);
        expect(a.posted()[0].state).toBe("success");
      }
    }
    for (const p of ["read", "triage", "none", undefined]) {
      for (const assoc of ["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR", "NONE", ""]) {
        const a = api({ comments: [by(assoc, "reader")], permission: p ? { reader: p } : {} });
        await go(a);
        expect(a.posted()[0]).toMatchObject({ state: "failure", description: "Independent review: the only record was not posted by someone with write access to this repository." });
      }
    }
    expect(await trustedAuthor({ author_association: "OWNER" }, async () => "admin")).toBe(false); // no login to look up
    expect(await trustedAuthor(null, async () => "admin")).toBe(false);
    // A read-only member's later record neither passes nor overrides a writer's.
    const mixed = api({ comments: [by("MEMBER", "writer", record({ verdict: "blocked" })), by("MEMBER", "reader")], permission: { writer: "write", reader: "read" } });
    await go(mixed);
    expect(mixed.posted()[0].description).toBe("Independent review: the review is blocked.");
    // One lookup per person, and none for comments that claim no record.
    const many = api({ comments: [{ body: "hi", author_association: "NONE", user: { login: "chatty" } }, by("NONE", "q"), by("NONE", "q")], permission: { q: "write" } });
    await go(many);
    expect(many.calls.filter((c) => c.path.startsWith("collaborators/")).map((c) => c.path)).toEqual(["collaborators/q/permission"]);
  });

  // The wrong version: "could not find out who posted the newest record"
  // treated as "not trusted", so the blocked record is ignored and an older
  // clear one turns the status green.
  it("does not go green when it cannot find out who posted a record", async () => {
    for (const err of [new ApiError("GET collaborators", 502), new ApiError("GET collaborators", 403), new Error("timeout")]) {
      const a = api({ comments: [by("OWNER"), by("CONTRIBUTOR", "quiet-member", record({ verdict: "blocked" }))], permission: { "quiet-member": err } });
      await expect(go(a)).rejects.toBe(err);
      expect(a.posted()).toEqual([{ path: `statuses/${HEAD}`, state: "error", context: "independent-review", description: COULD_NOT_CHECK }]);
    }
    await expect(trustedAuthor({ author_association: "NONE", user: { login: "x" } }, async () => Promise.reject(new ApiError("GET", 500)))).rejects.toBeInstanceOf(ApiError);
    // The author of an unreadable record is checked too: from a trusted author it is the newest record, and red.
    const a = api({ comments: [by("OWNER"), { body: `${MARKER}\nblocked; record to follow`, html_url: LINK, author_association: "CONTRIBUTOR", user: { login: "quiet-member" } }], permission: { "quiet-member": "write" } });
    await go(a);
    expect(a.posted()[0]).toMatchObject({ state: "failure", description: expect.stringMatching(/newest review record can't be read/) });
  });

  // The wrong version: a run that fails writes nothing, so a green status from
  // an earlier run stays on the commit after the record was edited to blocked.
  it("posts an error status on the head when it cannot finish, and still fails the run", async () => {
    const boom = new ApiError("GET issues/5/comments", 502);
    const a = api({ comments: [by("OWNER")], existing: [GREEN], fail: (path) => (path.startsWith("issues/5/comments") ? boom : undefined) });
    await expect(go(a)).rejects.toBe(boom);
    expect(a.posted()).toEqual([{ path: `statuses/${HEAD}`, state: "error", context: "independent-review", description: COULD_NOT_CHECK }]);
    expect(COULD_NOT_CHECK.length).toBeLessThanOrEqual(140);
    // The status read failing, and the status write failing, are failures too (the second can post nothing more).
    const noRead = api({ comments: [by("OWNER")], fail: (path) => (path.startsWith("commits/") ? boom : undefined) });
    await expect(go(noRead)).rejects.toBe(boom);
    expect(noRead.posted().map((p) => p.state)).toEqual(["error"]);
    const noWrite = api({ comments: [by("OWNER")], fail: (_p, init) => (init?.method === "POST" ? boom : undefined) });
    await expect(go(noWrite)).rejects.toBe(boom);
  });

  // The wrong version: one failed read of the pull request ends the run with
  // nothing written, so a green from an earlier run stands against a record
  // that now says blocked.
  it("tries a failed read again, so one bad answer from GitHub does not leave an old green standing", async () => {
    for (const first of [new ApiError("GET pulls/5", 502), new ApiError("GET pulls/5", 429), new Error("timeout")]) {
      let failures = 2;
      const a = api({ comments: [by("OWNER"), by("OWNER", "o", record({ verdict: "blocked" }))], existing: [GREEN], fail: (path) => (path === "pulls/5" && failures-- > 0 ? first : undefined) });
      waits.length = 0;
      await go(a);
      expect(a.posted()).toMatchObject([{ state: "failure", description: "Independent review: the review is blocked." }]);
      expect(waits).toEqual([500, 1000]);
    }
    // The same for the comment list.
    let once = 1;
    const b = api({ comments: [by("OWNER")], fail: (path) => (path.startsWith("issues/5/comments") && once-- > 0 ? new ApiError("GET", 503) : undefined) });
    await go(b);
    expect(b.posted()[0].state).toBe("success");
    // A plain "no" (404, 403) is not retried, and the POST never is.
    const gone = api({ fail: (path) => (path === "pulls/5" ? new ApiError("GET pulls/5", 404) : undefined) });
    await expect(go(gone)).rejects.toMatchObject({ status: 404 });
    expect(gone.calls).toHaveLength(1);
    const noWriteTwice = api({ comments: [by("OWNER")], fail: (_p, init) => (init?.method === "POST" ? new ApiError("POST statuses", 502) : undefined) });
    await expect(go(noWriteTwice)).rejects.toMatchObject({ status: 502 });
    expect(noWriteTwice.calls.filter((c) => c.init?.method === "POST")).toHaveLength(2); // the status, then the error status; neither repeated
  });

  // The job is killed at five minutes. The wrong version: retries run on
  // until then, and the job dies with the head known and no error status posted.
  it("stops reading when its time budget is spent, and still posts the error status", async () => {
    let clock = 0;
    const slow = new Error("timeout");
    const a = api({ comments: [by("OWNER")], existing: [GREEN], fail: (path) => (path.startsWith("issues/5/comments") ? ((clock += 70_000), slow) : undefined) });
    await expect(runGate({ repo: REPO, number: "5", defaultBranch: "main", request: a.request, sleep, now: () => clock })).rejects.toBeDefined();
    expect(a.calls.filter((c) => c.path.startsWith("issues/5/comments")).length).toBeLessThan(4); // gave up on time, not on attempts
    expect(clock).toBeLessThanOrEqual(RUN_BUDGET_MS + 70_000);
    expect(a.posted()).toEqual([{ path: `statuses/${HEAD}`, state: "error", context: "independent-review", description: COULD_NOT_CHECK }]);
    expect(RUN_BUDGET_MS).toBeLessThanOrEqual(200_000); // leaves the 5-minute job time for one last read and the post
    // No new read starts once the budget is spent.
    let t = 0;
    const b = api({ comments: [by("OWNER")] });
    const late = runGate({ repo: REPO, number: "5", defaultBranch: "main", request: async (path: string, init?: Call["init"]) => ((t += RUN_BUDGET_MS), b.request(path, init)), sleep, now: () => t });
    await expect(late).rejects.toThrow(/ran out of time/);
    expect(b.posted().map((x) => x.state)).toEqual(["error"]);
  });

  // The stated limit (docs/REVIEW-GATE.md, "What it cannot catch"): when the pull request
  // can't be read at all, the head is unknown and there is nowhere to post.
  it("when the pull request can't be read after every try, it fails the run and posts nothing", async () => {
    const boom = new ApiError("GET pulls/5", 502);
    const noPr = api({ existing: [GREEN], fail: (path) => (path === "pulls/5" ? boom : undefined) });
    await expect(go(noPr)).rejects.toBe(boom);
    expect(noPr.calls.map((c) => c.path)).toEqual(["pulls/5", "pulls/5", "pulls/5", "pulls/5"]);
    expect(noPr.posted()).toEqual([]);
  });

  it("reads every page of comments, and refuses to decide on a partial list", async () => {
    const chatter = (n: number) => Array.from({ length: n }, (_, i) => ({ body: `comment ${i}`, author_association: "MEMBER", user: { login: "m" } }));
    const a = api({ comments: [...chatter(205), by("MEMBER")] });
    await go(a);
    expect(a.posted()[0].state).toBe("success");
    expect(a.calls.filter((c) => c.path.startsWith("issues/5/comments")).length).toBe(3);
    // The wrong version: stop after 3,000 comments and let an older record decide.
    const flood = api({ comments: [by("OWNER"), ...chatter(3000), by("OWNER", "o", record({ verdict: "blocked" }))] });
    await expect(go(flood)).rejects.toThrow(/partial list/);
    expect(flood.posted().map((p) => p.state)).toEqual(["error"]);
  });

  // GitHub keeps a limited number of statuses per commit and context, and the
  // gate runs on every comment. The wrong version: re-post each time, until a
  // later blocked record can no longer be written.
  it("does not post a status the head already carries, and does post a changed one", async () => {
    const same = api({ comments: [by("MEMBER")], existing: [{ ...GREEN, id: 2 }, { state: "failure", context: "independent-review", description: "older", id: 1 }] });
    expect(await go(same)).toMatchObject({ posted: false, state: "success" });
    expect(same.posted()).toEqual([]);
    const otherContext = api({ comments: [by("MEMBER")], existing: [{ ...GREEN, context: "ci/other" }] });
    await go(otherContext);
    expect(otherContext.posted()).toHaveLength(1);
    const changed = api({ comments: [by("MEMBER", "m", record({ verdict: "blocked" }))], existing: [GREEN] });
    await go(changed);
    expect(changed.posted()).toMatchObject([{ state: "failure", description: "Independent review: the review is blocked." }]);
  });
});
