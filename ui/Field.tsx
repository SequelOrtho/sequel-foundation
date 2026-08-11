import type { ReactNode } from "react";

// Labeled form-control wrapper. Standardizes the label / required-marker / hint
// / error stack so dense editors stop re-implementing it inline. The control
// itself is passed as children — Field is layout + labeling, not an <input>, so
// it works for text inputs, selects, textareas, and grouped controls alike.
//
// Renders a wrapping <label>; for a single control this gives an implicit
// association. Keep one control per Field.

export function Field({
  label,
  hint,
  error,
  required = false,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`.trim()}>
      <span className="text-zinc-600 dark:text-zinc-400">
        {label}
        {required && (
          <span className="text-brand-danger" aria-hidden>
            {" *"}
          </span>
        )}
      </span>
      {children}
      {hint && <span className="text-xs text-brand-muted">{hint}</span>}
      {error && (
        <span role="alert" className="text-xs text-brand-danger">
          {error}
        </span>
      )}
    </label>
  );
}
