import Link from "next/link";
import type { ReactNode } from "react";
import { TileIcon, type TileIconName } from "./TileIcon";

// The area tile (DESIGN-CONVENTIONS §5 "Tiles carry an icon"): one card per
// area on a hub page — the Administration hub first. Icon + title on one line,
// a one-line description, and an optional footer carrying the area's current
// state (`status`) and, only when the area waits on the user, an `attention`
// line (⚠ glyph + words, never color alone). The whole card is the link.
//
// Render tiles inside <AreaTileGrid> so every hub's grid breaks the same way
// (1 → 2 → 3 columns) and equal-height cards line their footers up.
// Reference: Incident & Event Hub `app/admin/page.tsx`.

export const AREA_TILE_GRID_CLASS = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

export function areaTileClasses(emphasis = false): string {
  return [
    "group flex w-full flex-col rounded-xl border bg-white p-5 transition-shadow hover:shadow-md dark:bg-zinc-900",
    emphasis
      ? "border-brand hover:border-brand-navy"
      : "border-zinc-200 hover:border-brand-navy/40 dark:border-zinc-800",
  ].join(" ");
}

export function AreaTileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={className ? `${AREA_TILE_GRID_CLASS} ${className}` : AREA_TILE_GRID_CLASS}>{children}</ul>;
}

export function AreaTile({
  href,
  title,
  description,
  icon,
  status,
  attention,
  emphasis = false,
}: {
  href: string;
  /** Title Case (DESIGN-CONVENTIONS §7). */
  title: string;
  description: ReactNode;
  /** The area's glyph from the shared set — every tile on a hub carries one. */
  icon: TileIconName;
  /** Quiet footer line: the area's current state ("12 people mapped"). */
  status?: ReactNode;
  /** Shown only when the area waits on the user ("3 waiting for a role"). */
  attention?: ReactNode;
  /** The hub's primary area — brand border instead of the neutral one. */
  emphasis?: boolean;
}) {
  return (
    <li className="flex">
      <Link href={href} className={areaTileClasses(emphasis)}>
        <div className="flex items-center gap-2">
          <TileIcon name={icon} />
          <h2 className="font-semibold text-brand-navy group-hover:underline">{title}</h2>
        </div>
        <p className="mt-1 text-sm text-brand-muted">{description}</p>
        {(status != null || attention != null) && (
          <div className="mt-auto pt-3 text-xs">
            {attention != null && (
              <p className="mb-1 font-medium text-amber-800 dark:text-amber-300">
                <span aria-hidden="true">⚠ </span>
                {attention}
              </p>
            )}
            {status != null && <p className="text-brand-muted">{status}</p>}
          </div>
        )}
      </Link>
    </li>
  );
}
