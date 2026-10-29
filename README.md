# @sequel/foundation

The shared foundation for Sequel family applications — **Sequel Ortho, Fox Valley Orthopedics, and OrthoNebraska**: per-entity brand tokens and theme, the design-system UI primitives, LLM plumbing, the deck kit, guide-build machinery, and repo hygiene tooling — extracted from **Project Hub** (`project-insights`) and the **Market Expansion Hub** (`Sequel_Ortho`, formerly the Acquisition Hub), which previously kept these in sync by hand ("the twin registry").

**New here? Start with [ADOPTING.md](ADOPTING.md)** — the quick start for building a new Sequel app on the foundation or wiring it into an existing one.

Three documents carry the accumulated know-how; read them before building anything user-facing, deck-shaped, or AI-backed:

- **[docs/DESIGN-CONVENTIONS.md](docs/DESIGN-CONVENTIONS.md)** — the UX rules that make Sequel apps feel like one family.
- **[docs/DECK-CRAFT.md](docs/DECK-CRAFT.md)** — everything learned generating board-quality pptx/docx/xlsx at runtime.
- **[docs/AI-CRAFT.md](docs/AI-CRAFT.md)** — the demo-to-production rules for AI features: the five system boundaries, the 5-gate audit, and the per-infrastructure (Postgres/Neon vs Azure SQL, Netlify vs Azure) mapping. The `/ai-production-audit` skill (`.claude/skills/`) runs its scorecard against an app. The `/foundation-release` skill ships a release end to end (version-bump PR → CI auto-tag → fleet pin-bump PRs via `scripts/pin-foundation.sh`).

## Contents

