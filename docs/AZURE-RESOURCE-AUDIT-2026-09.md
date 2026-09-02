# Sequel Hub Fleet — Resource Audit for the Azure Move

**Date:** 2 September 2026 · **Measured on 2 September 2026** (Neon and Netlify connectors, Anthropic Admin API; read-only) · **Scope:** Project Hub, Incident & Event Hub, Scheduler Hub, Acquisition Hub, Audit Hub (plus the two non-runtime repos, `sequel-foundation` and `sequel-app-template`). **Out of scope by request:** Document Hub, Legal-UI, Workers-Comp portal, event-reporter.

## How to read this

The first edition of this report (2 September, morning) was derived from code, schemas, seeds, deploy configuration and platform documentation. This edition replaces those figures with live readings wherever a connector or API exposed one: the Neon API for every project and database, the Netlify API for every site and its production deploy, and the Anthropic Admin API usage and cost reports for the 30 days ending today. Each number still carries one of three confidence tags:

| Tag | Meaning |
|---|---|
| **Measured** | Read directly from a live API/SQL reading, code, config, or a real build. |
| **Derived** | Computed from measured inputs (rows × bytes/row, page loads × payload, measured tokens × list price). |
| **Assumed** | A stated planning assumption (user counts, session shape). Change the assumption and the derived figure moves proportionally. |

Where a measurement differed from the original estimate by more than 2×, the line keeps a short "estimate was" note so the correction is visible. Section 7 records which checks completed and which the connectors could not return.

## The five answers at a glance

| # | Question | Answer |
|---|---|---|
| 1 | Web apps and their CPU/memory | **5 deployed apps**, all Next.js 16 on Netlify (team plan **Pro**, Measured). Each runs as one serverless function at **1,024 MB RAM / ≈0.6 vCPU-equivalent** — the 1,024 MB is now Measured from every production deploy record — scale-to-zero, no reserved instances. Two apps run a background function; one has a scheduled function whose schedule the deploy record does not list (see §1.2). Node runtimes are mixed: 20, 22 and 24. |
| 2 | Databases and size | **4 Neon Postgres databases + 1 document store** (Netlify Blobs; Azure SQL adapter written, not provisioned). Fleet total **52 MB of database size today** (Measured: 15 + 11 + 16 + 9.8 MB), **150 MB of Neon-billed storage** including history; **≈0.4–0.6 GB at 12 months** stays Derived, and the measured growth rates point to the low end. Attachments in Blobs today: **2 files, 101 KB** (Measured from the attachment table). |
| 3 | Database server | Neon **Scale plan (paid)**, one project per hub, each compute configured **0.25 → 8 CU** autoscaling (1 CU = 1 vCPU + 4 GB), default 5-minute suspend. Measured for the current consumption period: **≈10 active compute-hours and ≈2.7 CU-hours fleet-wide**, i.e. the computes average **0.26 CU while awake** and sit suspended the rest of the time. Estimate was "Free plan, capped at 2 CU". |
| 4 | App ↔ database volume | **≈52 MB of Neon-metered egress fleet-wide for the current period** (Project Hub 44 MB, Audit Hub 4.8 MB, Incident Hub 2.5 MB, Scheduler Hub 0.6 MB — Measured). Estimate was ≈15–25 GB/month; the whole month measured below one estimated peak hour. The 12-month figures are kept as Derived worst cases for the unbounded read paths, not as forecasts. |
| 5 | App ↔ user volume at peak | **≈0.3–0.45 GB per peak hour fleet-wide** (≈25–35 GB/month) — still **Derived**: the Netlify connector exposes no bandwidth, invocation or GB-hour usage. Client payload sizes remain Measured from a real build. Given how far the measured database and LLM traffic fell below the estimates, treat this as an upper bound. |

**Bottom line for Azure sizing:** this is a low-concurrency, small-data fleet running at pilot-level load today — the measurements are one to two orders of magnitude below the code-derived estimates. The binding constraints are unchanged: **memory for in-process Office-file generation and ingest (≥1 GB, 2 GB comfortable)**, **request timeouts for 60–120 s AI calls**, **a job runner for three long-running lanes**, and **connection pooling** — not CPU, storage or bandwidth. One new item from the measurement: three of the four databases sit in a different AWS region from the functions that call them (§3.1).

