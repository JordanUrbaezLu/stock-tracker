"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "./AdminContext";

type HistoryPoint = { time: number; value: number };

type HoldingValue = {
  symbol: string;
  name?: string | null;
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
};

type InvestorValue = {
  name: string;
  slug: string;
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-slate-950 p-5 shadow-xl shadow-cyan-500/20">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
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
  const fixed = value.toFixed(2);
  return `${fixed}%`;
}

function badgeColor(change: number | null) {
  if (change == null || change === 0) return "text-slate-300";
  return change > 0 ? "text-emerald-400" : "text-rose-400";
}

function changeArrow(change: number | null) {
  if (change == null || change === 0) return "•";
  return change > 0 ? "▲" : "▼";
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

export default function Home() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slidesPerView, setSlidesPerView] = useState(1);
  const { isAdmin } = useAdmin();
  const [showAddInvestor, setShowAddInvestor] = useState(false);
  const [newInvestorName, setNewInvestorName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  useEffect(() => {
    const updateSlides = () => {
      setSlidesPerView(window.innerWidth < 1024 ? 1 : 0); // mobile carousel vs stacked list
    };
    updateSlides();
    window.addEventListener("resize", updateSlides);
    return () => window.removeEventListener("resize", updateSlides);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [data?.investors.length]);

  const asOfDate = useMemo(() => {
    if (!data) return "";
    const date = new Date(data.asOf);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [data]);

  const investors = data?.investors ?? [];
  const translateX =
    slidesPerView === 1
      ? `translateX(-${activeIndex * 100}%)`
      : "translateX(0%)";
  const cardWidth = "100%";
  const showNav = slidesPerView === 1 && investors.length > 1;

  const handleNext = () => {
    if (!investors.length) return;
    setActiveIndex((prev) => (prev + 1) % investors.length);
  };

  const handlePrev = () => {
    if (!investors.length) return;
    setActiveIndex((prev) => (prev - 1 + investors.length) % investors.length);
  };

  const Card = ({ investor }: { investor: InvestorValue }) => {
    const changeClass = badgeColor(investor.change);
    const mergedHoldings = mergeHoldings(investor.holdings || []);
    return (
      <Link
        href={`/investor/${investor.slug}`}
        className="block h-full"
        aria-label={`Open ${investor.name}'s portfolio`}
      >
        <div className="flex h-full flex-col gap-3 rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-4 shadow-lg shadow-cyan-500/20 transition hover:-translate-y-1 hover:border-cyan-400/60 hover:shadow-cyan-400/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-2xl uppercase tracking-[0.35em] text-cyan-200 pb-2">
                {investor.name}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-semibold text-white">
                {formatCurrency(investor.currentValue)}
              </p>
              <p className={`text-sm font-semibold ${changeClass}`}>
                {investor.change >= 0 ? "▲" : "▼"}{" "}
                {formatCurrency(Math.abs(investor.change))}
              </p>
              <p className="text-xs text-slate-400">
                Invested: {formatCurrency(investor.totalInvested)}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-cyan-500/10 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>Holdings</span>
              <span>Performance</span>
            </div>
            <div className="space-y-3">
              {mergedHoldings.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 px-3 py-4 text-center text-xs text-slate-400">
                  No investments yet. Tap to add the first one.
                </div>
              )}
              {mergedHoldings.map((holding, idx) => {
                const holdingChange = holding.change ?? 0;
                const holdingChangeClass = badgeColor(holdingChange);
                return (
                  <div
                    key={`${holding.symbol}-${idx}`}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {holding.symbol}
                      </p>
                      <p className="text-xs text-slate-500">
                        {holding.name || "Loading company"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold ${holdingChangeClass}`}
                      >
                        {changeArrow(holding.change)}{" "}
                        {formatPercent(holding.changePercent)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatCurrency(holding.currentValue)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Tap a card to see full details (invested, shares, start, current).
            </p>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-black text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-5 py-10 sm:px-8">
        <header className="space-y-3 rounded-3xl border border-cyan-500/20 bg-slate-900/70 p-5 shadow-lg shadow-cyan-500/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-indigo-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-900">
              <span role="img" aria-hidden>
                ✨
              </span>
              Investments Summary
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <Link
                href="/lookup"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-500/30 bg-slate-950/60 px-3 py-1 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:text-cyan-100"
              >
                Lookup
                <span className="text-white" aria-hidden>
                  🔍
                </span>
              </Link>
              <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/50 px-2 py-1">
                {!isAdmin ? (
                  <Link
                    href="/admin"
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 transition hover:-translate-y-0.5 hover:text-fuchsia-100"
                  >
                    Admin
                    <span className="text-white" aria-hidden>
                      👤
                    </span>
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/admin"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-fuchsia-100 transition hover:-translate-y-0.5 hover:text-white"
                    >
                      Admin panel
                      <span className="text-white" aria-hidden>
                        👤
                      </span>
                    </Link>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                      Admin
                    </span>
                  </>
                )}
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddInvestor(true)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:text-white"
                >
                  ＋ Add investor
                </button>
              )}
              {asOfDate && (
                <span className="rounded-full border border-slate-800 bg-slate-950/50 px-3 py-1 text-xs text-slate-300">
                  Updated {asOfDate}
                </span>
              )}
            </div>
          </div>
        </header>

        <section className="relative">
          {loading && (
            <div className="rounded-3xl border border-cyan-500/20 bg-slate-900/70 p-8 text-slate-200 shadow-lg shadow-cyan-500/20">
              Loading latest performance...
            </div>
          )}
          {error && (
            <div className="rounded-3xl border border-rose-700/40 bg-rose-950/50 p-8 text-rose-100 shadow-lg shadow-rose-900/40">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {slidesPerView === 1 ? (
                <div className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-900/60 p-4 shadow-lg shadow-cyan-500/20">
                  <div
                    className="flex transition-transform duration-500 ease-out"
                    style={{ transform: translateX }}
                  >
                    {investors.map((investor, idx) => (
                      <div
                        key={investor.slug}
                        className="shrink-0 px-1 sm:px-2"
                        style={{ width: cardWidth }}
                      >
                        <div
                          className="animate-fade-in-up"
                          style={{ animationDelay: `${idx * 80}ms` }}
                        >
                          <Card investor={investor} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {showNav && (
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={handlePrev}
                        className="h-10 w-10 rounded-full border border-cyan-500/40 bg-slate-900 text-cyan-200 transition transform hover:-translate-y-0.5 hover:border-cyan-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                        aria-label="Previous investor"
                      >
                        ◀
                      </button>
                      <div className="flex items-center gap-2">
                        {investors.map((_, idx) => (
                          <span
                            key={idx}
                            className={`h-2 w-2 rounded-full ${
                              idx === activeIndex
                                ? "bg-cyan-400"
                                : "bg-slate-600"
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleNext}
                        className="h-10 w-10 rounded-full border border-cyan-500/40 bg-slate-900 text-cyan-200 transition transform hover:-translate-y-0.5 hover:border-cyan-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                        aria-label="Next investor"
                      >
                        ▶
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {investors.map((investor, idx) => (
                    <div
                      key={investor.slug}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${idx * 80}ms` }}
                    >
                      <Card investor={investor} />
                    </div>
                  ))}
                </div>
              )}
            </>
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
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
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
            className="cursor-pointer rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateInvestor}
            disabled={creating}
            className="cursor-pointer rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-700/60"
          >
            {creating ? "Saving..." : "Add investor"}
          </button>
        </div>
      </div>
    </Modal>
  </div>
);
}
