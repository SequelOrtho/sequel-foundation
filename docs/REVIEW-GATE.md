# The review gate

A hub's pull request can merge with no independent review, because the review is a skill
(`sequel-hub-independent-review`) that a session may or may not run. It happened in
`outreach-directory` in November 2026: two pull requests merged on "CI green" alone. The review
gate makes a missing review visible: a commit status, **`independent-review`**, that is green only
when a finished review record covers the pull request's exact head.

It was built and reviewed in `outreach-directory` (pull requests 5 and 6 there, 2026-11-10) and
moved here the same day so every hub runs one copy (owner, asked whether to copy the script into
each hub or keep it here once: "Yes put the gate script and reusable workflow in
sequel-foundation").

- The rules: [`review-gate/review-gate.mjs`](../review-gate/review-gate.mjs), tested by
  `tests/review-gate.test.ts`. Every rule fails closed: what can't be read is a reason for red.
- The workflow hubs call: [`.github/workflows/review-gate.yml`](../.github/workflows/review-gate.yml).
- The file a hub copies: [`review-gate/caller.yml`](../review-gate/caller.yml).

## Adding it to a hub

1. Copy `review-gate/caller.yml` to the hub's `.github/workflows/review-gate.yml`. If the hub's
   default branch is not `main`, change `branches: [main]` to its name. Change nothing else. Its
   last line is the pin, an exact release tag:

   ```yaml
       uses: SequelOrtho/sequel-foundation/.github/workflows/review-gate.yml@v0.38.0
   ```

   **The pin is safe only while release tags here are protected, and only for a tag that names
   the release's real commit.** The called workflow runs with a token that sets the hub's
   `independent-review` status and can read the hub, so whoever could change what a release tag
   names could change what every hub runs. Two things cover that:

   - **A tag ruleset on this repository for `v*` that blocks updating and deleting** (owner,
     2026-11-10, asked whether to protect release tags: "yes I want protected v* tags"; then "I
     added the tag ruleset"). It is a repository setting that cannot be seen from the code: look
     at Settings → Rules → Rulesets before relying on it, and keep its bypass list empty. Once a
     release tag exists, it cannot be moved.
   - **A check each time a hub pins or moves to a release**, because that ruleset does not stop
     someone with write access here from creating a release's tag early, on a commit of their
     own (the release job leaves an existing tag alone). Before pinning `vX.Y.Z`, confirm the tag
     names that release's merge commit on `main`, in a checkout of this repository:

     ```bash
     git fetch origin "+refs/heads/main:refs/remotes/origin/main" "+refs/tags/vX.Y.Z:refs/tags/vX.Y.Z"
     ```

     ```bash
     git merge-base --is-ancestor "refs/tags/vX.Y.Z^{commit}" refs/remotes/origin/main && git log -1 --format='%H %s' "refs/tags/vX.Y.Z^{commit}"
     ```

     The fetch names both refs in full, so it takes exactly `main` and exactly that tag and
     nothing that merely ends the same way (a listing such as `git ls-remote … main` also shows
     look-alike names like `a/refs/heads/main`, and is not a safe way to compare). If the fetch
     fails, the release is not out: stop. The second command must succeed, which says the tag's
     commit is in `main`'s history, and the line it prints must be that release's merge: the
     squash-merge of the pull request that set the version (`… (vX.Y.Z) (#N)`). Anything else:
     do not pin, and tell the owner.

   Never pin a branch.
2. Add the "Working with the gate" rules below to the hub's `CLAUDE.md`, so a session knows to run
   the review, what the record must carry and what red means.
3. The gate judges a pull request only once the caller is on the hub's default branch, so the pull
   request that adds it is not judged by it. The next one is.
4. **It only colors a status until the hub's default-branch protection (ruleset) requires
   `independent-review`.** That is a repository setting for the owner, available where the
   repository's plan allows required status checks. Until then a red status does not stop a merge.

The caller runs on `pull_request_target` (pull requests into the default branch) and on PR
comments, so the hub's default branch decides which copy runs, and the called workflow checks out
`sequel-foundation` only, at the commit of the release the hub pinned. No code from the hub or from
a pull request runs, and the job's token can write commit statuses and nothing else. Never add a
step, a checkout, an install or a `workflow_dispatch` trigger to the caller.

## Working with the gate (paste into a hub's `CLAUDE.md`)

These are working rules for sessions, not owner rulings, except where a ruling is quoted. The
quoted rulings were made by the owner for `outreach-directory` on 2026-11-10 and travel with the
gate.

- **Run the review.** Before telling the owner a pull request is ready, and before any merge, run
  the `sequel-hub-independent-review` skill and post its record on the pull request. "CI green, no
  review comments" is not a review. If the owner gives a go-ahead while `independent-review` is red
  or missing, say what it is waiting on and let them decide.
- **What the record must carry**, beyond the skill's format up to v2.2 (skill v2.3 writes these
  itself):
  - `triageLenses`: the `lenses` array triage printed (`[]` at tier 0), next to `reviewers`.
  - `headSha`, and the `to` of a delta that ends at the head, as the **full 40-character** commit
    id. A short one never matches. Other ids in the record may be short.
  - `reviewers` is the roster of the full review and stays that way. The agents of a later round
    or of a delta review go in `history` or on the delta, never appended to it (a repeated lens
    there reads as a missing reviewer).
  - Every tier posts the full comment with the JSON block, tier 0 included. `repo` and `pr` are
    this pull request's.
- **One record comment per pull request, marker first.** The comment has
  `<!-- sequel-review v1 -->` at the start of a line (the first line, alone, as the skill posts
  it) and the gate reads the first fenced `json` block after it. It must be an ordinary PR
  comment, not a review comment. **Any comment by someone with write access that has the marker at
  the start of a line is taken as a record**, whatever else is on that line and even inside a code
  block (owner: "the marker rule is fine"). To talk about the marker in a comment, put it inside a
  sentence, in backticks or in a `>` quote, never at the start of a line.
- **Who may post a record:** someone with **write access** to the repository (owner, asked whether
  read-only members and collaborators should count: "write access only"). GitHub's "member" or
  "collaborator" label is not enough; the gate looks up the poster's permission. Sessions post
  from the owner's login (owner: "my own login").
- **Red means one of** (the status line says which):
  - no record from someone with write access;
  - a record for another pull request or an older commit;
  - a change after the review that is not recorded as reviewed (only a clean merge of the default
    branch may be `reviewed: false`);
  - a verdict other than `clear` / `clear-with-advisories` (`blocked` and `escalated` are red; an
    escalated review turns green when a newer record, written after the owner answered, passes);
  - a blocker or should-fix not `fixed`, `superseded` or `accepted-risk`;
  - no `triageLenses`, or one that isn't what triage would name (`correctness` at tier 1 and up,
    `access` too at tier 3, `[]` at tier 0); a named lens nobody read; fewer reviewers than
    triage's rule names (tier 1: one; tier 2: one for the risk lenses and one for the behavior
    lenses, where each is named; tier 3: one per lens, each lens once);
  - the newest record can't be read (no fenced `json` block, a typo in it, another schema). The
    newest record decides, newest meaning **edited last**, and an unreadable one is never skipped
    for an older one: edit or delete that comment.
