import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

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
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-sm",
  md: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-11 px-5 py-2.5 text-base",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-600",
  secondary: "bg-brand-navy text-white hover:bg-brand-navy-muted",
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
  danger: "bg-brand-danger text-white hover:bg-red-700",
};

export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = "primary", size = "md", className = "" } = opts ?? {};
  return [BASE, SIZES[size], VARIANTS[variant], className].filter(Boolean).join(" ");
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
    // Disables the control and swaps the label so callers don't re-implement
    // the spinner-text dance.
    busy?: boolean;
    busyLabel?: string;
  };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    href: string;
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
