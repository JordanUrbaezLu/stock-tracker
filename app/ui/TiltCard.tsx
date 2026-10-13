"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useSound } from "../SoundContext";
import { cx } from "./cx";
import { IconRefresh } from "./icons";
import "./primitives.css";
import "./arena.css";

export type TiltFoil = "gold" | "silver" | "bronze" | "holo";
type Face = "front" | "back";

export type TiltCardProps = {
  /** The front face. Give it `h-full rounded-[inherit]` and its own
   *  background; the card supplies the radius, lip and shadow. */
  children: ReactNode;
  /** The back face (same box: the card takes the taller face's height).
   *  Without it there is nothing to flip and FlipButtons render nothing. */
  back?: ReactNode;
  /** Controlled flip state. Omit it to let the card keep its own. */
  flipped?: boolean;
  /** Called with the requested state whenever a FlipButton is pressed. */
  onFlip?: (next: boolean) => void;
  /** Objects stuck on the front (stickers slapped over its edge), drawn
   *  above the foil, trim and glare. Position them absolutely — the face is
   *  their containing block. They tilt and flip with the card. */
  decals?: ReactNode;
  /** Foil on the front face: a metal (or rainbow) trim plus a sheen that
   *  follows the pointer (default none). */
  foil?: TiltFoil | null;
  /** Pointer tilt on hover devices (default true). Touch never tilts. */
  tilt?: boolean;
  /** Corner radius in px (default 24). Faces expose it as `inherit`. */
  radius?: number;
  /** Color of the card's solid bottom lip (default the --lip token). Pass a
   *  darker jersey for a jersey card, e.g.
   *  `color-mix(in oklab, ${jersey} 70%, var(--board))`. */
  lip?: string;
  className?: string;
  style?: CSSProperties;
};

type CardCtx = {
  hasBack: boolean;
  toggle: (from: Face) => void;
  register: (face: Face, el: HTMLButtonElement | null) => void;
};

const CardContext = createContext<CardCtx | null>(null);
const FaceContext = createContext<Face>("front");

/** Degrees each way at the card's edges. */
const MAX_TILT = 8;

function hashOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tiltAllowed() {
  return (
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A holographic player card (DESIGN §3). On hover devices it tilts toward
 * the pointer (±8°, rAF-throttled CSS variables, eased back on leave) under a
 * foil sheen that tracks the light; on touch screens it never tilts — that
 * would fight carousel swipes and scrolling — and the foil sweeps a slow
 * shine every few seconds instead. With a `back`, a FlipButton on either
 * face turns the card over (rotateY with a little overshoot); reduced motion
 * swaps that for a quick crossfade and drops tilt and sweep.
 */
export function TiltCard({
  children,
  back,
  flipped: flippedProp,
  onFlip,
  decals,
  foil = null,
  tilt = true,
  radius = 24,
  lip,
  className,
  style,
}: TiltCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const point = useRef<{ x: number; y: number } | null>(null);
  const buttons = useRef<Record<Face, HTMLButtonElement | null>>({
    front: null,
    back: null,
  });
  const [ownFlipped, setOwnFlipped] = useState(false);
  const hasBack = back !== undefined && back !== null && back !== false;
  const flipped = hasBack && (flippedProp ?? ownFlipped);

  // Stagger the touch-screen sweeps so a grid of cards doesn't flash in sync.
  const id = useId();
  const sweepDelay = useMemo(() => 0.8 + (hashOf(id) % 50) / 10, [id]);

  useEffect(() => {
    const pending = frame;
    return () => cancelAnimationFrame(pending.current);
  }, []);

  const toggle = useCallback(
    (from: Face) => {
      const next = !flipped;
      // Commit synchronously so the other face is no longer inert, then hand
      // focus to its FlipButton — keyboard users stay on the control.
      flushSync(() => {
        if (flippedProp === undefined) setOwnFlipped(next);
        onFlip?.(next);
      });
      buttons.current[from === "front" ? "back" : "front"]?.focus({
        preventScroll: true,
      });
    },
    [flipped, flippedProp, onFlip],
  );

  const register = useCallback((face: Face, el: HTMLButtonElement | null) => {
    buttons.current[face] = el;
  }, []);

  const ctx = useMemo(() => ({ hasBack, toggle, register }), [hasBack, toggle, register]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!tilt || e.pointerType !== "mouse") return;
    point.current = { x: e.clientX, y: e.clientY };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = rootRef.current;
      const p = point.current;
      if (!el || !p || !tiltAllowed()) return;
      const r = el.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (p.x - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (p.y - r.top) / r.height));
      // The side under the pointer presses away, like a thumb on a card.
      el.style.setProperty("--tilt-rx", `${((0.5 - py) * 2 * MAX_TILT).toFixed(2)}deg`);
      el.style.setProperty("--tilt-ry", `${((px - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
      el.style.setProperty("--tilt-mx", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--tilt-my", `${(py * 100).toFixed(1)}%`);
      el.setAttribute("data-tilting", "");
    });
  };

  const onPointerLeave = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    point.current = null;
    const el = rootRef.current;
    if (!el) return;
    // Back to the stylesheet defaults; the transition eases it home.
    for (const v of ["--tilt-rx", "--tilt-ry", "--tilt-mx", "--tilt-my"]) {
      el.style.removeProperty(v);
    }
    el.removeAttribute("data-tilting");
  };

  const rootStyle = {
    "--tilt-r": `${radius}px`,
    "--tilt-sweep-delay": `${sweepDelay.toFixed(1)}s`,
    ...(lip ? { "--tilt-lip": lip } : null),
    ...style,
  } as CSSProperties;

  return (
    <CardContext.Provider value={ctx}>
      <div
        ref={rootRef}
        className={cx("arena-tilt", className)}
        style={rootStyle}
        data-flipped={flipped ? "" : undefined}
        data-foil={foil ?? undefined}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <div className="arena-tilt__body">
          <div className="arena-tilt__flipper">
            <div className="arena-tilt__face arena-tilt__face--front" inert={flipped}>
              <FaceContext.Provider value="front">{children}</FaceContext.Provider>
              {foil ? (
                <>
                  <span aria-hidden className="arena-tilt__foil" />
                  <span aria-hidden className="arena-tilt__trim" />
                </>
              ) : null}
              <span aria-hidden className="arena-tilt__glare" />
              {decals}
            </div>
            {hasBack ? (
              <div className="arena-tilt__face arena-tilt__face--back" inert={!flipped}>
                <FaceContext.Provider value="back">{back}</FaceContext.Provider>
                <span aria-hidden className="arena-tilt__glare" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </CardContext.Provider>
  );
}

export type FlipButtonProps = {
  className?: string;
};

/**
 * The flip key (↻) — place one on each face of a TiltCard that has a back.
 * Labelled "Flip card" on the front and "Flip back" on the back. A round
 * secondary key (40px face on a 3px lip, 44px hit area), so it reads on a
 * jersey front and a white back alike. Its click never reaches a link around
 * it; still, keep it out of links (put it beside the face's link — see the
 * player-card recipe). Renders nothing outside a flippable card.
 */
export function FlipButton({ className }: FlipButtonProps) {
  const card = useContext(CardContext);
  const face = useContext(FaceContext);
  const { play } = useSound();
  if (!card || !card.hasBack) return null;
  const label = face === "back" ? "Flip back" : "Flip card";
  return (
    <button
      ref={(el) => card.register(face, el)}
      type="button"
      aria-label={label}
      title={label}
      data-variant="secondary"
      data-live=""
      className={cx(
        "arena-flip ui-key relative inline-grid size-10 shrink-0 cursor-pointer place-items-center rounded-full [--key-lip-size:3px] before:absolute before:-inset-0.5 before:rounded-full",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        play("swipe");
        card.toggle(face);
      }}
    >
      <IconRefresh size={18} strokeWidth={2.25} />
    </button>
  );
}
