// "Skip to main content" — the first focusable thing on every page (UX audit
// 2026-10-21, FND-15; WCAG 2.4.1). Hidden until it takes keyboard focus, then
// shown at the top-left over the header. Pair it with
// `<main id={MAIN_CONTENT_ID} tabIndex={-1}>` in the root layout so the jump
// moves focus, not only the scroll position (DESIGN-CONVENTIONS §5).

export const MAIN_CONTENT_ID = "main";
export const SKIP_LINK_TEXT = "Skip to main content";

export function SkipLink({ target = MAIN_CONTENT_ID, children = SKIP_LINK_TEXT }: { target?: string; children?: string }) {
  return (
    <a
      href={`#${target}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-navy focus:shadow-lg focus:outline-2 focus:outline-brand dark:focus:bg-zinc-900 dark:focus:text-zinc-100"
    >
      {children}
    </a>
  );
}

/**
 * The root layout's `metadata.title`: "Page · App" on every page that sets a
 * title, the app name alone on one that doesn't (WCAG 2.4.2). Next fills `%s`.
 */
export function titleTemplate(appName: string): { default: string; template: string } {
  return { default: appName, template: `%s · ${appName}` };
}
