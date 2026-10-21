"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME_STORAGE_KEY,
  THEME_MODE_HINT,
  THEME_MODE_LABEL,
  isThemeMode,
  nextThemeMode,
  resolveTheme,
  type ThemeMode,
} from "./theme";

// The Light / Dark / Browser switcher. Click cycles the mode; the stored mode
// is the source of truth and the <html data-theme> attribute is the resolved
// projection (kept live against browser-appearance changes while in system
// mode). Icon + label, never icon alone.
//
// Pass the app's storageKey (must match the key given to themeInitScript in
// the root layout) — e.g. "pi.theme" / "hub.theme" for the existing hubs.

function readMode(storageKey: string): ThemeMode {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(storageKey);
  return isThemeMode(raw) ? raw : "system";
}

let listeners: (() => void)[] = [];
const emit = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function apply(mode: ThemeMode) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(mode, systemDark);
}

const ICON: Record<ThemeMode, string> = { light: "☀️", dark: "🌙", system: "🖥️" };

// `compact`: "phone" (the default) shows the icon alone below the `sm`
// breakpoint, where the word pushed crowded headers past the screen (UX audit
// 2026-10-21, FND-17); `true` always icon-only, `false` always the word. The
// accessible name and tooltip always carry the mode.
export function ThemeToggle({
  storageKey = DEFAULT_THEME_STORAGE_KEY,
  compact = "phone",
}: {
  storageKey?: string;
  compact?: boolean | "phone";
}) {
  const mode = useSyncExternalStore(
    subscribe,
    () => readMode(storageKey),
    () => "system" as ThemeMode,
  );

  // Stamp the resolved theme on mount as well as on change. The inline
  // pre-hydration script normally does this first, but a page Next renders
  // in the browser — a `forbidden()` / `notFound()` thrown by a page with no
  // loading.tsx arrives as an empty shell — never runs that script, and the
  // 403/404 page then drew light components on a dark ground (v0.26.1).
  // Idempotent when the script did run. While in system mode, also follow
  // live browser-appearance changes.
  useEffect(() => {
    apply(readMode(storageKey));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readMode(storageKey) === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [storageKey]);

  const cycle = () => {
    const next = nextThemeMode(mode);
    window.localStorage.setItem(storageKey, next);
    apply(next);
    emit();
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${THEME_MODE_LABEL[mode]} (${THEME_MODE_HINT[mode]}) — click to switch`}
      aria-label={`Theme: ${THEME_MODE_LABEL[mode]}. ${THEME_MODE_HINT[mode]}. Activate to switch.`}
      className="flex min-h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:border-brand hover:text-brand dark:border-zinc-700 dark:text-zinc-300"
    >
      <span aria-hidden>{ICON[mode]}</span>
      <span aria-hidden className={compact === true ? "sr-only" : compact === "phone" ? "sr-only sm:not-sr-only" : undefined}>
        {THEME_MODE_LABEL[mode]}
      </span>
    </button>
  );
}
