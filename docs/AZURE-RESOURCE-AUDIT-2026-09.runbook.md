# Measurement pass runbook — Sequel fleet resource audit

Companion to `AZURE-RESOURCE-AUDIT-2026-09.md` (and its `.html` twin). That report is
code-derived; this runbook replaces its Derived/Assumed figures with measured ones.
Run it in a Claude Code session on branch `claude/resource-audit-azure-j42wb8` with the
**Neon** and **Netlify** connectors enabled in the chat and `ANTHROPIC_ADMIN_KEY` set as an
environment secret. Everything here is read-only; never invoke a Neon tool marked
destructive (create/delete/reset/restart) and never call a Netlify `*-updater` tool.

## Scope reminder

| App | Netlify site | Neon project (name in console; ids where known) |
|---|---|---|
| Project Hub | `project-insights-seq` → sequelorthoprojects.com | match by name (project-insights / project hub) |
| Incident & Event Hub | sequelincidenthub.com | id `flat-resonance-94441967` |
| Scheduler Hub | sequelscheduler.com | id `late-river-90207517` |
| Acquisition Hub | `sequel-ortho-playbook` | none (Netlify Blobs today) |
| Audit Hub | `sequel-audit-hub` → sequelaudit.com | match by name |

Excluded: Document Hub, Legal-UI, Workers-Comp portal, event-reporter. Do not query them.

## A. Neon (replaces report §2 and §3)

For each of the four projects:

1. `describe_project` / `get_branch` on the default branch: record **synthetic storage size**
   (or data size + history), **compute min/max CU**, autoscaling on/off, suspend timeout,
   region, Postgres version, and plan tier if exposed. `list_branch_computes` for the sizes.
2. `run_sql` on the default branch, read-only:
   ```sql
   SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
   SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS total,
          pg_size_pretty(pg_relation_size(oid)) AS heap
   FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
   ORDER BY pg_total_relation_size(oid) DESC LIMIT 15;
   SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15;
   ```
   Also, for growth-rate tables, `SELECT count(*), min("createdAt"), max("createdAt")` on
   `AuditLog` (all four), `ScheduleAssignment` (Scheduler), `ChargeLine` (Audit),
   `LlmTrace` (Project, Incident) — quote identifiers, Prisma uses camelCase.
3. If the connector exposes consumption metrics (compute hours, data transfer, active time
   last 30 days), record them; they replace the app↔DB estimate in §4 for that hub.
4. Note anything that contradicts the report (e.g. a project on a paid plan with a fixed
   compute, or a database larger than estimated) — those become corrections, not footnotes.

## B. Netlify (replaces report §1 and §5)

1. `netlify-team-services-reader`: list the team's sites; confirm the five above and note
   any others in scope that the code audit missed.
2. Per site, `netlify-project-services-reader` / `netlify-deploy-services-reader`: current
   production deploy id and date, Node runtime, function list with configured memory/timeout
   (expect 1024 MB default; record if different), background/scheduled functions present.
3. Team usage for the last 30 days if the reader exposes it: **bandwidth per site**,
   **function invocations and GB-hours per site**, **Blobs storage** (`attachments` store on
   the Incident & Event Hub site). If the connector cannot return usage, say so plainly in
   the report and keep the estimate with its tag; do not guess.

## C. Anthropic (replaces report §5.1)

Raw HTTP with the env secret; the endpoints are not in any SDK. Use a 30-day window ending
today (max 31 daily buckets per request).

```bash
H='anthropic-version: 2023-06-01'
curl -s "https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=<T-30d>T00:00:00Z&ending_at=<T>T00:00:00Z&bucket_width=1d&group_by[]=model&group_by[]=workspace_id" -H "$H" -H "x-api-key: $ANTHROPIC_ADMIN_KEY"
curl -s "https://api.anthropic.com/v1/organizations/cost_report?starting_at=<T-30d>T00:00:00Z&ending_at=<T>T00:00:00Z&group_by[]=workspace_id&group_by[]=description" -H "$H" -H "x-api-key: $ANTHROPIC_ADMIN_KEY"
```

Record per workspace (or per API key if everything sits in the default workspace with
`workspace_id: null`): requests, uncached input, cached input, cache-creation, output tokens,
and USD cost. Map workspaces/keys to hubs by name. Never print the key; never write it to a file.

**Fallback when `ANTHROPIC_ADMIN_KEY` is unset or returns 401.** Do not stop. In the Neon pass,
on the Project Hub and Incident & Event Hub databases (the two with an `LlmTrace` table; the
Acquisition Hub's `dbo.llm_traces` is on Azure SQL and unreachable here), run read-only:
```sql
SELECT feature, model, count(*) AS calls,
       sum("inputTokens") AS input_tokens, sum("outputTokens") AS output_tokens,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50_ms,
       min("createdAt") AS first_seen, max("createdAt") AS last_seen
FROM "LlmTrace" GROUP BY feature, model ORDER BY calls DESC;
```
Report tokens per hub and per feature as **Measured** (from app traces) and keep the cost line
as an estimate at list price, tagged Derived, noting that the Console usage report was not
available.

## D. Update the report

1. Edit `docs/AZURE-RESOURCE-AUDIT-2026-09.md` in place: swap figures, change tags from
   Derived/Assumed to Measured where a measurement replaced them, keep the original estimate
   in a short "estimate was" note only where the measured value differs by more than 2×.
2. Add a dated "Measured on <date>" line under the title and a row in §7 saying which checks
   were completed and which could not be (with the reason).
3. Mirror the same edits into `docs/AZURE-RESOURCE-AUDIT-2026-09.html` (same sections, same
   numbers; it is a hand-written page, not generated).
4. Commit on this branch with subject `docs(audit): measured pass — Neon, Netlify, Anthropic`
   and push. No PR unless asked.
5. Remind the owner to delete the Admin key.
