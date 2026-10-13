"use client";

import type { CSSProperties, ReactNode } from "react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { cx } from "./cx";
import "./arena.css";

export type StampTone = "ink" | "amber" | "gain" | "loss";
export type StampSize = "sm" | "md" | "lg";
export type StampShape = "rect" | "round";

export type StampProps = {
  /** The verdict, e.g. "Checked in", "Sold", "Bullish" — printed in caps.
   *  A round stamp can carry an icon instead (it's sized to the type). */
  children: ReactNode;
  /** Ink color (default "ink"). Context-aware: brighter on the board. */
  tone?: StampTone;
  /** sm 12px · md 15px (default) · lg 26px type. A round stamp is 2.5× its
   *  type size across (30 · 38 · 65px). */
  size?: StampSize;
  /** "rect" (default): a double-ruled frame around a word. "round": a
   *  postmark — a double ring around a short word, a number or an icon
   *  (the ticket's day stamps). */
  shape?: StampShape;
  /** Resting angle in degrees (default −8). */
  rotate?: number;
  /** Slam onto the page when it first scrolls into view (default true). */
  animate?: boolean;
  /** Seconds to wait after it comes into view — stagger a row of stamps
   *  (default 0). Dropped under reduced motion, like every entrance. */
  delay?: number;
  className?: string;
};

function hashOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A rubber stamp (DESIGN §3): condensed caps in a double-ruled frame (or a
 * round postmark), inked with worn texture, at a jaunty angle. Slams down —
 * drops from 2.2× onto the page, squashes, and settles with a tiny shake and
 * an ink puff — the first time it scrolls into view. Reduced motion: it
 * simply fades in.
 */
export function Stamp({
  children,
  tone = "ink",
  size = "md",
  shape = "rect",
  rotate = -8,
  animate = true,
  delay = 0,
  className,
}: StampProps) {
  // Reduced motion is left to MotionConfig ("user": the drop, squash and
  // shake are skipped, the fade stays; the puff is hidden in CSS) so server
  // and client render the same markup. Only the timing reads the preference:
  // nothing is left to stagger, so the fade starts at once.
  const reduce = useReducedMotion();
  const wait = reduce ? 0 : delay;
  // Shift the wear masks per stamp so no two print alike.
  const h = hashOf(typeof children === "string" ? children : String(rotate));
  const style = {
    "--stamp-mx": `${-(h % 96)}px`,
    "--stamp-my": `${-((h >>> 8) % 96)}px`,
    ...(animate ? null : { rotate: `${rotate}deg` }),
  } as CSSProperties;

  return (
    <MotionConfig reducedMotion="user">
      <motion.span
        className={cx("arena-stamp", className)}
        data-tone={tone}
        data-size={size}
        data-shape={shape === "round" ? "round" : undefined}
        style={style}
        initial={animate ? "up" : false}
        whileInView={animate ? "down" : undefined}
        viewport={{ once: true, amount: 0.6 }}
        variants={{
          // Waits at rest size (invisible); the 2.2× starts on entry — a
          // scaled-up stamp parked below the fold would widen the page.
          up: { opacity: 0, scale: 1, rotate, x: 0 },
          down: {
            opacity: [0, 1, 1],
            scale: [2.2, 0.92, 1.03, 1],
            rotate: [rotate - 7, rotate + 1, rotate],
            x: [0, 0, -2, 1.5, -0.75, 0],
            transition: {
              opacity: { duration: 0.42, times: [0, 0.3, 1], delay: wait },
              // Accelerates onto the paper, squashes, rebounds.
              scale: {
                duration: 0.42,
                times: [0, 0.5, 0.76, 1],
                ease: ["easeIn", "easeOut", "easeInOut"],
                delay: wait,
              },
              rotate: { duration: 0.42, times: [0, 0.5, 1], ease: "easeOut", delay: wait },
              x: { duration: 0.5, times: [0, 0.44, 0.58, 0.72, 0.86, 1], delay: wait },
            },
          },
        }}
      >
        <span className="arena-stamp__ink">
          <span className="arena-stamp__text">{children}</span>
        </span>
        {animate ? (
          <motion.span
            aria-hidden
            className="arena-stamp__puff"
            variants={{
              up: { opacity: 0, scale: 1 },
              down: {
                opacity: [0, 0, 0.35, 0],
                scale: [1, 1, 1, 1.3],
                transition: { duration: 0.6, times: [0, 0.34, 0.38, 1], delay: wait },
              },
            }}
          />
        ) : null}
      </motion.span>
    </MotionConfig>
  );
}
