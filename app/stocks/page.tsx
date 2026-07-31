"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { CompanyLogo } from "../CompanyLogo";
import { useSound } from "../SoundContext";
import { BackButton } from "../BackButton";
import { fetchPortfolio, getCachedPortfolio } from "../portfolioCache";

const MotionLink = motion.create(Link);

type HoldingValue = {
  symbol: string;
  name?: string | null;
  logo?: string | null;
  amountInvested: number;
  currentValue: number | null;
  change: number | null;
  changePercent: number | null;
  shares: number | null;
  status?: "open" | "closed";
};

type InvestorValue = {
  name: string;
  slug: string;
  holdings: HoldingValue[];
};

type PortfolioResponse = {
  investors: InvestorValue[];
};

type StockRow = {
  key: string;
  symbol: string;
  name: string | null;
  logo: string | null;
  invested: number;
  currentValue: number;
  changePercent: number;
  gain: number;
  investorName: string;
  slug: string;
};

type SortDir = "desc" | "asc"; // desc = best first, asc = worst first

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

function changeArrow(change: number | null) {
  if (change == null || change === 0) return "•";
  return change > 0 ? "▲" : "▼";
}

/** Combine duplicate OPEN allocations of the same symbol within one investor.
 * Closed positions pass through untouched — merging a sold position's $0
 * currentValue (and "closed" status) into a live re-buy of the same ticker
 * showed a phantom loss, then the inherited status got the row filtered out. */
function mergeHoldings(holdings: HoldingValue[]): HoldingValue[] {
  const bySymbol = new Map<string, HoldingValue>();
  const closed: HoldingValue[] = [];
  holdings.forEach((h) => {
    if (h.status === "closed") {
      closed.push(h);
      return;
    }
    const current = h.currentValue ?? h.amountInvested ?? 0;
    const existing = bySymbol.get(h.symbol);
    if (!existing) {
      bySymbol.set(h.symbol, { ...h, currentValue: current });
      return;
    }
    const invested = (existing.amountInvested ?? 0) + (h.amountInvested ?? 0);
    const value = (existing.currentValue ?? 0) + current;
    existing.amountInvested = invested;
    existing.currentValue = value;
    existing.change = value - invested;
    existing.changePercent = invested ? (existing.change / invested) * 100 : null;
  });
  return [...Array.from(bySymbol.values()), ...closed];
}

