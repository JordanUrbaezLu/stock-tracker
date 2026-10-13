"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { SPRING } from "./motion";
import "./primitives.css";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Second line under the label (e.g. a timespan's return); color it in
   *  the caller — on the active (amber) tab the tokens deepen to stay
   *  legible. */
  sub?: ReactNode;
};

export type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** md: 44px options (default) · sm: 34px options inside a 44px hit area. */
  size?: "sm" | "md";
  /** Names the radiogroup for screen readers. */
  ariaLabel: string;
  /** Stretch to the container with equal-width options. */
  fullWidth?: boolean;
  className?: string;
};

const OPTION_SIZE = {
  md: "min-h-11 py-1.5 text-[15px]",
  // A centered 44px ::before strip reaches past the track: 44px hit area.
  sm: "min-h-[34px] py-1 text-[14px] before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
};

// Intrinsic-width options need side padding; equal-width (fullWidth) ones
// are centered in their share, so they keep just a sliver for long subs.
const OPTION_PAD = { md: "px-4", sm: "px-3.5" };

/** Chunky pill tabs: an amber thumb key slides along a sunken groove (a
 *  radiogroup). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
  fullWidth = false,
  className,
}: SegmentedProps<T>) {
  // One layoutId per instance so two controls on a page never trade thumbs.
  const thumbId = useId();
  const reduce = useReducedMotion();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);

  const select = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    optionRefs.current[index]?.focus();
  };

  // Radio-group keys: arrows move and select (wrapping), Home/End jump.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next == null) return;
    e.preventDefault();
    select(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx(
        // pb-1.5: room for the thumb's 3px lip inside the groove.
        "ui-seg relative isolate items-stretch gap-0.5 rounded-full border border-line bg-surface-2 px-1 pt-1 pb-1.5",
        fullWidth ? "flex w-full" : "inline-flex max-w-full",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const focusable = selected || (selectedIndex === -1 && index === 0);
        return (
          <button
            key={option.value}
            ref={(el) => {
              optionRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={focusable ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cx(
              "group relative flex cursor-pointer select-none flex-col items-center justify-center whitespace-nowrap rounded-full font-bold leading-none transition-colors duration-150",
              OPTION_SIZE[size],
              fullWidth ? "min-w-0 flex-1 basis-0 px-1.5" : OPTION_PAD[size],
              !selected && "text-muted hover:bg-surface-3/60 hover:text-ink",
            )}
          >
            {selected && (
              <motion.span
                layoutId={thumbId}
                aria-hidden
                className="ui-seg__thumb absolute inset-0 -z-10 rounded-full"
                style={{ borderRadius: 999 }}
                transition={reduce ? { duration: 0 } : SPRING}
              />
            )}
            {/* The labels (not the button) take the amber context, so the
                focus ring keeps the page's --focus color. */}
            <span
              className={cx(
                "relative transition-[translate] duration-150 ease-board motion-safe:group-active:translate-y-px",
                selected && "on-amber",
              )}
            >
              {option.label}
            </span>
            {option.sub != null && (
              <span
                className={cx(
                  "relative mt-1 text-[12px] font-bold tabular-nums",
                  selected && "on-amber",
                )}
              >
                {option.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
