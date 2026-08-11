import { CheckCircle } from "./StatusBadges";

// Compact, consistent save-state chip used across save surfaces:
//   Saving…  →  Unsaved changes  →  Saved · 2:14 PM
// icon + label so meaning never rides on colour alone (same stance as
// StatusBadges). Renders nothing in the initial untouched state.
export function SaveStateIndicator({
  saving,
  dirty = false,
  savedAt,
}: {
  saving: boolean;
  dirty?: boolean;
  savedAt: number | null;
}) {
  if (saving) {
    return <span className="text-xs text-brand-muted">Saving…</span>;
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-brand-warning">
        <span aria-hidden>●</span> Unsaved changes
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
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
