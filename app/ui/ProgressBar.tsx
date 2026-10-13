"use client";

import { motion, useReducedMotion } from "motion/react";
import { cx } from "./cx";
import { EASE_BOARD } from "./motion";
import "./primitives.css";

export type ProgressTone =
  | "amber"
  | "gain"
  | "loss"
  | "ink"
  | "pink"
  | "blue"
  | "violet"
  | "lime";
export type ProgressSize = "sm" | "md" | "lg";

const FILL: Record<ProgressTone, string> = {
  amber: "bg-amber-bright",
  gain: "bg-gain",
  loss: "bg-loss",
  ink: "bg-ink",
  pink: "bg-pop-pink",
  blue: "bg-pop-blue",
  violet: "bg-pop-violet",
  lime: "bg-pop-lime",
};

// md and lg are the chunky bars: a sunken groove with a glossy fill.
const SIZE: Record<ProgressSize, string> = {
  sm: "h-1.5",
  md: "ui-progress--chunky h-2.5",
  lg: "ui-progress--chunky h-3.5",
};

export type ProgressBarProps = {
  /** 0..1 (clamped). */
  value: number;
  /** Default "amber". pink/blue/violet/lime are the fun pops (sticker book,
   *  race lanes). */
  tone?: ProgressTone;
  /** sm 6px slim · md 10px chunky (default) · lg 14px chunky. */
  size?: ProgressSize;
  /** aria-label, e.g. "Progress to $250". */
  label?: string;
  /** Fill sweeps in from empty on mount (default true). Later value changes
   *  always glide. */
  animate?: boolean;
  /** Candy stripes marching along the fill (static under reduced motion). */
  stripes?: boolean;
  className?: string;
};

export function ProgressBar({
  value,
  tone = "amber",
  size = "md",
  label,
  animate = true,
  stripes = false,
  className,
}: ProgressBarProps) {
  const reduce = useReducedMotion();
  const pct = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) * 100 : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cx(
        "relative w-full overflow-hidden rounded-full bg-surface-3",
        SIZE[size],
        className,
      )}
    >
      {/* A full-width bar slid left (not scaled) so its rounded leading edge
          never squashes, and the track's clip rounds the tail. */}
      <motion.div
        className={cx("ui-progress__fill h-full w-full rounded-full", FILL[tone])}
        data-stripes={stripes ? "" : undefined}
        initial={animate ? { x: "-100%" } : false}
        animate={{ x: `${pct - 100}%` }}
        transition={reduce ? { duration: 0 } : { duration: 0.9, ease: EASE_BOARD }}
      />
    </div>
  );
}
