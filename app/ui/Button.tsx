"use client";

import Link from "next/link";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./cx";
import "./primitives.css";

export type ButtonVariant =
  | "primary"
  | "ink"
  | "secondary"
  | "ghost"
  | "danger"
  | "gain"
  | "amber";
export type ButtonSize = "sm" | "md" | "lg";

// The look of each key lives in primitives.css (.ui-key[data-variant]).
// "amber" is the v1 name of today's primary key, kept as an alias.
const KEY: Record<ButtonVariant, string> = {
  primary: "primary",
  amber: "primary",
  ink: "ink",
  secondary: "secondary",
  ghost: "ghost",
  danger: "danger",
  gain: "gain",
};

const SIZE: Record<ButtonSize, string> = {
  // 40px face on a 3px lip; a centered 44px ::before strip is the real hit
  // area. Sized explicitly (not negative insets) because insets resolve
  // against the padding box, so a bordered variant would come up 2px short.
  sm: "h-10 gap-1.5 px-4 text-[14px] [--key-lip-size:3px] [&_svg]:size-4 before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
  md: "h-12 gap-2 px-5 text-base [&_svg]:size-5",
  lg: "h-14 gap-2.5 px-7 text-base [&_svg]:size-[22px]",
};

const BASE =
  "ui-key relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-2xl font-bold leading-none";

type ButtonLookProps = {
  /** Default "primary" (the amber key). */
  variant?: ButtonVariant;
  /** sm 40px (44px hit area) · md 48px (default) · lg 56px. */
  size?: ButtonSize;
  /** Leading icon; sized by the button (16/20/22px). */
  icon?: ReactNode;
  /** Trailing icon (e.g. an arrow). */
  iconRight?: ReactNode;
  fullWidth?: boolean;
};

function buttonClasses(
  size: ButtonSize,
  state: {
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    className?: string;
  },
) {
  return cx(
    BASE,
    SIZE[size],
    state.disabled ? "cursor-not-allowed" : state.loading ? "cursor-progress" : "cursor-pointer",
    state.fullWidth && "w-full",
    state.className,
  );
}

function ButtonContent({
  icon,
  iconRight,
  loading = false,
  children,
}: {
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      {/* Faded, not removed: the label keeps the button's width and stays
          in the accessibility tree as its name while the spinner shows. */}
      <span
        className={cx(
          "inline-flex items-center justify-center gap-[inherit] transition-opacity duration-150",
          loading && "opacity-0",
        )}
      >
        {icon}
        {children}
        {iconRight}
      </span>
      {loading && (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          {/* Spinning is the only signal that work is happening, so reduced
              motion slows it instead of stopping it. */}
          <span className="size-[1.1em] animate-spin rounded-full border-[2.5px] border-current border-r-transparent motion-reduce:animate-[spin_1.6s_linear_infinite]" />
        </span>
      )}
    </>
  );
}

export type ButtonProps = ComponentPropsWithRef<"button"> &
  ButtonLookProps & {
    /** Spinner in place of the label (width kept); sets aria-busy and
     *  swallows clicks — including form submits — until it clears. */
    loading?: boolean;
  };

/** A chunky key: sinks on press, lifts 2px on hover (hover devices only). */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  disabled = false,
  type = "button",
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-variant={KEY[variant]}
      data-live={!disabled && !loading ? "" : undefined}
      onClick={(e) => {
        // Busy buttons stay enabled so focus isn't dropped mid-save and the
        // label isn't dimmed like a disabled one.
        if (loading) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={buttonClasses(size, { disabled, loading, fullWidth, className })}
    >
      <ButtonContent icon={icon} iconRight={iconRight} loading={loading}>
        {children}
      </ButtonContent>
    </button>
  );
}

export type LinkButtonProps = Omit<ComponentPropsWithRef<typeof Link>, "children"> &
  ButtonLookProps & { children?: ReactNode };

/** A next/link styled as a Button (same variants and sizes). */
export function LinkButton({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  fullWidth = false,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      {...rest}
      data-variant={KEY[variant]}
      data-live=""
      className={buttonClasses(size, { fullWidth, className })}
    >
      <ButtonContent icon={icon} iconRight={iconRight}>
        {children}
      </ButtonContent>
    </Link>
  );
}

export type IconButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "aria-label" | "title"
> & {
  /** Accessible name — also the hover tooltip. */
  label: string;
  /** Default "ghost". */
  variant?: ButtonVariant;
  /** md 44px (default) · sm 36px visual inside a 44px hit area. */
  size?: "sm" | "md";
};

/** Round icon-only key; pass the icon as children (sized 20/18px). */
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  disabled = false,
  type = "button",
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-variant={KEY[variant]}
      data-live={!disabled ? "" : undefined}
      className={cx(
        "ui-key relative inline-grid shrink-0 select-none place-items-center rounded-full [--key-lip-size:3px]",
        size === "sm"
          ? "size-9 [&_svg]:size-[18px] before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2"
          : "size-11 [&_svg]:size-5",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      {children}
    </button>
  );
}
