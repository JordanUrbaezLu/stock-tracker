"use client";

import type { CSSProperties, ReactNode } from "react";
import { MotionConfig, motion } from "motion/react";
import { cx } from "./cx";
import "./arena.css";

export type StickerTone = "gold" | "green" | "blue" | "purple" | "rose" | "neutral";

export type StickerProps = {
  /** The art, e.g. "🚀". Ignored when locked. */
  emoji?: string;
  /** Alternative art (an icon or a short word); used when there's no emoji. */
  icon?: ReactNode;
  /** Visual diameter in px (default 44). The hit area is ≥44px either way. */
  size?: number;
  /** false = locked: the empty dashed slot with a "?" (default true). */
  earned?: boolean;
  /** Amber "NEW" starburst on the corner (earned stickers only). */
  isNew?: boolean;
  /** Pastel vinyl color (default "neutral" = white paper). */
  tone?: StickerTone;
  /** Any stable string (badge id, symbol…) → the same tilt and cut every
   *  render. Defaults to label, then emoji. */
  seed?: string;
  /** Accessible name (also the hover title). Without one the sticker is
   *  decorative (aria-hidden); always pass one with onClick. */
  label?: string;
  /** Makes it a button (≥44px hit area, hover wiggle, focus ring). */
  onClick?: () => void;
  /** Slap onto the page when it first scrolls into view (default true). */
  animate?: boolean;
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

/** Deterministic hand-cut look: tilt −10…10°, a slightly irregular round. */
function cutFor(seed: string) {
  const h = hashOf(seed);
  const tilt = ((h % 2001) / 100) - 10;
  // Four small radius wobbles (±4%) so each sticker is its own cut.
  const w = (shift: number) => ((h >>> shift) % 9) - 4;
  const shape = `${50 + w(3)}% ${50 - w(7)}% ${50 + w(11)}% ${50 - w(15)}% / ${50 - w(19)}% ${50 + w(23)}% ${50 - w(27)}% ${50 + w(5)}%`;
  // The slap overshoots away from the resting tilt, alternating by seed.
  const spin = h & 1 ? 18 : -18;
  return { tilt, shape, spin };
}

const SLAP = { type: "spring", stiffness: 520, damping: 15 } as const;

/**
 * A die-cut sticker (DESIGN §3): emoji on pastel vinyl, thick paper border,
 * gloss and a real contact shadow, tilted by its seed. Locked = an empty
 * dashed slot with a "?". Slaps on (scale 1.7 → 1 with a spin) the first
 * time it scrolls into view; reduced motion just fades it in.
 */
export function Sticker({
  emoji,
  icon,
  size = 44,
  earned = true,
  isNew = false,
  tone = "neutral",
  seed,
  label,
  onClick,
  animate = true,
  className,
}: StickerProps) {
  const { tilt, shape, spin } = cutFor(seed ?? label ?? emoji ?? "");
  // Locked slots are printed in the album, not stuck on: they never slap.
  // Reduced motion is left to MotionConfig ("user": the scale and spin are
  // skipped, the fade stays) so server and client render the same markup.
  const slap = animate && earned;
  const interactive = Boolean(onClick);

  const art = earned ? (
    emoji ? (
      <span className="arena-sticker__art">{emoji}</span>
    ) : (
      <span className="arena-sticker__art">{icon}</span>
    )
  ) : (
    <span className="arena-sticker__q">?</span>
  );

  const props = {
    className: cx("arena-sticker", className),
    "data-tone": tone,
    "data-locked": earned ? undefined : "",
    style: {
      "--st-size": `${size}px`,
      "--st-shape": earned ? shape : "50%",
      ...(slap ? null : { rotate: `${earned ? tilt : 0}deg` }),
    } as CSSProperties,
    title: label,
    // Waits at rest size (invisible) and starts the 1.7× only on entry: a
    // scaled-up sticker parked below the fold would widen the page.
    initial: slap ? { opacity: 0, scale: 1, rotate: tilt } : false,
    whileInView: slap
      ? { opacity: [0, 1], scale: [1.7, 1], rotate: [tilt + spin, tilt] }
      : undefined,
    viewport: { once: true, amount: 0.3 },
    transition: { ...SLAP, opacity: { duration: 0.12 } },
  } as const;

  const content = (
    <>
      <span className="arena-sticker__body">{art}</span>
      {isNew && earned ? (
        <span className="arena-sticker__new" aria-hidden>
          <span className="on-amber">New</span>
        </span>
      ) : null}
    </>
  );

  return (
    <MotionConfig reducedMotion="user">
      {interactive ? (
        <motion.button
          {...props}
          type="button"
          aria-label={label ?? (earned ? "Sticker" : "Locked sticker")}
          onClick={onClick}
        >
          {content}
        </motion.button>
      ) : (
        <motion.span
          {...props}
          role={label ? "img" : undefined}
          aria-label={label}
          aria-hidden={label ? undefined : true}
        >
          {content}
        </motion.span>
      )}
    </MotionConfig>
  );
}
