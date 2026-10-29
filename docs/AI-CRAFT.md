# Sequel AI Craft

Production rules for AI-backed features — what sits between a working prompt and something 10,000 users can trust. Distilled from *"From AI Demo to AI Product"* (Towards AI, AI Product Engineering for PMs #01, 2026) and the hubs' own rollouts. Read this **before** shipping any feature that calls a model; the code that embodies the rules lives in `llm/`.

**Infrastructure-agnostic by design.** Every rule below is stated as a boundary the *system* must enforce, not as a product of any one stack. The fleet spans hosting platforms (Netlify today, Azure tomorrow) and databases (Neon/Postgres, Azure SQL / MS SQL); §6 gives the deterministic mapping from each rule to each stack. If a rule only works on one stack, it doesn't belong here.

## 1. The demo trap — a prototype is a Living PRD, not v1

- **The high-fidelity trap**: an agentically-generated prototype is visually indistinguishable from enterprise software, so stakeholders read "95% done" when only the presentation layer exists. The polish is the visible 20%; security, reliability, and unit economics are the invisible 80%.
- **A demo is an engine on a bench; the product is the car built around it** — steering, brakes, seatbelts, fuel gauge. Never promote prototype code paths to customer-facing environments directly.
- **Use the prototype as the Living PRD**: validate demand, interaction ergonomics, prompt tone, and workflow feasibility with it — then hand the *validated interaction model* to real engineering with the five boundaries below as explicit requirements.
- **A working demo proves the model can respond. Production engineering proves the system can be trusted.** The moat is the deterministic engineering around the model, not the UI — anyone can vibe-code a frontend before lunch.

## 2. The five boundaries

Every AI feature passes user input through deterministic layers before and after the model. Each has a foundation module; none may be skipped.

### 2.1 Experience layer — latency is a design material

AI pipelines take 2–6s where classic APIs take 50–100ms. A static spinner past ~4s reads as frozen; users re-submit and spawn duplicate concurrent model calls.

- **Stream from t=0** (code: `llm/stream.ts` `streamJob`) — heartbeats keep time-to-first-byte ~0 and survive serverless sync-timeouts on any platform.
- **Narrate stages, don't just spin** (code: `streamJob`'s `progress()` → `consumeLlmStream`'s `onStatus`): "Querying policy documentation…" → "Analyzing…" → "Formatting…". This is §3 of DESIGN-CONVENTIONS (every pending state gets feedback) applied to model calls.
- **Offer an exit**: a Stop/Cancel control on long generations, and disable re-submit while a request is in flight — duplicate concurrent calls are a UX bug *and* a spend bug.
- Jobs that outrun the platform's streamed cap move to background + **202 + poll** (same rule as DECK-CRAFT §5).

### 2.2 Input gate ("the security bouncer") — deterministic validation before the model

A prototype assumes benevolent intent; production receives 40-page pastes, credential spills, and injection probes.

- **Gate every user input in plain code before it reaches an endpoint** (code: `llm/input-gate.ts` `gateLlmInput`): reject empty/oversized input with an actionable message, normalize control characters, and redact high-confidence secrets/PII (Luhn-verified card numbers, dashed SSNs, API-key shapes, JWTs). Tell the user what was redacted (§3 feedback rule) — never edit input silently.
- **Keys live server-side only.** `getClient` reads `ANTHROPIC_API_KEY` from server env; nothing model-related ships in a client bundle.
- **User text goes in user messages, never interpolated into the system prompt.** The cache-stable-system-prompt rule (DESIGN-CONVENTIONS §4) is also the injection-resistance rule: the deterministic frame and the untrusted content stay in separate channels.
- **Every AI route is metered, at the app layer, identity-aware** (code: `llm/rate-limit.ts`). An unmetered AI route is an open invoice; a public one is an open invoice anyone can sign. The convention: two fixed-window budgets per route — per identity (user id/email on authed routes, client IP via `clientIpFrom` on public ones) and a global ceiling that bounds spend against distributed scripts — checked with `checkRateBudget` before the model call, answering 429 + `Retry-After` when exceeded. Identity keys are HMAC hashes (`identityRateKey`), so no raw user id or IP ever reaches the rate table — compatible with the fleet's strictest anonymity posture. The store is a one-method seam (`FixedWindowStore.bump`) each app implements on its stack (§6); optional-assist routes **fail closed** on store errors — declining the model call is safe when a deterministic path exists, and failing open would let induced store errors bypass the ceiling. Reference store: `incident-event-hub` `lib/ai-rate-limit-store.ts` (Prisma; the atomic conditional-increment + window-reset upsert pattern) — the MS SQL equivalent is the same two statements over one table.

### 2.3 Retrieval & permissions ("the ACL librarian") — filter at the query, not after

The single most dangerous exposure in enterprise AI: semantic search over a flat index turns into automated data exfiltration. Cosine similarity does not know about org charts.

- **The identity rule**: if the requesting user cannot read a source document, retrieval must be *blind* to its chunks. Same query, different users ⇒ different results.
- **Enforce in the database query layer** — RLS policies or server-assembled `WHERE` predicates derived from the authenticated session — **never** by post-filtering retrieved chunks in application code, and never by hoping the model "won't mention it". §6 maps this to each engine.
- **Every stored chunk carries permission metadata** (owner, role scope, project boundary) written at index time; the retrieval query filters on it. A vector/semantic index without permission metadata is not shippable.
- The layout-fail-soft rule (DESIGN-CONVENTIONS §4) applies: a retrieval outage degrades the AI answer, never the page.

### 2.4 Model routing & unit economics ("the traffic router")

Routing every interaction to a frontier reasoning model destroys margins; most queries don't need one.

- **Model selection is configuration** (code: `llm/models.ts`): call sites declare a task class, env vars retarget a workload to a lighter model without a call-site rewrite. Add task classes as real routing needs appear — don't hardcode a second model id somewhere.
- **Every call is locked to the approved models** (code: `llm/approved-models.ts` `APPROVED_MODELS`, enforced in `llm/models.ts` `withModelFallback`; `testing/model-lock.mjs`; v0.34.0; owner ruling 2026-10-29, Mike: "we need to lock all now"). Only models eligible for zero data retention may ever be called — `claude-opus-5` and `claude-opus-4-8` today; never Fable 5, which needs 30-day retention. The list is code, never configuration: `LLM_MODEL_PROSE` / `LLM_MODEL_PRESENTATION` / `LLM_MODEL_FALLBACK` choose *between* approved models and can never add one. `withModelFallback` refuses an unapproved primary before `call` runs — one log line naming only the model id (`modelLockLogLine`), then `ModelNotApprovedError`, which `llmErrorEvent` turns into `{ status: 503, error: MODEL_NOT_APPROVED_MESSAGE }` ("This AI feature is switched off on this site: its AI model isn't one approved for patient data. Contact the System Administrator."), shown word for word; an unapproved fallback is never tried, so an unavailable primary's own error stands. A route that wants to refuse before it reads anything calls `modelLockIssue(taskClass)`. Because the lock lives in that one funnel, **every Anthropic SDK request goes through it**: `withModelFallback(modelFor(task), (model) => client.messages.create({ model, … }))`, with the callback's own `model` — never a literal, never another variable. Each hub's unit suite runs `findUnlockedModelCalls(collectSourceFiles(root, dirs))` from `@sequel/foundation/testing/model-lock`, which fails on an SDK call outside the funnel or one whose `model` didn't come from it, or could be replaced after it (a later spread, a second `model` key, a reassignment); it scans `.mts` Netlify functions too, and a hub's own wrapper around the funnel (`tracedModelCall`) is declared in `lockWrappers`, which the scan accepts only when the wrapper's definition hands its callback to `withModelFallback(primary, call)` (reviewed exceptions in its `allow` map with a reason); it reads source text, so a raw `fetch` to the API or bracket access (`client["messages"]`) is beyond it and stays a review item; the foundation runs it on itself. Adding a model to the list is a foundation release and an owner decision, never a hub change.
- **Cache the static frame**: the large framework prompt is the cache target (`cache_control: ephemeral`); per-request data goes in the user message. Never interpolate timestamps/UUIDs into cached blocks.
- **Never resend unbounded history.** Chat-style features cap and compact context; the input gate's size cap is the floor, deliberate history pruning is the feature's job. By turn 10 an uncompacted history is 8–15k tokens per turn — an order-of-magnitude cost and latency multiplier.
- **A hard timeout budget is configuration** (code: `llm/client.ts` `LLM_TIMEOUT_MS`, default 120s): when the budget fires, the typed 504 surfaces and the route degrades to its deterministic path (keyword search, cached answer, human hand-off) — never an indefinite spinner.
- **Know your cost per resolved task** before beta, not from the first invoice (§4, Gate 4).
- **Spend alarms are a five-minute console task — do them at rollout, not after the first surprise invoice.** (1) Anthropic Console → the workspace's *Limits*: set a monthly spend cap and a notification threshold below it (per workspace, so one hub's runaway can't drain the org). (2) The deploy platform's usage alert (Netlify: Account → Billing → usage notifications; Azure: a Cost Management budget + alert on the resource group). (3) With v0.10 traces in place, a scheduled query over the trace table (`SUM(inputTokens), SUM(outputTokens) per feature per day`) is the per-feature early-warning line the consoles can't give you.

### 2.5 Output contract ("the quality inspector") — validate before display

Traditional code throws; foundation models fail silently by generating fluent untruths and almost-JSON.

- **Never `JSON.parse` model text directly** (code: `llm/output.ts` `parseLlmJson` + a caller-owned type guard): preamble, code fences, truncation, and shape drift all become one typed `LlmOutputError` → the deterministic fallback message ("The AI response did not match the expected format. Try again."), never a blank panel.
- **Groundedness is a prompt contract + a validation habit**: generation prompts require every factual claim to come from the supplied context, and the safe answer for a claim that can't be grounded is "Verified information isn't available for this" — an honest miss beats a fluent fabrication, always.
- **Fallbacks are deterministic and named** (code: `llm/http.ts`): every model-side failure maps to a typed `{status, error}` whose message names the cause and the fix (§7 writing rule). Unknown errors are logged, not leaked.

### 2.6 Ask the Hub — the family's read-only assistant (code: `assistant/`, v0.33.0; approved models v0.34.0)

A header button and side panel where a signed-in person asks a question in plain words; Claude looks things up with read-only tools and answers with links into the hub. Built first in the Project Hub, cut down in the Missed Punch Hub (owner ruling 2026-10-28, Mike: "You can add Missed Punch Hub"), shared here when the Scheduler Hub joined. The foundation holds the hub-free parts — the conversation types and parser (`assistant`), the step loop, request reader and rate budget (`assistant/server`), and the panel (`assistant/panel`); each hub keeps its own tools, prompt, role rules and help text. The family rules, each a test in every hub that ships it:

- **Read-only.** No tool writes; the assistant path writes nothing but its own rate record. A hub test fails on any store or database write reachable from its tools or step route.
- **Tools read through the page's own rule.** Each tool stands in for one page and calls that page's own loader and access check, so the assistant can never be wider than the page. A tool the role isn't offered is refused even when a forged conversation asks for it (the foundation step loop refuses a name outside the step's tools before the runner sees it, and the runner checks again), and a record the person may not open reads exactly like a missing one.
- **Lists carry no more than the page shows**, and no free text beyond what one record's own page shows: lists answer with dates, status, figures the list page shows and links; a reason, note or narrative a person typed reaches the model only for the one record the person names (by link or id), as its page shows it. The prompt treats that text as information, never as instructions.
- **Nothing is stored server-side.** The browser holds the conversation for the tab under the remembered-view prefix (`sf.view.assistant.<role>`), so Sign Out, the signed-out screen and a role switch clear it; the server re-parses it on every step (`parseConversation`) and keeps none of it. Logs carry the step number, tool names and stop reason only — never the question, the answer or tool data (`stepLogLine`; traces carry no input).
- **An off switch.** `assistantEnabled()`: on only when `ANTHROPIC_API_KEY` is set and `ASSISTANT_ENABLED` is unset, empty, true, 1, on or yes; off, the button is hidden and the route answers 404 under the same rule, so the button never shows and then fails.
- **A rate budget.** `checkAssistantBudget` over the hub's `FixedWindowStore` (`AI_RATE_ASSISTANT_PER_IDENTITY` 120, `AI_RATE_ASSISTANT_GLOBAL` 1200 per `AI_RATE_WINDOW_MS`), keyed by a salted hash of the sign-in, failing closed — 429 beyond.
- **Bounded steps.** One model call per step, at most `MAX_STEPS` (8) per question with `tool_choice: none` on the last, at most `MAX_TOOL_CALLS` per turn, each step — its tool reads and the model call together — inside `STEP_BUDGET_MS` (45 s) with no retry: a tool starts only while `toolTimeLeft` leaves at least `MIN_CALL_MS` for it after reserving the model call's own `MIN_CALL_MS`, is cut off (its `signal` aborted) when that runs out, and a tool not started or cut off reads as a failed lookup; a tool's result is held to `MAX_TOOL_RESULT_CHARS` (`capToolResult`; a non-string result reads as a failed lookup), and every `tool_result` the browser posts back must answer exactly the calls of the turn before it. A hub passes `req.signal` as the step's `signal`, so a closed panel stops its tools and model call, and passes its own client seam as `client` (the loop's default `getClient()` is imported by relative path, so a test's `vi.mock("@sequel/foundation/llm")` never reaches it); `memoryRateStoreForDevOnly()` is a counter store for local development and tests only, never production; every question passes `gateLlmInput` (§2.2) and the panel says what was removed.
- **Ask the Hub runs only on an approved model (rule 5, v0.34.0).** Every hub is held to the family lock (§2.4 "Every call is locked to the approved models"; owner ruling 2026-10-29, Mike: "we need to lock all now", widening the patient-data rule Mike approved in plan-2026-10-28 §5 Q4 to every call). The step checks the configured model (`modelFor(taskClass)`) before it runs any tool: when it isn't approved the step runs no tool and makes no model call, logs one line naming the model id only (`modelNotApprovedLogLine`), and throws `AssistantModelNotApprovedError` (a `ModelNotApprovedError`), which `streamJob` sends as `{ status: 503, error: ASSISTANT_MODEL_NOT_APPROVED_MESSAGE }` ("Ask the Hub is switched off on this site: its AI model isn't one approved for patient data. Contact the System Administrator.") and the panel shows as written (`stepErrorMessage`; any other 503 stays generic). `allowedModels` stays as an optional, *narrower* list on top of the lock — `runAssistantStep({ …, allowedModels: ["claude-opus-5"] })` — kept in the hub's code, never an environment variable; omitted, the family list alone applies. The fallback is tried only when it passes both lists. A route that wants to answer before reading the request calls `assistantModelIssue(allowed, taskClass)`, which checks both lists → the same `{ status, error }` or null. The step trace never carries the question (`inputPreview` / `inputChars` null), a test in the foundation.
- **Withheld on purpose is said in words** (code: `assistant/withheld.ts`; v0.34.0; owner ruling 2026-10-29, Mike: "let's make sure when results are purposely being redacted based on rules that that is made clear to the user so it isn't reported as a 'bug'"). When a tool leaves fields out by rule (a reason, a note, free text), it says so in its result: spread `withheld(["the time-off reason"], "Open the request on Approvals to read it.")` → `{ withheld: "Left out on purpose by this hub's privacy rules: the time-off reason. Open the request on Approvals to read it." }` — the person's words for the fields, never column names; with no second argument it says "Open the linked page to see them." `runAssistantStep` appends one fixed block, `ASSISTANT_PRIVACY_PROMPT`, after the hub's prompt in every step, inside the cached prefix (it carries the `cache_control` marker, so the hub prompt and it cache together; the per-request context stays after it, uncached): the model says plainly what was left out, that it was on purpose, and how to see it, never calls it an error, a bug or missing data, never suggests reporting it and never guesses at it. A hub whose tools withhold anything also passes `privacyNote` to `AskHubPanel` — `true` for the family sentence (`DEFAULT_PRIVACY_NOTE`, "Ask the Hub leaves out some details on purpose to protect privacy. Open a record to see everything you have access to.") or its own — shown as a muted line under the question box and linked to it with `aria-describedby`; it is opt-in, so a hub that withholds nothing shows no line.
- **Links only for Hub paths a tool returned** (`renderAnswer`): a model-written link to anywhere else shows as its text. Answers render light markdown only — never HTML or an image.

