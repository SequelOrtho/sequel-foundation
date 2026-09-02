# Sequel Hub Fleet — Resource Audit for the Azure Move

**Date:** 2 September 2026 · **Scope:** Project Hub, Incident & Event Hub, Scheduler Hub, Acquisition Hub, Audit Hub (plus the two non-runtime repos, `sequel-foundation` and `sequel-app-template`). **Out of scope by request:** Document Hub, Legal-UI, Workers-Comp portal, event-reporter.

## How to read this

Every figure here was derived from the code, schemas, seeds, deploy configuration and platform documentation — **not from live telemetry**, because no session in this audit holds Netlify, Neon or Anthropic console credentials. Each number carries one of three confidence tags:

| Tag | Meaning |
|---|---|
| **Measured** | Read directly from code, config, a real build, or a documented prod count. |
| **Derived** | Computed from measured inputs (rows × bytes/row, page loads × payload). |
| **Assumed** | A stated planning assumption (user counts, session shape). Change the assumption and the derived figure moves proportionally. |

Section 7 lists the five console checks that replace the estimates with measurements in under an hour.

## The five answers at a glance

| # | Question | Answer |
|---|---|---|
| 1 | Web apps and their CPU/memory | **5 deployed apps**, all Next.js 16 on Netlify. Each runs as one serverless function at **1,024 MB RAM / ≈0.6 vCPU-equivalent**, scale-to-zero, no reserved instances. Three apps also run a background or scheduled function. |
| 2 | Databases and size | **4 Neon Postgres databases + 1 document store** (Netlify Blobs; Azure SQL adapter written, not provisioned). Fleet total **≈0.1 GB today, ≈0.4–0.6 GB at 12 months**, plus ≈0.5 GB of file attachments at 12 months. No single database exceeds 0.25 GB in a year. |
| 3 | Database server size | Neon serverless per hub: **1 Compute Unit = 1 vCPU + 4 GB RAM**, autoscaling from **0.25 CU (0.25 vCPU / 1 GB)**, capped at 2 CU on the Free plan and up to 16 CU on paid plans, suspends after 5 idle minutes. At this fleet's load the computes sit at the 0.25 CU floor almost all the time. |
| 4 | App ↔ database volume at peak | **≈0.2–0.35 GB per peak hour fleet-wide today** (≈15–25 GB/month); **≈0.6–0.9 GB/hr at 12-month adoption**, up to ≈2 GB/hr if two unbounded read paths are left as-is. Under 2 queries/second fleet-wide. |
| 5 | App ↔ user volume at peak | **≈0.3–0.45 GB per peak hour fleet-wide** (≈1–1.2 GB/day, ≈25–35 GB/month). Per-page payloads are 50–300 KB; the biggest single transfers are 1–4 MB PowerPoint exports and hourly calendar-feed polling. |

**Bottom line for Azure sizing:** this is a low-concurrency, small-data fleet. The binding constraints are **memory for in-process Office-file generation and ingest (≥1 GB, 2 GB comfortable)**, **request timeouts for 60–120 s AI calls**, **a job runner for three long-running lanes**, and **connection pooling** — not CPU, storage or bandwidth.

---

## 1. Web applications

### 1.1 Inventory

| App | Repo | Production host | Pages / API routes | Users (Assumed) | Peak concurrent (Assumed) |
|---|---|---|---|---|---|
| Project Hub | `project-insights` | `sequelorthoprojects.com` (origin `project-insights-seq.netlify.app`, Cloudflare-fronted) | 75 / 121 | ~40–60 active (PMs, EPMO, leadership); 165 Person rows, 41 authoritative members (Measured, Jul 2026) | 10–15 (2–3× in the monthly status week) |
| Incident & Event Hub | `incident-event-hub` | `sequelincidenthub.com` | 26 / 79 | 10–25 named staff across 13 roles; all employees as anonymous reporters | 5–15 |
| Scheduler Hub | `scheduler-hub` | `sequelscheduler.com` | 21 / 18 | ~10 coordinators/admins; 100 providers (42 physicians, 58 APPs) as light users and ICS calendar subscribers | 5–15 |
| Acquisition Hub | `Sequel_Ortho` | `sequel-ortho-playbook.netlify.app` (no custom domain found in code) | 16 / 15 | Deal team, IMO leads, steering committee: 3–10 | 3–5 |
| Audit Hub | `sequel-audit-hub` | `sequelaudit.com` (Cloudflare IP allow-list; origin `sequel-audit-hub.netlify.app`) | 12 / 13 | ~30 therapy staff + 3–5 leadership uploaders | 5–10 |
| — | `sequel-foundation` | not deployed (shared library, git dependency `v0.10.0`) | — | — | — |
| — | `sequel-app-template` | not deployed (starter template) | — | — | — |

