---
name: ai-production-audit
description: Audit a Sequel app's AI-backed features against the 5-gate demo-to-production scorecard in docs/AI-CRAFT.md. Use when asked to audit, harden, or production-review AI features in this repo or any hub, or before an AI feature ships to beta. Infrastructure-aware — detects the app's database and hosting stack and applies the matching pass rules.
---

# AI Production Audit

Audit every AI-backed feature in the target app against the 5-gate scorecard (docs/AI-CRAFT.md §4 in `sequel-foundation` — read it first if not already loaded; when auditing a hub, read it from the pinned `node_modules/@sequel/foundation/docs/AI-CRAFT.md` or the foundation repo).

## Step 0 — Detect the stack (determines which pass rules apply)

Do not assume the infrastructure; detect it and record it in the report header:

- **Database**: check `package.json` dependencies — `@neondatabase/serverless`, `pg`, `postgres`, `drizzle-orm/neon*` ⇒ Postgres/Neon rules; `mssql`, `tedious` ⇒ Azure SQL / MS SQL rules. Also grep for connection strings' scheme in env examples (`postgres://` vs `sqlserver://`/`mssql://`).
- **Hosting**: `netlify.toml` ⇒ Netlify (≈10s sync / ≈60s streamed caps); `host.json` or `staticwebapp.config.json` or Azure pipelines ⇒ Azure (caps depend on plan — look them up, don't assume); `vercel.json` ⇒ Vercel.
- **Semantic search**: grep for `pgvector`, `embedding`, Azure AI Search clients, Pinecone/Supabase clients.

Every finding must state its pass rule in the detected stack's terms (AI-CRAFT §6). A rule that can't be evaluated because the stack is ambiguous is a finding in itself.

## Step 1 — Inventory the AI surfaces

Grep for `@sequel/foundation/llm` imports, `getClient`, `streamJob`, `consumeLlmStream`, `ANTHROPIC_API_KEY`, and any direct `@anthropic-ai/sdk` usage that bypasses the foundation seam (a bypass is an automatic finding). List every route/action that reaches a model, plus any retrieval/vector index behind them.

## Step 2 — Score the five gates per surface

For each AI surface, score pass/fail with file:line evidence:

1. **Identity** — retrieval filters by the caller's permissions *in the query* (RLS or server-assembled WHERE; never post-filtering in app code). No retrieval ⇒ "pass by construction", recorded.
2. **Quality** — a golden set (50–100 realistic queries) runs automatically before prompt/model changes deploy. Check for eval scripts/CI steps; absence is a fail even if outputs "look good".
3. **Failure** — every model call path has: `withModelFallback`, the typed error mapping (`llmErrorEvent`), a timeout budget in effect (`LLM_TIMEOUT_MS` honored, not overridden to ∞), and a rendered fallback UI state. Read the component that renders the error, not just the route.
4. **Unit economics** — input gated (`gateLlmInput` or equivalent cap), no unbounded history resends, cache-stable system prompts (no interpolated timestamps/UUIDs/user text in cached blocks), a daily spend alarm documented.
5. **Observability** — per-request correlatable record (sanitized input, context refs, model, latency, tokens); the `[llm] served by` line reaches production logs.

Also sweep the six debts table (AI-CRAFT §3) — especially direct `JSON.parse` on model text (must be `parseLlmJson` + guard) and any client-side model key.

## Step 3 — Report

Produce a scorecard: header (app, detected stack, foundation pin version), then a gate × surface matrix (✅ / ❌ / n/a-by-construction), then findings ranked by severity (identity/security first, economics last), each with evidence and the concrete remediation — naming the foundation module that fixes it and whether a foundation version bump is needed first. Rate failures 0–4 (frequency × impact × persistence, same scale as DESIGN-CONVENTIONS §5a); fix 3s and 4s before the feature ships or the audit closes.

Do not auto-fix while auditing: the deliverable is the scorecard; fixes are follow-up work the owner sequences (identity-gate failures are the exception — flag those immediately and loudly).
