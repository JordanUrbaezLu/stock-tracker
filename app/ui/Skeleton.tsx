import type { CSSProperties } from "react";

export type SkeletonProps = {
  /** Size it with utilities (h-4 w-24 …); rounded-xl unless you pass a
   *  rounded-* class. */
  className?: string;
  style?: CSSProperties;
};

/** Shimmer placeholder (global .skeleton; the shimmer stops under reduced
 *  motion). */
export function Skeleton({ className = "", style }: SkeletonProps) {
  const rounded = /(^|\s)rounded/.test(className) ? "" : " rounded-xl";
  return (
    <span
      aria-hidden
      className={`skeleton block${rounded} ${className}`.trim()}
      style={style}
    />
  );
}