All five apps share the same stack: Next.js 16.2 App Router, React 19, `@sequel/foundation` v0.10.0, Auth.js v5 with Microsoft Entra ID (JWT sessions, no session table). Four use Prisma 7 over Postgres; the Acquisition Hub uses a `PlaybookStore` interface with memory / Netlify Blobs / Azure SQL (`mssql`) adapters.

### 1.2 Compute today (Netlify)

| Component | Allocation (Measured, Netlify docs) | Notes |
|---|---|---|
| Server function (SSR + API routes), one per app | **1,024 MB RAM default** (configurable to 4,096 MB on Pro/Enterprise); CPU is proportional to memory on the underlying AWS Lambda — ≈**0.6 vCPU-equivalent** at 1,024 MB | Synchronous limit 60 s; buffered response 6 MB, streamed 20 MB. No app sets a memory override. |
| Edge function (middleware `proxy.ts`), one per app | Netlify edge runtime | Auth gate + role cookie only. |
| Background functions | 1,024 MB, **15-minute** cap, 256 KB payload | Project Hub `ai-job-background` (AI jobs); Acquisition Hub `augment-background` (full-playbook narrative). |
| Scheduled function | 30 s cap | Scheduler Hub `nightly-horizon` (03:00 Central) — only POSTs to an app route that declares `maxDuration = 300`. |
| GitHub Actions crons | n/a | Project Hub: daily alerts run (13:00 UTC), weekly AI-job prune (Sun 06:00 UTC) — both hit the app or the DB directly from GitHub runners. |

Calibration build (Incident & Event Hub, this session, Measured): client JavaScript **389 KB gzipped across all chunks** (typical page 120–260 KB), server build output **45 MB**, dependency tree **1.2 GB** (Prisma 172 MB, Next 173 MB, ExcelJS 23 MB, recharts 10 MB, docx 7 MB).

### 1.3 Memory- and time-heavy work per app

| App | Heaviest in-process work | Long-running paths |
|---|---|---|
| Project Hub | PowerPoint decks from a 4.9 MB brand template (0.5–1.5 MB output; est. 200–400 MB peak RSS); ExcelJS workbook imports/exports; docx guides | 10 AI routes at `maxDuration = 120`; Opus-class calls 20–60 s; background AI job lane up to 15 min |
| Incident & Event Hub | ExcelJS register export up to 5,000 rows (est. 50–150 MB RSS); 4 MiB uploads buffered in memory | LLM assists 5–60 s **synchronously** (no background lane) |
| Scheduler Hub | Dashboard loads ~8,000 nested rows (est. 50–100 MB heap); ExcelJS weekly export | Nightly horizon regeneration: ~500 statements in one interactive transaction, est. 10–20 s at 100 providers |
| Acquisition Hub | PowerPoint from a **10.9 MB** template + 1.9 MB pitch library (1–4 MB output); streamed responses observed failing at 2.3–4.5 MB on Netlify | Full-playbook augment 60–120 s+, background up to 15 min; browser polls every 3 s |
| Audit Hub | ExcelJS ingest parses whole workbook in memory (est. 5–10× file size → 300–600 MB for a 6 MB upload); charge exports 5–15 MB at 12 months | Ingest commit: 15k-row `deleteMany + createMany` inside one interactive transaction |

### 1.4 Suggested Azure equivalents (recommendation, not a measurement)

- **Web tier:** one App Service Linux plan **P1v3 (2 vCPU / 8 GB)** hosting all five apps as separate web apps, or **P0v3 (1 vCPU / 4 GB) per app** if isolation matters. Aggregate load is under 1 request/second; memory headroom for Office-file generation is the reason for the size, not CPU. Keep one always-on instance per app — every page is `force-dynamic`, so cold starts (1–3 s with Prisma + Office libraries) are user-visible.
- **Job tier:** one Container Apps Job or Functions (Premium/Flex) runner for the three long lanes (Project Hub AI jobs, Acquisition Hub augment, Scheduler nightly horizon) and the two GitHub-cron tasks. All three lanes are already token-gated HTTP callbacks, so only the trigger moves.
- **Request timeout:** ≥120 s on the web tier for AI routes; streaming enabled with response buffering off.

---

## 2. Databases

### 2.1 Inventory and size