export default function StocksPage() {
  const [data, setData] = useState<PortfolioResponse | null>(() =>
    getCachedPortfolio<PortfolioResponse>(),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !getCachedPortfolio());
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterSlug, setFilterSlug] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const { play } = useSound();

  const load = useCallback(async (force = false) => {
    setError(null);
    try {
      const json = await fetchPortfolio<PortfolioResponse>(force);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => null);
  }, [load]);

  const rows = useMemo<StockRow[]>(() => {
    const investors = data?.investors ?? [];
    const base = investors.flatMap((inv) =>
      mergeHoldings(inv.holdings || [])
        .filter((h) => h.changePercent != null && h.status !== "closed")
        .map((h) => {
          const currentValue = h.currentValue ?? h.amountInvested ?? 0;
          const invested = h.amountInvested ?? 0;
          return {
            key: `${inv.slug}-${h.symbol}`,
            symbol: h.symbol,
            name: h.name ?? null,
            logo: h.logo ?? null,
            invested,
            currentValue,
            changePercent: h.changePercent as number,
            gain: currentValue - invested,
            investorName: inv.name,
            slug: inv.slug,
          };
        }),
    );

    return base.sort((a, b) =>
      sortDir === "desc"
        ? b.changePercent - a.changePercent
        : a.changePercent - b.changePercent,
    );
  }, [data, sortDir]);

  const maxPct = useMemo(
    () => Math.max(...rows.map((r) => Math.abs(r.changePercent)), 1),
    [rows],
  );

  // The investors available to filter by (each holder of a holding).
  const investorOptions = useMemo(
    () => (data?.investors ?? []).map((i) => ({ name: i.name, slug: i.slug })),
    [data],
  );
  const activeFilterName =
    filterSlug === "all"
      ? "All"
      : (investorOptions.find((o) => o.slug === filterSlug)?.name ?? "All");

  // Filter the leaderboard down to a single holder.
  const filtered = useMemo(
    () =>
      filterSlug === "all"
        ? rows
        : rows.filter((r) => r.slug === filterSlug),
    [rows, filterSlug],
  );

  return (
    <div className="app-backdrop min-h-screen overflow-x-clip text-slate-100">
      <main className="stagger-children mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 pb-12 pt-4 sm:px-6">
        <header className="glass rounded-2xl px-3 py-3 shadow-xl shadow-black/30 sm:px-5">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-amber-400 via-fuchsia-500 to-indigo-500 text-base">
                🔥
              </span>
              <div className="min-w-0 leading-tight">
                <p className="gradient-text truncate text-base font-bold tracking-tight">
                  Stock Leaderboard
                </p>
                <p className="truncate text-[10px] uppercase tracking-[0.18em] text-slate-400 sm:tracking-[0.22em]">
                  Every holding, ranked
                </p>
              </div>
            </div>
            <BackButton />
          </div>
        </header>

        {loading && (
          <div className="glass rounded-3xl p-4 sm:p-6">
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-16 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="glass rounded-3xl border-rose-500/30 bg-rose-950/30 p-8 text-rose-100">
            <p className="font-semibold">Couldn&apos;t load stocks</p>
            <p className="mt-1 text-sm text-rose-200/80">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                load(true);
              }}
              className="mt-4 cursor-pointer rounded-full border border-rose-300/40 px-4 py-1.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="glass rounded-3xl p-10 text-center text-slate-300">
            <p className="text-lg font-semibold text-white">No holdings yet</p>
            <p className="mt-1 text-sm text-slate-400">
              Add investments to see the leaderboard.
            </p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <section className="glass rounded-3xl p-4 shadow-2xl shadow-black/30 sm:p-6">
            <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {filtered.length}
                {filterSlug !== "all" ? ` of ${rows.length}` : ""} holdings
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {/* Filter-by-holder dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      play(filterOpen ? "close" : "open");
                      setFilterOpen((o) => !o);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-200 transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:text-white"
                  >
                    <span className="text-slate-400">Filter:</span>
                    {activeFilterName}
                    <span aria-hidden className="text-slate-400">
                      ▾
                    </span>
                  </button>
                  {filterOpen && (
                    <>
                      <button
                        type="button"
                        aria-hidden
                        tabIndex={-1}
                        className="fixed inset-0 z-10 cursor-default"
                        onClick={() => setFilterOpen(false)}
                      />
                      <div className="absolute left-0 z-20 mt-1.5 max-h-64 w-44 overflow-auto rounded-xl border border-white/10 bg-slate-900/95 p-1 shadow-xl shadow-black/40 backdrop-blur">
                        {[{ name: "All holders", slug: "all" }, ...investorOptions].map(
                          (opt) => (
                            <button
                              key={opt.slug}
                              type="button"
                              onClick={() => {
                                play("toggle");
                                setFilterSlug(opt.slug);
                                setFilterOpen(false);
                              }}
                              className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition ${
                                filterSlug === opt.slug
                                  ? "bg-cyan-500/15 text-cyan-100"
                                  : "text-slate-300 hover:bg-white/5 hover:text-white"
                              }`}
                            >
                              <span className="truncate">{opt.name}</span>
                              {filterSlug === opt.slug && (
                                <span aria-hidden>✓</span>
                              )}
                            </button>
                          ),
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    play("toggle");
                    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                  }}
                  aria-label={`Sorted ${
                    sortDir === "desc" ? "best to worst" : "worst to best"
                  } — tap to reverse`}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-100 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:text-white"
                >
                  {sortDir === "desc" ? "Best first" : "Worst first"}
                  <span aria-hidden className="text-sm leading-none">
                    {sortDir === "desc" ? "↓" : "↑"}
                  </span>
                </button>
              </div>
            </div>
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                No holdings for {activeFilterName}.
              </p>
            )}
            <div className="space-y-2">
              {filtered.map((row, idx) => {
                const tone = toneClasses(row.changePercent);
                const barPct = Math.max(
                  4,
                  (Math.max(0, row.changePercent) / maxPct) * 100,
                );
                return (
                  <MotionLink
                    key={row.key}
                    href={`/investor/${row.slug}`}
                    onClick={() => play("nav")}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: Math.min(idx, 12) * 0.04,
                      type: "spring",
                      stiffness: 320,
                      damping: 30,
                    }}
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.99 }}
                    className="relative block overflow-hidden rounded-2xl border border-white/5 bg-white/3 px-3 py-3 transition hover:border-white/10 hover:bg-white/6"
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-0 bg-linear-to-r from-fuchsia-400/20 to-transparent"
                      style={{ width: `${barPct}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-slate-500">
                          {idx + 1}
                        </span>
                        <CompanyLogo
                          symbol={row.symbol}
                          name={row.name}
                          logo={row.logo}
                          size={40}
                          delay={Math.min(idx, 8) * 60}
                          linkToLookup
                        />
                        <div className="min-w-0 max-w-24 sm:max-w-32">
                          <p className="truncate text-sm font-semibold text-white">
                            {row.symbol}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {row.name || "—"}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            Held by{" "}
                            <span className="text-slate-300">
                              {row.investorName}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${tone.pill}`}
                        >
                          {changeArrow(row.changePercent)}{" "}
                          {formatPercent(row.changePercent)}
                        </span>
                        <p className="mt-1 text-[11px] text-slate-400">
                          <span className="text-slate-500">Now</span>{" "}
                          {formatCurrency(row.currentValue)}
                        </p>
                        <p className={`text-[11px] ${tone.text}`}>
                          {row.gain >= 0 ? "+" : "−"}
                          {formatCurrency(Math.abs(row.gain))}
                        </p>
                      </div>
                    </div>
                  </MotionLink>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
