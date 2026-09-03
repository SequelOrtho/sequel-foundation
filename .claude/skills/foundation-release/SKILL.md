---
name: foundation-release
description: Ship a @sequel/foundation release end to end — version bump in the PR, squash-merge, automatic vX.Y.Z tag via CI, then fleet pin-bump PRs with the lockfile correctly re-resolved. Use when asked to release, tag, cut a version, bump the foundation across the hubs, or roll a shared change out to the fleet.
---

# Foundation Release

The release action is the **version bump inside the PR**. Merging to main tags it; nothing is pushed by hand.

## How tagging works (no owner step)

`.github/workflows/ci.yml` has a `tag` job that runs after `test` on every push to `main`. It reads `package.json` `"version"`; if `refs/tags/v<version>` does not exist it creates a GitHub Release `v<version>` targeting the merge commit (`gh release create --generate-notes`, `contents: write` via the workflow token). A merge that does not change the version is a no-op. Remote Claude Code sessions cannot push tags themselves (the git proxy limits pushes to work branches), so never try `git push origin vX.Y.Z` from a session — let the job do it.

## Step 1 — The release PR

One PR carries everything (CLAUDE.md "Releasing"):

1. Code + tests.
2. Every doc surface: README contents table, ADOPTING "what's in the box" row (and layout step if wiring changed), DESIGN-CONVENTIONS / DECK-CRAFT / AI-CRAFT entry when the change is a convention.
3. `package.json` `"version"` bumped (patch = additive prop/fix, minor = new primitive or convention, major = breaking), and every `#vX.Y.Z` pin example in README.md / ADOPTING.md moved to the new version.
4. `npm run typecheck` and `npm test` green locally.

Open the PR, wait for the `test` check, **squash-merge** with the one-line `type(scope): subject (#N)` title. If the merge is refused with "Required status check 'test' is expected" and the check is green, the branch is behind main (the ruleset requires up-to-date branches): merge `origin/main` into the branch (a merge commit, never a rebase on a shared branch), push, let CI re-run, merge again.

## Step 2 — Confirm the tag

Wait for the main-branch run (test + tag, ≈1 min), then:

```
git ls-remote --tags origin vX.Y.Z
```

Expect one line ending in `refs/tags/vX.Y.Z` whose SHA is the squash-merge commit. If the `tag` job failed, read its log; the fallback is the owner running `git tag vX.Y.Z <merge-sha> && git push origin vX.Y.Z` from a local clone, or cutting a Release from the GitHub UI targeting main. Until the tag exists, fleet PRs may pin the **full 40-char merge SHA** (`github:SequelOrtho/sequel-foundation#<sha>`) and swap the spec later.

## Step 3 — Fleet pin-bump PRs

For every repo in the fleet table (CLAUDE.md), including `sequel-app-template` and `workers-comp-portal`:

1. `git fetch origin main && git checkout -B claude/pin-foundation-vX.Y.Z origin/main`
2. `bash <foundation>/scripts/pin-foundation.sh <app-dir> vX.Y.Z` — edits the spec, runs the **explicit** `npm install "@sequel/foundation@github:…#vX.Y.Z"`, and fails unless the lockfile's resolved SHA matches the tag. (A plain `npm install` after a hand-edited spec reports "up to date" and keeps the old SHA — that is why the script exists.)
3. If the release changes shared behaviour, apply it in the app in the same PR (new exports go through the Acquisition Hub's `components/ui/index.ts` shim; regenerate committed guides where the repo requires it — Project Hub `build:user-guide` with version bump, Document Hub `build:user-guide`, Acquisition Hub `build:reviewer-guide`; Scheduler's testers guide is gitignored; Incident/Audit have none).
4. Run the app's full gate as its CI does (`prisma generate` / `next typegen` first where CI does; typecheck · lint · test · build with CI's placeholder `DATABASE_URL`).
5. Commit with the session trailers, push, open the PR, merge when green using the repo's convention: **merge commits** for `Sequel_Ortho` and `sequel-doc-hub`, squash everywhere else.
6. Live check for Netlify-hosted hubs: Netlify `get-project` → `currentDeploy`, then `get-deploy` — its `title` reads `gh-actions: <sha> on main`; fetch the deploy **permalink** (`https://<deploy-id>--<site>.netlify.app`), not the apex, which Cloudflare bot-challenges from a container.

Run independent repos in parallel (one subagent per hub is fine); the npm git-dep cache is shared, so bump one small repo first to warm it.

## Step 4 — Close out

- Record any new lesson in CLAUDE.md "Lessons learned" (same PR as the change that taught it, or a docs-only follow-up).
- Delete merged work branches from a local clone (`git push origin --delete <branch>`); the session's git proxy refuses deletes.
- Report: release SHA + tag, one row per fleet repo (PR, merge SHA, live deploy id), anything deliberately left out.
