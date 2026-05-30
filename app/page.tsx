"use client";

import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAdmin } from "./AdminContext";
import { Sparkline } from "./Sparkline";
import { CompanyLogo } from "./CompanyLogo";
import { AnimatedNumber } from "./AnimatedNumber";
import { celebrate } from "./confetti";

const MotionLink = motion.create(Link);

/** Springy entrance for a list of rows, staggered by index. */
const rowEntrance = (idx: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: {
    delay: Math.min(idx, 8) * 0.06,
    type: "spring" as const,
    stiffness: 320,
    damping: 28,
  },
});

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
  holdings: HoldingValue[];
  valueHistory: HistoryPoint[];
};

type PortfolioResponse = {
  asOf: number;
  investors: InvestorValue[];
  symbols: string[];
};

/**
 * Trackpad two-finger horizontal swipe → step a carousel. Wheel events are
 * attached non-passively so we can preventDefault (stops browser back-swipe).
 * A single flick (plus its inertial momentum) advances exactly one step: we
 * only re-arm after the trackpad has been idle briefly.
 *
 * Returns a callback ref. Tracking the node via state (rather than a ref object)
 * means the listener always rebinds when the element mounts/remounts — which the
 * inline investor carousel does during the loading→loaded transition.
 */
function useWheelStep(
  enabled: boolean,
  step: (dir: number) => void,
): (node: HTMLElement | null) => void {
  const stepRef = useRef(step);
  stepRef.current = step;
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!node || !enabled) return;

    let acc = 0;
    let armed = true;
    // After a step fires, the gesture must first "settle" (momentum decays
    // below settleLow) and only then can a fresh rising edge re-arm it. This
    // makes one flick — however big — fire exactly once: its acceleration ramp
    // and peak are ignored while unsettled, and its decaying tail never rises.
    let settled = true;
    let minSinceSettle = Infinity;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const threshold = 50;
    const settleLow = 8; // momentum considered died down below this
    const rearmFloor = 14; // a new push must exceed this absolute speed
    const rearmRise = 16; // ...and climb this much above the settled low

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const ax = Math.abs(e.deltaX);

      if (!armed) {
        if (!settled) {
          if (ax < settleLow) {
            settled = true;
            minSinceSettle = ax;
          }
        } else {
          minSinceSettle = Math.min(minSinceSettle, ax);
          if (ax > rearmFloor && ax > minSinceSettle + rearmRise) {
            armed = true;
            acc = 0;
          }
        }
      }

      // Fallback: fully reset once events stop entirely.
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => {
        acc = 0;
        armed = true;
        settled = true;
        minSinceSettle = Infinity;
      }, 200);

      if (!armed) return;
      acc += e.deltaX;
      if (Math.abs(acc) >= threshold) {
        const dir = acc > 0 ? 1 : -1;
        acc = 0;
        armed = false;
        settled = false;
        minSinceSettle = Infinity;
        stepRef.current(dir);
      }
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
      if (idle) clearTimeout(idle);
    };
  }, [node, enabled]);

  return useCallback((n: HTMLElement | null) => setNode(n), []);
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className="glass w-full max-w-md rounded-3xl p-6 shadow-2xl shadow-cyan-500/10"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function isUp(change: number | null) {
  return change != null && change > 0;
}

function changeArrow(change: number | null) {
  if (change == null || change === 0) return "•";
  return change > 0 ? "▲" : "▼";
}

function toneClasses(change: number | null) {
  if (change == null || change === 0)
    return {
      text: "text-slate-300",
      pill: "bg-slate-500/15 text-slate-200 ring-slate-400/20",
    };
  return change > 0
    ? {
        text: "text-emerald-400",
        pill: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/25",
      }
    : {
        text: "text-rose-400",
        pill: "bg-rose-500/15 text-rose-300 ring-rose-400/25",
      };
}

