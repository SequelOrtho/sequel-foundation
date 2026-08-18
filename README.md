# @sequel/foundation

The shared foundation for Sequel Ortho applications: brand tokens and theme, the design-system UI primitives, LLM plumbing, the deck kit, guide-build machinery, and repo hygiene tooling — extracted from **Project Hub** (`project-insights`) and the **Acquisition Hub** (`Sequel_Ortho`), which previously kept these in sync by hand ("the twin registry").

**New here? Start with [ADOPTING.md](ADOPTING.md)** — the quick start for building a new Sequel app on the foundation or wiring it into an existing one.

Two documents carry the accumulated know-how; read them before building anything user-facing or deck-shaped:

- **[docs/DESIGN-CONVENTIONS.md](docs/DESIGN-CONVENTIONS.md)** — the UX rules that make Sequel apps feel like one family.
- **[docs/DECK-CRAFT.md](docs/DECK-CRAFT.md)** — everything learned generating board-quality pptx/docx/xlsx at runtime.

## Contents

| Subpath | What it is |
|---|---|
| `@sequel/foundation/brand/tokens.css` | Framework-free brand custom properties (Brand Guide v1.0) |
| `@sequel/foundation/brand/theme.css` | Tailwind v4 layer: dark mode variant, tokens incl. dark values, RYG, blue-ramp remap, focus ring, print rules |
| `@sequel/foundation/brand/assets/*` | Logo PNGs (navy / white / banner) — see `brand/BRAND.md` |
| `@sequel/foundation/theme` | Theme model: modes, `resolveTheme`, `themeInitScript(storageKey)` |
| `@sequel/foundation/theme/ThemeToggle` | The Light / Dark / Browser header toggle (client component) |
| `@sequel/foundation/ui` | Button (incl. the accent hand-off variant), Callout, Field, StatusBadges, SaveStateIndicator, Toast + viewport/store, ShowMore, Breadcrumbs, ExportBar, NavProgress + LinkPendingHint (route-transition pending feedback), BackToTop, `SearchCombobox` + `comboMatches` (searchable APG editable-combobox-with-list primitive — type-to-filter, keyboard nav, optional group headers, capped render with overflow hint), `useScrollToEdit` (scroll-into-view + focus hook for jump-to-edit UX) |
| `@sequel/foundation/llm` | `getClient`, `modelFor`/`withModelFallback` (task-class model config), `llmErrorEvent`, `streamJob`/`consumeLlmStream` |
| `@sequel/foundation/holidays` | US observed company-holiday calendar — pure, no `Date.now()`; fixed-date holidays shift Sat/Sun to the nearest weekday, floating (Monday/Thursday-anchored) holidays never shift |
| `@sequel/foundation/deck-kit` | Native-shape chart primitives (`deck-charts`), the branded-deck engine (`createBrandDeckEngine` + table/status/card primitives), `slimPresentationZip` (dedupe + prune), brand `FONT` |
| `@sequel/foundation/docs-kit/guide-contents` | Bookmarked-outline Contents machinery for generated .docx guides |
| `@sequel/foundation/docs-kit/docx-brand` | Shared docx brand constants (NAVY/BLUE/LIME/GREY/CRITICAL/FONT) |
| `@sequel/foundation/docs-kit/xlsx-brand` | Shared ExcelJS styles — brand-navy header standard, status fills, `addHeader`/`titleBlock`/`workbookToBuffer` |
| `@sequel/foundation/scripts/*` | `clean-icloud-dups.sh`, `preseed-deck-template.mjs`, `render-verify.mjs` |

## Consuming from a Next.js app

1. **Install** (git dependency; tag releases and pin):

   ```jsonc
   // package.json
   "dependencies": {
     "@sequel/foundation": "github:SequelOrtho/sequel-foundation#v0.7.1"
   }
   ```

   The package ships TypeScript/TSX source, so add to `next.config.ts`:

   ```ts
   transpilePackages: ["@sequel/foundation"],
   ```

