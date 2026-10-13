"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useAdmin } from "./AdminContext";
import { useSound } from "./SoundContext";
import { Sparkline } from "./Sparkline";
import { CompanyLogo } from "./CompanyLogo";
import { AnimatedNumber } from "./AnimatedNumber";
import { Carousel } from "./Carousel";
import { celebrate } from "./confetti";
import { jerseyCard, jerseyColor } from "./avatar";
import { computeBadges } from "./badges";
import { isNewInvestor, investorSince } from "./investorMeta";
import { RichText } from "./RichText";
import { fetchPortfolio, getCachedPortfolio } from "./portfolioCache";
import { DailyPulse } from "./DailyPulse";
import { InstallNudge } from "./InstallNudge";
import { GUEST, getViewer } from "./checkin";
import { AppShell, weatherFor, weatherWords } from "./ui/AppShell";
import { AiNote } from "./ui/Ai";
import { Avatar } from "./ui/Avatar";
import { Button, LinkButton } from "./ui/Button";
import { Card } from "./ui/Card";
import { ChartLegend, type ChartLegendItem } from "./ui/ChartLegend";
import { Chip } from "./ui/Chip";
import { cx } from "./ui/cx";
import { Delta } from "./ui/Delta";
import { Field, Input } from "./ui/Field";
import { FlapDisplay } from "./ui/FlapDisplay";
import {
  compactMoney,
  firstName,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  gainLabel,
  toneText,
} from "./ui/format";
import { IconArrowRight, IconPlus, IconUser } from "./ui/icons";
import { LEVEL_STEPS, levelFor } from "./ui/LevelBar";
import { RankMarker } from "./ui/ListRow";
import { Medal, foilFor } from "./ui/Medal";
import { Modal, ModalActions } from "./ui/Modal";
import { BEATS, POP } from "./ui/motion";
import { Podium, type PodiumItem } from "./ui/Podium";
import { Rise } from "./ui/Reveal";
import { SectionHeader } from "./ui/SectionHeader";
import { Segmented } from "./ui/Segmented";
import { Skeleton } from "./ui/Skeleton";
import { Stat, StatGroup } from "./ui/Stat";
import { EmptyState, ErrorState } from "./ui/States";
import { Sticker } from "./ui/Sticker";
import { FlipButton, TiltCard } from "./ui/TiltCard";

type HistoryPoint = { time: number; value: number };

type HoldingValue = {
  symbol: string;
  name?: string | null;
  logo?: string | null;
  amountInvested: number;
  startPrice: number | null;
  currentPrice: number | null;
  shares: number | null;
  currentValue: number | null;
  change: number | null;
  changePercent: number | null;
  history: HistoryPoint[];
  allocationIndex?: number;
  id?: string;
  dateInvested?: string | null;
  status?: "open" | "closed";
  soldDate?: string | null;
  proceeds?: number | null;
  realizedChange?: number | null;
  realizedChangePercent?: number | null;
};

type InvestorValue = {
  name: string;
  slug: string;
  originalAmountInvested: number;
  totalInvested: number;
  currentValue: number;
  change: number;
  changePercent: number;
  dayChange?: number;
  dayChangePercent?: number;
  spyReturn?: number | null;
  alphaSpy?: number | null;
  benchmarkHistory?: HistoryPoint[];
  holdings: HoldingValue[];
  valueHistory: HistoryPoint[];
};

type BenchmarkInfo = {
  label: string;
  spyGroupReturn: number | null;
  spyHistory: { time: number; close: number }[];
};

type PortfolioResponse = {
  asOf: number;
  investors: InvestorValue[];
  symbols: string[];
  benchmark?: BenchmarkInfo;
};

function mergeHoldings(holdings: HoldingValue[]): HoldingValue[] {
  // Merge duplicate OPEN buys of the same symbol into one row. Closed positions
  // pass through untouched — blending a sold position's $0 currentValue and
  // "closed" status into a live re-buy of the same ticker showed a phantom loss
  // and hid the new position.
  const bySymbol = new Map<string, HoldingValue>();
  const closed: HoldingValue[] = [];

  holdings.forEach((holding) => {
    if (holding.status === "closed") {
      closed.push(holding);
      return;
    }
    const key = holding.symbol;
    const current = holding.currentValue ?? holding.amountInvested ?? 0;
    const shares = holding.shares ?? 0;

    if (!bySymbol.has(key)) {
      bySymbol.set(key, {
        ...holding,
        currentValue: current,
        shares: shares > 0 ? shares : null,
      });
      return;
    }

    const existing = bySymbol.get(key)!;
    const totalInvested =
      (existing.amountInvested ?? 0) + (holding.amountInvested ?? 0);
    const totalCurrent =
      (existing.currentValue ?? existing.amountInvested ?? 0) + current;
    const totalShares = (existing.shares ?? 0) + shares || 0;
    const mergedShares = totalShares > 0 ? totalShares : null;

    existing.amountInvested = totalInvested;
    existing.currentValue = totalCurrent;
    existing.shares = mergedShares;
    existing.change = totalCurrent - totalInvested;
    existing.changePercent = totalInvested
      ? (existing.change / totalInvested) * 100
      : null;
  });

  const merged = Array.from(bySymbol.values()).map((h) => {
    if (h.change == null) {
      const current = h.currentValue ?? h.amountInvested ?? 0;
      const change = current - (h.amountInvested ?? 0);
      return {
        ...h,
        change,
        changePercent:
          h.amountInvested ?? 0
            ? (change / (h.amountInvested ?? 1)) * 100
            : null,
      };
    }
    return h;
  });
  return [...merged, ...closed];
}

function returnPct(inv: InvestorValue) {
  return inv.originalAmountInvested
    ? ((inv.currentValue - inv.originalAmountInvested) /
        inv.originalAmountInvested) *
        100
    : 0;
}

/**
 * Sum every investor's value history into one combined group timeline.
 * Forward-filled: at each timestamp we add each investor's last-known value
 * (0 before their first point) rather than only investors that have a point at
 * that exact instant — otherwise a timestamp unique to one investor sums to
 * just their value and the group line shows a fake dip.
 */
function combineSeries(seriesList: HistoryPoint[][]): HistoryPoint[] {
  const series = seriesList
    .map((s) => [...s].sort((a, b) => a.time - b.time))
    .filter((points) => points.length > 0);
  const allTimes = Array.from(
    new Set(series.flatMap((points) => points.map((p) => p.time))),
  ).sort((a, b) => a - b);

  return allTimes.map((time) => {
    let value = 0;
    for (const points of series) {
      if (time < points[0].time) continue; // not yet invested
      let lastValue = points[points.length - 1].value;
      for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].time <= time) {
          lastValue = points[i].value;
          break;
        }
      }
      value += lastValue;
    }
    return { time, value };
  });
}

