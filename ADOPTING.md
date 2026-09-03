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
npm i "@sequel/foundation@github:SequelOrtho/sequel-foundation#v0.11.0"
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

**3. Layout** — load Montserrat + Geist Mono via `next/font`, render `themeInitScript(<your key>)` as the first element of `<body>`, and put `<ThemeToggle storageKey={…}/>` in your header. Render the header logo + app title as one `<HomeLink>` (fires the standard "Bringing you back to Home…" toast on the way back). Mount `<NavProgress/>` (route-transition top bar) and `<ToastViewport/>` once in `<body>` too. Copy the exact wiring from the template's [`app/layout.tsx`](https://github.com/SequelOrtho/sequel-app-template/blob/main/app/layout.tsx).

## What's in the box

| Import path | What you get |
|---|---|
| `…/brand/theme.css` | Brand tokens with dark mode, RYG status colors, focus ring, print rules |
| `…/theme` | Light / Dark / Browser theme with a no-flash pre-hydration script |
| `…/ui` | Button (incl. the chartreuse assign/hand-off variant), `IconButton` (glyph-only controls with a real hit area + focus ring + required label), Callout, Field, badges, toasts (with next-step action links), `HomeLink` (the header brand link home, with the family-standard departure toast), the save-surface kit (`useSaveRunner` / `useFormDirty` / `useDraftSave` / `SectionSaveBar` + `SaveStateIndicator` + `useUnsavedGuard` — dirty-disabled, save-in-place, per-section saves, tab-close warning), ShowMore, Breadcrumbs, ExportBar, `NavProgress` + `LinkPendingHint` (route-transition pending feedback), `BackToTop`, `AdaptiveSelect` + `SearchCombobox` (the dropdown rule — native up to 12 options, fuzzy-searchable beyond, picked automatically), `useBrandColors` (themed palette for chart/SVG code) |
| `…/brand/palette` | The brand palette as JavaScript — for charts and exporters, which can't take a Tailwind class. Kept in sync with `theme.css` by a test that parses the CSS |
| `…/llm` | Claude client seam (hard timeout budget + retries), per-task model configuration with fallback, streaming that survives serverless timeouts and narrates progress stages, deterministic input gate (size cap + secret/PII redaction), output-contract parsing (`parseLlmJson` — never raw `JSON.parse` on model text), identity-aware rate-limit core (your app supplies the one-method store), per-request trace records (your app supplies the sink), golden-set runner (your app supplies the cases) |
| `…/deck-kit` | Branded PowerPoint engine (approved template, native editable charts, auto-slimming) |
| `…/docs-kit/*` | Word/Excel brand constants and styles, clickable-contents machinery for generated guides |

The full subpath reference and consumption details are in the [README](README.md).

## House rules

- **Read the three docs first.** [DESIGN-CONVENTIONS.md](docs/DESIGN-CONVENTIONS.md) (the UX rules that make Sequel apps feel like one product — including §3's post-action feedback rule and §5's navigation patterns), [DECK-CRAFT.md](docs/DECK-CRAFT.md) (everything we learned generating board-quality decks), and [AI-CRAFT.md](docs/AI-CRAFT.md) (the demo-to-production rules for AI features) will save you weeks.
- **Saves stay in place, disabled until dirty.** A successful save never navigates away (toast + SaveState chip confirm in place; redirects are for create flows), Save buttons disable until the form actually changed, and scroll-length forms carry a per-section `SectionSaveBar` — §3's save conventions, with the code in `ui/SectionSave.tsx`.
- **Dropdowns over 12 items are searchable.** Render any select whose list can grow (people, projects, entities, sites) as `<AdaptiveSelect>` — it stays a native `<select>` up to 12 options and becomes the fuzzy `SearchCombobox` beyond that, automatically. Hard-coded enums stay native. §3 in DESIGN-CONVENTIONS.md.
- **Every action confirms; no page dead-ends.** Mutations pop a `toastSaved` confirmation — with an action link (`{ action: { label, href } }`) when there's a natural next step — and every leaf page links onward. Before shipping a PR that adds or moves a screen, run the §5a nav/flow review checklist in DESIGN-CONVENTIONS.md.
- **Never copy foundation code into your app.** To change anything shared, make the change in this repo, tag a release, and bump the version pin in each app. That's what keeps every tool consistent.
- **Pin a tag, not main.** Your `package.json` references a version tag (e.g. `#v0.11.0`), so foundation changes never reach your app until you choose to take them.
- **AI calls follow the pattern.** Models come from configuration (`modelFor` + `withModelFallback`), input passes the gate (`gateLlmInput`) before the call, responses stream with progress stages (`streamJob` / `consumeLlmStream`), structured output passes the contract (`parseLlmJson` + your type guard), errors are typed, and every call has a time budget. The template's `ai-demo` route is the reference. Before an AI feature reaches beta, it passes the 5-gate audit in [AI-CRAFT.md](docs/AI-CRAFT.md) — identity-filtered retrieval, a golden eval set (`runGoldenSet` + your cases), a rendered failure path, known unit economics with the route metered (`checkRateBudget` + your store), and replayable traces (`startLlmTrace` + your sink).

## Links

- [sequel-foundation](https://github.com/SequelOrtho/sequel-foundation) — this package + the three convention docs
- [sequel-app-template](https://github.com/SequelOrtho/sequel-app-template) — the new-app starter (GitHub template repo)
- Live examples: [Project Hub](https://sequelorthoprojects.com) and the [Acquisition Hub](https://sequelorthoplaybook.com) both run on the foundation in production.

*Questions or a change you need in the shared layer? Bring it to the platform owner — small foundation releases ship same-day.*