function mergeHoldings(holdings: HoldingValue[]): HoldingValue[] {
  const bySymbol = new Map<string, HoldingValue>();

  holdings.forEach((holding) => {
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

  return Array.from(bySymbol.values()).map((h) => {
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
}

function returnPct(inv: InvestorValue) {
  return inv.originalAmountInvested
    ? ((inv.currentValue - inv.originalAmountInvested) /
        inv.originalAmountInvested) *
        100
    : 0;
}

/** Sum every investor's value history into one combined group timeline. */
function combineHistories(investors: InvestorValue[]): HistoryPoint[] {
  const timeline = new Map<number, number>();
  investors.forEach((inv) => {
    (inv.valueHistory ?? []).forEach((p) => {
      timeline.set(p.time, (timeline.get(p.time) ?? 0) + p.value);
    });
  });
  return Array.from(timeline.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));
}

/** Medal for the top three places, otherwise the numeric rank. */
function rankLabel(idx: number): string {
  return ["🥇", "🥈", "🥉"][idx] ?? `${idx + 1}`;
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

function HoldingRow({
  holding,
  index = 0,
}: {
  holding: HoldingValue;
  index?: number;
}) {
  const tone = toneClasses(holding.change);
  const invested = holding.amountInvested ?? 0;
  const closed = holding.status === "closed";
  return (
    <motion.div
      {...rowEntrance(index)}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/3 px-3 py-2.5 transition hover:border-white/10 hover:bg-white/6"
    >
      <div className="flex min-w-0 items-center gap-3">
        <CompanyLogo
          symbol={holding.symbol}
          name={holding.name}
          logo={holding.logo}
          size={38}
          delay={index * 70}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-white">
              {holding.symbol}
            </p>
            {closed && (
              <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200 ring-1 ring-amber-300/30">
                Sold
              </span>
            )}
          </div>
          <p className="truncate text-xs text-slate-400">
            {holding.name || "—"}
          </p>
        </div>
      </div>
      <div className="text-right">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tone.pill}`}
        >
          {changeArrow(holding.change)} {formatPercent(holding.changePercent)}
        </span>
        <p className="mt-1 text-[11px] text-slate-400">
          <span className="text-slate-500">Start</span>{" "}
          {formatCurrency(invested)}
          <span className="px-1 text-slate-600">·</span>
          <span className="text-slate-500">{closed ? "Sold" : "Now"}</span>{" "}
          <span className={closed ? "text-amber-200" : "text-slate-200"}>
            {formatCurrency(closed ? holding.proceeds : holding.currentValue)}
          </span>
        </p>
      </div>
    </motion.div>
  );
}

function InvestorCard({ investor }: { investor: InvestorValue }) {
  const originalGain = investor.currentValue - investor.originalAmountInvested;
  const gainPct = investor.originalAmountInvested
    ? (originalGain / investor.originalAmountInvested) * 100
    : 0;
  const tone = toneClasses(originalGain);
  const mergedHoldings = mergeHoldings(investor.holdings || []);
  const hasHistory =
    Array.isArray(investor.valueHistory) && investor.valueHistory.length > 1;
  const best = topPerformer(mergedHoldings);

  return (
    <Link
      href={`/investor/${investor.slug}`}
      data-card-link
      className="group block h-full focus:outline-none"
      aria-label={`Open ${investor.name}'s portfolio`}
    >
      <div className="glass relative flex h-full flex-col gap-5 overflow-hidden rounded-[1.75rem] p-5 shadow-2xl shadow-black/40 sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200 ring-1 ring-white/10">
                {investor.name}
              </span>
            </div>
            <AnimatedNumber
              value={investor.currentValue}
              format={formatCurrency}
              className="mt-3 block text-3xl font-bold tracking-tight text-white sm:text-4xl"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${tone.pill}`}
              >
                {changeArrow(originalGain)} {formatPercent(gainPct)}
              </span>
              <span className={`text-sm font-medium ${tone.text}`}>
                {originalGain >= 0 ? "+" : "−"}
                {formatCurrency(Math.abs(originalGain))}
              </span>
            </div>
          </div>
          {hasHistory && (
            <div className="ml-2 min-w-0 flex-1 self-center">
              <p className="mb-1 text-right text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                30D trend
              </p>
              <Sparkline
                points={investor.valueHistory}
                positive={originalGain >= 0}
                height={72}
                strokeWidth={2}
                showAxes
                className="w-full"
              />
            </div>
          )}
        </div>

        <div className="relative grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/5 bg-white/3 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Original invested
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {formatCurrency(investor.originalAmountInvested)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/3 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Total gain
            </p>
            <p className={`mt-0.5 text-sm font-semibold ${tone.text}`}>
              {formatCurrency(originalGain)}
            </p>
          </div>
        </div>

        {best && (best.changePercent ?? 0) > 0 && (
          <div className="relative flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2">
            <span className="text-base" aria-hidden>
              🔥
            </span>
            <p className="text-xs text-emerald-100">
              <span className="font-semibold">{best.symbol}</span> leading at{" "}
              <span className="font-semibold">
                {formatPercent(best.changePercent)}
              </span>
            </p>
          </div>
        )}

        <div className="relative space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Holdings</span>
            <span>{mergedHoldings.length}</span>
          </div>
          <div className="space-y-2">
            {mergedHoldings.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/2 px-3 py-5 text-center text-xs text-slate-400">
                No investments yet. Tap to add the first one.
              </div>
            )}
            {mergedHoldings.slice(0, 4).map((holding, idx) => (
              <HoldingRow
                key={`${holding.symbol}-${idx}`}
                holding={holding}
                index={idx}
              />
            ))}
            {mergedHoldings.length > 4 && (
              <p className="pt-1 text-center text-[11px] text-slate-500">
                +{mergedHoldings.length - 4} more · tap to view all
              </p>
            )}
          </div>
        </div>

        <div className="relative mt-auto flex items-center justify-between border-t border-white/5 pt-3 text-[11px] text-slate-500">
          <span>Tap for full breakdown</span>
          <span className="text-cyan-300 transition group-hover:translate-x-0.5">
            View →
          </span>
        </div>
      </div>
    </Link>
  );
}

type Board = {
  id: string;
  title: string;
  icon: string;
  bar: string;
  sort: (a: InvestorValue, b: InvestorValue) => number;
  metric: (i: InvestorValue) => number;
  value: (i: InvestorValue) => string;
  positive: (i: InvestorValue) => boolean;
};

const LEADERBOARDS: Board[] = [
  {
    id: "returns",
    title: "Top Returns",
    icon: "🚀",
    bar: "from-emerald-400/30",
    sort: (a, b) => returnPct(b) - returnPct(a),
    metric: returnPct,
    value: (i) => formatPercent(returnPct(i)),
    positive: (i) => returnPct(i) >= 0,
  },
  {
    id: "value",
    title: "Most Valuable",
    icon: "💎",
    bar: "from-cyan-400/30",
    sort: (a, b) => b.currentValue - a.currentValue,
    metric: (i) => i.currentValue,
    value: (i) => formatCurrency(i.currentValue),
    positive: () => true,
  },
];

function LeaderboardSlide({
  board,
  investors,
}: {
  board: Board;
  investors: InvestorValue[];
}) {
  const ranked = [...investors].sort(board.sort);
  const maxMetric = Math.max(
    ...ranked.map((i) => Math.abs(board.metric(i))),
    1,
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>
          {board.icon}
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
          {board.title}
        </p>
      </div>
      <div className="mt-3 space-y-1.5">
        {ranked.map((inv, idx) => {
          const barPct = Math.max(
            4,
            (Math.max(0, board.metric(inv)) / maxMetric) * 100,
          );
          const tone = toneClasses(board.positive(inv) ? 1 : -1);
          return (
            <MotionLink
              key={inv.slug}
              href={`/investor/${inv.slug}`}
              {...rowEntrance(idx)}
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.98 }}
              className="relative block overflow-hidden rounded-2xl border border-white/5 bg-white/3 px-3 py-2 transition hover:border-white/10 hover:bg-white/6"
            >
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-y-0 left-0 bg-linear-to-r ${board.bar} to-transparent`}
                style={{ width: `${barPct}%` }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      idx < 3
                        ? "bg-transparent"
                        : "bg-white/5 text-slate-300 ring-1 ring-white/10"
                    }`}
                  >
                    {rankLabel(idx)}
                  </span>
                  <span className="truncate text-sm font-semibold text-white">
                    {inv.name}
                  </span>
                </div>
                <span className={`shrink-0 text-sm font-bold ${tone.text}`}>
                  {board.value(inv)}
                </span>
              </div>
            </MotionLink>
          );
        })}
      </div>
    </div>
  );
}

/** Best-performing individual holdings across everyone (one owner may sweep). */
function TopStocksSlide({ investors }: { investors: InvestorValue[] }) {
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

  const maxPct = Math.max(...rows.map((r) => Math.abs(r.changePercent)), 1);

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            🔥
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
            Top Stocks
          </p>
        </div>
        <MotionLink
          href="/stocks"
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.95 }}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 transition hover:border-cyan-300/50 hover:text-white"
        >
          View all →
        </MotionLink>
      </div>
      <div className="mt-3 space-y-1.5">
        {rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/2 px-3 py-5 text-center text-xs text-slate-400">
            No holdings yet.
          </div>
        )}
        {rows.map((row, idx) => {
          const barPct = Math.max(4, (Math.max(0, row.changePercent) / maxPct) * 100);
          const tone = toneClasses(row.changePercent);
          return (
            <MotionLink
              key={row.key}
              href={`/investor/${row.slug}`}
              {...rowEntrance(idx)}
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.98 }}
              className="relative block overflow-hidden rounded-2xl border border-white/5 bg-white/3 px-3 py-2 transition hover:border-white/10 hover:bg-white/6"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 bg-linear-to-r from-fuchsia-400/30 to-transparent"
                style={{ width: `${barPct}%` }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      idx < 3
                        ? "bg-transparent"
                        : "bg-white/5 text-slate-300 ring-1 ring-white/10"
                    }`}
                  >
                    {rankLabel(idx)}
                  </span>
                  <CompanyLogo
                    symbol={row.symbol}
                    name={row.name}
                    logo={row.logo}
                    size={30}
                    delay={idx * 70}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {row.symbol}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {row.investorName}
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 text-sm font-bold ${tone.text}`}>
                  {formatPercent(row.changePercent)}
                </span>
              </div>
            </MotionLink>
          );
        })}
      </div>
    </div>
  );
}

function HeroCarousel({
  investors,
  groupCurrent,
  groupGain,
  groupGainPct,
  groupHistory,
  count,
}: {
  investors: InvestorValue[];
  groupCurrent: number;
  groupGain: number;
  groupGainPct: number;
  groupHistory: HistoryPoint[];
  count: number;
}) {
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ startX: 0, active: false, moved: false, width: 1 });
  const [delta, setDelta] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Overview is slide 0; the leaderboards + top-stocks board only matter with
  // more than one investor.
  const slides = count > 1 ? 1 + LEADERBOARDS.length + 1 : 1;
  const leader = [...investors].sort((a, b) => returnPct(b) - returnPct(a))[0];

  const goTo = useCallback(
    (i: number) => setIndex(Math.max(0, Math.min(i, slides - 1))),
    [slides],
  );

  useEffect(() => {
    setIndex((p) => Math.min(p, slides - 1));
  }, [slides]);

  const setWheelNode = useWheelStep(slides > 1, (dir) =>
    setIndex((p) => Math.max(0, Math.min(p + dir, slides - 1))),
  );
  const setViewport = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      setWheelNode(node);
    },
    [setWheelNode],
  );

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (slides <= 1) return;
    drag.current = {
      startX: e.clientX,
      active: true,
      moved: false,
      width: ref.current?.offsetWidth ?? 1,
    };
    setDragging(true);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const d = e.clientX - drag.current.startX;
    if (Math.abs(d) > 6 && !drag.current.moved) {
      drag.current.moved = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const atStart = index === 0 && d > 0;
    const atEnd = index === slides - 1 && d < 0;
    setDelta(atStart || atEnd ? d * 0.35 : d);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const d = e.clientX - drag.current.startX;
    drag.current.active = false;
    setDragging(false);
    setDelta(0);
    const threshold = Math.min(120, drag.current.width * 0.22);
    if (d <= -threshold) goTo(index + 1);
    else if (d >= threshold) goTo(index - 1);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const labels = [
    "Overview",
    ...LEADERBOARDS.map((b) => b.title),
    "Top Stocks",
  ].slice(0, slides);

  return (
    <div className="glass relative overflow-hidden rounded-3xl p-4 shadow-2xl shadow-black/30 sm:p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl"
      />

      <div
        ref={setViewport}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClickCapture={onClickCapture}
        className="relative select-none overflow-hidden"
        style={{ touchAction: "pan-y", cursor: slides > 1 ? "grab" : "auto" }}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${delta}px))`,
            transition: dragging
              ? "none"
              : "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {/* Slide 0 — group overview */}
          <div className="w-full shrink-0 px-0.5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Group portfolio · {count}{" "}
                  {count === 1 ? "investor" : "investors"}
                </p>
                <AnimatedNumber
                  value={groupCurrent}
                  format={formatCurrency}
                  className="mt-1 block text-3xl font-bold tracking-tight text-white sm:text-4xl"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${
                      toneClasses(groupGain).pill
                    }`}
                  >
                    {changeArrow(groupGain)} {formatPercent(groupGainPct)}
                  </span>
                  <span
                    className={`text-sm font-medium ${toneClasses(groupGain).text}`}
                  >
                    {groupGain >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(groupGain))}
                  </span>
                </div>
              </div>
              {leader && count > 1 && (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/80">
                    🥇 Leader
                  </p>
                  <p className="text-sm font-bold text-amber-100">
                    {leader.name}
                  </p>
                  <p className="text-xs text-amber-200/80">
                    {formatPercent(returnPct(leader))}
                  </p>
                </div>
              )}
            </div>
            {groupHistory.length > 1 && (
              <div className="relative mt-3">
                <Sparkline
                  points={groupHistory}
                  positive={groupGain >= 0}
                  height={58}
                  strokeWidth={2}
                  showAxes
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Leaderboard slides */}
          {count > 1 &&
            LEADERBOARDS.map((board) => (
              <div key={board.id} className="w-full shrink-0 px-0.5">
                <LeaderboardSlide board={board} investors={investors} />
              </div>
            ))}

          {/* Top performing stocks across everyone */}
          {count > 1 && (
            <div className="w-full shrink-0 px-0.5">
              <TopStocksSlide investors={investors} />
            </div>
          )}
        </div>
      </div>

      {slides > 1 && (
        <div className="relative mt-4 flex items-center justify-center gap-2">
          {labels.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show ${label}`}
              title={label}
              className={`h-2 rounded-full transition-all ${
                i === index
                  ? "w-7 bg-linear-to-r from-cyan-400 to-fuchsia-400"
                  : "w-2 bg-slate-600 hover:bg-slate-400"
              }`}
            />
          ))}
        </div>
      )}
      {slides > 1 && (
        <p className="relative mt-1.5 text-center text-[11px] text-slate-500">
          {labels[index]} · swipe for more
        </p>
      )}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="glass h-104 rounded-[1.75rem] p-6">
      <div className="skeleton h-4 w-28 rounded-full" />
      <div className="skeleton mt-4 h-9 w-40 rounded-lg" />
      <div className="skeleton mt-3 h-5 w-24 rounded-full" />
      <div className="skeleton mt-6 h-14 w-full rounded-xl" />
      <div className="mt-6 space-y-2">
        <div className="skeleton h-12 w-full rounded-2xl" />
        <div className="skeleton h-12 w-full rounded-2xl" />
        <div className="skeleton h-12 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const { isAdmin } = useAdmin();
  const [showAddInvestor, setShowAddInvestor] = useState(false);
  const [newInvestorName, setNewInvestorName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startX: 0, active: false, moved: false, width: 0 });
  const [dragDelta, setDragDelta] = useState(0);
  const [dragging, setDragging] = useState(false);
  const celebrated = useRef(false);

  const loadPortfolios = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", { cache: "no-store" });
      const json = (await res.json()) as PortfolioResponse & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json?.error || "Could not load portfolios.");
      }

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
      await loadPortfolios();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to create investor.";
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }, [newInvestorName, loadPortfolios, isAdmin]);

  const rawInvestors = data?.investors ?? [];
  // Leaderboard: best return first, so the front of the carousel is "who's winning".
  const investors = [...rawInvestors].sort((a, b) => returnPct(b) - returnPct(a));
  const count = investors.length;

  const groupCurrent = investors.reduce((s, i) => s + i.currentValue, 0);
  const groupOriginal = investors.reduce(
    (s, i) => s + i.originalAmountInvested,
    0,
  );
  const groupGain = groupCurrent - groupOriginal;
  const groupGainPct = groupOriginal ? (groupGain / groupOriginal) * 100 : 0;
  const groupHistory = combineHistories(investors);

  useEffect(() => {
    setActiveIndex((prev) => (count ? Math.min(prev, count - 1) : 0));
  }, [count]);

  // One-time celebration when the portfolio first loads in the green.
  useEffect(() => {
    if (loading || error || celebrated.current) return;
    if (count > 0 && groupGain > 0) {
      celebrated.current = true;
      const t = setTimeout(() => celebrate(), 350);
      return () => clearTimeout(t);
    }
  }, [loading, error, count, groupGain]);

  const goTo = useCallback(
    (idx: number) => {
      if (!count) return;
      setActiveIndex(Math.max(0, Math.min(idx, count - 1)));
    },
    [count],
  );

  const setWheelNode = useWheelStep(count > 1, (dir) =>
    setActiveIndex((prev) => Math.max(0, Math.min(prev + dir, count - 1))),
  );
  const setViewport = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
      setWheelNode(node);
    },
    [setWheelNode],
  );

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (count <= 1) return;
    drag.current = {
      startX: e.clientX,
      active: true,
      moved: false,
      width: viewportRef.current?.offsetWidth ?? 1,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const delta = e.clientX - drag.current.startX;
    if (Math.abs(delta) > 6 && !drag.current.moved) {
      drag.current.moved = true;
      // Capture only once a real drag starts, so plain taps still reach the
      // card's link and navigate.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    // Add light resistance when dragging past the first/last card.
    const atStart = activeIndex === 0 && delta > 0;
    const atEnd = activeIndex === count - 1 && delta < 0;
    setDragDelta(atStart || atEnd ? delta * 0.35 : delta);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const { startX, width } = drag.current;
    const delta = e.clientX - startX;
    drag.current.active = false;
    setDragging(false);
    setDragDelta(0);
    const threshold = Math.min(120, width * 0.22);
    if (delta <= -threshold) goTo(activeIndex + 1);
    else if (delta >= threshold) goTo(activeIndex - 1);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const showNav = count > 1;
  const basePct = -activeIndex * 100;

  return (
    <div className="app-backdrop min-h-screen overflow-x-clip text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 pb-10 pt-3 sm:px-6 sm:pt-4">
        <header className="glass rounded-2xl px-4 py-3 shadow-xl shadow-black/30 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-cyan-400 via-fuchsia-500 to-indigo-500 text-base">
                📈
              </span>
              <div className="leading-tight">
                <p className="gradient-text text-base font-bold tracking-tight">
                  Stock Portfolio
                </p>
                <p
                  className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] ${
                    loading
                      ? "text-amber-300/90"
                      : error
                        ? "text-rose-300/90"
                        : "text-slate-400"
                  }`}
                >
                  <span
                    className={`live-dot ${
                      loading
                        ? "live-dot--loading"
                        : error
                          ? "live-dot--error"
                          : ""
                    }`}
                    aria-hidden
                  />
                  {loading ? "Getting data…" : error ? "Offline" : "Live Data"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <MotionLink
                href="/lookup"
                whileTap={{ scale: 0.94 }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:text-cyan-100"
              >
                <span aria-hidden>🔍</span> Lookup
              </MotionLink>
              <MotionLink
                href="/admin"
                whileTap={{ scale: 0.94 }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 transition hover:-translate-y-0.5 hover:border-fuchsia-300/50 hover:text-fuchsia-100"
              >
                <span aria-hidden>👤</span>
                {isAdmin ? "Admin panel" : "Admin"}
              </MotionLink>
              {isAdmin && (
                <motion.button
                  type="button"
                  onClick={() => setShowAddInvestor(true)}
                  whileTap={{ scale: 0.94 }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:text-white"
                >
                  ＋ Investor
                </motion.button>
              )}
            </div>
          </div>
        </header>

        {!loading && !error && count > 0 && (
          <HeroCarousel
            investors={investors}
            groupCurrent={groupCurrent}
            groupGain={groupGain}
            groupGainPct={groupGainPct}
            groupHistory={groupHistory}
            count={count}
          />
        )}

        <section className="relative flex flex-1 flex-col">
          {loading && (
            <div className="mx-auto w-full max-w-xl">
              <CardSkeleton />
            </div>
          )}

          {error && !loading && (
            <div className="glass rounded-3xl border-rose-500/30 bg-rose-950/30 p-8 text-rose-100">
              <p className="font-semibold">Couldn&apos;t load portfolios</p>
              <p className="mt-1 text-sm text-rose-200/80">{error}</p>
              <button
                type="button"
                onClick={() => loadPortfolios()}
                className="mt-4 cursor-pointer rounded-full border border-rose-300/40 px-4 py-1.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && count === 0 && (
            <div className="glass rounded-3xl p-10 text-center text-slate-300">
              <p className="text-lg font-semibold text-white">No investors yet</p>
              <p className="mt-1 text-sm text-slate-400">
                {isAdmin
                  ? "Add your first investor to get started."
                  : "Check back soon."}
              </p>
            </div>
          )}

          {!loading && !error && count > 0 && (
            <div className="relative mx-auto w-full max-w-xl">
              <div
                ref={setViewport}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="touch-pan-y cursor-grab select-none overflow-hidden active:cursor-grabbing"
                style={{ touchAction: "pan-y" }}
              >
                <div
                  className="flex"
                  style={{
                    transform: `translateX(calc(${basePct}% + ${dragDelta}px))`,
                    transition: dragging
                      ? "none"
                      : "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  {investors.map((investor) => (
                    <div
                      key={investor.slug}
                      className="w-full shrink-0 px-0.5"
                      onClickCapture={handleCardClick}
                    >
                      <InvestorCard investor={investor} />
                    </div>
                  ))}
                </div>
              </div>

              {showNav && (
                <>
                  {/* Side arrows: tablet + desktop only */}
                  <button
                    type="button"
                    onClick={() => goTo(activeIndex - 1)}
                    disabled={activeIndex === 0}
                    aria-label="Previous investor"
                    className="absolute -left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/10 bg-slate-900/80 text-cyan-200 shadow-lg backdrop-blur transition hover:border-cyan-300/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 md:grid lg:-left-6"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(activeIndex + 1)}
                    disabled={activeIndex === count - 1}
                    aria-label="Next investor"
                    className="absolute -right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/10 bg-slate-900/80 text-cyan-200 shadow-lg backdrop-blur transition hover:border-cyan-300/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 md:grid lg:-right-6"
                  >
                    ▶
                  </button>

                  {/* Dots + swipe hint */}
                  <div className="mt-5 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      {investors.map((inv, idx) => (
                        <button
                          key={inv.slug}
                          type="button"
                          onClick={() => goTo(idx)}
                          aria-label={`Go to ${inv.name}`}
                          className={`h-2 rounded-full transition-all ${
                            idx === activeIndex
                              ? "w-6 bg-linear-to-r from-cyan-400 to-fuchsia-400"
                              : "w-2 bg-slate-600 hover:bg-slate-400"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 md:hidden">
                      Swipe to explore
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </main>

      <Modal
        open={showAddInvestor}
        title="Add investor"
        onClose={() => {
          if (creating) return;
          setShowAddInvestor(false);
          setNewInvestorName("");
          setCreateError(null);
        }}
      >
        <div className="space-y-3">
          <label className="block text-sm text-slate-200">
            Name
            <input
              value={newInvestorName}
              onChange={(e) => setNewInvestorName(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-slate-100 outline-none transition focus:border-cyan-400"
              placeholder="e.g., Taylor"
              disabled={creating}
            />
          </label>
          {createError && (
            <p className="text-sm text-rose-300" role="alert">
              {createError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (creating) return;
                setShowAddInvestor(false);
                setNewInvestorName("");
                setCreateError(null);
              }}
              className="cursor-pointer rounded-xl px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
            >
              Cancel
            </button>
            <motion.button
              type="button"
              onClick={handleCreateInvestor}
              disabled={creating}
              whileTap={{ scale: 0.96 }}
              className="cursor-pointer rounded-xl bg-linear-to-r from-cyan-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Saving..." : "Add investor"}
            </motion.button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