function combineHistories(investors: InvestorValue[]): HistoryPoint[] {
  return combineSeries(investors.map((inv) => inv.valueHistory ?? []));
}

/** Keep only the last `days` of a (time-sorted) value series. The API now
 *  returns ~6 months of history (for the investor detail page); the home cards
 *  use this to show just their last 30 days. */
function sliceLastDays(
  points: HistoryPoint[] | undefined,
  days: number,
): HistoryPoint[] {
  if (!points || points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const cutoff = sorted[sorted.length - 1].time - days * 86_400;
  const windowed = sorted.filter((p) => p.time >= cutoff);
  return windowed.length > 1 ? windowed : sorted.slice(-2);
}

/** Best-performing open holding (by % change) for a card highlight. */
function topPerformer(holdings: HoldingValue[]): HoldingValue | null {
  let best: HoldingValue | null = null;
  holdings.forEach((h) => {
    if (h.changePercent == null || h.status === "closed") return;
    if (!best || (h.changePercent ?? 0) > (best.changePercent ?? 0)) best = h;
  });
  return best;
}

/** "MON · OCT 12" — the board eyebrow's date (CSS sets the caps). */
function dateEyebrow(): string {
  const d = new Date();
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  const mo = d.toLocaleDateString("en-US", { month: "short" });
  return `${wd} · ${mo} ${d.getDate()}`;
}

/** The money milestone a level stands for: Level 3 → "$250", Level 5 → "$1k". */
function levelClub(level: number): string | null {
  const floor = LEVEL_STEPS[level - 2];
  if (!floor) return null;
  return floor >= 1000 ? `$${floor / 1000}k` : `$${floor}`;
}

/* ------------------------------------------------------------------ Hero -- */

const HERO_GRID =
  "grid gap-7 pb-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end lg:gap-12";

function Hero({
  today,
  count,
  groupCurrent,
  groupGain,
  groupGainPct,
  groupDayChange,
  groupDayChangePercent,
  groupHistory,
  groupBenchmark,
}: {
  today: string;
  count: number;
  groupCurrent: number;
  groupGain: number;
  groupGainPct: number;
  groupDayChange: number;
  groupDayChangePercent: number;
  groupHistory: HistoryPoint[];
  groupBenchmark: HistoryPoint[];
}) {
  const value = formatCurrency(groupCurrent);
  const weather = weatherFor(groupDayChangePercent);
  const dayUp = groupDayChange >= 0.005;
  const dayDown = groupDayChange <= -0.005;
  const legend: ChartLegendItem[] = [
    { label: "Club · last 30 days", kind: "line", tone: groupGain >= 0 ? "gain" : "loss" },
  ];
  if (groupBenchmark.length > 1) {
    legend.push({ label: "Same money in the S&P 500", kind: "dashed", tone: "muted" });
  }

  return (
    // pb-10: the hall's first block is pulled 56px over the board's edge.
    <div className={HERO_GRID}>
      <div className="min-w-0">
        <p className="type-eyebrow text-amber">
          {today} — Club value · {count} {count === 1 ? "investor" : "investors"}
        </p>
        <FlapDisplay
          value={value}
          size="hero"
          sound
          label={`Club value ${value}`}
          className="mt-3"
        />
        <Rise delay={BEATS.deltas} className="mt-4 flex flex-col items-start gap-2.5">
          <p className="text-[18px] font-semibold leading-snug text-ink text-pretty">
            {weatherWords(weather)} —{" "}
            {dayUp || dayDown ? (
              <>
                the club is {dayUp ? "up" : "down"}{" "}
                <span className={cx("tnum font-bold", dayUp ? "text-gain" : "text-loss")}>
                  {formatCurrency(Math.abs(groupDayChange))}
                </span>{" "}
                today{" "}
                <span className="tnum whitespace-nowrap text-[15px] text-muted">
                  ({formatPercent(groupDayChangePercent)})
                </span>
              </>
            ) : (
              "the club is flat today"
            )}
          </p>
          <Delta
            variant="phrase"
            size="xl"
            value={groupGain}
            percent={groupGainPct}
            decimals={1}
            suffix="since starting"
          />
        </Rise>
      </div>
      {groupHistory.length > 1 && (
        <div className="flex h-44 min-w-0 flex-col gap-3 lg:h-52">
          <Rise delay={BEATS.chart}>
            <ChartLegend items={legend} />
          </Rise>
          <Sparkline
            points={groupHistory}
            benchmark={groupBenchmark}
            positive={groupGain >= 0}
            strokeWidth={2}
            showAxes
            fill
            delay={BEATS.chart * 1000}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className={HERO_GRID}>
      <span className="sr-only" role="status">
        Loading the club…
      </span>
      <div className="min-w-0" aria-hidden>
        <Skeleton className="h-3 w-60 max-w-full" />
        <Skeleton className="mt-3 h-[clamp(49px,15vw,94px)] w-[min(100%,28rem)] rounded-[10px]" />
        <Skeleton className="mt-5 h-4 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-56 max-w-full" />
      </div>
      <Skeleton className="h-44 rounded-[14px] lg:h-52" />
    </div>
  );
}

/** The board when there's nothing to total: load failed, or nobody's joined. */
function HeroNote({
  today,
  flap,
  tone,
  children,
}: {
  today: string;
  flap: string;
  tone: "ink" | "loss";
  children: ReactNode;
}) {
  return (
    <div className="pb-10">
      <p className="type-eyebrow text-amber">{today} — Club value</p>
      <FlapDisplay value={flap} size="hero" tone={tone} className="mt-3" />
      <p className="mt-4 text-[18px] font-semibold leading-snug text-ink text-pretty">
        {children}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- The race -- */

type RaceTab = "today" | "alltime" | "value";

const RACE: Record<
  RaceTab,
  {
    /** What the tab means, in words (the section's sub line). */
    sub: string;
    /** Tail of a lane's spoken label: "Taylor, rank 1, +5.6% all-time". */
    said: string;
    metric: (i: InvestorValue) => number | null;
    format: (v: number) => string;
  }
> = {
  today: {
    sub: "Today's moves",
    said: "today",
    metric: (i) => (typeof i.dayChangePercent === "number" ? i.dayChangePercent : null),
    format: (v) => formatPercent(v, 2),
  },
  alltime: {
    sub: "Total return since each investor started",
    said: "all-time",
    metric: returnPct,
    format: (v) => formatPercent(v, 1),
  },
  value: {
    sub: "What each portfolio is worth",
    said: "value",
    metric: (i) => i.currentValue,
    format: (v) => formatCurrency(v),
  },
};

const RACE_OPTIONS: { value: RaceTab; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "alltime", label: "All-time" },
  { value: "value", label: "Value" },
];

/** Runner (avatar) diameter; the track keeps this much room so a runner at
 *  either end still sits fully on it. */
const RUNNER = 30;
/** Fixed rank + name column, so every lane's track starts on the same line. */
const LANE_NAME_COL = "w-[104px]";
/** Space between a runner and its metric label (the label's `mx-1.5`). */
const LABEL_GAP = 6;

function Race({
  investors,
  viewerSlug,
  className,
}: {
  investors: InvestorValue[];
  viewerSlug: string | null;
  className?: string;
}) {
  const { play } = useSound();
  const [tab, setTab] = useState<RaceTab>("alltime");
  const board = RACE[tab];
  // % tabs diverge around a center 0 line; Value runs left → right from $0.
  const diverging = tab !== "value";

  const lanes = investors
    .map((inv) => ({ inv, v: board.metric(inv) }))
    .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
  const peak = Math.max(
    ...lanes.map((l) => Math.abs(l.v ?? 0)),
    // A floor, so a sleepy day doesn't fling runners to the ends over 0.01%.
    tab === "today" ? 0.5 : 1,
  );
  const zero = diverging ? 0.5 : 0;
  const span = `(100% - ${RUNNER}px)`;

  // The track's real width, so each label can pick the side of its runner
  // where it actually fits (the rail's tracks are much shorter than a
  // phone's). Measured from the section: the list itself remounts per tab.
  const lanesRef = useRef<HTMLElement>(null);
  const [trackW, setTrackW] = useState(0);
  useEffect(() => {
    const el = lanesRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const track = el.querySelector<HTMLElement>("[data-race-track]");
      if (track) setTrackW(track.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section
      ref={lanesRef}
      aria-labelledby="h-race"
      className={cx("flex min-w-0 flex-col", className)}
    >
      <SectionHeader id="h-race" emoji="🏁" title="The race" sub={board.sub} />
      <Card padding="sm" className="flex-1">
        <Segmented
          ariaLabel="Rank the race by"
          size="sm"
          fullWidth
          value={tab}
          onChange={(next) => {
            play("toggle");
            setTab(next);
          }}
          options={RACE_OPTIONS}
        />
        {/* Keyed by tab: lanes re-rank and every runner springs out from the
            start line again. */}
        <ol key={tab} className="mt-3 flex flex-col gap-0.5">
          {lanes.map(({ inv, v }, idx) => {
            const value = v ?? 0;
            const at = Math.min(
              1,
              Math.max(0, diverging ? 0.5 + (value / peak) * 0.5 : value / peak),
            );
            const isViewer = inv.slug === viewerSlug;
            const text = v == null ? "—" : board.format(v);
            // The label rides beside the runner — ahead of it (clear of its
            // trail) while it fits before the track's end, else behind.
            const aheadIsLeft = diverging && value < 0;
            let labelLeft: boolean;
            if (trackW > 0) {
              const travel = trackW - RUNNER;
              // 13px bold tabular figures + the pill's padding and border.
              const labelW = text.length * 7.7 + 18;
              const room = (aheadIsLeft ? at : 1 - at) * travel - LABEL_GAP;
              labelLeft = room >= labelW ? aheadIsLeft : !aheadIsLeft;
            } else {
              // Before the first measure: a guess that suits a phone.
              labelLeft = diverging ? (value >= 0 ? at > 0.6 : at >= 0.4) : at > 0.5;
            }
            const from = Math.min(at, zero);
            const jersey = jerseyColor(inv.name);
            return (
              <li key={inv.slug}>
                <Link
                  href={`/investor/${inv.slug}`}
                  onClick={() => play("nav")}
                  aria-label={`${inv.name}, rank ${idx + 1}, ${text} ${board.said}`}
                  className={cx(
                    // overflow-x-clip: the runner's sled is as wide as the
                    // track and slides right — clip it instead of widening
                    // the page (the crown still pokes out the top).
                    "group flex min-h-[52px] items-center gap-2.5 overflow-x-clip rounded-2xl px-2 py-1.5 transition-colors",
                    isViewer ? "bg-amber-soft" : "hover:bg-surface-2",
                  )}
                >
                  <span className={cx("flex shrink-0 items-center gap-2", LANE_NAME_COL)}>
                    <span className="grid w-6 shrink-0 place-items-center">
                      <RankMarker rank={idx + 1} delay={idx * 60} />
                    </span>
                    <span className="flex min-w-0 flex-col items-start gap-0.5">
                      <span className="max-w-full truncate text-[15px] font-bold leading-tight text-ink">
                        {firstName(inv.name)}
                      </span>
                      {isViewer && (
                        <Chip size="xs" tone="ink">
                          You
                        </Chip>
                      )}
                    </span>
                  </span>
                  <span aria-hidden data-race-track className="relative block h-8 min-w-0 flex-1">
                    <span
                      className={cx(
                        "absolute inset-0 rounded-full border border-line bg-surface-2 transition-colors",
                        !isViewer && "group-hover:bg-surface-3",
                      )}
                    />
                    {diverging && (
                      <span className="absolute inset-y-[-3px] left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-line-strong" />
                    )}
                    {/* Trail: the ground covered, in the runner's jersey. */}
                    <motion.span
                      className="absolute inset-y-[5px] rounded-full"
                      style={{
                        // Value starts at the track's own left end ($0);
                        // the % tabs grow out of the center line.
                        left: diverging
                          ? `calc(${RUNNER / 2}px + ${from} * ${span})`
                          : "5px",
                        width: diverging
                          ? `calc(${Math.abs(at - zero)} * ${span})`
                          : `calc(${RUNNER / 2 - 5}px + ${at} * ${span})`,
                        background: `color-mix(in oklab, ${jersey} 40%, transparent)`,
                        originX: at >= zero ? 0 : 1,
                      }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 230,
                        damping: 20,
                        delay: 0.12 + idx * 0.07,
                      }}
                    />
                    {/* Sled: its own width is the runner's travel, so a %
                        translate lands the runner exactly on its spot. */}
                    <motion.span
                      className="absolute inset-y-0 left-0 flex items-center"
                      style={{ width: `calc${span}` }}
                      initial={{ x: `${zero * 100}%` }}
                      animate={{ x: `${at * 100}%` }}
                      transition={{
                        type: "spring",
                        stiffness: 230,
                        damping: 17,
                        delay: 0.12 + idx * 0.07,
                      }}
                    >
                      <span className="relative flex">
                        <Avatar name={inv.name} size={RUNNER} ring />
                        {/* No crown for "leading" a day when nothing has moved. */}
                        {idx === 0 && v != null && !(tab === "today" && Math.abs(v) < 0.005) && (
                          // CSS bob (compositor-only): a motion repeat: Infinity
                          // loop ran on the main thread even off-screen.
                          <span className="crown-bob absolute -top-[15px] left-1/2 -translate-x-1/2 text-[16px] leading-none">
                            👑
                          </span>
                        )}
                        <span
                          className={cx(
                            "tnum absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line bg-surface px-2 py-1 text-[13px] font-bold leading-none",
                            labelLeft ? "right-full mr-1.5" : "left-full ml-1.5",
                            // A move that prints as "0.00%" isn't green or red.
                            diverging ? toneText(v, tab === "today" ? 0.005 : 0.05) : "text-ink",
                          )}
                        >
                          {text}
                        </span>
                      </span>
                    </motion.span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        {/* The track's scale, in words — lined up under the tracks. */}
        <div aria-hidden className="mt-1.5 flex items-center gap-2.5 px-2">
          <span className={cx("shrink-0", LANE_NAME_COL)} />
          {diverging ? (
            <span className="grid flex-1 grid-cols-3 whitespace-nowrap text-[12px] font-semibold text-muted">
              <span>▼ Down</span>
              <span className="text-center">0%</span>
              <span className="text-right">Up ▲</span>
            </span>
          ) : (
            <span className="flex flex-1 justify-between text-[12px] font-semibold text-muted">
              <span>$0</span>
              <span>{compactMoney(peak)}</span>
            </span>
          )}
        </div>
      </Card>
    </section>
  );
}

/* ---------------------------------------------------------- Player cards -- */

function PlayerCard({
  investor,
  allInvestors,
  rank,
  isViewer,
}: {
  investor: InvestorValue;
  allInvestors: InvestorValue[];
  /** Place by all-time return (1 = best) — picks the medal and the foil. */
  rank: number;
  isViewer: boolean;
}) {
  const { play } = useSound();
  // Earned achievement badges — a few stickers slapped on the card's edge that
  // hint at the full sticker book on the investor's detail page.
  const badges = computeBadges(investor, allInvestors);
  const isNew = isNewInvestor(investor.holdings);
  const since = investorSince(investor.holdings);
  // Which badge's title tooltip is currently revealed (tap the sticker to show it).
  const [tipBadge, setTipBadge] = useState<string | null>(null);
  const originalGain = investor.currentValue - investor.originalAmountInvested;
  const gainPct = investor.originalAmountInvested
    ? (originalGain / investor.originalAmountInvested) * 100
    : 0;
  const mergedHoldings = mergeHoldings(investor.holdings || []);
  // Card list: best percentage first, with sold positions pushed to the bottom.
  const sortedHoldings = [...mergedHoldings].sort((a, b) => {
    const aClosed = a.status === "closed";
    const bClosed = b.status === "closed";
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    return (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity);
  });
  // Cards show the last 30 days of the (now 6-month) history. No S&P overlay
  // here — the dashed benchmark line lives on the investor detail page and the
  // group overview chart, where the full window makes it a fair comparison.
  const cardHistory = sliceLastDays(investor.valueHistory, 30);
  const hasHistory = cardHistory.length > 1;
  const best = topPerformer(mergedHoldings);

  // Personalized AI encouragement. Refetched per investor (and on each reload,
  // since `investor` is recreated when the portfolio refreshes). The endpoint
  // always resolves to a message — real AI when ANTHROPIC_API_KEY is set, a
  // warm templated line otherwise — so every card gets one. Seeded from the
  // last real AI line this device saw, so the card never sits blank while the
  // fresh one loads (or when the API is briefly unavailable).
  const [insight, setInsight] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(`pulse:insight:${investor.slug}`);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const controller = new AbortController();
    const merged = mergeHoldings(investor.holdings || []);
    const gain = investor.currentValue - investor.originalAmountInvested;
    const pct = investor.originalAmountInvested
      ? (gain / investor.originalAmountInvested) * 100
      : 0;
    const top = topPerformer(merged);
    fetch("/api/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        name: investor.name,
        currentValue: investor.currentValue,
        originalInvested: investor.originalAmountInvested,
        totalGain: gain,
        gainPct: pct,
        holdingsCount: merged.length,
        topHolding: top
          ? { symbol: top.symbol, changePercent: top.changePercent ?? null }
          : null,
        holdings: merged.slice(0, 6).map((h) => ({
          symbol: h.symbol,
          changePercent: h.changePercent ?? null,
        })),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { message?: string; source?: string } | null) => {
        // Only surface a real AI (or cached AI) line — never the templated
        // fallback. Until then the card shows the last remembered line.
        if (j?.message && j.source !== "fallback") {
          setInsight(j.message);
          try {
            window.localStorage.setItem(`pulse:insight:${investor.slug}`, j.message);
          } catch {
            // Fine — just no stale-while-revalidate next visit.
          }
        }
      })
      .catch(() => null);
    return () => controller.abort();
  }, [investor]);

  const jersey = jerseyColor(investor.name);
  const foil = foilFor(rank, isViewer);
  const href = `/investor/${investor.slug}`;
  const holdingsWord = `${mergedHoldings.length} ${
    mergedHoldings.length === 1 ? "holding" : "holdings"
  }`;
  const shownBadges = badges.slice(0, 3);
  const shownHoldings = sortedHoldings.slice(0, 4);
  const moreHoldings = sortedHoldings.length - shownHoldings.length;

  const back = (
    <div className="flex h-full flex-col gap-3 rounded-[inherit] border border-line bg-surface p-4 text-ink">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={investor.name} size={36} />
          <div className="min-w-0">
            <p className="type-title truncate text-[18px] leading-tight text-ink">
              {firstName(investor.name)}&apos;s picks
            </p>
            <p className="text-[13px] font-medium text-muted">{holdingsWord}</p>
          </div>
        </div>
        <FlipButton />
      </div>
      <StatGroup columns={2}>
        <Stat
          size="sm"
          label="Invested"
          value={formatCurrency(investor.originalAmountInvested)}
        />
        <Stat
          size="sm"
          label={gainLabel(originalGain)}
          tone={originalGain < 0 ? "loss" : "gain"}
          value={formatSignedCurrency(originalGain)}
        />
      </StatGroup>
      {shownHoldings.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface-2 px-3 py-5 text-center text-[15px] text-muted">
          No investments yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {shownHoldings.map((holding, idx) => {
            const closed = holding.status === "closed";
            return (
              <li
                key={`${holding.symbol}-${idx}`}
                className="flex min-h-11 items-center gap-2 border-t border-line first:border-t-0"
              >
                <CompanyLogo
                  symbol={holding.symbol}
                  name={holding.name}
                  logo={holding.logo}
                  size={28}
                  delay={idx * 70}
                  linkToLookup
                />
                <span className="type-title min-w-0 truncate text-[15px] text-ink">
                  {holding.symbol}
                </span>
                {closed && (
                  <Chip size="xs" tone="amber">
                    Sold
                  </Chip>
                )}
                <span className="tnum ml-auto shrink-0 text-[14px] font-semibold text-ink-2">
                  {formatCurrency(closed ? holding.proceeds : holding.currentValue)}
                </span>
                <Delta
                  variant="pill"
                  size="sm"
                  percent={holding.changePercent}
                  decimals={1}
                  className="shrink-0"
                />
              </li>
            );
          })}
        </ul>
      )}
      {moreHoldings > 0 && (
        <p className="-mt-1 text-[13px] font-medium text-muted">
          +{moreHoldings} more in the portfolio
        </p>
      )}
      {insight && (
        <AiNote>
          <RichText text={insight} />
        </AiNote>
      )}
      {/* pb-1: the key's lip is a shadow, not layout. */}
      <div className="mt-auto pb-1">
        <LinkButton
          href={href}
          variant="ink"
          fullWidth
          iconRight={<IconArrowRight />}
          onClick={() => play("nav")}
        >
          Open portfolio
        </LinkButton>
      </div>
    </div>
  );

  // Badge stickers slapped over the card's bottom edge (the decal layer sits
  // above the foil). They are siblings of the card link, never inside it — a
  // tap shows the badge's name and can't navigate.
  const decals =
    shownBadges.length > 0 ? (
      <div className="absolute -bottom-3.5 right-3 z-3 flex items-end">
        {shownBadges.map((b, j) => (
          <span key={b.id} className={cx("relative flex", j > 0 && "-ml-1.5")}>
            <Sticker
              emoji={b.emoji}
              tone={b.tone}
              seed={b.id}
              size={40}
              label={b.label}
              onClick={() => {
                play("tap");
                setTipBadge((cur) => (cur === b.id ? null : b.id));
              }}
            />
            {tipBadge === b.id && (
              <motion.span
                role="status"
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...POP, opacity: { duration: 0.12 } }}
                className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-[14px] font-bold leading-none text-on-ink shadow-pop"
              >
                {b.label}
              </motion.span>
            )}
          </span>
        ))}
        {badges.length > shownBadges.length && (
          <span
            className="mb-1.5 ml-1 inline-flex h-7 items-center rounded-full border border-line bg-surface px-2 text-[13px] font-bold text-ink shadow-lip"
            title={`${badges.length - shownBadges.length} more stickers`}
          >
            +{badges.length - shownBadges.length}
          </span>
        )}
      </div>
    ) : null;

  return (
    <TiltCard
      className="h-full"
      foil={foil}
      lip={`color-mix(in oklab, ${jersey} 62%, var(--board))`}
      back={back}
      decals={decals}
    >
      <article
        className={cx(
          "on-jersey relative flex h-full flex-col rounded-[inherit] p-5",
          // Room for the stickers hanging on the bottom edge.
          shownBadges.length > 0 && "pb-9",
        )}
        // Under a foil the face starts deeper: the sheen lightens it again.
        style={{ background: jerseyCard(investor.name, foil ? 6.4 : undefined) }}
      >
        {/* Stretched link: the whole face opens the portfolio. The keys and
            stickers sit above it (z-index) as siblings, so they never
            navigate. */}
        <Link
          href={href}
          data-card-link
          onClick={() => play("nav")}
          aria-label={`Open ${investor.name}'s portfolio`}
          className="absolute inset-0 z-1 rounded-[inherit]"
          // Focus ring inside the card (white on the jersey), clear of the
          // foil trim. Inline: the global :focus-visible rule is unlayered
          // and beats outline utilities.
          style={{ outlineOffset: -11, outlineWidth: 3 }}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {rank <= 3 ? (
              <Medal rank={rank} size={40} />
            ) : (
              <span
                role="img"
                aria-label={`Rank ${rank}`}
                className="tnum inline-flex h-9 items-center rounded-full bg-surface-2 px-3 text-[15px] font-bold"
              >
                #{rank}
              </span>
            )}
            {isViewer && (
              <Chip size="xs" tone="ink">
                You
              </Chip>
            )}
            {isNew && (
              <Chip size="xs" tone="new">
                New
              </Chip>
            )}
          </div>
          <FlipButton className="z-2" />
        </div>
        <h3 className="type-display mt-4 truncate text-[40px] uppercase">{investor.name}</h3>
        <p className="mt-1.5 text-[14px] font-semibold text-muted">
          {since ? `Since ${since} · ${holdingsWord}` : holdingsWord}
        </p>
        <AnimatedNumber
          value={investor.currentValue}
          format={formatCurrency}
          className="type-display mt-4 block text-[44px]"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Delta variant="pill" percent={gainPct} decimals={1} suffix="all time" />
          {typeof investor.dayChangePercent === "number" && (
            // Whole cents: a sub-cent move would read "▲ $0.00".
            <Delta
              size="sm"
              prefix="Today"
              value={Math.round((investor.dayChange ?? 0) * 100) / 100 || 0}
            />
          )}
        </div>
        {hasHistory && (
          <div className="relative mt-4 min-h-16 flex-1">
            <Sparkline
              points={cardHistory}
              positive={originalGain >= 0}
              strokeWidth={2.25}
              fill
              className="absolute inset-0"
            />
          </div>
        )}
        <p className="mt-auto pt-4 text-[14px] font-semibold text-muted">
          {best ? (
            <>
              Best pick:{" "}
              <span className="tnum whitespace-nowrap font-bold text-ink">
                {best.symbol} {formatPercent(best.changePercent, 1)}
              </span>
            </>
          ) : (
            "No open picks yet"
          )}
        </p>
      </article>
    </TiltCard>
  );
}

/* ------------------------------------------------------------- Hot picks -- */

/** Best-performing individual holdings across everyone (one owner may sweep). */
function HotPicks({
  investors,
  className,
}: {
  investors: InvestorValue[];
  className?: string;
}) {
  const { play } = useSound();
  const rows = investors
    .flatMap((inv) =>
      mergeHoldings(inv.holdings || [])
        .filter((h) => h.changePercent != null && h.status !== "closed")
        .map((h) => ({
          key: `${inv.slug}-${h.symbol}`,
          symbol: h.symbol,
          name: h.name ?? null,
          logo: h.logo ?? null,
          changePercent: h.changePercent as number,
          investorName: inv.name,
          slug: inv.slug,
        })),
    )
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 3);

  const items: PodiumItem[] = rows.map((row, idx) => ({
    key: row.key,
    // No linkToLookup: the whole spot is already a link to the owner — a
    // button inside it would put two destinations 0px apart.
    top: (
      <CompanyLogo
        symbol={row.symbol}
        name={row.name}
        logo={row.logo}
        size={44}
        delay={idx * 70}
      />
    ),
    label: (
      <span className="flex flex-col items-center gap-1.5">
        <span>{row.symbol}</span>
        <Delta variant="pill" size="sm" percent={row.changePercent} decimals={1} />
      </span>
    ),
    sub: (
      <span className="mt-1 inline-flex max-w-full items-center justify-center gap-1.5">
        <Avatar name={row.investorName} size={18} />
        <span className="truncate">{firstName(row.investorName)}</span>
      </span>
    ),
    href: `/investor/${row.slug}`,
    ariaLabel: `${row.symbol}, ${formatPercent(row.changePercent, 1)}, held by ${row.investorName}`,
  }));

  return (
    <section aria-labelledby="h-picks" className={cx("flex min-w-0 flex-col", className)}>
      <SectionHeader
        id="h-picks"
        emoji="🔥"
        title="Hot picks"
        sub="The club's best open holdings"
        action={
          <LinkButton
            href="/stocks"
            variant="secondary"
            size="sm"
            iconRight={<IconArrowRight />}
            onClick={() => play("nav")}
          >
            See all picks
          </LinkButton>
        }
      />
      <Card className="flex flex-1 flex-col justify-end">
        {items.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-muted">No holdings yet.</p>
        ) : (
          // Podium spots are links without a click hook — catch the tap here
          // for the nav sound.
          <div
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest("a")) play("nav");
            }}
          >
            <Podium items={items} />
          </div>
        )}
      </Card>
    </section>
  );
}

