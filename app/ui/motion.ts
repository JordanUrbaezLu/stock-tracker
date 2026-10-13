/**
 * Motion tokens (DESIGN.md §1 Motion) for motion/react, which can't read CSS
 * variables. CSS animations use var(--ease-board) directly.
 */

/** Mirrors --ease-board. */
export const EASE_BOARD = [0.22, 1, 0.36, 1] as const;

/** The layout spring: things sliding to a new place (segmented thumb, race
 *  runners, nav pills). */
export const SPRING = { type: "spring", stiffness: 320, damping: 28 } as const;

/** The pop spring: objects landing with a bounce (menus, sheets, medals,
 *  the icon swap in a toggle). Opacity should ride a plain ease beside it. */
export const POP = { type: "spring", stiffness: 420, damping: 18 } as const;

/** Seconds, in motion/react units. */
export const DURATION = { micro: 0.15, ui: 0.25, entrance: 0.6 } as const;

/**
 * The load choreography, in seconds after the hero mounts. The flaps settle
 * left → right inside ~1s; each later beat starts while the previous one is
 * finishing, so the page reads as one motion rather than a queue.
 */
export const BEATS = {
  /** Delta lines under the flap value rise in. */
  deltas: 0.55,
  /** The hero chart draws itself (pass `BEATS.chart * 1000` to Sparkline `delay`). */
  chart: 0.7,
  /** The first hall card (check-in ticket) stamps in. */
  ticket: 0.85,
  /** Ranked rows start flipping down, one after another. */
  rows: 1,
} as const;