2. **Styles** — in `app/globals.css`:

   ```css
   @import "tailwindcss";
   @import "@sequel/foundation/brand/theme.css";
   /* Tailwind v4 doesn't scan node_modules by default; scan the package so
      its component classes are generated: */
   @source "../node_modules/@sequel/foundation";
   ```

3. **Layout** — fonts, theme init, toggle:

   ```tsx
   import { Montserrat, Geist_Mono } from "next/font/google";
   import { themeInitScript } from "@sequel/foundation/theme";
   import { ThemeToggle } from "@sequel/foundation/theme/ThemeToggle";

   const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
   const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
   const THEME_KEY = "myapp.theme"; // per-app; existing hubs keep pi.theme / hub.theme

   // in <body>, first element:
   <script dangerouslySetInnerHTML={{ __html: themeInitScript(THEME_KEY) }} />
   // in the header:
   <ThemeToggle storageKey={THEME_KEY} />
   ```

4. **LLM env vars** (all optional overrides): `ANTHROPIC_API_KEY`, `LLM_MODEL_PROSE` (default `claude-opus-5`), `LLM_MODEL_PRESENTATION` (default `claude-opus-5`), `LLM_MODEL_FALLBACK` (default `claude-opus-4-8` — unavailability rescue only, never what a healthy call runs on).

   `withModelFallback` logs which model actually served each call (`[llm] served by <model>`) and warns when a fallback fires (`[llm] <model> unavailable (NotFoundError 404) — retrying on <fallback>`). Callers may ignore the returned `model`, so these lines are the only way a silent downgrade — a key that lost access to the configured model, say — is visible in production logs. The served-model line is suppressed under `NODE_ENV=test`.

5. **Peer deps**: install what the subpaths you use need — `jszip`/`pptx-automizer` for deck-kit, `@anthropic-ai/sdk` for llm, `docx` for docs-kit.

## Twin-retirement map (Phase C)

When the two existing hubs adopt this package, these local copies are deleted and imports repointed; until then the hand-sync rule still applies to anything below.