/* --------------------------------------------------------------- Level up -- */

function LevelUpBanner({
  slug,
  level,
  onDismiss,
}: {
  slug: string;
  level: number;
  onDismiss: () => void;
}) {
  const { play } = useSound();
  const club = levelClub(level);
  return (
    <motion.div
      // Opaque backing: the amber tint is translucent in dark mode and this
      // card rests over the board's edge.
      className="rounded-3xl bg-surface"
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...POP, opacity: { duration: 0.15 } }}
    >
      <Card as="section" tone="amber" raised aria-labelledby="h-levelup">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Sticker emoji="🎉" tone="gold" seed="level-up" size={56} />
          <div className="min-w-0 flex-1 basis-48" role="status">
            <h2 id="h-levelup" className="type-display text-[30px] uppercase text-ink">
              Level up!
            </h2>
            <p className="mt-1.5 text-[16px] font-semibold leading-snug text-ink-2 text-pretty">
              You reached Level {level}
              {club ? ` — ${club} club` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <LinkButton
              href={`/investor/${slug}`}
              variant="ink"
              size="sm"
              onClick={() => play("nav")}
            >
              See my level
            </LinkButton>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                play("tap");
                onDismiss();
              }}
            >
              Nice!
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/* -------------------------------------------------------------- Skeletons -- */

