# Sequel Design Conventions

The UX rules that make Project Hub and the Acquisition Hub feel like one product family. Every new Sequel application adopts these from day one. Rules marked **(code)** are enforced or embodied by a module in this repo; the rest are conventions to carry into the app.

## 1. Brand & theming

- **One token mechanism** (code: `brand/tokens.css`, `brand/theme.css`). All color flows through CSS custom properties; Tailwind utilities reference tokens (`bg-brand`, `text-brand-navy`), never raw hexes. Tailwind's default `blue-*` ramp is remapped to brand blues so third-party-ish code adopts the brand automatically.
- **Dark mode is an attribute, not a media query** (code: `theme/theme.ts`, `ThemeToggle`). The resolved theme is stamped on `<html data-theme>` by a pre-hydration script (no flash), a three-state Light / Dark / Browser toggle persists in localStorage, and Tailwind's `dark:` variant is re-keyed to the attribute. Per-app localStorage key (`pi.theme`, `hub.theme`, …) so apps don't fight; the auto mode is stored as `"system"` and **labeled "Browser"** (it reads `prefers-color-scheme`, which is the browser's setting).
- **The dark yellow problem**: dark mode gets its own lightened/desaturated status values (see `theme.css`), never the light palette on a dark ground. Don't invent per-app dark values.
- **The theme layer owns the page ground** (code: `theme.css`): `body` background/color come from `--background`/`--foreground` (in `@layer base`, so an app's own body utilities still win), and `color-scheme` tracks `data-theme` so native scrollbars, pickers, and form controls follow the theme. Apps do not need — and template apps should not add — body-level color classes.
- **Muted/helper text is a token, never a raw gray** (code: `ui/Field.tsx` hint, `ui/SaveState.tsx`): use `text-brand-muted` (light `#707372` / dark `#a1a1aa`, both AA on their grounds) for hints, captions, secondary labels, empty states, and char counts. A raw `text-zinc-500` with no `dark:` pair is the single most common dark-mode bug across the hubs.
- **Contrast rescue is a net, not a license** (code: `theme.css` "Dark-mode contrast rescue"): in dark mode, un-darkened mid-gray text and light-gray border utilities are remapped to legible values — but only on elements with no `dark:text-*` / `dark:border-*` of their own. It exists so a missed pair degrades to "slightly generic" instead of "invisible"; new code still uses tokens or real `dark:` pairs, and rescued grays should be retired in sweeps.
- **Montserrat everywhere** — UI, docx, xlsx, pptx. Monospace is Geist Mono. Load via `next/font/google` with `--font-montserrat` / `--font-geist-mono` variables.

## 2. Color semantics

- **Chartreuse accent = hand-off.** The lime accent (`#CAD400`) is reserved for assign / hand-off / delegate actions (code: `Button` variant `accent`). Views and passive links stay arrow-less and non-accent. Accent buttons take dark ink (zinc-900), never navy — navy washes out on lime, in both themes.
- **Icon + label, never color alone.** Every status indicator pairs a shape/icon with text: the ApprovedBadge check-circle + "Approved · date" (code: `ui/StatusBadges.tsx`), RYG dots next to status words, the dumbbell chart's hollow-start/filled-end dots. This is an accessibility floor, not a style choice.
- **RYG stoplight vocabulary** (code: tokens in `theme.css`). Green / Yellow / Red / None, with separate `-text` variants for colored text. Thresholds are computed by shared pure helpers (see §4), and the same tokens drive UI chips and deck dot-cells.
- **Maroon (`#8C1D2D`) for critical rows in decks** — an emphasized table row must not reuse the navy header fill or it reads as a second header.

## 3. Interaction & state

- **Explicit sign-off for commitment actions; auto-advance only trivial transitions.** Anything that implies acknowledgement, approval, or an auditable decision (completing a gate, approving a phase, adopting a baseline) is an explicit user action — the apps are the record a steering committee reads. Auto-advancing "you typed something → in progress" is fine and appreciated.
- **Save-state chip idiom** (code: `ui/SaveState.tsx`): `Saving… → Unsaved changes → Saved · 2:14 PM`. Toasts confirm saves; error toasts linger longer than confirmations (code: `ui/toast/`).
- **Every mutation ends with confirmation + a next step — never silence.** After any user action that changes data, the user must see (a) that it worked and (b) where to go from there: a toast with a contextual action link (`toastSaved("PM assigned", { action: { label: "View project →", href } })`), an inline `SaveStateIndicator` on form surfaces, or a redirect that lands on the affected entity. `router.refresh()` alone is not feedback. Queue rows must never silently vanish on success — confirm the action and offer the entity or the next item (code: `ui/toast/` action links; the toast ttl stretches when a link is attached).
- **Saving keeps you in place** (code: `ui/SectionSave.tsx`). A successful save never navigates away from the form — the confirmation is the toast plus the SaveState chip, and the user decides when to leave (Cancel / the origin-aware back link). Redirect-on-save is reserved for CREATE flows, which land on the newly created entity. List-row inline actions refresh in place.
- **Save is disabled until something changed** (code: `ui/SectionSave.tsx` + `ui/form-dirty.ts`). Every Save button is dirty-aware — disabled with "No changes to save" on its title until the form actually differs from its loaded state (`useFormDirty` snapshots uncontrolled forms; `shallowDirty` compares controlled state). A Save that would PATCH nothing is noise and a false audit entry.
- **Long forms save per section** (code: `ui/SectionSaveBar`). A form tall enough to scroll carries a compact Save bar inside each section (fieldset) so committing never requires scrolling to the bottom; the bottom Save-all remains for the full sweep. Both are dirty-aware, both confirm in place.
- **Navigation shows pending state too** (code: `ui/NavProgress`, `ui/LinkPendingHint`). A route transition that blocks on server work is an action like any other — it gets feedback within ~1s (NN/g response-time limits). Three layers, outermost first: `<NavProgress/>` mounted once in the root layout paints a brand-blue top bar on every internal link click and back/forward (fetch-then-push flows call `startNavProgress()` next to the fetch); slow segments ship a `loading.tsx` skeleton so the destination answers immediately; high-traffic tiles add an inline `LinkPendingHint` ("Opening…") on the control the user clicked. Every indicator holds invisible for its first ~250ms so fast hops never flicker.
- **Back to top on long scroll surfaces** (code: `ui/BackToTop`). Any page that regularly runs past ~4 screens mounts the floating pill; it appears only past ~2.5 viewports of scroll *and* on upward scroll intent (NN/g back-to-top guidelines), so short pages and downward reading never see it. Quiet outline styling — never the accent — icon + label, `data-no-print`. Pair with a sticky section jump-nav when the page has named sections; back-to-top gets you *up*, the jump-nav gets you *around*.
- **Locked areas render as non-links** — `role="link" aria-disabled` with the reason printed on the tile ("Complete due diligence to unlock"), never a dead `<a href>` and never a hidden tile (GOV.UK "cannot start yet" + NN/g). Server routes redirect locked URLs; the PATCH/API layer enforces the same rule. **Keep all enforcement layers in agreement** — UI affordance, server redirect, API validation.
- **Progressive disclosure for long lists** (code: `ui/ShowMore.tsx`): "Show N more / Show all (X) / Show fewer" with a live "Showing X of Y" count. No unbounded lists, no silent truncation.
- **Working-ahead warnings, not locks, for soft dependencies** — an amber banner ("Phase 1 is not yet completed…") when a user works in a later phase, reserved locks for hard gates.

## 4. Architecture principles

- **Shared pure helpers when UI and an exporter compute the same thing.** If a filter/sort/score appears in a `.tsx` view and a deck/workbook exporter, extract it to a plain function that takes the domain object, and unit-test it. The preview and the download must call the same function — execs must read what the analyst just reviewed.
- **Domain knowledge lives in content/templates, generators assemble.** Editable-by-non-engineers content (KPI libraries, phase templates, question catalogs, model constants) stays in data modules; logic modules stay generic.
- **LLM model selection is configuration** (code: `llm/models.ts`). Call sites declare a task class (`prose` | `presentation`) and go through `modelFor` + `withModelFallback`; adopting a new model is an env-var change. Never hardcode a model id at a call site.
- **Cache-stable system prompts.** The large static framework prompt is the cache target (`cache_control: ephemeral`); all per-request data goes in the user message. Never interpolate timestamps/UUIDs/names into the system prompt.
- **Typed exceptions, never string-matching** (code: `llm/http.ts`). Map SDK error classes to `{status, error}`.
- **Deterministic gates bracket every model call** (code: `llm/input-gate.ts`, `llm/output.ts`). Input passes `gateLlmInput` before the request (size cap, control-char normalization, high-precision secret/PII redaction — with the user told what was redacted); output passes `parseLlmJson` + a caller-owned type guard before render — never a raw `JSON.parse` on model text. Contract failures surface as one typed error with a safe retryable message, never a blank panel. The full production framework — five boundaries, the 5-gate audit, per-infrastructure mapping — is [AI-CRAFT.md](./AI-CRAFT.md); read it before shipping any AI-backed feature.
- **Streaming beats platform timeouts — and narrates its stages** (code: `llm/stream.ts` + `stream-client.ts`). Any LLM-backed route streams SSE with heartbeats (`streamJob`), multi-step jobs emit status stages via `progress()` ("Querying…" → "Formatting…") that the UI surfaces through `consumeLlmStream`'s `onStatus` instead of a bare spinner, and the browser collapses the stream back to one awaited value. A hard timeout budget (`LLM_TIMEOUT_MS`) turns provider brownouts into the typed 504 + the route's deterministic fallback, never an indefinite spinner. Jobs that exceed the platform's streamed-function cap (~60s on Netlify; measure per platform) go to a background function returning **202 + poll**.
- **Registry-driven surfaces.** Exports, admin areas, and home tiles are data (a registry array), and the UI renders the registry. Adding a capability = appending a descriptor, not hand-editing three components.
- **Layout-rendered helpers fail soft on DB errors.** Anything the root layout renders on every page (header nav, scope/role resolution, session-to-person lookups) must catch database errors and degrade — empty list, null person, claim-derived role — never rethrow. A hard failure in the layout 500s *every* route, including public ones a DB outage must not take down (e.g. the Incident Hub's anonymous-reporting pages, Aug 2026). Page bodies may still fail on their own queries; the layout may not. Hide dependent chrome (selectors, badges) when the degraded value is empty rather than rendering hollow controls.

## 5. Navigation & structure

- **The header logo links home — and says so** (code: `ui/HomeLink.tsx`). The logo + app title in the header are one `<Link href="/">` (with an accessible label) on every page — there is always a way back to the landing page without the browser back button. A bare `<div>` around the logo is a defect, not a style choice (surfaced by the Incident Hub tester review, Aug 2026). Clicking it confirms the departure with the family-standard "Bringing you back to Home…" info toast — §3's feedback rule applied to the one navigation whose destination is always nameable. Render the brand link as `<HomeLink>` (or call `toastHomeNav()` from a hand-rolled brand link's click handler); the toast fires only on clicks that actually navigate in this tab — never on modified/middle clicks (new tab) or re-clicks while already on Home.
- **Tile ↔ menu parity.** Every hub tile appears in that section's nav dropdown, added in the same PR, both rendered from one shared registry — locked by a parity unit test so a hand-edited menu can't drift.
- **Breadcrumbs on nested routes** (code: `ui/Breadcrumbs.tsx`); the last crumb is the current page, unlinked, `aria-current`.
- **Origin-aware back-nav via a strict allow-list registry.** Deep links into an entity page carry `?from=<origin-key>`; the page resolves the key against a registry (`{ key → { label, href } }`) to render "← Back to {label}", and threads the key through edit round-trips (`returnHref`). Never echo the raw param into an href; guard lookups with `Object.hasOwn`; unknown keys fall back to the default back target. A subpage may consume a *single* origin key by strict equality when only one flow lands there — comment it as deliberately not generalized.
- **Tabs are URLs.** Tabbed views drive the active tab from a query param through a strict allow-list (`?tab=`, `?view=`), rendered as `<Link scroll={false}>` with `aria-current="page"` — deep-linkable, in history, shareable. Links launched from inside a tab stamp the launching tab so returning lands where the user left. The default tab is the bare URL (omit the param when canonical).
- **Queues act-and-advance.** A worklist (assignment queue, triage inbox, approval list) never strands the user after an action: the item's departure is confirmed (toast + link, per §3), a session-local record strip preserves what was just done, visited/handled rows are marked (icon + label), and the surface the queue hands off to offers a way back to the queue. Entity names rendered anywhere (tables, cards, panels) are links to their detail page — a plain-text name with a detail page is a dead-end micro-moment.
- **Names open the editor wherever an Edit affordance exists.** On any surface that carries an Edit link or button for a resource (a table row, a card, a panel header), the resource's *name* is a second door to that same editor — same href for a navigating Edit link, same toggle handler for an inline editor, gated on the same edit permission. For viewers without edit rights the name stays plain text (or keeps its detail link per the queues rule above). The Edit affordance itself remains — the name is an addition, never a replacement, and the two must never diverge in target (established portfolio-wide in Project Hub, Aug 2026).
- **No zero-exit pages.** Every page offers at least one contextual next step beyond the global nav. Empty states double as navigation: explain what belongs here and link the create/next action.
- **Print is a feature** (code: print block in `theme.css` + `ui/ExportBar.tsx`): every read-only view saves cleanly to PDF; chrome and export buttons carry `data-no-print`.

## 5a. Navigation & flow review checklist

Run on every new/changed page and flow (synthesized from NN/g cognitive-walkthrough + menu/breadcrumb guidance, GOV.UK confirmation pages, Baymard back-button research, MeasuringU first-click). Score pass/fail; rate failures 0–4 (frequency × impact × persistence); fix 3s and 4s before merge.

Per page:
- **P1 Where am I?** — current section lit in the nav; title matches the link that got you here.
- **P2 Where can I go?** — global nav present; breadcrumb when ≥3 levels deep.
- **P3 First click is obvious** — a fresh colleague's first click for the page's #1 task is correct.
- **P4 No dead end** — ≥1 contextual next-step link beyond the global nav.
- **P5 Empty state navigates** — zero-data view explains + offers the create/next CTA.
- **P6 Back behaves** — back returns to the perceived previous view with state intact.

Per flow:
- **F1 Walkthrough** — at each step: right goal / control noticed / label connects / progress visible.
- **F2 Exit at every step** — cancel/back available, non-destructive; no trap states.
- **F3 Completion answers "what now?"** — confirmation + next-step link (§3 post-action rule).
- **F4 Queue actions advance** — next item or state-preserved return, never a dead stop.
- **F5 Path isn't lost-making** — the happy path is short and each hop is a confident choice; don't budget clicks, budget confusion per click.

## 6. Accessibility floor

- Visible brand focus ring on keyboard focus (`:focus-visible`, in `theme.css`), never removed.
- Minimum tap-target heights on all buttons (code: `ui/Button.tsx` sizes).
- `aria-live` on dynamic counts; `role="alert"` on danger callouts, `role="status"` elsewhere (code: `ui/Callout.tsx`).
- WCAG ≥ 4.5:1 for text chips (the emerald badge pairing is pre-checked).
- **Motion honors `prefers-reduced-motion`** (code: motion tokens + reduced-motion overrides in `theme.css`). Animated affordances drop the animation but keep the feedback visible — the nav bar becomes a static translucent strip, fade-ins appear instantly, `BackToTop` scrolls without smoothing. Information never rides on motion alone.

## 7. Writing & labels

- **Title-case for buttons, tiles, and nav items**; sentence case for body and hints.
- **The arrow (→) means hand-off** — pair it with accent actions; plain views stay arrow-less.
- Say what unlocks a locked thing ("Complete due diligence to unlock"), not just that it's locked.
- Error messages name the likely cause and the fix ("the configured API key lacks permission for this model — check ANTHROPIC_API_KEY").

## 8. Verification habits

- **Verify every render state a change touches** — pre-gate and post-gate, with and without an active record, empty/error/loading — not just the state you developed in.
- **Every user-facing PR regenerates the app's guide** in the same PR (docs-kit convention): the guide is a committed artifact and drifts silently otherwise. Validate by extracting the docx text and checking new wording present, stale wording absent.
- Deck/exporter changes follow the render-verify workflow in [DECK-CRAFT.md](./DECK-CRAFT.md).
- **AI-behavior changes rerun the feature's golden set.** A prompt edit or model bump can fix one case and quietly break twenty-five others; "tried a few prompts and it looked fine" is not verification. Each AI feature keeps a golden set of realistic queries and runs it before shipping prompt/model changes — and passes the 5-gate audit in [AI-CRAFT.md](./AI-CRAFT.md) before its first beta.
