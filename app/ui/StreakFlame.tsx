import { cx } from "./cx";
import { IconFlame } from "./icons";
import "./primitives.css";

export type StreakFlameProps = {
  /** Icon size in px (default 24). */
  size?: number;
  /** Lit = amber with a slow flicker; unlit (streak at risk/broken) = faint
   *  and still. Default true. */
  lit?: boolean;
  className?: string;
};

/** The streak flame (decorative). Flicker is off under reduced motion. */
export function StreakFlame({ size = 24, lit = true, className }: StreakFlameProps) {
  return (
    <span aria-hidden className={cx("ui-flame", lit && "ui-flame--lit", className)}>
      <IconFlame size={size} fill="currentColor" strokeWidth={1.5} />
    </span>
  );
}
