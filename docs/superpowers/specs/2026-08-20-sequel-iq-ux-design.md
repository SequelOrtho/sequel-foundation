# Sequel IQ UX Overhaul — Design Spec

**Date:** 2026-08-20
**Status:** Approved (brainstorm with Mike, 2026-08-20)
**Scope:** Apply the Sequel hub UX principles ([DESIGN-CONVENTIONS.md](../../DESIGN-CONVENTIONS.md)) to Sequel IQ, the data-analytics product (Azure + Databricks lakehouse, Power BI presentation layer, front door on SharePoint).

## Problem

Sequel IQ works but is clunky to use — the complaint comes from the CEO. The audience is execs and business leaders. Their failures are:

1. **Findability** — "How do I find X data?"
2. **Interpretability** — "How do I tell if X or Y is happening?" / "How can I use this to make decisions?"

Data quality is not the complaint. There are no formal usage metrics; all evidence is anecdotal. Goal: a more intuitive interface overall, dashboards that are crystal clear, and measurably higher adoption.

## Environment facts

- **Deployment:** Power BI Service, network-restricted (conditional access / private links — reachable only from the corporate network or VPN). Full Service API surface exists: scanner API, Activity Events, built-in usage metrics — some need tenant-admin cooperation.
- **Front door:** a SharePoint page linking/embedding the reports.
- **Scan access:** a work machine inside the network can run Claude Code; browser tooling there reaches the reports with Mike's viewer session. All scanning is read-only.

## Core design decision

Foundation conventions split into **code** (React components — does not transfer to Power BI) and **principle** (color semantics, icon+label, no zero-exit, navigation checklist — transfers fully). We do not port components; we build the **Power BI-native carriers** of the same rules:

| Foundation asset | Sequel IQ carrier |
|---|---|
| `brand/tokens.css` / theme | Power BI **theme JSON**: brand navy/blue/chartreuse, RYG status values, Montserrat, data-color ramp |
| `ui/` primitives | **Report template (.pbit/.pbip)**: pre-built header, page-nav buttons, slicer panel, KPI card layouts |
| §2 color semantics | Chartreuse reserved for action cues; RYG never color-alone — icon/label pairs in conditional formatting |
| §5 navigation | Home page per workspace/app; drill-through always with a back affordance; no dead-end pages |
| §5a review checklist | **D1–D7 dashboard checklist** (below) as the review gate for every new/changed report |
| §7 writing rules | Titles state the takeaway, not the chart type; every measure carries a tooltip definition |
| Registry-driven surfaces | Certified semantic model + measure dictionary — one definition per KPI |

These artifacts live in a new sibling repo, **`sequel-iq-foundation`**, playing the role this repo plays for the hubs.

## Dashboard review checklist (D1–D7)

Per report page; score pass/fail, rate failures 0–4 (frequency × impact × persistence), fix 3s and 4s first.

- **D1 Where am I?** — page title + workspace/app context visible; matches the nav label that got the user here.
- **D2 What is this number?** — every KPI has a definition on hover, units, time grain; refresh timestamp visible.
- **D3 First glance answers the #1 question** — top-left carries the takeaway; detail sits below or behind drill.
- **D4 No dead end** — drill-throughs have back; related reports are linked.
- **D5 Empty/stale states speak** — "No data for this filter" plus a fix hint, never a blank visual; stale refresh flagged.
- **D6 Filters visible** — active filter state readable without opening the filter pane (icon + label, per §2).
- **D7 One definition per metric** — measures come from the certified model, never a report-local DAX fork.

## Decision-framing rule

"How do I tell if X is happening" fails when a chart shows data without a reference point. Every exec-facing visual bakes the comparison in: target line, prior period, threshold band, or RYG status vs plan. The title states the answer ("Backlog up 18% vs capacity — East region"); the chart is the evidence.

## Phases

### Phase 0 — Baseline measurement

One tenant-admin ask: 90 days of Activity Events (report views by user/report) — or minimum, the built-in per-workspace usage metrics report. Plus SharePoint page analytics on the front door. Purpose: (a) adoption baseline before anything changes, (b) traffic ranking to order the scan, since current evidence is anecdotal. Runs passively; no user-visible change.

### Phase 1 — Scan (from the work machine)

Claude Code session on the inside machine:

1. Browser walkthrough of every flagship report with a viewer session — score against D1–D7, screenshot failures, map the SharePoint → report click paths (the "find X" journey).
2. In parallel: export flagship .pbix files; `pbi-tools` extract to a repo so layout, visuals, and DAX are text — producing the measure inventory and flagging duplicate/conflicting KPI definitions.
3. If tenant admin cooperates: scanner API (WorkspaceInfo) dump for datasets/measures/lineage; Databricks Unity Catalog check (read-only) for upstream column/metric descriptions Power BI should surface.

**Output:** findings doc — checklist failures rated 0–4, ranked by Phase 0 traffic; measure-conflict inventory; usage-ranked report list.

### Phase 2 — Front door (ships first)

Redesign the SharePoint landing hub-style with **question-named tiles** — "Are we hitting plan?", "Where is backlog growing?" — each linking the report page that answers it. Registry-driven, grouped by decision area, no zero-exit, empty/locked states per conventions §3/§5. No Power BI rework required; directly attacks findability.

### Phase 3 — Flagship redesign (1–2 highest-traffic, worst-scoring reports)

Apply decision framing throughout: takeaway titles, baked-in comparisons, RYG icon+label, definition tooltips, refresh timestamp, drill-with-back. The theme JSON and .pbit template are built here and seeded into `sequel-iq-foundation`.

### Phase 4 — Rollout + governance

Remaining reports migrate to the template as they are touched. D1–D7 becomes the review gate for any new or changed report (same role as conventions §5a). Re-measure Phase 0 metrics; the adoption delta is the success number the CEO sees.

## Success criteria

- An exec finds the answer to a named business question in ≤2 clicks from the front door.
- Every flagship visual answers "is X or Y happening" without interpretation (comparison baked in, takeaway title).
- Report views trend up vs the Phase 0 baseline.

## Risks

- **Tenant-admin cooperation** (Phase 0 metrics, scanner API): plan degrades gracefully — the browser walkthrough alone still yields the D1–D7 findings; traffic ranking falls back to anecdote.
- **Report-builder buy-in:** who builds reports (central team, embedded analysts, vendors) is still an open question; template + checklist adoption depends on the answer. Resolve during Phase 1.
- **Access mechanics:** everything scan-related runs read-only from inside the network; no firewall or external-access change is required.

## Out of scope (for now)

- A custom web front end / Next.js shell with embedded Power BI (would let the actual foundation components carry the chrome). Revisit after Phase 3 if Power BI-native carriers prove too limiting.
- Data-quality or pipeline work in Databricks — not the complaint.
