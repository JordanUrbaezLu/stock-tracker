"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { FlapDisplay } from "./FlapDisplay";

export type ListRowProps = {
  /** Navigates when set (Next Link); otherwise a button if onClick, else a plain row. */
  href?: string;
  onClick?: () => void;
  /** Left cluster: RankMarker, Avatar, CompanyLogo… */
  lead?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned metric block. */
  trail?: ReactNode;
  /** Full-width line under the row, e.g. a slim ProgressBar. */
  footer?: ReactNode;
  /** Marks the viewer's own row. */
  highlight?: boolean;
  ariaLabel?: string;
  className?: string;
};

/**
 * The shared ranked-list row (standings, top holdings, the stock leaderboard)
 * so every list in the app has the same height, hit area, and hover.
 */
export function ListRow({
  href,
  onClick,
  lead,
  title,
  subtitle,
  trail,
  footer,
  highlight = false,
  ariaLabel,
  className = "",
}: ListRowProps) {
  const interactive = Boolean(href || onClick);
  // One hover per state: the viewer's row keeps its amber tint (with an
  // amber edge, so "you" reads at a glance) and deepens it.
  const classes = cx(
    "group relative flex min-h-14 w-full flex-col justify-center gap-2 rounded-2xl px-3 py-2.5 text-left transition-colors duration-150",
    highlight && "bg-amber-soft shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--amber-bright)_70%,transparent)]",
    interactive &&
      (highlight
        ? "cursor-pointer hover:bg-amber-bright/30 active:bg-amber-bright/40"
        : "cursor-pointer hover:bg-surface-2 active:bg-surface-3"),
    className,
  );

  const body = (
    <>
      <span className="flex items-center gap-3">
        {lead}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base leading-snug font-bold text-ink">
            {title}
          </span>
          {subtitle ? (
            <span className="block truncate text-[14px] leading-snug text-muted">{subtitle}</span>
          ) : null}
        </span>
        {trail ? <span className="shrink-0 text-right">{trail}</span> : null}
      </span>
      {footer ? <span className="block">{footer}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} aria-label={ariaLabel} className={classes}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} className={classes}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}

/**
 * Rank marker for ranked lists: the podium (1–3) gets small flap tiles — #1
 * in amber — and everyone else a plain number, so the top of every board
 * reads like the board itself.
 */
export function RankMarker({
  rank,
  animate = true,
  delay = 0,
}: {
  rank: number;
  animate?: boolean;
  delay?: number;
}) {
  if (rank >= 1 && rank <= 3) {
    return (
      <span className="grid w-8 shrink-0 place-items-center">
        {/* 22px: between the sm and md steps, sized to sit beside a 32px avatar. */}
        <FlapDisplay
          value={String(rank)}
          size="sm"
          tone={rank === 1 ? "amber" : "ink"}
          animate={animate}
          delay={delay}
          label={`Rank ${rank}`}
          className="[--flap-size:22px]"
        />
      </span>
    );
  }
  return (
    <span className="type-display grid w-8 shrink-0 place-items-center text-[19px] text-muted">
      <span className="sr-only">Rank </span>
      {rank}
    </span>
  );
}