Route order in a hub: 404 off → 401 signed out → `readStepRequest` (413 / 422) → 429 budget → `streamJob(() => runAssistantStep(…))` (a hub may answer `assistantModelIssue(…)` first, and may pass a narrower `allowedModels`).

## 3. The six debts — what generated code omits

The audit list for any prototype (or any existing feature) headed to customers. Each debt, its production symptom, and the foundation defense:

| # | Architectural debt | Production symptom | Defense |
|---|---|---|---|
| 1 | Brittle schema parsing | UI crashes / blank panels on almost-JSON | `parseLlmJson` + guard (`llm/output.ts`) |
| 2 | Unpruned token bleed | Latency climbs, invoice ×10 by turn 10 | Input cap + history compaction + prompt caching (§2.4) |
| 3 | Flat vector/semantic search | Data exfiltration via retrieval | Query-layer ACL filtering (§2.3, §6) |
| 4 | The "vibes" eval void | Silent regressions on prompt/model changes | Golden set in CI (§4, Gate 2) |
| 5 | Missing timeouts/resilience | Perpetual spinner on provider brownout | `LLM_TIMEOUT_MS` + typed 504 + deterministic fallback |
| 6 | Exposed keys / injection paths | Leaked prompts, keys, PII | Server-side keys, input gate, channel separation (§2.2) |

