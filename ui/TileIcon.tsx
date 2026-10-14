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
} satisfies Record<string, ReactNode>;

export type TileIconName = keyof typeof GLYPHS;

/** Every glyph in the set, in declaration order (tests + showcases iterate it). */
export const TILE_ICON_NAMES = Object.keys(GLYPHS) as TileIconName[];

export function isTileIconName(value: string): value is TileIconName {
  return Object.hasOwn(GLYPHS, value);
}

export const TILE_ICON_CLASS = "shrink-0 text-brand-navy";

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