---

## 1. Web applications

### 1.1 Inventory (Measured from the Netlify API, 2 Sep 2026)

| App | Repo | Netlify site → production host | Production deploy | Node | Pages / API routes | Users (Assumed) | Peak concurrent (Assumed) |
|---|---|---|---|---|---|---|---|
| Project Hub | `project-insights` | `project-insights-seq` → `sequelorthoprojects.com` (Cloudflare-fronted) | 2 Sep 2026 16:35 UTC, from `main` | 20 | 75 / 121 | ~40–60 active; 147 Person rows, 42 authoritative members (Measured today; was 165 / 41 in Jul) | 10–15 (2–3× in the monthly status week) |
| Incident & Event Hub | `incident-event-hub` | `sequel-incident-hub` → `sequelincidenthub.com` | 2 Sep 2026 13:36 UTC | 22 | 26 / 79 | 10–25 named staff across 13 roles; all employees as anonymous reporters | 5–15 |
| Scheduler Hub | `scheduler-hub` | `sequel-scheduler-hub` → `sequelscheduler.com` | 2 Sep 2026 00:48 UTC | 22 | 21 / 18 | ~10 coordinators/admins; 100 providers (Measured: 100 Provider rows) | 5–15 |
| Acquisition Hub | `Sequel_Ortho` | `sequel-ortho-playbook` → **`sequelorthoplaybook.com`** (custom domain is configured; the code audit had found none) | 29 Aug 2026 17:01 UTC, from `main` | 24 | 16 / 15 | Deal team, IMO leads, steering committee: 3–10 | 3–5 |
| Audit Hub | `sequel-audit-hub` | `sequel-audit-hub` → `sequelaudit.com` (Cloudflare IP allow-list) | 29 Aug 2026 15:19 UTC | 22 | 12 / 13 | ~30 therapy staff + 3–5 leadership uploaders | 5–10 |
| — | `sequel-foundation` | not deployed (shared library, git dependency `v0.10.0`) | — | — | — | — | — |
| — | `sequel-app-template` | not deployed (starter template) | — | — | — | — | — |

The team (`buckygrad`, plan **Pro**, one member) has seven sites. Besides the five above: `sequel-doc-hub` → `sequeldocs.com` (excluded by request) and `settleiq` (`settleiq.netlify.app`, last deployed March 2026, not a Sequel hub — out of scope, noted for completeness). Every site has the Netlify observability extension and skew protection enabled; none uses Forms, password protection or team SSO.

All five apps share the same stack: Next.js 16.2 App Router, React 19, `@sequel/foundation` v0.10.0, Auth.js v5 with Microsoft Entra ID (JWT sessions, no session table). Four use Prisma 7 over Postgres; the Acquisition Hub uses a `PlaybookStore` interface with memory / Netlify Blobs / Azure SQL (`mssql`) adapters. All five deploy through `@netlify/plugin-nextjs` 5.15.13.

### 1.2 Compute today (Netlify, Measured from the production deploy records)

| Component | Allocation | Notes |
|---|---|---|
| Server function (SSR + API routes), one per app | **1,024 MB RAM on all five** (Measured: `memory: 1024` on every `___netlify-server-handler`), streaming invocation mode; CPU is proportional to memory on the underlying AWS Lambda — ≈**0.6 vCPU-equivalent** at 1,024 MB | Synchronous limit 60 s (documented; the deploy record does not expose the timeout). Function region **us-east-2 (cmh)** for Project, Incident, Scheduler and Audit Hubs; **us-east-1 (iad)** for the Acquisition Hub. Bundle sizes 24–37 MB. |
| Edge function (middleware `proxy.ts`) | Netlify edge runtime | Present on four sites (Measured: "1 edge function deployed"). **The Audit Hub deploys no edge function**, consistent with its no-auth-layer posture. |
| Background functions | 1,024 MB, **15-minute** cap, 256 KB payload | Project Hub `ai-job-background` (Node 20, background mode) and Acquisition Hub `augment-background` (Node 24, background mode) — both Measured present. |
| Scheduled function | 30 s cap | Scheduler Hub `nightly-horizon` is deployed (built 15 Aug, runtime API v1) **but the production deploy's `function_schedules` list is empty**, and the database shows no schedule-assignment or audit rows since 27 Aug (§2.1). Verify in the Netlify UI that the 03:00 Central schedule is still registered before assuming the nightly lane works. |
| GitHub Actions crons | n/a | Project Hub: daily alerts run (13:00 UTC), weekly AI-job prune (Sun 06:00 UTC) — both hit the app or the DB directly from GitHub runners. All five production deploys are published by GitHub Actions (`gh-actions: <sha> on main`). |

