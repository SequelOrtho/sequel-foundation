// Approved-state indicators. Pattern per design-system research (Carbon /
// Polaris / Atlassian / GOV.UK): a checkmark icon inside a filled green circle
// (the stepper completed-step idiom) plus a tinted chip with a past-tense text
// label — icon + label together, never color alone. Greens chosen for WCAG
// contrast: emerald-800 text on emerald-100 ≥ 4.5:1; the icon circle is
// decorative reinforcement (aria-hidden).
//
// Decoupled from any domain type: pass the approval timestamp directly.

export function CheckCircle() {
  return (
    <span
      aria-hidden
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[9px] font-bold leading-none"
    >
      ✓
    </span>
  );
}

export function ApprovedBadge({
  approvedAt,
  label = "Approved",
}: {
  approvedAt: string | number | Date;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
      <CheckCircle />
      {label} · {new Date(approvedAt).toLocaleDateString()}
    </span>
  );
}
