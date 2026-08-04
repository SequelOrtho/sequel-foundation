"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { iconButtonClasses, type IconButtonTone } from "./icon-button-classes";

// A bare icon control — a remove ✕, a collapse chevron — with the parts that
// keep getting dropped when one is hand-rolled:
//
//   - a 36x36 hit area (DESIGN-CONVENTIONS §1 touch target) even when the glyph
//     inside is 12px
//   - the same focus-visible ring as Button, so keyboard users can see it
//   - a REQUIRED aria-label, because the accessible name of "✕" is "✕"
//
// The six hand-rolled copies this replaces had drifted across all three: two
// used rounded-md and four had no radius, three used text-zinc-400 and three
// text-zinc-500, and not one of them had a focus ring.
//
// For anything with a text label, use Button — this is only for glyph-only
// controls. Class logic lives in icon-button-classes.ts so the node test suite
// can reach it.

export { iconButtonClasses };
export type { IconButtonTone };

export function IconButton({
  label,
  tone = "neutral",
  className = "",
  children,
  type = "button",
  ...rest
}: {
  /** Accessible name — required. Describe the action ("Remove Acme Ortho"), not the glyph. */
  label: string;
  tone?: IconButtonTone;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "className" | "children">) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      className={iconButtonClasses(tone, className)}
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}
