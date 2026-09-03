# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

`@sequel/foundation` — the shared platform layer every Sequel Ortho application builds on: brand theme, UI primitives, UX conventions, deck/docs export kits, LLM plumbing. Consumed as a git dependency pinned to a version tag. **Read [docs/DESIGN-CONVENTIONS.md](docs/DESIGN-CONVENTIONS.md) before any UI work, [docs/DECK-CRAFT.md](docs/DECK-CRAFT.md) before deck/exporter work, and [docs/AI-CRAFT.md](docs/AI-CRAFT.md) before any AI-feature work** — they carry the accumulated family rules; new conventions land there in the same PR as the code that embodies them. The `/ai-production-audit` skill (`.claude/skills/`) runs AI-CRAFT's 5-gate scorecard against an app; it is stack-aware (Postgres/Neon vs Azure SQL / MS SQL, Netlify vs Azure), so audits stay valid as hubs migrate infrastructure. The `/foundation-release` skill runs the release flow below end to end (version-bump PR → auto-tag → fleet pin-bump PRs).

## Commands

- `npm test` — vitest (node env by default; component tests opt into jsdom with a `// @vitest-environment jsdom` pragma).
- `npm run typecheck` — tsc. CI runs both plus an iCloud-conflict-copy guard; keep them green locally before pushing.

## Releasing

The version bump **is** the release. Everything else is automatic or scripted (`/foundation-release` skill).

1. **One PR** carries the code, tests, and every doc surface: the README contents table, the ADOPTING.md "what's in the box" row (and layout step if wiring changed), and the DESIGN-CONVENTIONS entry when the change is a convention.
2. **Version in the same PR**: bump `package.json` `"version"` (patch = additive prop/fix, minor = new primitive or convention, major = breaking) and the `#vX.Y.Z` pin examples in README.md/ADOPTING.md.
3. **Squash-merge** (history convention: one-line `type(scope): subject (#N)`). The `tag` job in `.github/workflows/ci.yml` then cuts `vX.Y.Z` as a GitHub Release on the merge commit whenever `package.json`'s version has no tag yet (idempotent; a merge without a bump is a no-op). Confirm with `git ls-remote --tags origin vX.Y.Z`.
   - Remote Claude Code sessions cannot push tags or delete branches (the git proxy limits pushes to work branches) — that is why CI tags. If the job ever fails, the owner fallback is `git tag vX.Y.Z <merge-sha> && git push origin vX.Y.Z` from a local clone, or a Release from the web UI targeting main.
   - Interim trick while a tag is missing: pin apps to the **full merge-commit SHA** (`github:SequelOrtho/sequel-foundation#<40-char sha>`), then swap the spec to `#vX.Y.Z` later — the lockfile's resolved SHA does not change.
4. **Fleet pin-bumps** go through `scripts/pin-foundation.sh <app-dir> vX.Y.Z`, which runs the explicit `npm install "@sequel/foundation@github:…#vX.Y.Z"` and fails unless the lockfile re-resolved to the tag's SHA. A plain `npm install` after a hand-edited spec reports "up to date" and silently keeps the old SHA.
5. **Rulesets require up-to-date branches**: a green PR whose branch is behind main is refused with "Required status check 'test' is expected" — merge `origin/main` into the branch (merge commit, never rebase a shared branch), let CI re-run, then merge.

## The fleet (apps pinning this package)

A shared-behavior change is one PR here + tag, then one pin-bump PR per app, each validated with that app's `npm run build`. The template repo is part of the fleet — fix it in the same sweep so new apps inherit.

| Repo | App | Rollout notes |
|---|---|---|
| `project-insights` | Project Hub | PR template enforces the §5a checklist + full local gate (typecheck · lint · test · build); guide-regen rule applies only when the guide's prose covers the changed surface. Squash merges. Largest CI (~6 min); forms use a local uppercase `labelCls` — pass it as `labelClassName` on converted dropdowns. |
| `Sequel_Ortho` | Acquisition Hub | Imports UI through the `components/ui/index.ts` shim — a new foundation export used by this app must be re-exported there. Phase editors' `Select<T>` wrapper in `editors/_shared.tsx` fronts ~70 dropdowns (`EDITOR_SELECT_CLASS` / `EDITOR_LABEL_CLASS`) — change it once, not per site. **Merge commits**, not squash. |
| `sequel-doc-hub` | Document Hub | **Merge commits**, not squash. |
| `scheduler-hub` | Scheduler Hub | Squash. Header title hidden on phones — keep that treatment when touching the brand link. Apex is Cloudflare-fronted — validate live via the deploy permalink. |
| `incident-event-hub` | Incident & Event Hub | Squash. |
| `sequel-audit-hub` | Audit Hub | Squash. Apex domain is Cloudflare-fronted — validate live via the Netlify deploy permalink. |
| `workers-comp-portal` | (unnamed) | Squash. ★ TEMPLATE checklist never completed — header/CLAUDE.md/README still say "Sequel App Template"; rename pending with the owner. No deploy target yet (template step 7), so nothing to validate live. |
| `sequel-app-template` | new-app starter | Squash. ADOPTING.md points here for canonical layout wiring — keep `app/layout.tsx` current. |

## Lessons learned (Aug 2026, HomeLink rollout)