## 4. The 5-gate production audit

Run before any AI feature reaches beta, and fleet-wide when conventions change (the `/ai-production-audit` skill walks an agent through this scorecard). Score each gate pass/fail; a failing gate blocks rollout, not the retro.

- **Gate 1 — Identity.** *If an entry-level employee and a director submit the identical query, do they get permission-filtered results?* Pass: ACL metadata filtering happens at the retrieval query (§2.3), before prompt assembly. Features with no retrieval pass by construction — record that, don't skip the gate.
- **Gate 2 — Quality.** *How do we know today's prompt edit or model bump didn't break 25 other cases?* Pass: a golden set of 50–100 realistic queries with expected properties, executed automatically (CI or a pre-release script) before prompt/model changes deploy. "We tried a few prompts" is the vibes void. The runner is foundation code (`llm/golden.ts`: `runGoldenSet` + check builders + `assertGoldenPass`); an app writes only its typed cases and points the runner at the same lib function production calls. Assert *properties* (the classification, the harm level, a rationale mentioning the mechanism), never exact wording — generation is probabilistic. Golden runs make real model calls, so they're a deliberate pre-ship step (`npm run golden`), not an every-commit job, until a team decides otherwise.
- **Gate 3 — Failure.** *What exact UI renders during a 10-second provider outage or rate limit?* Pass: a deterministic fallback path — typed error message, classic search/manual path, or human hand-off. Verify by pointing the feature at a black-holed endpoint, not by reading the code.
- **Gate 4 — Unit economics.** *At 10,000 DAU, what does a resolved task cost?* Pass: token economics computed, caching + context discipline in place, and a daily spend alarm exists (provider budget alert or platform cost alert — any deterministic tripwire counts).
- **Gate 5 — Observability.** *A user reports a wrong answer — can engineering replay that session?* Pass: each request logs a correlatable record: sanitized input, retrieved context refs, model + parameters, served-model line (`withModelFallback` already emits it), latency, and token counts. The store can be anything queryable; the requirement is the record, not the vendor. The record builder is foundation code (`llm/trace.ts`: `startLlmTrace` → `succeed`/`fail` → `emitLlmTrace(sink, record)`): input previews are secret-redacted and truncated before any sink sees them, errors are recorded by class never message, and a broken sink can never break the feature. Apps supply the sink on their stack (§6); `consoleTraceSink` is the zero-infrastructure floor. Redaction is not de-identification — a PHI-bearing app decides at the sink whether to keep the preview or only `inputChars`.

