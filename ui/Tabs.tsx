import Link from "next/link";
import { TAB_COUNT_CLASS, tabClasses, tabHref, type TabDef } from "./tabs";

// The URL-backed tab bar (DESIGN-CONVENTIONS §5 "Tabs are URLs"). Server-
// compatible, no state: the active tab is whatever the page resolved from the
// query param through `pickTab`, every tab is a `<Link scroll={false}>` with
// `aria-current="page"` on the selected one, and the default tab links to the
// bare URL. Panels are the page's business — render the active one below (or
// keep every panel mounted and `hidden`, as Project Hub does).

export function Tabs<T extends string>({
  basePath,
  tabs,
  active,
  defaultTab,
  param = "tab",
  query,
  label = "Filter",
  className = "",
}: {
  /** The page's path (or path + fixed query) the tab param is appended to. */
  basePath: string;
  tabs: ReadonlyArray<TabDef<T>>;
  /** The resolved active key — from `pickTab`, never the raw param. */
  active: T;
  /** The tab that is the bare URL. */
  defaultTab: T;
  /** Query param name; `tab` unless the page already uses `view` / `scope`. */
  param?: string;
  /** Extra allow-listed params to keep on every tab link (an origin `from`). */
  query?: Record<string, string | undefined>;
  /** Accessible name of the bar — "Filter" for a list, "Sections" for a detail page. */
  label?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={`flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800 ${className}`.trim()}
      data-no-print
    >
      {tabs.map((t) => {
        const current = t.key === active;
        const href = t.href ?? tabHref(basePath, t.key, defaultTab, { param, query });
        return (
          <Link key={t.key} href={href} scroll={false} aria-current={current ? "page" : undefined} className={tabClasses(current)}>
            {t.label}
            {typeof t.count === "number" && (
              <>
                <span className="sr-only">, </span>
                <span className={TAB_COUNT_CLASS}>{t.count}</span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