Calibration build (Incident & Event Hub, this session, Measured): client JavaScript **389 KB gzipped across all chunks** (typical page 120–260 KB), server build output **45 MB**, dependency tree **1.2 GB** (Prisma 172 MB, Next 173 MB, ExcelJS 23 MB, recharts 10 MB, docx 7 MB).

### 1.3 Memory- and time-heavy work per app

| App | Heaviest in-process work | Long-running paths |
|---|---|---|
| Project Hub | PowerPoint decks from a 4.9 MB brand template (0.5–1.5 MB output; est. 200–400 MB peak RSS); ExcelJS workbook imports/exports; docx guides | 10 AI routes at `maxDuration = 120`; Opus-class calls 20–60 s; background AI job lane up to 15 min (**0 AiJob rows and 0 LlmTrace rows in production today** — the lane has not been exercised) |
| Incident & Event Hub | ExcelJS register export up to 5,000 rows (est. 50–150 MB RSS); 4 MiB uploads buffered in memory | LLM assists 5–60 s **synchronously** (no background lane); one production trace so far: `categorize`, 14.0 s |
| Scheduler Hub | Dashboard loads nested assignment rows (est. 50–100 MB heap at 8,000 rows; **368 assignment rows today**); ExcelJS weekly export | Nightly horizon regeneration: ~500 statements in one interactive transaction, est. 10–20 s at 100 providers |
| Acquisition Hub | PowerPoint from a **10.9 MB** template + 1.9 MB pitch library (1–4 MB output); streamed responses observed failing at 2.3–4.5 MB on Netlify | Full-playbook augment 60–120 s+, background up to 15 min; browser polls every 3 s |
| Audit Hub | ExcelJS ingest parses whole workbook in memory (est. 5–10× file size → 300–600 MB for a 6 MB upload); charge exports 5–15 MB at 12 months | Ingest commit: `deleteMany + createMany` inside one interactive transaction (23 batches, 629 rows total so far — Measured) |

### 1.4 Suggested Azure equivalents (recommendation, not a measurement)

- **Web tier:** one App Service Linux plan **P1v3 (2 vCPU / 8 GB)** hosting all five apps as separate web apps, or **P0v3 (1 vCPU / 4 GB) per app** if isolation matters. Measured load is far below one request/second; memory headroom for Office-file generation is the reason for the size, not CPU. Keep one always-on instance per app — every page is `force-dynamic`, so cold starts (1–3 s with Prisma + Office libraries) are user-visible.
- **Job tier:** one Container Apps Job or Functions (Premium/Flex) runner for the three long lanes (Project Hub AI jobs, Acquisition Hub augment, Scheduler nightly horizon) and the two GitHub-cron tasks. All three lanes are already token-gated HTTP callbacks, so only the trigger moves.
- **Request timeout:** ≥120 s on the web tier for AI routes; streaming enabled with response buffering off.
- **Pin one Node major** (22 or 24) across the fleet during the move; today three majors are in production.

---

## 2. Databases

### 2.1 Inventory and size (Measured from the Neon API and read-only SQL, 2 Sep 2026)

