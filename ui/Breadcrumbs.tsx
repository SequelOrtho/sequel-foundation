import Link from "next/link";

// Shared breadcrumb trail for nested routes (UX P2 #12). Server-compatible, no
// state. The last item is the current page (no link, aria-current); earlier
// items link back up the hierarchy.

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-brand-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {c.href && !last ? (
                <Link href={c.href} className="text-brand hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-brand-navy" : undefined}>
                  {c.label}
                </span>
              )}
              {!last && <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