- **`error` instead of red or green** means the gate could not finish once it had read the pull
  request (GitHub kept failing, or it could not find out who posted a record). Re-run the "Review
  gate" workflow or post any comment.

## What it cannot catch

- **A false record.** The tier and the verdict are the record's own claims, and anyone with write
  access can post a status by hand. The gate catches a review that was forgotten, cut short or
  left stale.
- **A run that writes nothing.** A run that never learns which commit it is judging (the pull
  request can't be read at all), whose error status can't be posted, whose job is killed, or
  that stops at "Pin the gate to this workflow's own commit" leaves the status from the earlier
  run in place. **A red "Review gate" run must be re-run before a green `independent-review` is
  trusted.**
- **A change to the two GitHub actions the job uses.** `actions/checkout@v4` and
  `actions/setup-node@v4` are pinned by GitHub's own major-version tags, as in every other
  workflow in the family, and setup-node downloads Node at run time. Whoever controls those runs
  code in the gate's job. The protected release tag covers the gate's own code, not these.
- **Two open pull requests at the same commit** share one status (a status belongs to a commit;
  owner, asked whether that is acceptable: "yes").
- **A merge while the status is red**, until the hub's branch protection requires it.

## Releasing a change to the gate

The gate ships with the package: a change here is a normal release (version bump, CI tags it).
A hub keeps running the release its caller pins until a pull request in that hub changes the
pin: one line, by hand, normally in the same pin-bump pull request that moves the package
(`scripts/pin-foundation.sh` moves the package only), after the check in "Adding it to a hub"
step 1 that the tag names the release's merge commit. Move it only to a release that has the gate
(v0.38.0 or later); a release from before it has no workflow to call, and the status would stop
being set. Keep `review-gate/caller.yml` on the newest release that changed the gate.

## Taking it out

- **One hub:** remove any branch-protection requirement on `independent-review` first (or every
  pull request waits forever for a status nothing sets), then delete the hub's
  `.github/workflows/review-gate.yml`. Statuses already posted stay; they are harmless.
- **Reverting it here** does not stop hubs that pinned a release: the tag still names a commit
  that has the workflow. Take it out hub by hub as above. A reverted release's tag also stays, so
  the next release takes the next version number, never the reverted one again.
