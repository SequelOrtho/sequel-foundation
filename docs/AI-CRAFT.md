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
- **Rate limits are per-user/per-org and enforced at the app layer** (the layer that knows identity). An unmetered AI route is an open invoice.

### 2.3 Retrieval & permissions ("the ACL librarian") — filter at the query, not after

The single most dangerous exposure in enterprise AI: semantic search over a flat index turns into automated data exfiltration. Cosine similarity does not know about org charts.

- **The identity rule**: if the requesting user cannot read a source document, retrieval must be *blind* to its chunks. Same query, different users ⇒ different results.
- **Enforce in the database query layer** — RLS policies or server-assembled `WHERE` predicates derived from the authenticated session — **never** by post-filtering retrieved chunks in application code, and never by hoping the model "won't mention it". §6 maps this to each engine.
- **Every stored chunk carries permission metadata** (owner, role scope, project boundary) written at index time; the retrieval query filters on it. A vector/semantic index without permission metadata is not shippable.
- The layout-fail-soft rule (DESIGN-CONVENTIONS §4) applies: a retrieval outage degrades the AI answer, never the page.

### 2.4 Model routing & unit economics ("the traffic router")

Routing every interaction to a frontier reasoning model destroys margins; most queries don't need one.

- **Model selection is configuration** (code: `llm/models.ts`): call sites declare a task class, env vars retarget a workload to a lighter model without a call-site rewrite. Add task classes as real routing needs appear — don't hardcode a second model id somewhere.
- **Cache the static frame**: the large framework prompt is the cache target (`cache_control: ephemeral`); per-request data goes in the user message. Never interpolate timestamps/UUIDs into cached blocks.
- **Never resend unbounded history.** Chat-style features cap and compact context; the input gate's size cap is the floor, deliberate history pruning is the feature's job. By turn 10 an uncompacted history is 8–15k tokens per turn — an order-of-magnitude cost and latency multiplier.
- **A hard timeout budget is configuration** (code: `llm/client.ts` `LLM_TIMEOUT_MS`, default 120s): when the budget fires, the typed 504 surfaces and the route degrades to its deterministic path (keyword search, cached answer, human hand-off) — never an indefinite spinner.
- **Know your cost per resolved task** before beta, not from the first invoice (§4, Gate 4).

### 2.5 Output contract ("the quality inspector") — validate before display

Traditional code throws; foundation models fail silently by generating fluent untruths and almost-JSON.

- **Never `JSON.parse` model text directly** (code: `llm/output.ts` `parseLlmJson` + a caller-owned type guard): preamble, code fences, truncation, and shape drift all become one typed `LlmOutputError` → the deterministic fallback message ("The AI response did not match the expected format. Try again."), never a blank panel.
- **Groundedness is a prompt contract + a validation habit**: generation prompts require every factual claim to come from the supplied context, and the safe answer for a claim that can't be grounded is "Verified information isn't available for this" — an honest miss beats a fluent fabrication, always.
- **Fallbacks are deterministic and named** (code: `llm/http.ts`): every model-side failure maps to a typed `{status, error}` whose message names the cause and the fix (§7 writing rule). Unknown errors are logged, not leaked.

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
- **Gate 2 — Quality.** *How do we know today's prompt edit or model bump didn't break 25 other cases?* Pass: a golden set of 50–100 realistic queries with expected properties, executed automatically (CI or a pre-release script) before prompt/model changes deploy. "We tried a few prompts" is the vibes void.
- **Gate 3 — Failure.** *What exact UI renders during a 10-second provider outage or rate limit?* Pass: a deterministic fallback path — typed error message, classic search/manual path, or human hand-off. Verify by pointing the feature at a black-holed endpoint, not by reading the code.
- **Gate 4 — Unit economics.** *At 10,000 DAU, what does a resolved task cost?* Pass: token economics computed, caching + context discipline in place, and a daily spend alarm exists (provider budget alert or platform cost alert — any deterministic tripwire counts).
- **Gate 5 — Observability.** *A user reports a wrong answer — can engineering replay that session?* Pass: each request logs a correlatable record: sanitized input, retrieved context refs, model + parameters, served-model line (`withModelFallback` already emits it), latency, and token counts. The store can be anything queryable; the requirement is the record, not the vendor.

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
| Observability store (Gate 5) | Postgres table is fine | SQL table is fine | Requirement is a queryable, correlatable record — not a specific vendor |

## 7. Rollout notes

- Foundation ships the domain-free enforcement (`llm/`); each app owns identity, rate limits, retrieval predicates, golden sets, and its deterministic fallbacks — those need the app's domain.
- The fleet audit against §4 runs per-hub with the `/ai-production-audit` skill (`.claude/skills/ai-production-audit/`); copy the skill into `sequel-app-template` in the next fleet sweep so new apps carry it from day one.
