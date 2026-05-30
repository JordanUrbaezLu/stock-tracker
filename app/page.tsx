"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAdmin } from "./AdminContext";
import { Sparkline } from "./Sparkline";
import { CompanyLogo } from "./CompanyLogo";
import { AnimatedNumber } from "./AnimatedNumber";
import { Carousel } from "./Carousel";
import { celebrate } from "./confetti";
import { initials, avatarGradient } from "./avatar";

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

/**
 * Sum every investor's value history into one combined group timeline.
 * Forward-filled: at each timestamp we add each investor's last-known value
 * (0 before their first point) rather than only investors that have a point at
 * that exact instant — otherwise a timestamp unique to one investor sums to
 * just their value and the group line shows a fake dip.
 */
function combineHistories(investors: InvestorValue[]): HistoryPoint[] {
  const series = investors
    .map((inv) => [...(inv.valueHistory ?? [])].sort((a, b) => a.time - b.time))
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
      className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/3 px-3 py-2.5 transition hover:border-white/10 hover:bg-white/6"
    >
      <CompanyLogo
        symbol={holding.symbol}
        name={holding.name}
        logo={holding.logo}
        size={38}
        delay={index * 70}
        linkToLookup
      />
      <div className="min-w-0 flex-1">
        {/* Row 1: ticker + (sold) + change % — ticker is never crowded out */}
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-white">
            {holding.symbol}
          </p>
          {closed && (
            <span className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200 ring-1 ring-amber-300/30">
              Sold
            </span>
          )}
          <span
            className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tone.pill}`}
          >
            {changeArrow(holding.change)} {formatPercent(holding.changePercent)}
          </span>
        </div>
        {/* Row 2: company name (truncates) + start / now (or sold) values */}
        <div className="mt-0.5 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {holding.name || "—"}
          </p>
          <p className="shrink-0 whitespace-nowrap text-[11px] text-slate-400">
            <span className="text-slate-500">Start</span>{" "}
            {formatCurrency(invested)}
            <span className="px-1 text-slate-600">·</span>
            <span className="text-slate-500">{closed ? "Sold" : "Now"}</span>{" "}
            <span className={closed ? "text-amber-200" : "text-slate-200"}>
              {formatCurrency(closed ? holding.proceeds : holding.currentValue)}
            </span>
          </p>
        </div>
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

  // Personalized AI encouragement. Refetched per investor (and on each reload,
  // since `investor` is recreated when the portfolio refreshes). The endpoint
  // always resolves to a message — real AI when ANTHROPIC_API_KEY is set, a
  // warm templated line otherwise — so every card gets one.
  const [insight, setInsight] = useState<string | null>(null);
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
      .then((j: { message?: string } | null) => {
        if (j?.message) setInsight(j.message);
      })
      .catch(() => null);
    return () => controller.abort();
  }, [investor]);

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
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={`avatar-pulse flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br ${avatarGradient(
                  investor.name,
                )} text-[13px] font-bold text-white shadow-lg shadow-black/30 ring-1 ring-white/20`}
              >
                {initials(investor.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold leading-tight text-white">
                  {investor.name}
                </p>
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
                  Investor
                </p>
              </div>
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

        {(insight || (best && (best.changePercent ?? 0) > 0)) && (
          <div className="relative flex items-start gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2">
            <span className="text-base leading-5" aria-hidden>
              {insight ? "✨" : "🔥"}
            </span>
            <p className="text-xs leading-5 text-emerald-100">
              {insight ? (
                insight
              ) : (
                <>
                  <span className="font-semibold">{best!.symbol}</span> leading
                  at{" "}
                  <span className="font-semibold">
                    {formatPercent(best!.changePercent)}
                  </span>
                </>
              )}
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
      <div className="mt-2.5 space-y-1">
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
              className="relative block overflow-hidden rounded-2xl border border-white/5 bg-white/3 px-3 py-1.5 transition hover:border-white/10 hover:bg-white/6"
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
      <div className="mt-2.5 space-y-1">
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
              className="relative block overflow-hidden rounded-2xl border border-white/5 bg-white/3 px-3 py-1.5 transition hover:border-white/10 hover:bg-white/6"
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
                    size={26}
                    delay={idx * 70}
                    linkToLookup
                  />
                        <div className="min-w-0 max-w-22 sm:max-w-28">
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
  const multi = count > 1;
  const leader = [...investors].sort((a, b) => returnPct(b) - returnPct(a))[0];

  const overview = (
    <div className="flex h-full flex-col">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
        Group portfolio · {count} {count === 1 ? "investor" : "investors"}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:gap-x-3">
        <AnimatedNumber
          value={groupCurrent}
          format={formatCurrency}
          className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 sm:px-2.5 sm:text-sm ${
              toneClasses(groupGain).pill
            }`}
          >
            {changeArrow(groupGain)} {formatPercent(groupGainPct)}
          </span>
          <span
            className={`whitespace-nowrap text-xs font-medium sm:text-sm ${toneClasses(groupGain).text}`}
          >
            {groupGain >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(groupGain))}
          </span>
        </div>
        {leader && multi && (
          // Full-width on mobile (drops to its own line, never clips the card
          // edge); inline + right-aligned from sm up.
          <div className="w-full min-w-0 sm:ml-auto sm:w-auto">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 sm:gap-2 sm:px-2.5">
              <span className="text-xs" aria-hidden>
                🥇
              </span>
              <span className="max-w-24 truncate text-xs font-semibold text-amber-100 sm:max-w-14 sm:text-sm md:max-w-20">
                {leader.name}
              </span>
              <span className="whitespace-nowrap text-[11px] font-semibold text-amber-200/90 sm:text-xs">
                {formatPercent(returnPct(leader))}
              </span>
            </span>
          </div>
        )}
      </div>
      {groupHistory.length > 1 && (
        // Cap the graph height on every breakpoint. Without a cap, the filled
        // SVG (height:100% with no taller sibling to bound it) falls back to
        // aspect-ratio sizing and balloons on wide screens — which made the
        // Overview the tallest slide and left the list panels with dead space.
        // Capped, the list slides set the height and the graph stays sane.
        <div className="relative mt-3 flex max-h-24 min-h-0 flex-1 sm:max-h-32">
          <Sparkline
            points={groupHistory}
            positive={groupGain >= 0}
            strokeWidth={2}
            showAxes
            fill
            className="w-full"
          />
        </div>
      )}
    </div>
  );

  const slides: ReactNode[] = [overview];
  const labels = ["Overview"];
  if (multi) {
    LEADERBOARDS.forEach((board) => {
      slides.push(<LeaderboardSlide board={board} investors={investors} />);
      labels.push(board.title);
    });
    slides.push(<TopStocksSlide investors={investors} />);
    labels.push("Top Stocks");
  }

  return (
    <div className="glass relative overflow-hidden rounded-3xl p-3.5 shadow-2xl shadow-black/30 sm:p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl"
      />
      <Carousel
        slides={slides}
        labels={labels}
        hint={(label) => `${label} · swipe for more`}
      />
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
  const { isAdmin } = useAdmin();
  const [showAddInvestor, setShowAddInvestor] = useState(false);
  const [newInvestorName, setNewInvestorName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
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

  // One-time celebration when the portfolio first loads in the green.
  useEffect(() => {
    if (loading || error || celebrated.current) return;
    if (count > 0 && groupGain > 0) {
      celebrated.current = true;
      const t = setTimeout(() => celebrate(), 350);
      return () => clearTimeout(t);
    }
  }, [loading, error, count, groupGain]);

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
            <Carousel
              className="mx-auto w-full max-w-xl"
              arrows
              hint="Swipe to explore"
              hintMobileOnly
              // Round the clip + pad each slide so the card's rounded corners
              // and drop shadow aren't cut into a square corner by the viewport.
              viewportClassName="rounded-[2rem]"
              slidePadding="px-1 py-1.5"
              labels={investors.map((inv) => inv.name)}
              slides={investors.map((investor) => (
                <InvestorCard key={investor.slug} investor={investor} />
              ))}
            />
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
