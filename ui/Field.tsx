import type { ReactNode } from "react";

// Labeled form-control wrapper. Standardizes the label / required-marker / hint
// / error stack so dense editors stop re-implementing it inline. The control
// itself is passed as children — Field is layout + labeling, not an <input>, so
// it works for text inputs, selects, textareas, and grouped controls alike.
//
// Renders a wrapping <label>; for a single control this gives an implicit
// association. Keep one control per Field. Pass `id` (the control's id) to get
// an explicit association too, plus a stable error id the caller can point the
// control's aria-describedby at (`fieldErrorId(id)`).
//
// Label geometry is the hubs' native-field idiom, shared with AdaptiveSelect and
// SearchCombobox: a block wrapper, an INLINE label span (it sits in the
// container's inherited line box exactly like a hand-rolled
// `<label class="block"><span>…</span><input class="mt-0.5">`), and the control
// carrying `mt-0.5`; hint / error follow with `mt-1`. Field used to be a flex
// column with `gap-1`, which made its label a 16px line box (text-xs) next to
// ~21px inherited line boxes on the neighbouring pickers, so controls in one
// grid row landed ~5px apart (Project Hub, Onboard a Resource, 2026-09-10).
//
// Required-field convention (DESIGN-CONVENTIONS §3 "Required fields"): the
// label carries <RequiredMark/> (a danger-token asterisk, aria-hidden), the
// control itself carries `required` / aria-required so assistive tech announces
// it, and the form opens with <RequiredLegend/> explaining the asterisk.
// Errors appear on save under the field (<FieldError/>, role="alert") — never
// on the first keystroke.

export const REQUIRED_LEGEND_TEXT = "Required field";
export const ALL_REQUIRED_LEGEND_TEXT = "All fields are required";

/** The asterisk that marks a required label. Decorative for AT — the control's
 *  `required` / aria-required is what gets announced. */
export function RequiredMark({ className = "" }: { className?: string }) {
  return (
    <span className={`text-brand-danger ${className}`.trim()} aria-hidden="true">
      {" *"}
    </span>
  );
}

/** The one-line legend every form with a required field opens with. */
export function RequiredLegend({
  allRequired = false,
  className = "",
}: {
  allRequired?: boolean;
  className?: string;
}) {
  return (
    <p className={`text-xs text-brand-muted ${className}`.trim()}>
      {allRequired ? (
        ALL_REQUIRED_LEGEND_TEXT
      ) : (
        <>
          <span className="text-brand-danger" aria-hidden="true">
            *
          </span>{" "}
          {REQUIRED_LEGEND_TEXT}
        </>
      )}
    </p>
  );
}

export function fieldErrorId(id: string): string {
  return `${id}-error`;
}

/** Inline validation message under a control. Give it the id from
 *  fieldErrorId(controlId) and point the control's aria-describedby at it. */
export function FieldError({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span id={id} role="alert" className={`text-xs text-brand-danger ${className}`.trim()}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  required = false,
  id,
  className = "",
  labelClassName,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** The wrapped control's id — enables htmlFor and a stable error id. */
  id?: string;
  className?: string;
  /** Replaces the default label classes so a host form's label typography
   *  (uppercase, navy, …) carries through. */
  labelClassName?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className={`block ${className}`.trim()}>
      <span className={labelClassName ?? "text-zinc-600 dark:text-zinc-400"}>
        {label}
        {required && <RequiredMark />}
      </span>
      <span className="mt-0.5 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-brand-muted">{hint}</span>}
      {error && (
        <FieldError id={id ? fieldErrorId(id) : undefined} className="mt-1 block">
          {error}
        </FieldError>
      )}
    </label>
  );
}