| App | Engine today | Tables | Size today | Size at 12 months | Growth driver |
|---|---|---|---|---|---|
| Project Hub | Neon Postgres | 72 models, ~35 JSON columns | **15–30 MB** (Derived: 511 projects, 165 people, 624 alert rows measured Jul 2026) | **60–120 MB** | `AuditLog` (append-only, 93 write sites), `LlmTrace`, `AiJob` churn (weekly prune) |
| Incident & Event Hub | Neon Postgres | 47 models | **10–20 MB** | **50–80 MB** (pessimistic <400 MB) | `AuditLog` (every mutation and sensitive read; est. 75–150k rows/yr) |
| Scheduler Hub | Neon Postgres | 25 models | **15–30 MB** | **~200 MB** | `ScheduleAssignment` (~1,000 rows/week at 100 providers, 26-week horizon), `AuditLog` (~180k rows/yr, no retention) |
| Audit Hub | Neon Postgres | 18 models | **<1 MB data** (~30 MB with Postgres baseline; 700 seed rows) | **15–150 MB** (range depends on whether charge exports are per CPT line or aggregated) | `ChargeLine` (est. 15k rows/month), `PiFeedSnapshot` (one row per page view) |
| Acquisition Hub | Netlify Blobs (JSON documents); Azure SQL adapter written, DDL as a comment, **not provisioned** | 5 tables in the Azure SQL DDL | **<5 MB** (38 KB base playbook measured; 120–250 KB fully worked) | **≤10 MB** | 10–20 deals/yr (Assumed) |
| **Fleet total** | | | **≈0.1 GB** | **≈0.4–0.6 GB** | |

No database stores binary files. File content lives outside the databases:

| Store | Contents | Limit | Est. at 12 months |
|---|---|---|---|
| Netlify Blobs `attachments` (Incident & Event Hub) | Uploaded evidence (images, PDF, Office, audio) and generated letters | 4 MiB per file | **0.3–0.6 GB** |
| Netlify Blobs (Acquisition Hub) | Playbook and deal-analysis documents | — | <10 MB |
| Netlify Blobs `ai-jobs` (Project Hub) | Fallback only; prod uses Postgres (`AI_JOB_STORE=postgres`) | — | ~0 |

### 2.2 Storage sizing on Azure

Every database fits the **smallest** Azure tier by volume; provision for connections and IOPS, not GB. A 32 GB Flexible Server disk (the minimum) is more than a decade of headroom at the spec ceilings.

---

## 3. Database server

### 3.1 Neon today (Measured from Neon documentation and repo config)

| Property | Value |
|---|---|
| Model | Serverless Postgres, **one Neon project per hub** (four projects; e.g. Incident Hub `flat-resonance-94441967`, Scheduler Hub `late-river-90207517`) |
| Compute Unit | **1 CU = 1 vCPU + 4 GB RAM** |
| Autoscaling floor | **0.25 CU = 0.25 vCPU / 1 GB RAM** (104 `max_connections`) |
| Plan ceiling | Free: 2 CU (8 GB RAM), 0.5 GB storage per project, 100 CU-hours, 5 GB transfer. Launch/Scale: up to 16 CU autoscaling, storage $0.35/GB-month, 500 GB transfer included. |
| Scale-to-zero | After **5 minutes** idle — every first request after a quiet period pays a compute cold start on top of the function cold start |
| Connection path | All four apps use the **pooled** (`-pooler`, PgBouncer) endpoint; Prisma 7 with the `pg` driver adapter, one pool per warm function instance |

**What the code cannot tell us:** the plan tier and the configured min/max CU per project. Those live in the Neon console (Section 7). At this fleet's query rates (under 2 queries/second fleet-wide at peak) the computes will spend nearly all active time at the **0.25 CU floor** and most of the day suspended, so the honest "current database server size" is **≈0.25 vCPU / 1 GB per hub, bursting to at most 2 CU**.

### 3.2 Azure equivalents (recommendation)

| Option | Fit |
|---|---|
| **Azure Database for PostgreSQL Flexible Server, Burstable B2s (2 vCPU / 4 GB), one server, four databases** | Matches today's aggregate load with margin; enable the built-in PgBouncer; 32 GB storage. Simplest to operate. |
| Burstable **B1ms (1 vCPU / 2 GB) per hub** | If per-hub isolation or separate backup policies are required. |
| **Azure SQL** for the Acquisition Hub: serverless General Purpose 0.5–1 vCore with auto-pause, or Basic/S0 | The adapter and DDL already exist; two `mssql` pools per process at driver defaults (max 10 each). |

Two Prisma patterns need a **session-mode or direct connection** rather than transaction-mode PgBouncer: the Scheduler Hub horizon transaction (~500 statements) and the Audit Hub ingest commit. Give the job lane its own direct connection string.