| Subpath | What it is |
|---|---|
| `@sequel/foundation/brand/tokens.css` | Framework-free brand custom properties (Sequel Ortho default + FVO / ON `data-entity` blocks) |
| `@sequel/foundation/brand/theme.css` | Tailwind v4 layer: dark mode variant, tokens incl. dark values, **entity brands** (`<html data-entity="FVO"|"ON">` re-pitches every brand token, the blue ramp and the body/heading faces; none = Sequel Ortho), native-control `color-scheme` + dark `<option>` ground, RYG, blue-ramp remap, focus ring, print rules |
| `@sequel/foundation/brand/entities` | The entity registry (`ENTITIES`, `ENTITY_KEYS` = `SEQ` / `FVO` / `ON`): names + written forms, official swatches, token roles, typography, logo files/rules — see `brand/BRAND.md` |
| `@sequel/foundation/brand/EntityLogo` | `<EntityLogo entity=… />` — the entity's lockup, color on light / reverse in dark mode (or a pinned `variant`) |
| `@sequel/foundation/brand/palette` | The palette in JS for charts/exporters: `brandColors(theme, entity)` (`brand` = the text-safe primary, `brandBright` = the guide color for charts and marks), `seriesColors(theme, entity)`, `ENTITY_BRAND_COLORS` (test-locked to `theme.css`) |
| `@sequel/foundation/brand/assets/*` | Logos per entity (`logo-navy`/`logo-white`/`banner` for Sequel; `fvo/*`, `on/*`: color / reverse / white / mark) and favicons (`<key>/icon.png`) — see `brand/BRAND.md` |
| `@sequel/foundation/theme` | Theme model: modes, `resolveTheme`, `themeInitScript(storageKey)` |
| `@sequel/foundation/theme/ThemeToggle` | The Light / Dark / Browser header toggle (client component) |
| `@sequel/foundation/ui` | Button (incl. the accent hand-off variant), Callout, Field (hint / error tied to the control by `aria-describedby`; `fieldHintId` / `fieldErrorId`) + `RequiredMark` / `RequiredLegend` / `FieldError` + `checkRequired` (the required-field convention: asterisk + legend, announced, validated on Save with standard messages), StatusBadges, SaveStateIndicator, Toast + viewport/store (next-step link actions and callback actions — `toastUndo` for reversible actions), `offerUndo` + `UndoStrip` + `postUndo` (Undo for deletes: the toast, then a strip the `ToastViewport` docks that keeps Undo on screen for the 30-minute window, across navigation), `HomeLink` + `toastHomeNav` (header brand link with the standard "Bringing you back to Home…" departure toast), ShowMore, Breadcrumbs, `TileIcon` + `TILE_ICON_MUTED_CLASS` + `AreaTile` / `AreaTileGrid` (tile iconography — the shared line-glyph set every hub tile carries beside its title, landing and section grids included, muted on a locked tile; and the Administration-hub area card with status/attention footer), `Tabs` + `pickTab` / `tabHref` / `tabClasses` (URL-backed tab bar — `?tab=` resolved through a strict allow-list, the default tab is the bare URL, `aria-current` on the active link, optional count pills, per-tab href override), ExportBar, NavProgress + LinkPendingHint (route-transition pending feedback), BackToTop, `AdaptiveSelect` (the one dropdown control — native `<select>` up to 12 options, fuzzy `SearchCombobox` beyond, same props/`name`/`defaultValue` either way; `labelClassName` matches a host form's label typography), `SearchCombobox` + `comboMatches` / `comboScore` / `rankComboOptions` (searchable APG editable-combobox-with-list primitive — fuzzy ranked type-to-filter, keyboard nav, optional group headers, capped render with overflow hint, hidden form input via `name`), `SEARCHABLE_SELECT_THRESHOLD` / `isSearchableSize`, `MultiSelectFilter` + `passesMulti` / `toggleMulti` / `multiSummary` (list filters that take several values — checkbox popover, OR within a filter, AND across filters, nothing ticked = off; searchable past 12 options), `useScrollToEdit` (scroll-into-view + focus hook for jump-to-edit UX), `useFitInViewport` + `horizontalNudge` / `availableHeightBelow` (popovers stay on screen — put the ref on any menu or popover panel and it slides back inside the window and caps its size), `NoAccessNotice` / `NotFoundNotice` / `PageErrorNotice` + `noAccessMessage` / `notFoundMessage` / `pageErrorMessage` (the branded 403 / neutral 404 / error pages every hub renders from `app/forbidden.tsx`, `app/not-found.tsx`, `app/error.tsx` — a forwarded link the role can't open says why and who to ask), `INPUT_CLASS` / `inputClasses` (the pickers' own box for hand-rolled `<input>`/`<textarea>` — white ground in light mode, so fields on tinted cards match the pickers); v0.29.0 adds `SkipLink` + `titleTemplate` (skip link and page titles), `Dialog` (native `<dialog>` modal), `useConfirmStep` (arm-then-confirm focus), `RygStatus` (stoplight glyph + word) and `useChartTheme` / `chartTheme` (readable chart tooltips and axes); v0.30.0 adds `FILE_INPUT_CLASS` / `fileInputClasses` (file pickers drawn as the outline Button — focus ring, wraps at 390px) and `BUTTON_DISABLED_CLASS` / `BUTTON_BUSY_CLASS` (the disabled and busy states `buttonClasses` applies: a neutral zinc ground with a muted label in both themes); v0.31.0 adds `UnreadBadge` + `clearUnreadBadge` (the bell's unread count in the tab title, "(3) Page · Hub", and on the tab's icon; Sign Out and the signed-out screen clear it) and `badgeTitle` / `stripBadge` / `sameTitleIgnoringBadge` / `stripShownBadge` (title logic that must ignore the count; `stripShownBadge` for a title put back); v0.32.0 adds `useRememberedState` + `clearRememberedViews` / `readLike` (list filters are remembered — `useState` for a list's filters, search, sort and grouping, kept for this browser tab so opening an item and coming back by a link, Back or reload shows the list as it was left; Sign Out and the signed-out screen clear them) |
| `@sequel/foundation/llm` | `getClient` (with hard timeout budget + pinned retry policy), `modelFor`/`withModelFallback` (task-class model config), the model lock (v0.34.0: `APPROVED_MODELS` / `isApprovedModel`, `ModelNotApprovedError` + `MODEL_NOT_APPROVED_MESSAGE` / `MODEL_NOT_APPROVED_STATUS` (503), `modelLockIssue`, `modelLockLogLine` — `withModelFallback` refuses an unapproved model before any call and never tries an unapproved fallback), `llmErrorEvent`, `streamJob`/`consumeLlmStream` (heartbeats + status stages), `gateLlmInput`/`redactSecrets` (deterministic input gate), `parseLlmJson`/`extractJsonPayload` (output contract), `checkRateBudget` + `FixedWindowStore` seam (identity-aware rate limiting, hashed keys), `startLlmTrace`/`emitLlmTrace` + `LlmTraceSink` seam (Gate-5 per-request traces), `runGoldenSet`/`assertGoldenPass` (golden-set runner) |
| `@sequel/foundation/assistant` | Ask the Hub, the family read-only assistant (AI-CRAFT §2.6, v0.33.0) — pure and client-safe: the conversation types + limits (`MAX_STEPS`, `MAX_TOOL_CALLS`, `MAX_BODY_CHARS`, `MAX_TOOL_RESULT_CHARS`, `MAX_QUESTION_CHARS`), `parseConversation` / `compactHistory` / `pendingToolCalls` / `answerText` / `exchanges` / `namedIds` / `fit` / `capToolResult`, `renderAnswer` + `isHubPath` / `linksInToolResult` (light markdown; a link only for a Hub path a tool returned), `assistantEnabled` (the off switch), the approved-model refusal (`ASSISTANT_MODEL_NOT_APPROVED_MESSAGE` / `MODEL_NOT_APPROVED_STATUS`, `AssistantModelNotApprovedError`, `modelApproved`, `modelNotApprovedLogLine`), withheld on purpose (v0.34.0: `withheld(fields, howToSee?)` for a tool result that drops fields by rule, `ASSISTANT_PRIVACY_PROMPT`, `DEFAULT_PRIVACY_NOTE`), and the panel's copy (`conversationKey`, `stepErrorMessage`, `redactionNotice`, `readStoredConversation`, `ASK_BUTTON_CLASS`). Server half at `…/assistant/server`: `runAssistantStep` (one model call per step, `tool_choice: none` on the last, a 45 s step budget that binds the tools too, an optional `signal`, no question logged — the hub passes its tools, runner, prompt and its own `client` seam; every step is held to the family `APPROVED_MODELS` and a hub may pass a narrower `allowedModels`, v0.34.0: an unapproved model makes no call and ends the step in the 503 refusal `ASSISTANT_MODEL_NOT_APPROVED_MESSAGE`, an unapproved fallback is never tried; the static `ASSISTANT_PRIVACY_PROMPT` rides once in the cached system prefix), `assistantModelIssue` (the same refusal for a route to answer early), `readStepRequest` (413 / 422 + the input gate), `checkAssistantBudget` (the per-person and global rate budget over a `FixedWindowStore`; `memoryRateStoreForDevOnly()` for local development and tests only). Client panel at `…/assistant/panel`: `AskHubPanel` (opt-in `privacyNote`: `true` for `DEFAULT_PRIVACY_NOTE` or the hub's own line, muted, under the question box) |
| `@sequel/foundation/access` | No-role sign-in policy under Entra (DESIGN-CONVENTIONS §4): `noRoleMessage` (the family wording), `signNoRolePass`/`readNoRolePass` (signed hand-off from the `signIn` callback to the 403 page), `recordNoRoleAttempt` + `AccessRequestStore` seam (the admin queue), `requestAccess` (one email to all System Administrators, 24 h throttle), `accessRequestEmail`, `pendingAccessRequests`, `NoRoleNotice` (page body with the Request access form) |
| `@sequel/foundation/session` | Signing out and ended sessions (DESIGN-CONVENTIONS §4): `SignOutForm` (the header Sign Out — a plain form POST to `/auth/sign-out`, never a Server Action), `SessionWatch` (signed-out dialog when another tab signs out or the session expired while the tab sat idle), `SignedInNotice` + `MicrosoftSignOutOffer` (the sign-in page's still-signed-in and signed-out states). Pure half at `…/session/policy` for `proxy.ts` and route handlers: `signOutRoute` (the `/auth/sign-out` GET/POST handlers), `signedOutResponse` (the proxy's answer to a signed-out page / API fetch / Server Action), `bypassOnSignOut` (wraps an Auth.js proxy so `/auth/sign-out` never gets a refreshed session cookie), `safeCallbackUrl` / `signInHref`, `entraSignOutUrl`; `SessionWatch idleTimeoutSeconds` warns two minutes before an idle sign-out with **Stay Signed In** (v0.29.0); `ForgetSignedInState` (v0.32.0) goes on the sign-in page's signed-out branch and clears remembered list filters and the unread count after an idle sign-out |
| `@sequel/foundation/undo` | Undo for deletes (DESIGN-CONVENTIONS §3), pure and client-safe: `UNDO_WINDOW_MINUTES` (30), `undoTicket` / `undoTicketFrom` (what a delete route returns), `undoRefusal` + `undoRefusalMessage` (only the deleter, once, inside the window), `UNDO_CONFLICT_MESSAGE`, `UNDOABLE_DELETE_HINT` |
| `@sequel/foundation/undo/postgres` | Server-only Postgres snapshot engine: `captureDelete(exec, table, key)` before the delete (cascade tree + SET NULL links, read from the live foreign keys), `restoreSnapshot(exec, snapshot)` to put it back, `isRestoreConflict` — driver-agnostic over a `SqlExecutor` (Prisma: `tx.$queryRawUnsafe`) |
| `@sequel/foundation/testing/a11y` | CI accessibility and link checks (DESIGN-CONVENTIONS §8): `A11Y_TAGS` (WCAG 2.0–2.2 A/AA for axe), `blockingViolations` (serious + critical fail; exceptions need a reason) + `formatViolations`, `sameOriginLinks` / `findBrokenLinks` / `formatBrokenLinks`, `themeInitFor` (scan in light and dark). No Playwright or axe dependency — the app's own Playwright test supplies them |
| `@sequel/foundation/testing/scrollers` | The scrolling-table rule as a unit-test check (DESIGN-CONVENTIONS §3 "A scrolling wrapper is positioned", v0.30.0): `findUnpositionedScrollers` (class strings with an `overflow-x-auto` / `overflow-auto` / `overflow-x-scroll` / `overflow-scroll` and no `relative` / `absolute` / `fixed` / `sticky`; `vertical` and a reasoned `allow` map optional) + `formatUnpositionedScrollers`, `collectSourceFiles` (reads `app/` and `components/` into `{ path, source }`) |
| `@sequel/foundation/testing/model-lock` | The model lock as a unit-test check (AI-CRAFT §2.4, v0.34.0): `findUnlockedModelCalls(collectSourceFiles(root, dirs), { allow })` lists every Anthropic SDK call (`messages.create` / `parse` / `stream`, `batches.create`) that is not inside a `withModelFallback` callback or doesn't use that callback's `model`; `formatUnlockedModelCalls` names the fix. Every hub runs it in its unit suite |
| `@sequel/foundation/testing/unread-badge` | Test-only UnreadBadge helpers (v0.31.0): `resetUnreadBadgeForTests` (forget the badge's module state between tests — never in app code, where it would let a count back onto a signed-out tab) and `rememberBadgedTitleForTests` (mark a hand-set "(N) …" title as one the badge wrote, for a restore test through `stripShownBadge`) |
| `@sequel/foundation/holidays` | US observed company-holiday calendar — pure, no `Date.now()`; fixed-date holidays shift Sat/Sun to the nearest weekday, floating (Monday/Thursday-anchored) holidays never shift |
| `@sequel/foundation/deck-kit` | Native-shape chart primitives (`deck-charts`), the branded-deck engine (`createBrandDeckEngine` + table/status/card primitives), `slimPresentationZip` (dedupe + prune), brand `FONT` |
| `@sequel/foundation/docs-kit/guide-contents` | Bookmarked-outline Contents machinery for generated .docx guides |
| `@sequel/foundation/docs-kit/docx-brand` | Shared docx brand constants (NAVY/BLUE/LIME/GREY/CRITICAL/FONT — Sequel) + `docxBrand(entity)` for FVO / ON (colors + document faces) |
| `@sequel/foundation/docs-kit/xlsx-brand` | Shared ExcelJS styles — brand-navy header standard (`headerFill(entity)` / `blueHeaderFill(entity)` per entity), status fills, `addHeader(sheet, titles, entity?)`/`titleBlock`/`workbookToBuffer` |
| `@sequel/foundation/scripts/*` | `clean-icloud-dups.sh`, `preseed-deck-template.mjs`, `render-verify.mjs`, `extract-entity-logos.py` (rebuilds `brand/assets/{fvo,on}` from a guide PDF) |

## Consuming from a Next.js app

1. **Install** (git dependency; tag releases and pin):

   ```jsonc
   // package.json
   "dependencies": {
     "@sequel/foundation": "github:SequelOrtho/sequel-foundation#v0.34.0"
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

3. **Layout** — entity, fonts, theme init, toggle, logo:

   ```tsx
   import { Montserrat, Open_Sans, Geist_Mono } from "next/font/google";
   import { EntityLogo } from "@sequel/foundation/brand/EntityLogo";
   import { themeInitScript } from "@sequel/foundation/theme";
   import { ThemeToggle } from "@sequel/foundation/theme/ThemeToggle";

   const ENTITY = "FVO"; // "SEQ" | "FVO" | "ON" — the app's one entity (template: lib/entity.ts)
   const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
   const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans" }); // FVO body face
   const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
   const THEME_KEY = "myapp.theme"; // per-app; existing hubs keep pi.theme / hub.theme

   <html lang="en" data-entity={ENTITY} suppressHydrationWarning>
   // in <body>, first element:
   <script dangerouslySetInnerHTML={{ __html: themeInitScript(THEME_KEY) }} />
   // in the header:
   <EntityLogo entity={ENTITY} height={32} priority />
   <ThemeToggle storageKey={THEME_KEY} />
   ```

   Sequel Ortho apps may omit `data-entity` (the default) and Open Sans.

4. **LLM env vars** (all optional overrides): `ANTHROPIC_API_KEY`, `LLM_MODEL_PROSE` (default `claude-opus-5`), `LLM_MODEL_PRESENTATION` (default `claude-opus-5`), `LLM_MODEL_FALLBACK` (default `claude-opus-4-8` — unavailability rescue only, never what a healthy call runs on) — these three choose only among `APPROVED_MODELS` (v0.34.0): any other value is refused before a call (primary) or never tried (fallback), `LLM_TIMEOUT_MS` (default `120000` — the hard per-call time budget; a fired budget surfaces as a typed 504 so routes can degrade deterministically), `LLM_MAX_RETRIES` (default `2`, the SDK's backoff retries on 408/429/5xx), `LLM_INPUT_MAX_CHARS` (default `32000` — the input gate's size cap; per-call `maxChars` overrides for real long-document features).

   `withModelFallback` logs which model actually served each call (`[llm] served by <model>`) and warns when a fallback fires (`[llm] <model> unavailable (NotFoundError 404) — retrying on <fallback>`). Callers may ignore the returned `model`, so these lines are the only way a silent downgrade — a key that lost access to the configured model, say — is visible in production logs. The served-model line is suppressed under `NODE_ENV=test`.

5. **Peer deps**: install what the subpaths you use need — `jszip`/`pptx-automizer` for deck-kit, `@anthropic-ai/sdk` for llm and `assistant/server`, `docx` for docs-kit.

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

- **Button** — Project Hub's variant vocabulary (`primary` blue / `secondary` navy / `accent` hand-off (the entity accent — Sequel chartreuse) / `outline` / `outlineBrand` / `danger`) + Acquisition Hub's `ghost`, polymorphic `href` → `<Link>`, and `busy`/`busyLabel`. `buttonClasses` takes an options object. *Acquisition Hub's old `secondary` (neutral border) maps to `outline`.*
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
2. If anything in `ui/`, `theme/`, or `brand/` changed, that is a visual change in **every** consumer — check both hubs before releasing. A `brand/` change touching one entity's block reaches every app of that entity (`data-entity`); verify the default (no attribute) still renders Sequel Ortho unchanged.
3. Bump `version` in `package.json`.
4. **Bump the version refs in `README.md` and `ADOPTING.md`** — the install command, the `package.json` example, and the "pin a tag" example. These are the first commands a new developer copies, so a stale tag here starts every new app behind. Verify none are left:

   ```bash
   grep -rnE "#v[0-9]+\.[0-9]+\.[0-9]+" README.md ADOPTING.md
   ```

5. Open the PR and squash-merge it. CI's `tag` job cuts `v0.x.y` as a GitHub Release on the merge commit automatically (it fires whenever `package.json`'s version has no tag yet). Confirm: `git ls-remote --tags origin v0.x.y`.
6. Bump the pin in each fleet app (see CLAUDE.md's fleet table) with `scripts/pin-foundation.sh <app-dir> v0.x.y` — it uses the explicit `npm install <name>@<spec>` form, the only one that re-resolves a git dependency after a spec change — then run that app's gate and open its PR.
