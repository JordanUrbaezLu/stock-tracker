import { Children, Fragment, type CSSProperties, type ReactNode } from "react";
import { cx } from "./cx";
import "./primitives.css";

export type StatTone = "default" | "gain" | "loss" | "amber";
export type StatSize = "sm" | "md" | "lg";

const TONE: Record<StatTone, string> = {
  default: "text-ink",
  gain: "text-gain",
  loss: "text-loss",
  amber: "text-amber",
};

// Phone → ≥768 → ≥1024. Set as a variable, not a text-* utility: inside a
// StatGroup the value is also capped to fit its cell (primitives.css).
const SIZE: Record<StatSize, string> = {
  sm: "[--ui-stat-size:20px]",
  md: "[--ui-stat-size:24px] md:[--ui-stat-size:26px] lg:[--ui-stat-size:28px]",
  lg: "[--ui-stat-size:32px] lg:[--ui-stat-size:38px]",
};

export type StatProps = {
  /** Sentence-case label, e.g. "Invested". */
  label: ReactNode;
  /** Pre-formatted value (use format.ts helpers). */
  value: ReactNode;
  /** 13px muted line under the value (a caption or a <Delta size="sm">). */
  sub?: ReactNode;
  tone?: StatTone;
  /** sm 20px · md 24→26→28px (default) · lg 32→38px. */
  size?: StatSize;
  className?: string;
};

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  size = "md",
  className,
}: StatProps) {
  return (
    <div className={cx("ui-stat", className)}>
      <div className="ui-stat__label type-label truncate">{label}</div>
      <div className={cx("ui-stat__value type-display whitespace-nowrap", SIZE[size], TONE[tone])}>
        {value}
      </div>
      {sub != null && (
        <div className="ui-stat__sub text-[13px] leading-snug text-muted">{sub}</div>
      )}
    </div>
  );
}

export type StatGroupProps = {
  children: ReactNode;
  /** 2 · 3 (default) · 4 (2×2 while the group is narrower than 34rem).
   *  Ignored with `operators`. */
  columns?: 2 | 3 | 4;
  /** Hairlines between cells (default true). Ignored with `operators`. */
  divided?: boolean;
  /** Turns the group into an equation of chunky tiles: operators[i] sits
   *  between cell i and cell i+1, e.g. ["+", "="] for "Invested + Gain =
   *  Value". Stacked rows while the group is narrower than 24rem. */
  operators?: ReactNode[];
  className?: string;
};

/** Grid of Stats — hairline-divided cells, or equation tiles with
 *  `operators`. It is a CSS size container, so give it a definite width
 *  (any block, w-full or flex-1) — never a shrink-to-fit slot. */
export function StatGroup({
  children,
  columns = 3,
  divided = true,
  operators,
  className,
}: StatGroupProps) {
  if (operators) {
    const cells = Children.toArray(children);
    return (
      <div className={cx("ui-stat-wrap", className)}>
        <div
          className="ui-stat-eq"
          style={{ "--ui-cols": cells.length, "--ui-ops": cells.length - 1 } as CSSProperties}
        >
          {cells.map((cell, i) => (
            <Fragment key={i}>
              {i > 0 &&
                (operators[i - 1] != null ? (
                  <span className="ui-stat-eq__op">{operators[i - 1]}</span>
                ) : (
                  <span aria-hidden className="ui-stat-eq__gap" />
                ))}
              <div className="ui-stat-eq__tile">{cell}</div>
            </Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cx("ui-stat-wrap", className)}>
      <div className="ui-stat-group" data-cols={columns} data-divided={divided ? "" : undefined}>
        {children}
      </div>
    </div>
  );
}
