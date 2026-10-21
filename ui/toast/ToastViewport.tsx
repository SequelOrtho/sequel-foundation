"use client";

import { useEffect, useRef, useState } from "react";
import { Toast } from "../Toast";
import { UndoStrip } from "../UndoDelete";
import { dismissToast, useToasts, type ToastItem } from "./store";

// Single global toast stack, mounted once in the root layout. Each toast
// auto-dismisses after its ttl; the user can dismiss early. Fixed bottom-right,
// above app chrome. It also docks the Undo strip for a recent delete
// (DESIGN-CONVENTIONS §3) once that delete's Undo toast has gone.
//
// Screen readers (UX audit 2026-10-21, FND-6): the two live regions are always
// in the page — empty until a toast arrives — so each toast is announced when
// it is inserted. Errors go to the assertive region, everything else to the
// polite one.
//
// Timing (FND-7, WCAG 2.2.1): a toast's clock stops while the pointer is over
// it or keyboard focus is inside it, and resumes with the time it had left, so
// a keyboard user tabbing to "Next Pending Request →" never loses it mid-way.
export function ToastViewport() {
  const toasts = useToasts();
  const polite = toasts.filter((t) => t.tone !== "danger");
  const urgent = toasts.filter((t) => t.tone === "danger");
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      <div role="alert" aria-live="assertive" aria-atomic="false" className="flex flex-col items-end gap-2">
        {urgent.map((t) => (
          <AutoDismiss key={t.id} item={t} />
        ))}
      </div>
      <div role="status" aria-live="polite" aria-atomic="false" className="flex flex-col items-end gap-2">
        {polite.map((t) => (
          <AutoDismiss key={t.id} item={t} />
        ))}
      </div>
      <div className="pointer-events-auto">
        <UndoStrip hideWhileToastShows />
      </div>
    </div>
  );
}

function AutoDismiss({ item }: { item: ToastItem }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  // Time left on the clock; shrinks each time the toast is paused.
  const remaining = useRef(item.ttl);
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const h = setTimeout(() => dismissToast(item.id), remaining.current);
    return () => {
      clearTimeout(h);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [item.id, paused]);
  return (
    <div
      className="pointer-events-auto"
      data-paused={paused || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <Toast
        tone={item.tone}
        message={item.message}
        action={item.action}
        onActionClick={() => dismissToast(item.id)}
        onDismiss={() => dismissToast(item.id)}
      />
    </div>
  );
}
