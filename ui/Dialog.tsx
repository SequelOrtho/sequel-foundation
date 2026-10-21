"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// A modal dialog on the native <dialog> element (UX audit 2026-10-21, FND-18).
// showModal() gives the parts hand-rolled overlays kept missing: the rest of
// the page goes inert, Tab stays inside, Escape closes, and focus goes back
// to the button that opened it. The title names the dialog; the ✕ is a real
// labelled button. Render it with `open` from the parent's state and close it
// in `onClose` (Escape, ✕, a backdrop click, or your own Cancel).

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeOnBackdrop = true,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, right-aligned under the body. */
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  /** Extra classes on the panel — e.g. max-w-2xl for a wide dialog. */
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  // Where the last press started: a click whose press began inside the panel
  // (a text selection dragged out over the backdrop) is not a backdrop click.
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    const opener = document.activeElement as HTMLElement | null;
    if (typeof el.showModal === "function") {
      if (!el.open) el.showModal();
    } else {
      el.setAttribute("open", ""); // test environments without <dialog> support
    }
    return () => {
      if (typeof el.close === "function" && el.open) el.close();
      else el.removeAttribute("open");
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-desc` : undefined}
      onCancel={(e) => {
        e.preventDefault(); // the parent decides; it re-renders without `open`
        onCloseRef.current();
      }}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const fromBackdrop = pressedOnBackdrop.current;
        pressedOnBackdrop.current = false;
        if (closeOnBackdrop && fromBackdrop && e.target === e.currentTarget) onCloseRef.current();
      }}
      onClose={() => {
        // The browser closed it while the parent still has it open (Chrome lets
        // a second Escape through; a <form method="dialog"> closes it too). Tell
        // the parent, and if it keeps the dialog open, show it again so the
        // page and the parent's state never disagree.
        const el = ref.current;
        if (!el || el.open) return;
        onCloseRef.current();
        setTimeout(() => {
          if (el.isConnected && !el.open && typeof el.showModal === "function") el.showModal();
        }, 0);
      }}
      className={`m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-zinc-200 bg-white p-0 text-left text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${className}`.trim()}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-brand-navy dark:text-zinc-100">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onCloseRef.current()}
            className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-brand-muted hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
        {description && (
          <div id={`${id}-desc`} className="mt-1 text-sm text-brand-muted">
            {description}
          </div>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  );
}
