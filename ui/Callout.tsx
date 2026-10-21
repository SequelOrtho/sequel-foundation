import type { ReactNode } from "react";

// Semantic message box. Replaces ad-hoc `text-red-600` error <div>s and
// hand-rolled amber banners with one toned component. Tone carries an icon +
// (optional) title so meaning never rides on color alone — same accessibility
// stance as StatusBadges. Danger uses role="alert" so it is announced; the
// rest use role="status".

export type CalloutTone = "info" | "success" | "warning" | "danger";

const TONES: Record<CalloutTone, { box: string; icon: string }> = {
  info: {
    box: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
    icon: "ℹ️",
  },
  success: {
    box: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    icon: "✓",
  },
  warning: {
    box: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200",
    icon: "⚠️",
  },
  danger: {
    box: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    icon: "⚠️",
  },
};

export function Callout({
  tone = "info",
  title,
  className = "",
  children,
}: {
  tone?: CalloutTone;
  title?: string;
  className?: string;
  children?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${t.box} ${className}`.trim()}
    >
      <span aria-hidden className="leading-5">
        {t.icon}
      </span>
      {/* min-w-0 + break-words: a long URL or word wraps instead of pushing
          the box past a phone screen (UX audit 2026-10-21, FND-16). */}
      <div className="flex min-w-0 flex-col gap-0.5 break-words">
        {title && <strong className="font-semibold">{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
