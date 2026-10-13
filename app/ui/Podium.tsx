"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { MotionConfig, motion, useInView, useReducedMotion } from "motion/react";
import { cx } from "./cx";
import { EASE_BOARD } from "./motion";
import "./arena.css";

export type PodiumItem = {
  /** Stable React key (e.g. the holding id or symbol). */
  key: string;
  /** What stands on the block, e.g. a <CompanyLogo> (without linkToLookup
   *  when the spot has an href — no button inside a link). */
  top: ReactNode;
  /** The name over its head, e.g. "NVDA". */
  label: ReactNode;
  /** A line under the label, e.g. a return or "held by Brandon". */
  sub?: ReactNode;
  /** Makes the whole spot a link. */
  href?: string;
  /** Accessible name for the link (defaults to its text: place, label, sub). */
  ariaLabel?: string;
};

export type PodiumProps = {
  /** In rank order (1st, 2nd, 3rd); 1–3 items, extras are ignored. */
  items: PodiumItem[];
  className?: string;
};

const PLACE = ["1st", "2nd", "3rd"] as const;
// The blocks grow out of the floor together (3rd a hair first). Then the
// drumroll: 3rd lands, then 2nd, and the winner last with the biggest bounce.
const RISE_AT = [0.1, 0.05, 0];
const POP_AT = [0.66, 0.5, 0.34];

/**
 * The best-picks podium (DESIGN §3): three chunky blocks arranged 2 · 1 · 3
 * with medal trims and big extruded rank numerals. When it scrolls into
 * view the blocks spring up and each item drops onto its block, winner last.
 * Screen readers get the list in rank order ("1st place: …").
 */
export function Podium({ items, className }: PodiumProps) {
  const ref = useRef<HTMLOListElement>(null);
  const shown = useInView(ref, { once: true, amount: 0.35 });
  const reduce = useReducedMotion() ?? false;
  const spots = items.slice(0, 3);
  if (spots.length === 0) return null;

  return (
    <MotionConfig reducedMotion="user">
      <ol
        ref={ref}
        className={cx("arena-podium", className)}
        data-count={spots.length}
      >
        {spots.map((item, index) => (
          <Spot key={item.key} item={item} index={index} shown={shown} reduce={reduce} />
        ))}
      </ol>
    </MotionConfig>
  );
}

function Spot({
  item,
  index,
  shown,
  reduce,
}: {
  item: PodiumItem;
  index: number;
  shown: boolean;
  reduce: boolean;
}) {
  const place = index + 1;
  // Reduced motion: no choreography, everything simply fades in together.
  const at = (seconds: number) => (reduce ? 0 : seconds);

  const body = (
    <>
      <span className="sr-only">{PLACE[index]} place: </span>
      <motion.span
        className="arena-podium__head"
        initial={{ opacity: 0, y: 8 }}
        animate={shown ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.35, ease: EASE_BOARD, delay: at(POP_AT[index] + 0.14) }}
      >
        <span className="arena-podium__label">{item.label}</span>
        {item.sub != null ? <span className="arena-podium__sub">{item.sub}</span> : null}
      </motion.span>
      <motion.span
        className="arena-podium__top"
        initial={{ opacity: 0, y: -56, scale: 0.5 }}
        animate={shown ? { opacity: 1, y: 0, scale: 1 } : undefined}
        transition={{
          type: "spring",
          stiffness: 420,
          damping: index === 0 ? 11 : 14,
          delay: at(POP_AT[index]),
          opacity: { duration: 0.15, delay: at(POP_AT[index]) },
        }}
      >
        <span className="arena-podium__hop">{item.top}</span>
      </motion.span>
      <motion.span
        aria-hidden
        className="arena-podium__rise"
        style={{ originY: 1 }}
        initial={{ scaleY: 0 }}
        animate={shown ? { scaleY: 1 } : undefined}
        transition={{ type: "spring", stiffness: 300, damping: 17, delay: at(RISE_AT[index]) }}
      >
        <span className="arena-podium__block">
          <span className="arena-podium__num">{place}</span>
        </span>
      </motion.span>
    </>
  );

  return (
    <li className="arena-podium__spot" data-place={place}>
      {item.href ? (
        <Link href={item.href} aria-label={item.ariaLabel} className="arena-podium__hit">
          {body}
        </Link>
      ) : (
        <div className="arena-podium__hit">{body}</div>
      )}
    </li>
  );
}