| App | Neon project · region · PG | Tables | Database size today (Measured) | Neon storage incl. history (Measured) | Size at 12 months (Derived) | Growth driver (Measured today) |
|---|---|---|---|---|---|---|
| Project Hub | `bold-cherry-02731021` · us-east-2 · PG 18 | 72 | **15 MB** — largest tables Project 640 kB, AlertLog 400 kB, AuditLog 312 kB, AiJob 272 kB | 39.8 MB | **60–120 MB** | `AuditLog` **710 rows since 18 Jun (≈9/day, ≈3.4k/yr)**; AlertLog 739 rows; 514 projects; `LlmTrace` and `AiJob` both **empty** |
| Incident & Event Hub | `flat-resonance-94441967` · us-east-1 · PG 17 · **HIPAA enabled, extended audit logging** | 47 | **11 MB** — largest ComplianceMeasureEntry 600 kB (1,527 rows), AuditLog 192 kB | 34.8 MB | **50–80 MB** | `AuditLog` **371 rows in 29 days (≈13/day, ≈4.7k/yr)** — estimate was 75–150k rows/yr; 19 incident events; 1 LLM trace |
| Scheduler Hub | `late-river-90207517` · us-east-1 · PG 18 | 25 | **16 MB** — `AuditLog` **6.6 MB (41 % of the database)**, ScheduleAssignment 432 kB | 41.1 MB | **~200 MB** | `AuditLog` **21,269 rows**, all between 6 and 27 Aug (bulk generation), **2 rows in the last 7 days**; `ScheduleAssignment` **368 rows**, last written 27 Aug — estimate was ~1,000 rows/week; no rows of either since 27 Aug (see §1.2 on the nightly schedule) |
| Audit Hub | `damp-wave-17284476` · us-east-1 · PG 18 | 18 | **9.8 MB** — ChargeLine 728 kB (480 rows), Denial 136 kB | 34.0 MB | **15–150 MB** | `ChargeLine` 480 rows with service dates 21 May–17 Aug (seeded); 23 ingest batches / 629 rows 17–31 Aug; `PiFeedSnapshot` 4 rows; **no `AuditLog` table** in this app |
| Acquisition Hub | Netlify Blobs (JSON documents); Azure SQL adapter written, DDL as a comment, **not provisioned** | 5 tables in the Azure SQL DDL | **<5 MB** (38 KB base playbook measured from code; blob size not exposed by the connector) | — | **≤10 MB** | 10–20 deals/yr (Assumed) |
| **Fleet total** | | | **52 MB** (estimate was ≈0.1 GB) | **150 MB** | **≈0.4–0.6 GB** (measured growth rates point to the low end) | |

All four projects report **history retention of 6 hours** and a **16 TB logical-size limit**; `written_data_bytes` is reported as 0 by the API for every branch and was not used. The Audit Hub project carries a second branch (`br-crimson-voice-aw2jnkwg`) with its own compute endpoint, idle since 17 Aug, and its default branch was in Neon's **archived** state at measurement time (Neon parks idle branches in cold storage; the first connection un-archives it and pays an extra cold start).

No database stores binary files. File content lives outside the databases:

| Store | Contents | Limit | Today (Measured) | Est. at 12 months (Derived) |
|---|---|---|---|---|
| Netlify Blobs `attachments` (Incident & Event Hub) | Uploaded evidence (images, PDF, Office, audio) and generated letters | 4 MiB per file | **2 files, 101 KB** (from the `Attachment` table; `FeedbackAttachment` and `PrivacyAttachment` empty). The connector does not expose Blob store size directly. | **0.3–0.6 GB** at the spec's assumed upload rate |
| Netlify Blobs (Acquisition Hub) | Playbook and deal-analysis documents | — | not exposed | <10 MB |
| Netlify Blobs `ai-jobs` (Project Hub) | Fallback only; prod uses Postgres (`AI_JOB_STORE=postgres`) | — | ~0 (AiJob table empty) | ~0 |

### 2.2 Storage sizing on Azure

Every database fits the **smallest** Azure tier by volume; provision for connections and IOPS, not GB. A 32 GB Flexible Server disk (the minimum) is more than a decade of headroom at the spec ceilings, and more than two centuries at the measured run-rate.

---

## 3. Database server

### 3.1 Neon today (Measured from the Neon API, 2 Sep 2026)

