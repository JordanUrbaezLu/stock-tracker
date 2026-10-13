import type { ReactNode } from "react";
import { cx } from "./cx";
import "./primitives.css";

export type ChipTone = "neutral" | "ink" | "amber" | "gain" | "loss" | "new";
export type ChipSize = "xs" | "sm";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-surface-3 text-ink-2",
  // "You" / "Admin": a solid ink pill (on-ink flips with the context, so it
  // stays legible on the board and on jerseys too).
  ink: "bg-ink text-on-ink",
  amber: "bg-amber-soft text-amber",
  gain: "bg-gain-soft text-gain",
  loss: "bg-loss-soft text-loss",
  // Attention: the amber key color with dark ink in every context, on a
  // tiny lip. Wiggles in once when it appears.
  new: "ui-wiggle on-amber bg-amber-bright shadow-[0_2px_0_var(--amber-lip)]",
};

const SIZE: Record<ChipSize, string> = {
  xs: "h-6 gap-1 px-2 text-[12px] [&_svg]:size-3.5",
  sm: "h-7 gap-1.5 px-2.5 text-[13px] [&_svg]:size-4",
};

export type ChipProps = {
  /** Default "neutral". "ink" is the "You" tag. */
  tone?: ChipTone;
  /** xs = 24px (New · Sold · AI · You) · sm = 28px (default). */
  size?: ChipSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** Chunky pill label: New · Sold · Admin · AI · You · #2. */
export function Chip({
  tone = "neutral",
  size = "sm",
  icon,
  className,
  children,
}: ChipProps) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full leading-none font-bold",
        SIZE[size],
        TONE[tone],
        className,
      )}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}