function PlayerCardSkeleton() {
  return (
    <Card className="h-104">
      <div className="flex items-center justify-between">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="size-10 rounded-full" />
      </div>
      <Skeleton className="mt-5 h-9 w-40" />
      <Skeleton className="mt-3 h-4 w-44" />
      <Skeleton className="mt-6 h-10 w-48" />
      <Skeleton className="mt-3 h-7 w-28 rounded-full" />
      <Skeleton className="mt-6 h-20 w-full rounded-2xl" />
      <Skeleton className="mt-6 h-4 w-36" />
    </Card>
  );
}

function HallSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:gap-8">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-8 lg:gap-8">
        {/* The daily ticket */}
        <Card raised>
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="ml-auto h-8 w-40 rounded-full" />
          </div>
          <Skeleton className="mt-5 h-28 w-full rounded-2xl" />
          <Skeleton className="mt-5 h-5 w-3/4" />
          <Skeleton className="mt-3 h-4 w-1/2" />
        </Card>
        {/* Player cards (desktop keeps them in the left column) */}
        <div className="hidden lg:block">
          <Skeleton className="mb-4 h-8 w-48" />
          <div className="grid grid-cols-2 gap-5">
            <PlayerCardSkeleton />
            <PlayerCardSkeleton />
          </div>
        </div>
      </div>
      {/* The race — lg:mt-18 like the real rail, so nothing jumps on load. */}
      <div className="min-w-0 lg:col-span-4 lg:mt-18">
        <Skeleton className="mb-4 h-8 w-36" />
        <Card padding="sm">
          <Skeleton className="h-10 w-full rounded-full" />
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-8 flex-1 rounded-full" />
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="min-w-0 lg:hidden">
        <Skeleton className="mb-4 h-8 w-48" />
        <div className="grid gap-5 md:grid-cols-2">
          <PlayerCardSkeleton />
          <div className="hidden md:block">
            <PlayerCardSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Page -- */