---

## 4. Data between applications and databases (peak)

Assumptions: 5–15 concurrent users per app at peak, one session per user per peak hour, session shapes as described in each hub's audit. Bytes are logical row bytes over the wire (Prisma result sets), uncompressed.

| App | Per session | Peak hour today | Peak hour at 12-month adoption | Daily today → 12 months | Queries at peak |
|---|---|---|---|---|---|
| Project Hub | 5–12 MB, 120–150 queries | **40–80 MB** (150–250 MB in the monthly status week) | same | 150–400 MB | 1–2k/hr |
| Incident & Event Hub | 1.5–3 MB, 60–90 queries | **30–50 MB** (+15 MB per 5,000-row register export) | 50–80 MB | 100–200 MB | 1–1.5k/hr |
| Scheduler Hub | 6 MB today → 30 MB at 100 providers | **~60 MB** | **~310 MB** (incl. 11 MB ICS polling) | 0.3 GB → 1.3 GB (incl. 264 MB/day ICS + 15 MB nightly job) | 2.6k/hr |
| Acquisition Hub | 10–15 MB (augment polling dominates: 50–250 KB every 3 s for up to 4 min) | **50–150 MB** | same | 0.2–0.4 GB | <1 req/s |
| Audit Hub | 0.3 MB today; 65 MB at 12 months when a charges page is opened | **~20 MB** | **100 MB** bounded / **up to 1.3 GB** if `/charges` and `/productivity` keep reading every ChargeLine row | 50 MB → 0.5–5 GB | ~100 views/hr |
| **Fleet** | | **≈0.2–0.35 GB/hr** | **≈0.6–0.9 GB/hr** (≈2 GB/hr worst case) | **≈0.6–1 GB/day → 2–3 GB/day** | **<2 queries/s** |

Monthly app↔DB transfer: **≈15–25 GB today, ≈40–70 GB at 12 months.** Within Azure, app-to-database traffic inside a region is not metered, so this number sizes the database's network/IOPS envelope rather than a bill.

The heaviest single reads, in order (all Measured from code):

1. Audit Hub `/charges`, `/productivity` and charge exports — every `ChargeLine` row for the entity, no date window (est. 63 MB per view at 12 months).
2. Scheduler Hub `/dashboard` — 8 weeks of assignments with room/capability includes (~5 MB, ~8,000 rows).
3. Project Hub `/projects` and `GET /api/projects` — all 511 projects with 7 relations, no ACTIVE filter (2–3 MB).
4. Scheduler Hub nightly horizon — ~13 MB read, ~300 writes, once per night.
5. Incident & Event Hub `/admin/audit` — whole-table `count` + `groupBy` on `AuditLog` per view.

---

## 5. Data between applications and users (peak)

Assumptions: first visit ≈0.5–1 MB (JS, CSS, HTML), subsequent pages 50–150 KB gzipped, plus exports and uploads as noted. Client JavaScript is Measured from a real build (389 KB gzipped across all chunks; 120–260 KB on a typical page).

| App | Per session | Peak hour | Daily | Largest transfers |
|---|---|---|---|---|
| Project Hub | 2–4 MB | **30–60 MB** | 100–250 MB | PowerPoint decks 0.5–1.5 MB; `/projects` page ~100 KB gz; 5 guide `.docx` in `public/` (1.3 MB total) |
| Incident & Event Hub | 2–3 MB staff; ~0.5 MB + attachments anonymous | **50–70 MB** (incl. ~10 MB uploads/exports) | ~150 MB | Attachment uploads ≤4 MiB; xlsx registers 50–500 KB; queue pages 150–300 KB HTML |
| Scheduler Hub | 1.5–2 MB | **~30 MB** (7 MB of it ICS) | ~0.3 GB (**55% is hourly ICS polling** from ~100 subscribed calendars, uncacheable) | ICS feed ~70 KB per fetch; week grid ~80 KB gz; weekly xlsx ~150 KB |
| Acquisition Hub | ~15 MB (augment polling ~10 MB, two exports ~3 MB) | **150–200 MB** | ~0.3 GB | pptx exports 1–4 MB; full playbook JSON 50–250 KB per view and per poll; 4.5 MB pitch-graphics PNGs (static, cacheable) |
| Audit Hub | ~0.8 MB | **40–60 MB** (incl. ≤24 MB of uploads: each file is sent twice, preview + commit) | ~0.1 GB | Ingest uploads ≤6 MB; charge-integrity xlsx 5–15 MB at 12 months |
| **Fleet** | | **≈0.3–0.45 GB/hr** | **≈1–1.2 GB/day** | |

