# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

`@sequel/foundation` — the shared platform layer every Sequel Ortho application builds on: brand theme, UI primitives, UX conventions, deck/docs export kits, LLM plumbing. Consumed as a git dependency pinned to a version tag. **Read [docs/DESIGN-CONVENTIONS.md](docs/DESIGN-CONVENTIONS.md) before any UI work and [docs/DECK-CRAFT.md](docs/DECK-CRAFT.md) before deck/exporter work** — they carry the accumulated family rules; new conventions land there in the same PR as the code that embodies them.

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