| Property | Value |
|---|---|
| Organisation and plan | Org `org-falling-cell-70790666` ("Mike"), **Scale plan** (paid). Estimate was Free. |
| Model | Serverless Postgres, **one Neon project per hub** (four in scope; a fifth, `sequel-doc-hub`, is excluded). Project Hub in **aws-us-east-2**; Incident, Scheduler and Audit Hubs in **aws-us-east-1** |
| Compute Unit | **1 CU = 1 vCPU + 4 GB RAM** |
| Configured autoscaling | **min 0.25 CU → max 8 CU on every project** (Measured from `default_endpoint_settings` and each endpoint). Estimate was "capped at 2 CU on Free". |
| Scale-to-zero | `suspend_timeout_seconds: 0` = the platform default of **5 minutes**. Every endpoint was `idle` at measurement time; each one's `suspended_at` is 5–6 minutes after its `last_active`. |
| Measured consumption, current period (see note) | Active time / compute time / egress — Project Hub **3.6 h / 0.98 CU-h / 44.2 MB**; Incident Hub **1.7 h / 0.44 CU-h / 2.5 MB**; Scheduler Hub **0.34 h / 0.09 CU-h / 0.6 MB**; Audit Hub **4.6 h / 1.17 CU-h / 4.8 MB**. **Fleet: ≈10.2 active hours, ≈2.7 CU-hours, ≈52 MB egress.** Compute-time ÷ active-time = **0.26 CU average while awake** — the computes never leave the floor. |
| Postgres version | 18 on three projects, **17 on the Incident & Event Hub** |
| Compliance settings | Incident & Event Hub: `hipaa: true` (since 26 Aug), `audit_log_level: extended`, maintenance window Sat 08:00–09:00 UTC. The other three: HIPAA off. |
| Connection path | All four apps use the **pooled** (`-pooler`, PgBouncer, transaction mode) host; Prisma 7 with the `pg` driver adapter, one pool per warm function instance. `passwordless_access` is enabled on every endpoint. |

*Consumption-period note:* the API reports these counters for the current billing period with `quota_reset_at = 2026-10-01` and does not expose the period start. The excluded Document Hub project still shows non-zero usage despite no activity since 29 Aug, so the counters were not reset on 1 Sep; treat the window as roughly August to date (≈30 days). Three of the four projects were created in August anyway (Incident 4 Aug, Scheduler 6 Aug, Audit 8 Aug; Project Hub 9 Jun).

**Region mismatch (new finding):** the Incident, Scheduler and Audit Hub functions run in Netlify's us-east-2 region while their Neon computes are in us-east-1, so every query crosses AWS regions (roughly 10–15 ms extra per round-trip). The Project Hub (us-east-2 both sides) and the Acquisition Hub (us-east-1 functions, no Neon) are aligned. On Azure, keep the web tier and the database in the same region and the problem disappears.

The honest "current database server size" is therefore **≈0.25 vCPU / 1 GB per hub**, with an 8 CU ceiling that has never been approached: 2.7 CU-hours across ≈10 active hours means the fleet has not needed more than the floor.

### 3.2 Azure equivalents (recommendation)

