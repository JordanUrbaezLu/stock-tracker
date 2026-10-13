import type { CSSProperties } from "react";
import { cx } from "./cx";
import { compactMoney, formatCurrency } from "./format";
import "./arena.css";

/*
 * No "use client": the fill animates in CSS, so LevelBar and levelFor work
 * in server and client components alike.
 */

/** Money milestones (DESIGN §3). Under $100 is Level 1; reaching each step
 *  is the next level, so $100k+ is Level 11, the top. */
export const LEVEL_STEPS = [
  100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
] as const;

export type LevelInfo = {
  /** 1…11. */
  level: number;
  /** The amount this level started at ($0 for Level 1). */
  floor: number;
  /** The amount that reaches the next level; null at the top level. */
  next: number | null;
  /** 0…1 of the way from floor to next (1 at the top level). */
  progress: number;
  /** Dollars still needed for the next level (0 at the top level). */
  toGo: number;
};

/** Where a value sits on the level ladder. Negative/NaN count as $0. */
export function levelFor(value: number): LevelInfo {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  let passed = 0;
  while (passed < LEVEL_STEPS.length && v >= LEVEL_STEPS[passed]) passed++;
  const floor = passed === 0 ? 0 : LEVEL_STEPS[passed - 1];
  if (passed === LEVEL_STEPS.length) {
    return { level: passed + 1, floor, next: null, progress: 1, toGo: 0 };
  }
  const next = LEVEL_STEPS[passed];
  return {
    level: passed + 1,
    floor,
    next,
    progress: Math.min(1, Math.max(0, (v - floor) / (next - floor))),
    toGo: Math.max(0, next - v),
  };
}

export type LevelBarProps = {
  /** Current value in dollars. */
  value: number;
  /** One tight block for cards: smaller gem, "$40.00 to Level 4", thin bar. */
  compact?: boolean;
  className?: string;
};

// A pointy-top hexagon; the 6-unit round-joined stroke rounds its corners.
const HEX = "M28 4 49.65 16.5V41.5L28 54 6.35 41.5V16.5Z";
const FACET = "M28 4 49.65 16.5 28 29 6.35 16.5Z";

const SEGMENTS = 5;

/**
 * Money levels (DESIGN §3): an amber level gem, "Level 3", what the next
 * level takes, and a five-cell XP bar that fills left → right on mount.
 * The top level shows a full bar and "Max level".
 */
export function LevelBar({ value, compact = false, className }: LevelBarProps) {
  const info = levelFor(value);
  const max = info.next === null;
  const nextLevel = info.level + 1;

  const bar = (
    <div
      role="progressbar"
      aria-label={max ? "Max level reached" : `Progress to Level ${nextLevel}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(info.progress * 100)}
      aria-valuetext={max ? "Max level" : `${formatCurrency(info.toGo)} to go`}
      className={cx("arena-level__bar", compact ? "mt-2" : "mt-3")}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const fill = Math.min(1, Math.max(0, info.progress * SEGMENTS - i));
        return (
          <span key={i} className="arena-level__seg">
            {fill > 0 ? (
              <span
                className="arena-level__fill"
                style={{ "--fill": fill.toFixed(4), "--i": i } as CSSProperties}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );

  return (
    <div className={cx("arena-level", compact && "arena-level--compact", className)}>
      {/* Keyed by level: reaching a new one re-pops the gem. */}
      <LevelGem key={info.level} level={info.level} />
      <div className="min-w-0 flex-1">
        {compact ? (
          <div className="flex items-baseline justify-between gap-2">
            <p className="type-title shrink-0 text-[16px] leading-tight text-ink">
              Level {info.level}
            </p>
            <p className="truncate text-[13px] font-semibold text-muted">
              {max ? (
                <span className="font-bold text-amber">Max level</span>
              ) : (
                <>
                  <span className="tnum font-bold text-ink">
                    {formatCurrency(info.toGo)}
                  </span>{" "}
                  to Level {nextLevel}
                </>
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="type-display text-[26px] text-ink">Level {info.level}</p>
              {max ? (
                <p className="text-[15px] font-bold text-amber">Max level</p>
              ) : (
                <p className="text-[15px] font-semibold text-muted">
                  <span className="tnum font-bold text-ink">
                    {formatCurrency(info.toGo)}
                  </span>{" "}
                  to go
                </p>
              )}
            </div>
            <p className="type-label mt-1.5">
              {max
                ? `Top of the ladder — past ${compactMoney(info.floor)}`
                : `Next: Level ${nextLevel} at ${compactMoney(info.next ?? 0)}`}
            </p>
          </>
        )}
        {bar}
      </div>
    </div>
  );
}

/** The level gem: lip, amber face, lighter top facet, "LV" + number. */
function LevelGem({ level }: { level: number }) {
  return (
    <span aria-hidden className="arena-level__badge">
      <svg viewBox="0 0 56 64" focusable="false">
        <path
          className="arena-level__lip"
          d={HEX}
          transform="translate(0 5)"
          strokeWidth={6}
          strokeLinejoin="round"
        />
        <path
          className="arena-level__face"
          d={HEX}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        <path className="arena-level__facet" d={FACET} />
      </svg>
      <span className="arena-level__mark on-amber">
        <span className="arena-level__lv">LV</span>
        <span className="arena-level__num">{level}</span>
      </span>
    </span>
  );
}
