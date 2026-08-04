# Building on the Sequel Foundation

**Developer quick start.** Sequel Ortho applications share one platform layer: this package. It carries the SequelOrtho brand theme with dark mode, the shared UI components and UX conventions, the branded PowerPoint/Excel/Word export machinery, and our Claude (AI) integration patterns — extracted from [Project Hub](https://sequelorthoprojects.com) and the [Acquisition Hub](https://sequelorthoplaybook.com), which both run on it in production. Build on it and your tool automatically looks, feels, and exports like the rest of the family.

## Starting a new application (the fast path)

Create your repo from the template — it boots already themed, with working sample exports and the AI pattern wired:

```bash
gh repo create my-new-app --private \
  --template SequelOrtho/sequel-app-template --clone
cd my-new-app && npm install && npm run dev
```

Then work through the short **Template checklist** at the bottom of the template's `CLAUDE.md` — rename the app, pick a theme-storage key, set `ANTHROPIC_API_KEY`, and replace the sample pages/exports with your own.

## Adding the foundation to an existing application

**1. Install** (public repo — no tokens needed anywhere):

```bash
npm i "@sequel/foundation@github:SequelOrtho/sequel-foundation#v0.4.6"
```

```ts
// next.config.ts
transpilePackages: ["@sequel/foundation"],
```

**2. Styles** — in `app/globals.css`:

```css
@import "tailwindcss";
@import "@sequel/foundation/brand/theme.css";
@source "../node_modules/@sequel/foundation";
```

**3. Layout** — load Montserrat + Geist Mono via `next/font`, render `themeInitScript(<your key>)` as the first element of `<body>`, and put `<ThemeToggle storageKey={…}/>` in your header. Mount `<NavProgress/>` (route-transition top bar) and `<ToastViewport/>` once in `<body>` too. Copy the exact wiring from the template's [`app/layout.tsx`](https://github.com/SequelOrtho/sequel-app-template/blob/main/app/layout.tsx).

## What's in the box

| Import path | What you get |
|---|---|
| `…/brand/theme.css` | Brand tokens with dark mode, RYG status colors, focus ring, print rules |
| `…/theme` | Light / Dark / Browser theme with a no-flash pre-hydration script |
| `…/ui` | Button (incl. the chartreuse assign/hand-off variant), Callout, Field, badges, toasts (with next-step action links), the save-surface kit (`useSaveRunner` / `useFormDirty` / `SectionSaveBar` + `SaveStateIndicator` — dirty-disabled, save-in-place, per-section saves), ShowMore, Breadcrumbs, ExportBar, `NavProgress` + `LinkPendingHint` (route-transition pending feedback), `BackToTop` |
| `…/llm` | Claude client seam, per-task model configuration with fallback, streaming that survives serverless timeouts |
| `…/deck-kit` | Branded PowerPoint engine (approved template, native editable charts, auto-slimming) |
| `…/docs-kit/*` | Word/Excel brand constants and styles, clickable-contents machinery for generated guides |

The full subpath reference and consumption details are in the [README](README.md).

## House rules

- **Read the two docs first.** [DESIGN-CONVENTIONS.md](docs/DESIGN-CONVENTIONS.md) (the UX rules that make Sequel apps feel like one product — including §3's post-action feedback rule and §5's navigation patterns) and [DECK-CRAFT.md](docs/DECK-CRAFT.md) (everything we learned generating board-quality decks) will save you weeks.
- **Saves stay in place, disabled until dirty.** A successful save never navigates away (toast + SaveState chip confirm in place; redirects are for create flows), Save buttons disable until the form actually changed, and scroll-length forms carry a per-section `SectionSaveBar` — §3's save conventions, with the code in `ui/SectionSave.tsx`.
- **Every action confirms; no page dead-ends.** Mutations pop a `toastSaved` confirmation — with an action link (`{ action: { label, href } }`) when there's a natural next step — and every leaf page links onward. Before shipping a PR that adds or moves a screen, run the §5a nav/flow review checklist in DESIGN-CONVENTIONS.md.
- **Never copy foundation code into your app.** To change anything shared, make the change in this repo, tag a release, and bump the version pin in each app. That's what keeps every tool consistent.
- **Pin a tag, not main.** Your `package.json` references a version tag (e.g. `#v0.4.6`), so foundation changes never reach your app until you choose to take them.
- **AI calls follow the pattern.** Models come from configuration (`modelFor` + `withModelFallback`), responses stream (`streamJob` / `consumeLlmStream`), errors are typed. The template's `ai-demo` route is the reference.

## Links

- [sequel-foundation](https://github.com/SequelOrtho/sequel-foundation) — this package + the two convention docs
- [sequel-app-template](https://github.com/SequelOrtho/sequel-app-template) — the new-app starter (GitHub template repo)
- Live examples: [Project Hub](https://sequelorthoprojects.com) and the [Acquisition Hub](https://sequelorthoplaybook.com) both run on the foundation in production.

*Questions or a change you need in the shared layer? Bring it to the platform owner — small foundation releases ship same-day.*
