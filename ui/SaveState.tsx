import { CheckCircle } from "./StatusBadges";

// Compact, consistent save-state chip used across save surfaces:
//   Saving…  →  Unsaved changes  →  Saved · 2:14 PM
// icon + label so meaning never rides on color alone (same stance as
// StatusBadges). Shows nothing in the initial untouched state. The wrapper is
// a persistent polite live region so "Saved · 2:14 PM" is announced, not only
// shown (UX audit 2026-10-21, FND-14).
export function SaveStateIndicator(props: { saving: boolean; dirty?: boolean; savedAt: number | null }) {
  return (
    <span aria-live="polite" aria-atomic="true" className="inline-flex">
      <SaveStateText {...props} />
    </span>
  );
}

function SaveStateText({
  saving,
  dirty = false,
  savedAt,
}: {
  saving: boolean;
  dirty?: boolean;
  savedAt: number | null;
}) {
  if (saving) {
    return <span className="whitespace-nowrap text-xs text-brand-muted">Saving…</span>;
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-brand-warning">
        <span aria-hidden>●</span> Unsaved changes
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle /> Saved ·{" "}
        {new Date(savedAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
    );
  }
  return null;
}
