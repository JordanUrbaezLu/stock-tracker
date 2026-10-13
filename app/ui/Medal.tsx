import type { CSSProperties } from "react";
import { cx } from "./cx";
import type { TiltFoil } from "./TiltCard";
import "./arena.css";

/*
 * No "use client": Medal, medalFor and foilFor work in server and client
 * components alike.
 */

export type Metal = "gold" | "silver" | "bronze";

/** 1st gold · 2nd silver · 3rd bronze · everyone else null. */
export function medalFor(rank: number): Metal | null {
  return rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : null;
}

/** A player card's foil (DESIGN: foil by rank). Off the podium, the viewer's
 *  own card still shines holo — everyone gets a shiny card of their own;
 *  the rest are plain card stock (null). */
export function foilFor(rank: number, isViewer = false): TiltFoil | null {
  return medalFor(rank) ?? (isViewer ? "holo" : null);
}

export type MedalProps = {
  /** 1–3 are metal coins; any other rank is a plain token coin. */
  rank: number;
  /** Diameter in px (default 36). */
  size?: number;
  className?: string;
};

/**
 * A rank medal: a struck coin with the place number on it, resting on a
 * solid lip like every arena object. Gold/silver/bronze for the podium
 * (same metals as Podium); a plain coin in the context's tokens otherwise,
 * so it reads on the hall, the board and a jersey. Announced as "Rank N".
 */
export function Medal({ rank, size = 36, className }: MedalProps) {
  return (
    <span
      role="img"
      aria-label={`Rank ${rank}`}
      data-metal={medalFor(rank) ?? undefined}
      className={cx("arena-medal", className)}
      style={{ "--medal-size": `${size}px` } as CSSProperties}
    >
      <span aria-hidden className="arena-medal__num">
        {rank}
      </span>
    </span>
  );
}
