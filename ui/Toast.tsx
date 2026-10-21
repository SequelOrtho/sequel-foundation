import type { ReactNode } from "react";
import Link from "next/link";
import type { ToastAction } from "./toast/store";

// Presentational toast chip. The orchestration layer (module-level store +
// auto-dismiss + the fixed bottom-right stack) lives in ./toast; keeping the
// chip pure means it stays unit-testable and the viewport just positions
// instances of it. An action is a next-step <Link> when it has an href and an
// in-place <button> (Undo) when it has a callback; both dismiss the toast.
//
// The chip carries no live-region role of its own: a region inserted already
// filled is often not read at all, so the ToastViewport keeps two persistent
// regions (polite for success / info, assertive for errors) and renders the
// chips inside them (UX audit 2026-10-21, FND-6).

export type ToastTone = "success" | "info" | "danger";

// Fills are fixed dark shades with white text in BOTH themes (≥ 4.5:1):
// emerald-700, the entity's ramp-800 (Sequel navy-muted, FVO dark green, ON
// navy) for info, red-700 for errors (FND-8).
const TONES: Record<ToastTone, { box: string; icon: string }> = {
  success: { box: "bg-emerald-700 text-white", icon: "✓" },
  info: { box: "bg-blue-800 text-white", icon: "ℹ️" },
  danger: { box: "bg-red-700 text-white", icon: "⚠️" },
};

const RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

const ACTION_CLASS = `ml-1 whitespace-nowrap font-semibold text-white underline underline-offset-2 hover:text-white/85 rounded-sm ${RING}`;

// 24 × 24 px target (WCAG 2.5.8) with a white ring that shows on every fill.
const DISMISS_CLASS = `ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-white/85 hover:text-white ${RING}`;

export function Toast({
  tone = "success",
  message,
  action,
  onActionClick,
  onDismiss,
}: {
  tone?: ToastTone;
  message: ReactNode;
  action?: ToastAction;
  onActionClick?: () => void;
  onDismiss?: () => void;
}) {
  const t = TONES[tone];
  return (
    <div
      data-tone={tone}
      className={`inline-flex max-w-md items-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-lg forced-colors:border forced-colors:border-[CanvasText] ${t.box}`}
    >
      <span aria-hidden>{t.icon}</span>
      <span className="min-w-0 break-words">{message}</span>
      {action &&
        (action.href !== undefined ? (
          <Link href={action.href} onClick={onActionClick} className={ACTION_CLASS}>
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              void action.onClick();
              onActionClick?.();
            }}
            className={ACTION_CLASS}
          >
            {action.label}
          </button>
        ))}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={DISMISS_CLASS}
        >
          <span aria-hidden>✕</span>
        </button>
      )}
    </div>
  );
}
