# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

`@sequel/foundation` — the shared platform layer every Sequel Ortho application builds on: brand theme, UI primitives, UX conventions, deck/docs export kits, LLM plumbing. Consumed as a git dependency pinned to a version tag. **Read [docs/DESIGN-CONVENTIONS.md](docs/DESIGN-CONVENTIONS.md) before any UI work, [docs/DECK-CRAFT.md](docs/DECK-CRAFT.md) before deck/exporter work, and [docs/AI-CRAFT.md](docs/AI-CRAFT.md) before any AI-feature work** — they carry the accumulated family rules; new conventions land there in the same PR as the code that embodies them. The `/ai-production-audit` skill (`.claude/skills/`) runs AI-CRAFT's 5-gate scorecard against an app; it is stack-aware (Postgres/Neon vs Azure SQL / MS SQL, Netlify vs Azure), so audits stay valid as hubs migrate infrastructure.

## Commands

- `npm test` — vitest (node env by default; component tests opt into jsdom with a `// @vitest-environment jsdom` pragma).
- `npm run typecheck` — tsc. CI runs both plus an iCloud-conflict-copy guard; keep them green locally before pushing.

## Releasing

The flow that shipped v0.8.0 (Aug 2026):

1. **One PR** carries the code, tests, and every doc surface: the README contents table, the ADOPTING.md "what's in the box" row (and layout step if wiring changed), and the DESIGN-CONVENTIONS entry when the change is a convention.
2. **Version in the same PR**: bump `package.json` `"version"` and the `#vX.Y.Z` pin examples in README.md/ADOPTING.md.
3. **Squash-merge** (history convention: one-line `type(scope): subject (#N)`), then tag the merge commit on main and push the tag:
   `git tag vX.Y.Z <merge-sha> && git push origin vX.Y.Z`
   - Remote Claude Code sessions cannot push tags (the git proxy limits pushes to work branches) — ask the owner to run the command, or cut a GitHub Release from the web UI targeting main (creates the tag server-side).
   - Interim trick that keeps downstream PRs installable/green before the tag exists: pin apps to the **full merge-commit SHA** (`github:SequelOrtho/sequel-foundation#<40-char sha>` — npm resolves full-SHA committish without any ref), then swap the spec string to `#vX.Y.Z` once the tag is up: 2-line diff per app, the lockfile's resolved SHA doesn't change.

## The fleet (apps pinning this package)

A shared-behavior change is one PR here + tag, then one pin-bump PR per app, each validated with that app's `npm run build`. The template repo is part of the fleet — fix it in the same sweep so new apps inherit.

| Repo | App | Rollout notes |
|---|---|---|
| `project-insights` | Project Hub | PR template enforces the §5a checklist + full local gate (typecheck · lint · test · build); guide-regen rule applies only when the guide's prose covers the changed surface. Squash merges. |
| `Sequel_Ortho` | Acquisition Hub | Imports UI through the `components/ui/index.ts` shim — a new foundation export used by this app must be re-exported there. **Merge commits**, not squash. |
| `sequel-doc-hub` | Document Hub | **Merge commits**, not squash. |
| `scheduler-hub` | Scheduler Hub | Squash. Header title hidden on phones — keep that treatment when touching the brand link. |
| `incident-event-hub` | Incident & Event Hub | Squash. |
| `sequel-audit-hub` | Audit Hub | Squash. |
| `workers-comp-portal` | (unnamed) | Squash. ★ TEMPLATE checklist never completed — header/CLAUDE.md/README still say "Sequel App Template"; rename pending with the owner. |
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