export default function Home() {
  // Seed from the session cache so navigating back to Home is instant (no
  // skeleton flash); a full refresh starts with an empty cache → live fetch.
  const [data, setData] = useState<PortfolioResponse | null>(() =>
    getCachedPortfolio<PortfolioResponse>(),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !getCachedPortfolio());
  const { isAdmin } = useAdmin();
  const { play } = useSound();
  const [showAddInvestor, setShowAddInvestor] = useState(false);
  const [newInvestorName, setNewInvestorName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const celebrated = useRef(false);
  // Which investor this device belongs to (picked in the Daily Pulse card) —
  // used to pin their card first instead of the anonymous shuffle.
  const [viewerSlug, setViewerSlug] = useState<string | null>(() => getViewer());
  // A level the viewer just reached (celebrated once, then remembered).
  const [levelUp, setLevelUp] = useState<{ slug: string; level: number } | null>(null);
  // The board eyebrow's date. Only ever rendered after the client-side load.
  const [today] = useState(dateEyebrow);
  // iPad and up: cards render as a two-up grid instead of one-at-a-time
  // swiping — the extra width finally does something. Safe to read matchMedia
  // in the initializer: the cards only render after a client-side fetch.
  const [isWide, setIsWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const loadPortfolios = useCallback(async (force = false) => {
    setError(null);
    try {
      const json = await fetchPortfolio<PortfolioResponse>(force);
      setData(json);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolios().catch(() => null);
  }, [loadPortfolios]);

  // Warm the browser cache with every holding's logo so cards/carousel/detail
  // pages render logos instantly. Deferred to idle time (not the initial paint)
  // so the image fetches/decodes don't compete with first render on mobile.
  // crossOrigin matches <CompanyLogo> so FMP's CORS responses are reused.
  useEffect(() => {
    if (typeof window === "undefined" || !data?.investors) return;
    const urls = new Set<string>();
    for (const inv of data.investors) {
      for (const h of inv.holdings ?? []) {
        if (h.logo) urls.add(h.logo);
      }
    }
    if (urls.size === 0) return;
    const preload = () => {
      urls.forEach((u) => {
        const img = new window.Image();
        if (u.includes("financialmodelingprep.com"))
          img.crossOrigin = "anonymous";
        img.src = u;
      });
    };
    const ric = window.requestIdleCallback;
    if (ric) {
      const id = ric(preload, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(preload, 800);
    return () => window.clearTimeout(t);
  }, [data]);

  const handleCreateInvestor = useCallback(async () => {
    if (!isAdmin) {
      setCreateError("Admin access required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      if (!newInvestorName.trim()) {
        throw new Error("Name is required.");
      }
      const res = await fetch("/api/admin/investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newInvestorName.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Unable to create investor.");
      }
      setShowAddInvestor(false);
      setNewInvestorName("");
      play("success");
      await loadPortfolios(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to create investor.";
      setCreateError(message);
      play("error");
    } finally {
      setCreating(false);
    }
  }, [newInvestorName, loadPortfolios, isAdmin, play]);

  const openAddInvestor = () => {
    play("open");
    setShowAddInvestor(true);
  };
  const closeAddInvestor = () => {
    if (creating) return;
    setShowAddInvestor(false);
    setNewInvestorName("");
    setCreateError(null);
  };

  const rawInvestors = data?.investors ?? [];
  // Best return first — used for the group sums, the card ranks (medal + foil)
  // and as the race's input (each tab re-sorts internally).
  const investors = [...rawInvestors].sort((a, b) => returnPct(b) - returnPct(a));
  const count = investors.length;
  const multi = count > 1;

  // Live broadcast ticker: every distinct holding across the league, ordered by
  // biggest mover so the tape leads with the action.
  const tickerTicks = (() => {
    const seen = new Map<string, number | null>();
    for (const inv of investors) {
      for (const h of inv.holdings ?? []) {
        if (h.symbol && !seen.has(h.symbol)) {
          seen.set(h.symbol, h.changePercent ?? null);
        }
      }
    }
    return [...seen.entries()]
      .map(([symbol, changePercent]) => ({ symbol, changePercent }))
      .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0));
  })();

  // Shuffle the investor CARDS on each page load so no one is permanently
  // first — except the device's own investor, who always leads once the
  // viewer has picked themselves in the Daily Pulse card. Keyed by the set of
  // slugs: stable across re-renders within a mount (no reshuffle on data
  // refetch), re-randomized on a fresh mount or roster change.
  const cardKey = investors.map((i) => i.slug).join(",");
  const cardInvestors = useMemo(() => {
    const arr = [...investors];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (viewerSlug && viewerSlug !== GUEST) {
      const mine = arr.findIndex((i) => i.slug === viewerSlug);
      if (mine > 0) arr.unshift(arr.splice(mine, 1)[0]);
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, viewerSlug]);

  const groupCurrent = investors.reduce((s, i) => s + i.currentValue, 0);
  const groupOriginal = investors.reduce(
    (s, i) => s + i.originalAmountInvested,
    0,
  );
  const groupGain = groupCurrent - groupOriginal;
  const groupGainPct = groupOriginal ? (groupGain / groupOriginal) * 100 : 0;
  const groupDayChange = investors.reduce((s, i) => s + (i.dayChange ?? 0), 0);
  const groupDayPrevValue = groupCurrent - groupDayChange;
  const groupDayChangePercent = groupDayPrevValue
    ? (groupDayChange / groupDayPrevValue) * 100
    : 0;
  // Home overview mirrors the cards: a 30-day window of the richer 6-month
  // history the API returns (the investor detail page shows the full span).
  const groupHistory = sliceLastDays(combineHistories(investors), 30);

  // S&P 500 overlay for the group chart — the SUM of each investor's
  // capital-flow benchmark. Built this way (rather than scaling raw SPY to the
  // group's starting value), adding a new investor bumps the S&P line by their
  // capital too, instead of faking massive group outperformance.
  const groupBenchmark = sliceLastDays(
    combineSeries(investors.map((i) => i.benchmarkHistory ?? [])),
    30,
  );

  // One-time celebration when the portfolio first loads in the green.
  // (Audio only fires if the context is already unlocked — browsers block
  // sound until the first user gesture, so a cold load stays silent.)
  useEffect(() => {
    if (loading || error || celebrated.current) return;
    if (count > 0 && groupGain > 0) {
      celebrated.current = true;
      const t = setTimeout(() => {
        celebrate(() => play("success")); // sound fires with the confetti burst
      }, 350);
      return () => clearTimeout(t);
    }
  }, [loading, error, count, groupGain, play]);

  // Level up: when the chosen viewer's value has crossed into a higher money
  // level than this device last saw (`pulse:level:<slug>`), celebrate it once.
  // The first visit just remembers the level silently.
  const viewerInvestor =
    viewerSlug && viewerSlug !== GUEST
      ? investors.find((i) => i.slug === viewerSlug)
      : undefined;
  const viewerLevel = viewerInvestor ? levelFor(viewerInvestor.currentValue).level : null;
  const viewerLevelSlug = viewerInvestor?.slug ?? null;
  useEffect(() => {
    if (loading || error || viewerLevel == null || !viewerLevelSlug) return;
    const key = `pulse:level:${viewerLevelSlug}`;
    let seen: number | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      seen = raw == null ? null : Number(raw);
      if (seen == null || !Number.isFinite(seen)) {
        window.localStorage.setItem(key, String(viewerLevel));
        return;
      }
    } catch {
      return; // No storage → it would re-celebrate on every load; skip.
    }
    if (viewerLevel <= seen) return;
    // After the board's own entrance (and the green-club confetti) settles.
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(key, String(viewerLevel));
      } catch {
        // Unreachable in practice: the read above just worked.
      }
      setLevelUp({ slug: viewerLevelSlug, level: viewerLevel });
      celebrate(() => play("success"));
    }, 1400);
    return () => clearTimeout(t);
  }, [loading, error, viewerLevel, viewerLevelSlug, play]);

  const ready = !loading && !error;
  const showLevelUp = ready && levelUp != null && levelUp.slug === viewerSlug;
  const rankOf = new Map(investors.map((inv, idx) => [inv.slug, idx + 1]));
  const renderCard = (investor: InvestorValue) => (
    <PlayerCard
      key={investor.slug}
      investor={investor}
      allInvestors={investors}
      rank={rankOf.get(investor.slug) ?? count}
      isViewer={investor.slug === viewerSlug}
    />
  );

  const hero = loading ? (
    <HeroSkeleton />
  ) : error ? (
    <HeroNote today={today} flap="OFFLINE" tone="loss">
      The scoreboard lost its signal.
    </HeroNote>
  ) : count === 0 ? (
    <HeroNote today={today} flap="$0.00" tone="ink">
      Nobody&apos;s on the board yet.
    </HeroNote>
  ) : (
    <Hero
      today={today}
      count={count}
      groupCurrent={groupCurrent}
      groupGain={groupGain}
      groupGainPct={groupGainPct}
      groupDayChange={groupDayChange}
      groupDayChangePercent={groupDayChangePercent}
      groupHistory={groupHistory}
      groupBenchmark={groupBenchmark}
    />
  );

  return (
    <AppShell
      active="home"
      status={loading ? "loading" : error ? "error" : "live"}
      weather={ready && count > 0 ? weatherFor(groupDayChangePercent) : null}
      ticker={loading ? "loading" : ready && tickerTicks.length > 0 ? tickerTicks : undefined}
      hero={hero}
    >
      {/* The hall. One wrapper pulled up over the board's edge, so its first
          block reads as an object resting on the scoreboard. */}
      <div className="relative z-10 -mt-14 flex flex-col gap-6 lg:gap-8">
        {loading && <HallSkeleton />}

        {error && !loading && (
          <ErrorState
            title="Couldn't load the club"
            message={error}
            onRetry={() => {
              // Back to the skeleton while it retries — with the error
              // cleared and nothing loaded, the page would otherwise flash
              // "No investors yet".
              setLoading(true);
              loadPortfolios();
            }}
          />
        )}

        {ready && count === 0 && (
          <Card padding="none" raised>
            <EmptyState
              icon={<IconUser />}
              title="No investors yet"
              body={
                isAdmin
                  ? "Add your first investor to get started."
                  : "Check back soon."
              }
              action={
                isAdmin ? (
                  <Button icon={<IconPlus />} onClick={openAddInvestor}>
                    Add investor
                  </Button>
                ) : undefined
              }
            />
          </Card>
        )}

        {showLevelUp && levelUp && (
          <LevelUpBanner
            slug={levelUp.slug}
            level={levelUp.level}
            onDismiss={() => setLevelUp(null)}
          />
        )}

        {ready && count > 0 && (
          /*
           * phone   ticket → race → cards → hot picks   (the rail dissolves:
           *         `contents`, its two sections ordered around the cards)
           * iPad    ticket → [race | hot picks] → cards
           * desktop left 8: ticket + cards · right 4: race + hot picks. The
           *         rail spans both rows; the 1fr row soaks up its extra
           *         height, so the ticket never gets a gap under it.
           */
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-8">
            {/* The daily ritual: streak, scratch-off, greeting and today's
                club brief. Checking in is celebrated regardless of market
                color. */}
            <div
              className={cx(
                "order-1 min-w-0 lg:row-start-1",
                multi ? "lg:col-span-8" : "lg:col-span-12",
              )}
            >
              <DailyPulse
                investors={investors.map((i) => ({
                  name: i.name,
                  slug: i.slug,
                  dayChange: i.dayChange ?? null,
                  dayChangePercent: i.dayChangePercent ?? null,
                }))}
                groupDayChange={groupDayChange}
                groupDayChangePercent={groupDayChangePercent}
                groupGainPct={groupGainPct}
                topHolding={tickerTicks[0] ?? null}
                onViewerChange={setViewerSlug}
              />
            </div>

            {multi && (
              <div
                className={cx(
                  "contents md:order-2 md:grid md:grid-cols-2 md:gap-6 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-8",
                  // The hall is pulled 56px over the board; the rail's first
                  // header would land on it — start it on the hall floor.
                  !showLevelUp && "lg:mt-18",
                )}
              >
                <Race
                  investors={investors}
                  viewerSlug={viewerSlug}
                  className="order-2 md:order-0"
                />
                {/* Desktop: the podium stays pinned under the brand bar while
                    the (much longer) card column scrolls past, so the rail
                    never turns into an empty strip. */}
                <HotPicks
                  investors={investors}
                  className="order-4 md:order-0 lg:sticky lg:top-[calc(var(--brandbar-h)+1rem)] lg:flex-none"
                />
              </div>
            )}

            <section
              aria-labelledby="h-cards"
              className={cx(
                "order-3 min-w-0 lg:col-start-1 lg:row-start-2",
                multi ? "lg:col-span-8" : "lg:col-span-12",
              )}
            >
              <SectionHeader
                id="h-cards"
                emoji="🃏"
                title="Player cards"
                sub="Tap a card to open the portfolio"
                action={
                  isAdmin ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<IconPlus />}
                      onClick={openAddInvestor}
                    >
                      Add investor
                    </Button>
                  ) : undefined
                }
              />
              {isWide ? (
                // iPad and up: every card visible at once in a two-up grid —
                // the carousel is a phone affordance, not a tablet one.
                // gap-y-8: badge stickers hang over each card's bottom edge.
                <div className="grid grid-cols-2 items-stretch gap-x-5 gap-y-8 pb-3">
                  {cardInvestors.map(renderCard)}
                </div>
              ) : (
                <Carousel
                  className="mx-auto w-full max-w-xl"
                  arrows
                  hint="Swipe to explore"
                  hintMobileOnly
                  // Only mount the visible card + its neighbors — keeps the home
                  // screen light on phones as the investor count grows (each card
                  // runs a sparkline pulse, logo animations, and an AI insight fetch).
                  virtualize
                  // Round the clip + pad each slide so the card's rounded corners,
                  // its lip and the stickers hanging off its bottom edge aren't
                  // cut by the viewport.
                  viewportClassName="rounded-[2rem]"
                  slidePadding="px-1 pt-2.5 pb-6"
                  labels={cardInvestors.map((inv) => inv.name)}
                  slides={cardInvestors.map(renderCard)}
                />
              )}
            </section>
          </div>
        )}

        {ready && <InstallNudge />}
      </div>

      <Modal
        open={showAddInvestor}
        title="Add investor"
        description="They'll get a player card and a lane in the race."
        size="sm"
        onClose={closeAddInvestor}
        dismissible={!creating}
        footer={
          <ModalActions>
            <Button variant="ghost" onClick={closeAddInvestor} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" form="add-investor-form" loading={creating}>
              Add investor
            </Button>
          </ModalActions>
        }
      >
        <form
          id="add-investor-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateInvestor();
          }}
        >
          <Field label="Name" error={createError}>
            <Input
              value={newInvestorName}
              onChange={(e) => setNewInvestorName(e.target.value)}
              placeholder="e.g., Taylor"
              autoComplete="off"
              disabled={creating}
            />
          </Field>
        </form>
      </Modal>
    </AppShell>
  );
}
