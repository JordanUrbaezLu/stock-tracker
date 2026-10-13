"use client";

import type { ReactNode } from "react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { EASE_BOARD } from "./motion";

/*
 * Entrance helpers for the load choreography (DESIGN.md §1 Motion; delays in
 * BEATS from ./motion). Each sets reducedMotion="user" itself, so outside
 * AppShell too, reduced motion skips the transform and keeps a short fade —
 * with no delay, since nothing is left to choreograph.
 * The wrapper element is the motion element: put layout classes on it.
 */

type Tag = "div" | "span" | "li" | "section" | "article";

const TAGS = {
  div: motion.div,
  span: motion.span,
  li: motion.li,
  section: motion.section,
  article: motion.article,
} as const;

export type RevealProps = {
  children?: ReactNode;
  /** Seconds before it starts (see BEATS). */
  delay?: number;
  /** Element to render (default "div"). */
  as?: Tag;
  className?: string;
  id?: string;
};

/** Fades in while rising 12px: delta lines, secondary hero content. */
export function Rise({ children, delay = 0, as = "div", className, id }: RevealProps) {
  const M = TAGS[as] as typeof motion.div;
  const reduce = useReducedMotion();
  return (
    <MotionConfig reducedMotion="user">
      <M
        id={id}
        className={className}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0.25 : 0.6, ease: EASE_BOARD, delay: reduce ? 0 : delay }}
      >
        {children}
      </M>
    </MotionConfig>
  );
}

export type FlipInProps = RevealProps & {
  /** Position in the list; each step adds `stagger`. */
  index?: number;
  /** Seconds between rows (default 0.06). */
  stagger?: number;
};

/**
 * A row flipping down into place like a board line updating: hinged at its
 * top edge, it falls toward the viewer and knocks once against its stop.
 */
export function FlipIn({
  children,
  index = 0,
  stagger = 0.06,
  delay = 0,
  as = "div",
  className,
  id,
}: FlipInProps) {
  const M = TAGS[as] as typeof motion.div;
  const at = useReducedMotion() ? 0 : delay + index * stagger;
  return (
    <MotionConfig reducedMotion="user">
      <M
        id={id}
        className={className}
        style={{ transformPerspective: 900, originY: 0 }}
        initial={{ opacity: 0, rotateX: 78 }}
        animate={{ opacity: 1, rotateX: 0 }}
        transition={{
          rotateX: { type: "spring", stiffness: 260, damping: 17, delay: at },
          opacity: { duration: 0.2, delay: at },
        }}
      >
        {children}
      </M>
    </MotionConfig>
  );
}

/** Presses into place like a rubber stamp: the check-in ticket's entrance. */
export function StampIn({ children, delay = 0, as = "div", className, id }: RevealProps) {
  const M = TAGS[as] as typeof motion.div;
  const at = useReducedMotion() ? 0 : delay;
  const press = { type: "spring", stiffness: 420, damping: 20, delay: at } as const;
  return (
    <MotionConfig reducedMotion="user">
      <M
        id={id}
        className={className}
        initial={{ opacity: 0, scale: 1.05, rotate: -0.8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ scale: press, rotate: press, opacity: { duration: 0.18, delay: at } }}
      >
        {children}
      </M>
    </MotionConfig>
  );
}
