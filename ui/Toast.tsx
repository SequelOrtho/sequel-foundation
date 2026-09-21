import type { ReactNode } from "react";
import Link from "next/link";
import type { ToastAction } from "./toast/store";

// Presentational toast chip. The orchestration layer (module-level store +
// auto-dismiss + the fixed bottom-right stack) lives in ./toast; keeping the
// chip pure means it stays unit-testable and the viewport just positions
// instances of it. An action is a next-step <Link> when it has an href and an
// in-place <button> (Undo) when it has a callback; both dismiss the toast.

export type ToastTone = "success" | "info" | "danger";

const TONES: Record<ToastTone, { box: string; icon: string }> = {
  success: { box: "bg-emerald-600 text-white", icon: "✓" },
  info: { box: "bg-brand text-white", icon: "ℹ️" },
  danger: { box: "bg-red-600 text-white", icon: "⚠️" },
};

const ACTION_CLASS =
  "ml-1 whitespace-nowrap font-semibold text-white underline underline-offset-2 hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-sm";

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
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-lg ${t.box}`}
    >
      <span aria-hidden>{t.icon}</span>
      <span>{message}</span>
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
          className="ml-1 text-white/80 hover:text-white"
        >
          ✕
        </button>
      )}
    </div>
  );
}