- **Reuse the pure predicates.** `HomeLink`'s should-this-toast gating reuses `clickStartsNavigation` from `ui/nav-progress` instead of a second click-classification implementation — one tested definition of "this click actually navigates".
- **Audit the fleet before shipping a convention.** The home-nav toast request surfaced that workers-comp-portal's header logo sat in a bare `<div>` (the §5 defect) — a fleet grep costs minutes and turns "add a toast" into "and fix the app where it couldn't fire at all".
- **Stale pins are usually safe to jump** when every intervening release was additive; verify with `git diff vOld vNew -- . ':!docs' ':!*.md'` before bumping (v0.4.5 → v0.8.0 was clean this way).
- **A wedged Actions re-run doesn't heal itself.** A PR run that hangs and gets cancelled can leave its requested re-run stuck pre-queue for hours — cancel returns 409 "not yet queued" and the UI offers no Re-run button — while *fresh* `pull_request` runs schedule fine. Retrigger by pushing the next real commit to the branch (never an empty commit) instead of waiting on the re-run.

## Lessons learned (Aug 2026, AI production rollout)

- **Check for repo-specific schema guards before adding models.** Project Hub's CI runs a data-dictionary guard: every Prisma table/column needs curated prose in `scripts/build-data-dictionary.mjs` and the generated xlsx is a committed artifact — a new model without its dictionary entries fails `test`. Reproduce the guard locally (`node scripts/build-data-dictionary.mjs`) before pushing.
- **The trace/rate seams have three wiring shapes — pick by the app's own bundle doctrine, never one-size-fits-all.** (1) Direct DB sink where everything is one bundle (Incident Hub). (2) Pluggable sink defaulting to `consoleTraceSink`, upgraded from the file the repo already decrees Next-side (Project Hub: `jobs/guards.ts` registers the Prisma sink; the AI-job function keeps the console floor). (3) A hard-constrained courier (no DB imports allowed) times its own calls and posts `{model, latencyMs, tokens}` on the result it already sends over its token-gated channel; the Next side writes the row (Doc Hub).
- **§6 works in practice.** The Acquisition Hub landed the same `FixedWindowStore`/`LlmTraceSink` contracts on MS SQL (conditional `UPDATE` + `MERGE` reset; `dbo` tables). Where an app has no schema-push lane, transient infra tables (counters, telemetry) may self-create via `IF OBJECT_ID … CREATE TABLE` — an explicit, commented divergence from operator-run schema, justified only for tables that expire and reference nothing.
- **Golden sets select fixtures, never hardcode them.** Derive cases from the app's own deterministic generators/taxonomies (work items by topic regex, categories from the taxonomy module) with loud-fail selectors, so template drift breaks the run visibly instead of silently emptying the set. Enforce distinct fixtures per case — one catch-all item will otherwise absorb several topics.

## Lessons learned (Sep 2026, searchable-dropdown rollout — v0.11.0)

- **Encode a size rule as an adaptive control, not a per-site judgment.** "More than 12 items → searchable" shipped as `AdaptiveSelect` (counts options at render time) so every data-driven select in the fleet adopts it once and self-corrects as tenants grow; only hard-coded enums stay native. The fleet audit found 111 files with `<select>`; ~50 sites converted, ~130 left native — classify by *option source* (data vs. literal enum), not by today's count.
- **A hidden `<input>` fires no DOM event.** Dirty-tracking that snapshots a form on `input`/`change` misses a combobox pick in searchable mode; forms that mix `name`-posted pickers with `useFormDirty` must track those pickers in state and OR them into the dirty flag (Project Hub `EditProjectForm`). Native constraint validation also skips hidden inputs — guard `required` in code.
- **`<label htmlFor>` is slow in jsdom.** Moving labels from wrapping to `htmlFor` made `getByLabelText` walk the whole document per label; a 130-dropdown questionnaire went from ~50 ms to ~8 s (Acquisition Hub). Query by control id/role in such tests; it is a jsdom artifact, not a runtime cost.
- **Foundation label geometry is fixed** (`text-xs text-brand-muted`, `mt-0.5`). Hubs with their own uppercase `labelCls` show a mixed-case inconsistency on converted fields; a `labelClassName` prop on `AdaptiveSelect`/`SearchCombobox` is the fix if the owner wants parity.
- **Live validation from a remote session:** Netlify's `get-project` → `currentDeploy` plus `get-deploy` `title` ("gh-actions: <sha> on main") proves which commit is live; fetch the deploy permalink, not the apex — Cloudflare bot-challenges the container (403) on some hub domains while the site is healthy.

## Lessons learned (Sep 2026, v0.11.1 label pass + release automation)

- **A hand-edited git-dep spec does not re-resolve.** After changing `"@sequel/foundation": "github:…#v0.11.1"` in package.json, `npm install` prints "up to date" and keeps the previous resolved SHA in the lockfile. Only `npm install "@sequel/foundation@github:…#v0.11.1"` re-resolves — `scripts/pin-foundation.sh` wraps that and asserts the SHA.
- **CI tags, humans don't.** Sessions can't push tags or delete branches through the git proxy; the `tag` job now cuts `v<version>` on merge, so the version bump in the PR is the whole release action. Branch cleanup still happens from a local clone.
- **"Required status check 'test' is expected" on a green PR means the branch is behind main** under a strict ruleset — merge main into it and let CI re-run; nothing is wrong with the check.
- **Squash-merged branches read "1 ahead, 1 behind" forever.** That is the squash SHA differing, not unmerged work; verify with the PR's `merged_at` before deleting, and inspect any branch with no PR (the Azure resource audit sat unmerged that way).
- **Match sibling label typography, don't restyle the control.** `labelClassName` exists so a converted dropdown's label matches its neighbours (`Field` = `text-sm text-zinc-600 dark:text-zinc-400`; Project Hub `labelCls`; Audit Hub navy labels); pass only typography utilities, never the wrapper's `flex flex-col gap-1`. Sites whose neighbours already use the foundation default, and every `hideLabel` site, need nothing.
- **Hub `Field` labels vs. foundation control labels differ by design** (`text-sm` vs `text-xs`); a form that mixes `Field`-wrapped inputs with foundation controls will look uneven unless the control is told which style to match.