## 5. Metrics that matter

Instrument outcomes, not vanity counts ("total prompts submitted" measures nothing). The dashboard five, with starting targets:

1. **Task completion rate** (>85%) — workflows reaching verified resolution without abandonment or rephrase-loops.
2. **Groundedness** (>95%) — generated claims supported by retrieved, authorized context.
3. **Policy & injection block rate** — inputs the gate intercepted; a spike means an attack or a confused workflow, both worth a look.
4. **TTFT / p95 total latency** (<1.2s first token; streamed heartbeat counts for perceived liveness).
5. **Cost per resolved task** (<$0.02 as the reference point) — spend ÷ successful outcomes, not spend ÷ calls.

## 6. Infrastructure mapping — same rule, deterministic per stack

The rules above are stack-free; this table is where stack specifics are allowed to live. When a hub migrates (AWS/Netlify → Azure, Neon → MS SQL), the left column is unchanged and only the right cells are re-verified.

| Boundary rule | Postgres / Neon | Azure SQL / MS SQL | Any other |
|---|---|---|---|
| Query-layer ACL filtering (§2.3) | RLS policies (`CREATE POLICY`) keyed to session identity, or server-assembled `WHERE` from the authenticated session | Row-Level Security (`CREATE SECURITY POLICY` + filter predicate), or the same server-assembled `WHERE` rule | The invariant: the *database query* carries the caller's scope; app code never post-filters |
| Vector/semantic search with permissions | pgvector + metadata columns in the same filtered query | Azure AI Search with security filters / SQL vector search + the same predicate rule | Permission metadata filters **inside** the search query |
| Streaming past platform timeouts (§2.1) | — | — | `streamJob` heartbeats are platform-free; the *numbers* (sync cap, streamed cap) are per-platform config to measure, never assume (Netlify ≈10s sync / ≈60s streamed; Azure Functions/App Service differ by plan) |
| Timeout + spend budgets (§2.4, Gate 4) | — | — | `LLM_TIMEOUT_MS` env per deploy; daily spend alarm in whichever billing console the deploy uses |
| Rate-limit store (§2.2) | One counter table + `FixedWindowStore` impl — conditional-increment `updateMany` + window-reset upsert (reference: incident-event-hub `lib/ai-rate-limit-store.ts`) | Same interface: one table, `UPDATE … WHERE key AND windowStart > cutoff` then upsert (`MERGE`) on miss | `llm/rate-limit.ts` core is the contract; keys are HMAC hashes on every stack |
| Observability store (Gate 5) | Postgres table fed by an `LlmTraceSink` | SQL table fed by the same sink interface | `llm/trace.ts` builds the record; the sink owns persistence + PHI retention. Requirement is a queryable, correlatable record — not a specific vendor |

## 7. Rollout notes

- Foundation ships the domain-free enforcement (`llm/`), including the rate-limit core, the trace-record builder, and the golden-set runner (v0.10); each app owns what needs its domain — identity, the `FixedWindowStore`/`LlmTraceSink` implementations on its database, retrieval predicates, golden cases, and its deterministic fallbacks.
- The fleet audit against §4 runs per-hub with the `/ai-production-audit` skill (`.claude/skills/ai-production-audit/`); copy the skill into `sequel-app-template` in the next fleet sweep so new apps carry it from day one.
