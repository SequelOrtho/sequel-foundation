// URL-backed tabs, the pure half (DESIGN-CONVENTIONS §5 "Tabs are URLs").
// Kept free of React and of "use client" so a server page can import the
// allow-list resolution directly: an export from a client module reaches
// the server as a client reference, not a value, and `allowed.includes(tab)`
// throws on the first `?tab=` deep link (Missed Punch Hub, Sep 2026).
//
//   const TABS = ["pending", "approved", "all"] as const;
//   const tab = pickTab(sp.tab, TABS, "pending");            // never the raw param
//   <Tabs basePath="/admin" defaultTab="pending" active={tab} tabs={[...]} />
//
// The default tab is the canonical bare URL: tabHref omits the param for it
// and stamps `?tab=<key>` for the others, so a link is deep-linkable, lands
// in history, and a raw value is never echoed into an href.

export type TabDef<T extends string = string> = {
  key: T;
  label: string;
  /** Rendered as a small pill after the label (a row count, an unread count). */
  count?: number;
  /** Override the computed href — for a tab bar whose links carry extra
   *  state the bar cannot compute (Project Hub stamps `?from=` per tab). */
  href?: string;
};

/**
 * Resolve a raw search param against a strict allow-list. Arrays, unknown
 * values and undefined all resolve to the fallback — the raw value is never
 * used further.
 */
export function pickTab<T extends string>(raw: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * The href for one tab: `basePath` for the default tab (the canonical bare
 * URL), `basePath?tab=<key>` otherwise. `opts.query` carries extra
 * allow-listed params to keep alongside (an origin `from`); undefined or
 * empty values are dropped. `opts.param` renames the key (`view`, `scope`).
 */
export function tabHref(
  basePath: string,
  key: string,
  defaultTab: string,
  opts: { param?: string; query?: Record<string, string | undefined> } = {},
): string {
  const param = opts.param ?? "tab";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (k !== param && v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  if (key !== defaultTab) parts.push(`${encodeURIComponent(param)}=${encodeURIComponent(key)}`);
  if (parts.length === 0) return basePath;
  return `${basePath}${basePath.includes("?") ? "&" : "?"}${parts.join("&")}`;
}

const TAB_BASE =
  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50";

/** Classes for one tab link — exported so a bespoke anchor can match the bar. */
export function tabClasses(selected: boolean, className = ""): string {
  return [
    TAB_BASE,
    selected ? "border-brand font-semibold text-brand" : "border-transparent text-brand-muted hover:text-brand",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export const TAB_COUNT_CLASS =
  "rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
