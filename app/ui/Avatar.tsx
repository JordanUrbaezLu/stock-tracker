import type { CSSProperties } from "react";
import { initials, jerseyColor } from "../avatar";
import { cx } from "./cx";
import "./primitives.css";

export type AvatarProps = {
  name: string;
  /** Pixel size of the square tile (default 40). Under 20px it renders as a
   *  plain jersey swatch — initials that small are noise. */
  size?: number;
  /** 2.5px amber ring with a gap — "this is you" / the pinned investor. */
  highlight?: boolean;
  /** 2px white sticker ring, for avatars on colored or dark backgrounds
   *  (jerseys, the board, overlapping stacks). */
  ring?: boolean;
  className?: string;
  /** Makes the avatar meaningful (role="img" + tooltip). Omit when the name
   *  is printed next to it — it's decorative then. */
  title?: string;
};

/**
 * The investor's "jersey": a flat team color with condensed heavy initials,
 * a soft top sheen and a molded bottom edge (styles in primitives.css).
 */
export function Avatar({
  name,
  size = 40,
  highlight = false,
  ring = false,
  className,
  title,
}: AvatarProps) {
  return (
    <span
      className={cx(
        "ui-jersey type-display inline-grid shrink-0 select-none place-items-center",
        className,
      )}
      data-highlight={highlight ? "" : undefined}
      data-ring={ring ? "" : undefined}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
      style={
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          backgroundColor: jerseyColor(name),
          // Jersey colors are picked for white initials (all ≥3.6:1).
          color: "#fff",
          fontSize: Math.round(size * 0.42),
          letterSpacing: "0.01em",
          // The molded edge scales with the tile: 1px on swatches, 3px on
          // big player-card avatars.
          "--jersey-edge": `${Math.min(3, Math.max(1, Math.round(size / 22)))}px`,
        } as CSSProperties
      }
    >
      {size >= 20 ? initials(name) : null}
    </span>
  );
}
