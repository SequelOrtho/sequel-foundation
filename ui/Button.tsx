import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";

// Shared button primitive — the merged canonical of the two hubs' Buttons.
// Variant vocabulary comes from Project Hub (blue primary, navy secondary, the
// chartreuse accent hand-off convention, outline/outlineBrand/danger) plus the
// Acquisition Hub's quiet `ghost`; mechanics come from the Acquisition Hub
// (polymorphic href → <Link>, `busy` state). Every variant carries a
// focus-visible ring and a minimum tap-target height (a11y).
//
// Migration note: the Acquisition Hub's old `secondary` (neutral border) maps
// to `outline` here; foundation `secondary` is the Project Hub navy solid.
//
// Two entry points because action affordances are a mix of <button>, <Link>,
// and <a download>: use `buttonClasses(...)` on bespoke anchors, and the
// `Button` component for buttons and internal links.

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "accent"
  | "outline"
  | "outlineBrand"
  | "ghost"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2";

// Disabled is a state of its own, the same in every variant: a neutral zinc
// ground, muted text and no hover change (v0.30.0). It used to be
// `disabled:opacity-50` over the variant's fill, which reads as disabled on a
// white page but not in dark mode: the solid fills turn light there, and half
// of a light blue over a near-black card is a mid blue with dark ink — the
// look of an enabled dark-mode button (hub walk-through 2026-10-21: Scheduler
// Save Changes / Apply, Project Hub Configuration Delete).
//
// Every rule is `disabled:not-aria-busy:` — `.x:disabled:not([aria-busy=true])`,
// specificity 0,3,0 — so it outranks the variants' hover and dark-mode rules
// (0,1,0 / 0,2,0) without depending on stylesheet order, and it leaves a busy
// button alone: `busy` disables the button too, but a busy button keeps its
// fill, dims a little and shows the progress cursor, so it reads as working,
// not as unavailable. In dark mode the ground is zinc-900, not the zinc-800 an
// outline or ghost button turns on hover, so a disabled button never looks
// like an enabled one under the pointer; a 1px zinc-700 outline drawn over
// the border line (`outline-1 -outline-offset-1`, no layout change) keeps a
// borderless solid button's box visible on a zinc-900 card. The label is
// ≥ 3:1 on the disabled ground in both themes (zinc-500 on zinc-100 ≈ 4.4:1,
// on zinc-900 ≈ 3.7:1; checked in tests/button-contrast.test.ts). The
// explicit dark:text pair also keeps theme.css's contrast rescue off the
// label.
export const BUTTON_DISABLED_CLASS =
  "disabled:not-aria-busy:cursor-not-allowed disabled:not-aria-busy:border-zinc-200 disabled:not-aria-busy:bg-zinc-100 disabled:not-aria-busy:text-zinc-500 dark:disabled:not-aria-busy:border-zinc-700 dark:disabled:not-aria-busy:bg-zinc-900 dark:disabled:not-aria-busy:text-zinc-500 dark:disabled:not-aria-busy:outline-1 dark:disabled:not-aria-busy:-outline-offset-1 dark:disabled:not-aria-busy:outline-zinc-700";

/** A busy button (`busy`) keeps its variant's look, dimmed, with the progress cursor. */
export const BUTTON_BUSY_CLASS = "aria-busy:cursor-progress aria-busy:opacity-80";

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-sm",
  md: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-11 px-5 py-2.5 text-base",
};

// Solid fills flip to light tokens in dark mode (brand #35b5e8, navy #c3c8f5,
// danger #f87171 for Sequel), so their label flips to dark ink there: white on
// those fills was 1.4–2.8:1 (UX audit 2026-10-21, FND-1). The explicit
// dark:text pair also opts out of theme.css's contrast rescue.
// tests/button-contrast.test.ts checks every solid variant ≥ 4.5:1 for all
// three entities in both themes.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-600 dark:text-zinc-900",
  secondary: "bg-brand-navy text-white hover:bg-brand-navy-muted dark:text-zinc-900",
  // Assign / hand-off workflows: the entity accent (SEQ chartreuse, FVO
  // yellow, ON lime). Dark ink on a bright fill reads in BOTH themes (the
  // token flips e.g. #cad400 → #d6e04a in dark mode; text stays zinc-900 —
  // never theme-inverted navy, which would wash out on lime). The explicit
  // dark:text pair opts out of theme.css's dark-mode contrast rescue, which
  // otherwise remaps an unpaired text-zinc-900 to near-white on the accent.
  accent:
    "bg-brand-accent text-zinc-900 dark:text-zinc-900 hover:bg-brand-accent-dark hover:text-zinc-900 dark:hover:text-zinc-900",
  outline:
    "border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
  // Download / secondary-link affordance — neutral border, brand text.
  outlineBrand:
    "border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-brand hover:border-brand hover:bg-brand-surface",
  ghost: "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
  danger: "bg-brand-danger text-white hover:bg-red-700 dark:text-zinc-900 dark:hover:bg-red-300",
};

export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = "primary", size = "md", className = "" } = opts ?? {};
  return [BASE, SIZES[size], VARIANTS[variant], BUTTON_DISABLED_CLASS, BUTTON_BUSY_CLASS, className].filter(Boolean).join(" ");
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
    /** React 19 passes ref as a prop; it lands on the <button> (useConfirmStep). */
    ref?: Ref<HTMLButtonElement>;
    // Disables the control and swaps the label so callers don't re-implement
    // the spinner-text dance.
    busy?: boolean;
    busyLabel?: string;
  };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    href: string;
    ref?: Ref<HTMLAnchorElement>;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  // `href !== undefined` narrows the union to the link variant (the button
  // variant types `href` as `undefined`).
  if ("href" in props && props.href !== undefined) {
    const { href, variant, size, className, children, ...rest } = props;
    return (
      <Link href={href} className={buttonClasses({ variant, size, className })} {...rest}>
        {children}
      </Link>
    );
  }

  const {
    variant,
    size,
    className,
    children,
    busy = false,
    busyLabel,
    disabled,
    type = "button",
    ...rest
  } = props;
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || busy}
      aria-busy={busy}
      {...rest}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