| Option | Fit |
|---|---|
| **Azure Database for PostgreSQL Flexible Server, Burstable B2s (2 vCPU / 4 GB), one server, four databases** | Matches today's aggregate load with a wide margin (the measured fleet averages 0.26 CU ≈ ¼ vCPU while awake); enable the built-in PgBouncer; 32 GB storage. Simplest to operate. |
| Burstable **B1ms (1 vCPU / 2 GB) per hub** | If per-hub isolation or separate backup policies are required (the Incident & Event Hub's HIPAA flag argues for isolating it). |
| **Azure SQL** for the Acquisition Hub: serverless General Purpose 0.5–1 vCore with auto-pause, or Basic/S0 | The adapter and DDL already exist; two `mssql` pools per process at driver defaults (max 10 each). |

Two Prisma patterns need a **session-mode or direct connection** rather than transaction-mode PgBouncer: the Scheduler Hub horizon transaction (~500 statements) and the Audit Hub ingest commit. Give the job lane its own direct connection string.

---

## 4. Data between applications and databases

**Measured (Neon-metered egress from each default branch, current period ≈30 days):** Project Hub **44.2 MB**, Audit Hub **4.8 MB**, Incident & Event Hub **2.5 MB**, Scheduler Hub **0.6 MB** — **≈52 MB fleet-wide for the whole period.** The original estimate was ≈15–25 GB/month; the measured month is below what the estimate allowed for a single peak hour. Neon does not expose per-hour or per-query breakdowns through the connector, so the peak-hour columns below remain the code-derived model, kept as an **upper bound** with its assumptions (5–15 concurrent users per app at peak, one session per user per peak hour) explicitly unverified — the measured egress implies usage today is a small fraction of that.

| App | Per session (Derived) | Peak hour today (Derived, upper bound) | Peak hour at 12-month adoption (Derived) | Measured egress, current period | Queries at peak (Derived) |
|---|---|---|---|---|---|
| Project Hub | 5–12 MB, 120–150 queries | 40–80 MB (150–250 MB in the monthly status week) | same | **44.2 MB** | 1–2k/hr |
| Incident & Event Hub | 1.5–3 MB, 60–90 queries | 30–50 MB (+15 MB per 5,000-row register export) | 50–80 MB | **2.5 MB** | 1–1.5k/hr |
| Scheduler Hub | 6 MB today → 30 MB at 100 providers | ~60 MB | ~310 MB (incl. 11 MB ICS polling) | **0.6 MB** | 2.6k/hr |
| Acquisition Hub | 10–15 MB (augment polling dominates) | 50–150 MB | same | n/a (Blobs; not metered by the connector) | <1 req/s |
| Audit Hub | 0.3 MB today; 65 MB at 12 months when a charges page is opened | ~20 MB | 100 MB bounded / up to 1.3 GB if `/charges` and `/productivity` keep reading every ChargeLine row | **4.8 MB** | ~100 views/hr |
| **Fleet** | | ≈0.2–0.35 GB/hr (upper bound) | ≈0.6–0.9 GB/hr (≈2 GB/hr worst case) | **≈52 MB / period** | <2 queries/s |

Monthly app↔DB transfer: **≈0.05 GB measured today** (estimate was ≈15–25 GB); ≈40–70 GB at 12 months stays as the Derived worst case. Within Azure, app-to-database traffic inside a region is not metered, so this number sizes the database's network/IOPS envelope rather than a bill — and at the measured rate it sizes nothing.

The heaviest single reads, in order (all Measured from code; row counts updated from today's readings):

1. Audit Hub `/charges`, `/productivity` and charge exports — every `ChargeLine` row for the entity, no date window (480 rows today; est. 63 MB per view at 12 months if ingest reaches spec volume).
2. Scheduler Hub `/dashboard` — 8 weeks of assignments with room/capability includes (368 assignment rows today; ~8,000 at the spec's 100-provider horizon).
3. Project Hub `/projects` and `GET /api/projects` — all 514 projects with 7 relations, no ACTIVE filter (2–3 MB).
4. Scheduler Hub nightly horizon — ~13 MB read, ~300 writes, once per night (not observed running since 27 Aug).
5. Incident & Event Hub `/admin/audit` — whole-table `count` + `groupBy` on `AuditLog` per view (371 rows today).

---

## 5. Data between applications and users (peak)

**Not measured.** The Netlify connector's read operations (`get-teams`, `get-team`, `get-projects`, `get-project`, `get-deploy`, `get-forms-for-project`, `get-user`, extensions) return no bandwidth, function-invocation or GB-hour usage, so this section keeps the code-derived model and its tags. The Netlify Team → Usage screen remains the place to read it (§7).

Assumptions: first visit ≈0.5–1 MB (JS, CSS, HTML), subsequent pages 50–150 KB gzipped, plus exports and uploads as noted. Client JavaScript is Measured from a real build (389 KB gzipped across all chunks; 120–260 KB on a typical page).

| App | Per session | Peak hour | Daily | Largest transfers |
|---|---|---|---|---|
| Project Hub | 2–4 MB | **30–60 MB** | 100–250 MB | PowerPoint decks 0.5–1.5 MB; `/projects` page ~100 KB gz; 5 guide `.docx` in `public/` (1.3 MB total) |
| Incident & Event Hub | 2–3 MB staff; ~0.5 MB + attachments anonymous | **50–70 MB** (incl. ~10 MB uploads/exports) | ~150 MB | Attachment uploads ≤4 MiB (2 uploaded to date, 101 KB — Measured); xlsx registers 50–500 KB; queue pages 150–300 KB HTML |
| Scheduler Hub | 1.5–2 MB | **~30 MB** (7 MB of it ICS) | ~0.3 GB (**55% is hourly ICS polling** from ~100 subscribed calendars, uncacheable) | ICS feed ~70 KB per fetch; week grid ~80 KB gz; weekly xlsx ~150 KB |
| Acquisition Hub | ~15 MB (augment polling ~10 MB, two exports ~3 MB) | **150–200 MB** | ~0.3 GB | pptx exports 1–4 MB; full playbook JSON 50–250 KB per view and per poll; 4.5 MB pitch-graphics PNGs (static, cacheable) |
| Audit Hub | ~0.8 MB | **40–60 MB** (incl. ≤24 MB of uploads: each file is sent twice, preview + commit) | ~0.1 GB | Ingest uploads ≤6 MB; charge-integrity xlsx 5–15 MB at 12 months |
| **Fleet** | | **≈0.3–0.45 GB/hr** (Derived, upper bound) | **≈1–1.2 GB/day** | |

Monthly app↔user transfer: **≈25–35 GB (Derived, upper bound).** This is comfortably inside any App Service / Front Door egress allowance; the only design-level item is the Scheduler Hub ICS feed, which is `Cache-Control: no-store` and regenerates per poll — a 5–15 minute cache would remove roughly half that app's daily traffic.

### 5.1 External egress — Anthropic (Measured from the Admin API usage and cost reports, 3 Aug – 2 Sep 2026)

The organisation has no named workspaces; everything bills to the default workspace, so usage is attributed by API key. Model in use: **`claude-opus-5` only** — no fallback (`claude-opus-4-8`) traffic was recorded. Traffic occurred on **11 of the 30 days**.

| API key → hub | Active days | Uncached input | Cache read | Cache write (5 min) | Output | Cost at list price (Derived) |
|---|---|---|---|---|---|---|
| `Incident_Hub` → Incident & Event Hub | 10 | 1,152 | 19,542 | 48,566 | 8,666 | ≈$0.54 |
| `sequel-ortho-netlify-rotated` → Acquisition Hub | 2 | 18 | 0 | 91,246 | 5,267 | ≈$0.70 |
| `sequel-ortho-playbook-prod` → Acquisition Hub | 0 | 0 | 0 | 0 | 0 | $0 |
| Project Hub | — | no key carries traffic; production `LlmTrace` table is empty | | | | $0 |
| **Fleet** | 11 | **1,170** | **19,542** | **139,812** | **13,933** | **$1.24 (Measured, cost report)** |

The cost report reconciles to Opus 5 list price ($5 / $0.50 / $6.25 / $25 per million tokens for the four columns), which confirms the split. Request counts are not part of the usage report; the token volumes correspond to a few dozen calls at most. The Incident Hub's key saw traffic on 10 days but its production trace table holds **one** call (`categorize`, 42 in / 306 out, 14.0 s), so most of that key's use came from outside production (local or preview). The original estimate was 1–2k calls/month fleet-wide; measured usage is well under that. Only five keys exist: the two above with traffic, `sequel-ortho-playbook-prod`, and two archived ones (`Sequel_Ortho_Netlify`, and `Resource Audit Sept 2026` created today).

Other external egress (unchanged, code-derived):

| Target | Apps | Volume |
|---|---|---|
| Microsoft Entra ID (OIDC) | All five when `AUTH_MODE=entra` (currently **off** everywhere; Audit Hub has no auth layer and relies on the Cloudflare allow-list) | Negligible |
| Microsoft Graph (mail, calendar) | Project Hub only, both modes **off** today | 5–50 mails/day when enabled |
| EMR FHIR (Cerner, athena) | Incident & Event Hub patient lookup | Est. 100–300 searches/month, 2–5 KB each |
| Cross-hub feeds | Project Hub ← Acquisition Hub `/api/pipeline` (5-min cache, ~10 KB); Audit Hub ← Project Hub `/api/therapy-pi-feed` (per page view, 2–5 KB; 4 `PiFeedSnapshot` rows to date) | Tens of calls/day |
| GitHub Actions → databases | All four Prisma apps run `prisma db push` from GitHub runners on every deploy (all five production deploys are GitHub-Actions-published — Measured); Project Hub prune/import workflows open direct DB connections | The Azure network path for runners (or a self-hosted/VNet runner) must exist before cut-over |

---

## 6. Items the move should plan for

1. **Three long-running lanes need a runner** — Project Hub AI jobs, Acquisition Hub augment, Scheduler Hub nightly horizon. Each is a token-gated HTTP callback today; only the trigger and duration cap change. **Check the nightly-horizon schedule first**: the production deploy lists no function schedule and the database has had no horizon writes since 27 Aug.
2. **Netlify Blobs has two consumers to replace** — Incident & Event Hub attachments (needs a BAA-covered Azure Blob container; 2 files / 101 KB to migrate today) and Acquisition Hub documents (Azure SQL adapter exists, needs its one-time DDL run and tests).
3. **Connection pooling** — one `pg` pool per instance today; use Flexible Server's PgBouncer for web traffic and a direct connection for the two interactive-transaction lanes.
4. **Bound the four unbounded reads before user growth** — Audit Hub charges/productivity, Scheduler dashboard, Project Hub projects list, Incident Hub audit admin page. At today's row counts none of them hurts; they decide whether app↔DB traffic stays under 1 GB/hour once data reaches spec volume.
5. **AuditLog retention** — two hubs append audit rows with no pruning (Project Hub, Incident & Event Hub, both at single-digit rows/day today); the Scheduler Hub's 21k-row log came from bulk generation and is already 41 % of that database.
6. **Request timeouts and streaming** — AI routes need ≥120 s; Acquisition Hub exports need streamed responses above 4.5 MB to work (they do not on Netlify today).
7. **Auth go-live is a gate, not a migration task** — all five apps run `AUTH_MODE=off`; Audit Hub's only protection is a Cloudflare IP allow-list (and it deploys no edge middleware at all). Entra should be on before any Azure endpoint is public.
8. **Co-locate database and web tier** — three hubs cross AWS regions today (§3.1); pick one Azure region for both.
9. **Carry the HIPAA posture across** — the Incident & Event Hub's Neon project is HIPAA-enabled with extended audit logging; the Azure equivalent (BAA, auditing on Flexible Server) must be in place before that database moves.

---

## 7. Measurement pass — what was completed (2 September 2026)

| Check | Result | Replaced |
|---|---|---|
| Storage per project, configured compute min/max, plan tier, consumption for the period | **Done** via the Neon connector (`list_projects`, `get_default_branch`, `list_postgres_endpoints`): Scale plan, 0.25–8 CU on every project, 150 MB billed storage, 2.7 CU-hours, 52 MB egress. | §2, §3, §4 |
| Database and per-table sizes, row counts, growth-table date ranges | **Done** via read-only `run_sql` on each default branch (`pg_database_size`, `pg_class`, `pg_stat_user_tables`, `count/min/max` on `AuditLog`, `ScheduleAssignment`, `ChargeLine`, `LlmTrace`, `Attachment`). Note: the Audit Hub has no `AuditLog` table, and the timestamp column is `at` on the Project, Incident and Scheduler Hubs (not `createdAt`). | §2 |
| Netlify sites, plan, production deploys, function memory, runtimes, background/scheduled functions | **Done** via the Netlify connector (`get-teams`, `get-projects`, `get-project`, `get-deploy-for-site`). Function timeout is not in the deploy record. | §1 |
| Bandwidth, function invocations, GB-hours per site (30 days) | **Not available** — the connector's reader tools expose no usage endpoint. §5 keeps its Derived figures; read them from Netlify → Team → Usage. | — |
| Blob store size (`attachments`) | **Not available directly** — no Blobs operation in the connector. Proxied from the Incident & Event Hub `Attachment` tables: 2 files, 101 KB. | §2 (partial) |
| Token usage and cost by workspace/key (30 days) | **Done** via the Anthropic Admin API (`usage_report/messages` grouped by model and API key, `cost_report`): $1.24, 13.9k output tokens, two active keys. The `LlmTrace` fallback query was also run (Project Hub: empty; Incident Hub: one row). | §5.1 |

Data-transfer notes: Neon's egress counter (`data_transfer_bytes`) replaced the §4 estimate; Netlify's bandwidth counter remains unread. Neon's `written_data_bytes` reported 0 on every branch and was ignored.

**Owner action after this pass:** delete the `Resource Audit Sept 2026` Admin API key in the Anthropic console.

---

*Source material: the five repositories at their main-branch heads on 2026-09-02, one real production build of `incident-event-hub`, Neon / Netlify platform documentation fetched the same day, and the live readings described in §7 taken on 2026-09-02 between 16:50 and 17:15 UTC. Per-hub working notes (query-by-query tables, byte-per-row derivations) are in the audit session and can be attached on request.*