Monthly app↔user transfer: **≈25–35 GB.** This is comfortably inside any App Service / Front Door egress allowance; the only design-level item is the Scheduler Hub ICS feed, which is `Cache-Control: no-store` and regenerates per poll — a 5–15 minute cache would remove roughly half that app's daily traffic.

### 5.1 External egress (for completeness)

| Target | Apps | Volume |
|---|---|---|
| Anthropic API (`claude-opus-5`, fallback `claude-opus-4-8`, `max_tokens` 2k–16k) | Project Hub (13 features), Incident & Event Hub (6 features, one public), Acquisition Hub (augment + assist); Scheduler and Audit Hubs have no wired calls | Est. 1–2k calls/month fleet-wide; <100 MB/month of bytes; 5–120 s latency per call |
| Microsoft Entra ID (OIDC) | All five when `AUTH_MODE=entra` (currently **off** everywhere; Audit Hub has no auth layer and relies on the Cloudflare allow-list) | Negligible |
| Microsoft Graph (mail, calendar) | Project Hub only, both modes **off** today | 5–50 mails/day when enabled |
| EMR FHIR (Cerner, athena) | Incident & Event Hub patient lookup | Est. 100–300 searches/month, 2–5 KB each |
| Cross-hub feeds | Project Hub ← Acquisition Hub `/api/pipeline` (5-min cache, ~10 KB); Audit Hub ← Project Hub `/api/therapy-pi-feed` (per page view, 2–5 KB) | Tens of calls/day |
| GitHub Actions → databases | All four Prisma apps run `prisma db push` from GitHub runners on every deploy; Project Hub prune/import workflows open direct DB connections | The Azure network path for runners (or a self-hosted/VNet runner) must exist before cut-over |

---

## 6. Items the move should plan for

1. **Three long-running lanes need a runner** — Project Hub AI jobs, Acquisition Hub augment, Scheduler Hub nightly horizon. Each is a token-gated HTTP callback today; only the trigger and duration cap change.
2. **Netlify Blobs has two consumers to replace** — Incident & Event Hub attachments (needs a BAA-covered Azure Blob container; spec already names this seam) and Acquisition Hub documents (Azure SQL adapter exists, needs its one-time DDL run and tests).
3. **Connection pooling** — one `pg` pool per instance today; use Flexible Server's PgBouncer for web traffic and a direct connection for the two interactive-transaction lanes.
4. **Bound the four unbounded reads before user growth** — Audit Hub charges/productivity, Scheduler dashboard, Project Hub projects list, Incident Hub audit admin page. These, not user count, decide whether app↔DB traffic stays under 1 GB/hour at 12 months.
5. **AuditLog retention** — three hubs append audit rows with no pruning; together they are the largest growth line in Section 2.
6. **Request timeouts and streaming** — AI routes need ≥120 s; Acquisition Hub exports need streamed responses above 4.5 MB to work (they do not on Netlify today).
7. **Auth go-live is a gate, not a migration task** — all five apps run `AUTH_MODE=off`; Audit Hub's only protection is a Cloudflare IP allow-list. Entra should be on before any Azure endpoint is public.

---

## 7. Replace the estimates with measurements (≈1 hour)

| Check | Where | Replaces |
|---|---|---|
| Storage per project, configured compute min/max, plan tier, CU-hours last 30 days | Neon console → each project → Usage / Compute settings | Sections 2 and 3 |
| `SELECT pg_size_pretty(pg_database_size(current_database()));` and `SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) FROM pg_class WHERE relkind='r' ORDER BY pg_total_relation_size(oid) DESC LIMIT 15;` | Neon SQL editor per project | Per-table sizes in Section 2 |
| Bandwidth and function invocations / GB-hours per site, last 30 days | Netlify → Team → Usage, and each site → Analytics | Sections 1 and 5 |
| Blob store size (`attachments`) | Netlify → site → Blobs | Attachment volume in Section 2 |
| Token usage by workspace | Anthropic console → Usage | Section 5.1 |

Data-transfer notes: Neon meters egress (5 GB included on Free, 500 GB on paid plans); Netlify meters site bandwidth. Both dashboards give the true monthly numbers for Sections 4 and 5 in one screen each.

---

*Source material: the five repositories at their main-branch heads on 2026-09-02, one real production build of `incident-event-hub`, and Neon / Netlify platform documentation fetched the same day. Per-hub working notes (query-by-query tables, byte-per-row derivations) are in the audit session and can be attached on request.*
