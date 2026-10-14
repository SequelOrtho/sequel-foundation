import type { ReactNode } from "react";

// Tile iconography (DESIGN-CONVENTIONS §5 "Tiles carry an icon"). One small
// line glyph sits left of every tile title — admin area hubs, landing tiles —
// so a grid of cards scans by shape before it is read. Established on the
// Incident & Event Hub's Administration hub (Oct 2026) and drawn to its
// grammar: 24×24 grid, 1.75 stroke, round caps and joins, no fill,
// currentColor. The title beside the icon carries the meaning (icon + label,
// never the icon alone), so every glyph is aria-hidden.
//
// Pick by what the area *is about*, not by its data model; reuse a glyph
// across hubs for the same idea (people-access is "who can sign in" in every
// hub). Add a glyph here — never draw a one-off in an app — so the family
// keeps one visual vocabulary.

const GLYPHS = {
  /** Who can sign in and what they can do — roles, users & scopes. */
  "people-access": (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M17 11l1.5 1.5L22 9" />
    </>
  ),
  /** Who a case goes to — routing rules, assignment. */
  routing: (
    <>
      <circle cx="5" cy="12" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M7 12h4l6-6M11 12l6 6" />
    </>
  ),
  /** When something goes overdue — clocks, escalation thresholds. */
  clock: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </>
  ),
  /** Correspondence — letter templates, email wording. */
  letter: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  /** How the org is shaped — entities and sites, departments. */
  organization: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="2" y="16" width="6" height="5" rx="1" />
      <rect x="16" y="16" width="6" height="5" rx="1" />
      <path d="M12 8v4M5 16v-4h14v4" />
    </>
  ),
  /** One organization or entity record. */
  building: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M16 9h2a2 2 0 0 1 2 2v10" />
      <path d="M2 21h20M8 7h4M8 11h4M8 15h4" />
    </>
  ),
  /** Physical places — locations, clinics, rooms. */
  "map-pin": (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  /** One kind of person — providers, staff. */
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  /** Groups of people — teams, rosters. */
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M17.5 14.2a6.5 6.5 0 0 1 4 5.8" />
    </>
  ),
  /** A person's role badge — role mappings, authorization records. */
  "id-card": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16a3 3 0 0 1 6 0M14 10h4M14 14h4" />
    </>
  ),
  /** Authority — who is authorized or validated to act. */
  "shield-check": (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  /** Recurring schedules — patterns, cycles, calendars. */
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  /** A dated step to complete — entry into another system, sign-off by date. */
  "calendar-check": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4" />
    </>
  ),
  /** Kinds and categories — types, vocabularies. */
  tag: (
    <>
      <path d="M3 3h8l10 10-8 8L3 11z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  /** Things that take turns — rotations, recurring cycles. */
  rotation: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" />
    </>
  ),
  /** Bulk loads — import, upload. */
  upload: (
    <>
      <path d="M12 15V3M7 8l5-5 5 5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  /** Settings and lookup lists. */
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  /** A collection of work records — projects, cases. */
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  /** Goals and initiatives. */
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  /** Linking one record to another — mappings, assignments to an owner. */
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  /** Weighing — scoring rubrics, criteria. */
  scale: (
    <>
      <path d="M12 4v16M8 20h8M5 7h14" />
      <path d="M5 7l-3 6M5 7l3 6M2 13a3 3 0 0 0 6 0" />
      <path d="M19 7l-3 6M19 7l3 6M16 13a3 3 0 0 0 6 0" />
    </>
  ),
  /** Alerts and notifications. */
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" />
      <path d="M10 21h4" />
    </>
  ),
  /** The record of what happened — audit trails, decision logs. */
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8.3" />
      <path d="M3 3.5v4.8h4.8M12 7.5v4.5l3 2" />
    </>
  ),
  /** Checked numbers — validation, tie-outs. */
  "chart-check": (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 17v-5M11 17V9M15 17v-3M15 7.5l2 2 4-4" />
    </>
  ),
  /** A worklist waiting on someone — queues, inboxes. */
  inbox: (
    <>
      <path d="M3 13l3-8h12l3 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 13h5l1.5 2.5h5L16 13h5" />
    </>
  ),
  /** A list of entries. */
  list: <path d="M9 6h11M9 12h11M9 18h11M3.5 6h1M3.5 12h1M3.5 18h1" />,
  /** Start something new — a submission, a request. */
  "file-plus": (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M12 12v6M9 15h6" />
    </>
  ),
  /** Documents and submitted records. */
  "file-text": (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  /** Evaluating before committing — screening, discovery, assessment. */
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.5-4.5" />
    </>
  ),
  /** A layered build — platform standardization, an integration stack. */
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5M3 17.5l9 5 9-5" />
    </>
  ),
  /** A deck or pitch — presentations, readouts. */
  presentation: (
    <>
      <rect x="3" y="3" width="18" height="12" rx="1.5" />
      <path d="M12 15v4M8 21l4-2 4 2M7 11l3-3 2 2 4-4" />
    </>
  ),
  /** Confidentiality — NDAs, protected material. */
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2.5" />
    </>
  ),
  /** A staged pipeline — deals or requests moving toward a close. */
  funnel: <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />,
  /** Growth and optimization — scale-up, improvement over time. */
  "trending-up": (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  /** Program status — health, RYG, steering readouts. */
  gauge: (
    <>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 18l4-5M2.5 18h3M18.5 18h3M12 6.5V9" />
    </>
  ),
  /** Urgent and acute care — urgent care, walk-in, first aid. */
  "first-aid": (
    <>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M9 5V3.5h6V5M12 9.5v6M9 12.5h6" />
    </>
  ),
  // ── Landing / section tiles (v0.25.0) — the ideas the hubs' home and
  // section grids needed beyond the admin vocabulary above.
  /** Safety events — incidents, near misses, unsafe conditions. */
  "shield-alert": (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
      <path d="M12 8v5M12 16.5h.01" />
    </>
  ),
  /** The patient's voice — feedback, complaints, grievances. */
  message: (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M7.5 9h9M7.5 13h5" />
    </>
  ),
  /** Privacy — who may see a record, privacy incidents and breaches. */
  "eye-off": (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </>
  ),
  /** A concern about a person's conduct — disruptive behavior. */
  "user-alert": (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M19.5 7v5M19.5 15.5h.01" />
    </>
  ),
  /** Legal — claims, legal holds, matters. */
  gavel: (
    <>
      <path d="M12.5 4.5l7 7-3 3-7-7z" />
      <path d="M13 11l-8.5 8.5M13 21h8" />
    </>
  ),
  /** Conformance checked against a list — checklists, compliance programs. */
  "clipboard-check": (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2.5" width="6" height="3" rx="1" />
      <path d="M9 13l2 2 4-4" />
    </>
  ),
  /** A file to take away — exports, registers, workbooks. */
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  /** Needs management attention — escalations, raised issues. */
  flag: <path d="M5 21V4M5 4h12l-2.5 4L17 12H5" />,
  /** Work laid out over time — timelines, sprint waves, roadmaps. */
  gantt: (
    <>
      <path d="M3 3v18" />
      <rect x="6" y="5" width="8" height="3" rx="1" />
      <rect x="10" y="10.5" width="9" height="3" rx="1" />
      <rect x="6" y="16" width="7" height="3" rx="1" />
    </>
  ),
  /** A composite score — health scores and their drivers. */
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  /** What was learned — lessons learned, ideas. */
  lightbulb: (
    <>
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
      <path d="M9.5 19h5M10.5 21.5h3" />
    </>
  ),
  /** Data and analytics — data requests, reporting queues. */
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  /** Load against capacity — demand vs capacity, utilization. */
  capacity: (
    <>
      <path d="M3 21h18M6.5 21v-6M10.5 21v-9M14.5 21v-5M18.5 21v-11" />
      <path d="M3 6.5h18" strokeDasharray="2 2.5" />
    </>
  ),
  /** Something refused — denials, rejected claims. */
  "file-x": (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M9.5 12.5l5 5M14.5 12.5l-5 5" />
    </>
  ),
  /** Supplies and orders — spend, purchasing. */
  cart: (
    <>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h3l2.6 11.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6" />
    </>
  ),
  /** A finished bundle to hand over — packages, ZIPs, archives. */
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
    </>
  ),
  /** Time away — out of office, time off, call-ins. */
  "calendar-off": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M10 13.5l4 4M14 13.5l-4 4" />
    </>
  ),
  /** Pay — payroll documents, pay statements. */
  banknote: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type TileIconName = keyof typeof GLYPHS;

/** Every glyph in the set, in declaration order (tests + showcases iterate it). */
export const TILE_ICON_NAMES = Object.keys(GLYPHS) as TileIconName[];

export function isTileIconName(value: string): value is TileIconName {
  return Object.hasOwn(GLYPHS, value);
}

export const TILE_ICON_CLASS = "shrink-0 text-brand-navy";

/** A locked tile keeps its glyph, muted, so the grid still scans by shape —
 *  the lock itself is said in words on the tile (DESIGN-CONVENTIONS §5). */
export const TILE_ICON_MUTED_CLASS = "shrink-0 text-zinc-400 dark:text-zinc-500";

export function TileIcon({
  name,
  size = 20,
  className = TILE_ICON_CLASS,
}: {
  name: TileIconName;
  /** Rendered width/height in px. Tiles use 20; keep it unless the title is larger. */
  size?: number;
  /** Replaces the default color/flex classes (no tailwind-merge — pass the whole set). */
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-tile-icon={name}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {GLYPHS[name]}
    </svg>
  );
}
