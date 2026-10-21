// A stoplight status that never rides on color alone (UX audit 2026-10-21,
// FND-20; DESIGN-CONVENTIONS §2 "Icon + label"): each level has its own glyph
// shape AND its word, and the colors are the theme's RYG text tokens, which
// meet 4.5:1 on their grounds (a bare yellow dot is 1.9:1 on white).

export type RygLevel = "green" | "yellow" | "red" | "none";

export const RYG_LABEL: Record<RygLevel, string> = {
  green: "On track",
  yellow: "At risk",
  red: "Off track",
  none: "Not reported",
};

// Distinct shapes: filled circle, triangle, square, hollow circle.
const GLYPH: Record<RygLevel, string> = { green: "●", yellow: "▲", red: "■", none: "○" };

const TONE: Record<RygLevel, string> = {
  green: "text-ryg-green-text",
  yellow: "text-ryg-yellow-text",
  red: "text-ryg-red-text",
  none: "text-brand-muted",
};

export function RygStatus({
  level,
  label,
  className = "",
}: {
  level: RygLevel;
  /** The word shown; defaults to RYG_LABEL[level]. Use the screen's own vocabulary ("Due soon", "Overdue"). */
  label?: string;
  className?: string;
}) {
  return (
    <span data-ryg={level} className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${TONE[level]} ${className}`.trim()}>
      <span aria-hidden className="text-[0.85em] leading-none">
        {GLYPH[level]}
      </span>
      {label ?? RYG_LABEL[level]}
    </span>
  );
}