| App file (both hubs unless noted) | Replaced by |
|---|---|
| `lib/theme.ts`, `components/ThemeToggle.tsx` | `theme`, `theme/ThemeToggle` (pass the app's storage key) |
| brand token blocks in `app/globals.css` | `brand/theme.css` import |
| `lib/llm/{models,client,http,stream,stream-client}.ts` | `llm` |
| `lib/exporters/pptx-slim.ts` (Sequel_Ortho) / prune logic inside `brand-deck.ts` | `deck-kit` (`slimPresentationZip`) |
| `lib/exporters/deck-charts.ts` (project-insights) | `deck-kit` |
| `scripts/lib/guide-contents.mjs` (Sequel_Ortho) | `docs-kit/guide-contents` |
| `lib/exporters/brand-deck.ts` (both) | `deck-kit/brand-deck` — the app keeps a thin config module: `createBrandDeckEngine({ templatePath, brands, defaultBrand })` plus its `pickBrand` entity matcher; primitives (`th`, `td`, `contentTable`, `statBox`, `takeaway`, `riskCard`, …) import from the kit |
| per-file `NAVY`/`BLUE`/`LIME`/`GREY`/`FONT` consts in `*-docx.ts` (both) | `docs-kit/docx-brand` |
| `lib/exporters/xlsx-helpers.ts` (Sequel_Ortho) + inline header styling in PI xlsx exporters | `docs-kit/xlsx-brand` |
| `scripts/clean-icloud-dups.sh`, `scripts/preseed-deck-template.mjs` | `scripts/*` |
| `components/ui/*` (Sequel_Ortho), `components/{Button,Callout,ShowMore,Breadcrumbs,ExportBar}.tsx` (project-insights) | `ui` — **note the merges below** |

**Merge decisions (canonical vs. the old copies):**

- **Button** — Project Hub's variant vocabulary (`primary` blue / `secondary` navy / `accent` chartreuse hand-off / `outline` / `outlineBrand` / `danger`) + Acquisition Hub's `ghost`, polymorphic `href` → `<Link>`, and `busy`/`busyLabel`. `buttonClasses` takes an options object. *Acquisition Hub's old `secondary` (neutral border) maps to `outline`.*
- **Callout** — Acquisition Hub's canonical (icon + optional title, `role` derived from tone). Project Hub's `role` prop is dropped; tone set is identical.
- **StatusBadges** — `ApprovedBadge` now takes `approvedAt` (+ optional `label`) instead of the playbook domain type.
- **theme** — `THEME_STORAGE_KEY` constant became `themeInitScript(storageKey)` + a `storageKey` prop; behavior otherwise identical.
- **brand-deck engine (Phase B)** — the BRANDS map / SEQ const became a `BrandDeckEngineConfig` the app supplies (template path + per-brand slide map + header fills); `spec.brand` is optional and defaults to the engine's `defaultBrand`. The engine's post-assembly cleanup now calls `slimPresentationZip` (a superset of the old `pruneUnusedLayoutsAndMedia`: same layout/media prune plus byte-identical media dedupe and chart/diagram/notes pruning) — proven end-to-end against the Acquisition Hub's real template (0.19 MB output from the 10.9 MB template, clean LibreOffice render).
- **contentTable (Phase B)** — canonical style is Project Hub's horizontal-rules-only (Tufte) table with `margin [3,10,3,10]` and zebra `FAFAFB`; the Acquisition Hub's old full grid / `margin 5` / zebra `F7F7F8` is superseded (pass `border`/`margin` opts if a specific export needs the old look). `CONTENT.bottom` standardizes on 6.7 (AH was 6.6). `th()` gains the fontSize/align superset; AH-only `contentBullets`/`FOOTNOTE_Y` and PI-only `takeaway`/`riskCard`/`gaugeBar`/etc. are all included.
- **xlsx headers (Phase B)** — the canonical workbook header fill is **brand navy** (parity with deck contentTable headers and docx table shading). The Acquisition Hub's zinc-900 header is superseded at adoption; Project Hub's exporters already used navy/blue.

## Not here yet

- **VCP engine** — clean single-file twin, but its tie-out tests and constants are per-app; extract with care.
- **Nav shell / tile-parity registry pattern** — reusable pattern, app-specific registries; extract the shell + parity-test helper.
- **graphic-render / pitch-library build scripts** — Acquisition Hub-specific for now (LibreOffice-dependent, tuned to its library).
- **App starter template** (Phase D) — a `create-sequel-app` template repo wiring all of the above.

## Development

```bash
npm install
npm test          # vitest unit suite
npm run typecheck
```

Component tests (`.test.tsx`) run under `jsdom` via `@testing-library/react`; `@vitejs/plugin-react` handles JSX for Vite's transform pipeline (added as devDeps alongside the new `SearchCombobox` component tests — plain `.ts` tests still run under Node).

Versioning: tag releases (`v0.x.y`); consumers pin the tag in their git dependency.

### Release checklist

1. `npm test` and `npm run typecheck` green.
2. If anything in `ui/`, `theme/`, or `brand/` changed, that is a visual change in **every** consumer — check both hubs before releasing.
3. Bump `version` in `package.json`.
4. **Bump the version refs in `README.md` and `ADOPTING.md`** — the install command, the `package.json` example, and the "pin a tag" example. These are the first commands a new developer copies, so a stale tag here starts every new app behind. Verify none are left:

   ```bash
   grep -rnE "#v[0-9]+\.[0-9]+\.[0-9]+" README.md ADOPTING.md
   ```

5. Commit, then tag: `git tag v0.x.y && git push --tags`.
6. Bump the pin in each consumer as you choose to take the release: `Sequel_Ortho`, `project-insights`, `sequel-app-template`.
