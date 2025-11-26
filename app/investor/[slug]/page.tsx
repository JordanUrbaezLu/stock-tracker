"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { HoldingsList } from "../HoldingsList";

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
  dateInvested?: string | null;
  history: HistoryPoint[];
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
  return `${value.toFixed(2)}%`;
}

function badgeColor(change: number | null) {
  if (change == null || change === 0) return "text-slate-600";
  return change > 0 ? "text-emerald-500" : "text-rose-500";
}

export default function InvestorDetail() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug?.toString().toLowerCase() ?? "";

  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/portfolio");
        const json = (await res.json()) as PortfolioResponse & { error?: string };
        if (!res.ok) {
          throw new Error(json?.error || "Could not load portfolio data.");
        }
        setData(json);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not load portfolio data.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const investor = useMemo(() => {
    if (!data) return null;
    return data.investors.find(
      (inv) => inv.slug.toLowerCase() === slug.toLowerCase(),
    );
  }, [data, slug]);

  const asOfDate = data
    ? new Date(data.asOf).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-black text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-5 py-12 sm:px-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-6 shadow-lg shadow-cyan-500/20">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-slate-900 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-sm shadow-cyan-500/20 transition hover:border-cyan-400 hover:bg-slate-800"
            >
              ← Back to summary
            </Link>
            <div className="text-sm text-slate-400">
              {asOfDate ? `Prices as of ${asOfDate}` : "Loading prices..."}
            </div>
          </div>
          {loading && <p className="text-sm text-slate-400">Loading portfolio...</p>}
          {error && (
            <p className="text-sm text-rose-300" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && investor && (
            <div className="mt-4 grid gap-4 lg:grid-cols-[2fr,1.1fr]">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-linear-to-r from-cyan-500 via-fuchsia-500 to-indigo-500 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-900">
                  {investor.name}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <h1 className="text-4xl font-semibold text-white">
                    {formatCurrency(investor.currentValue)}
                  </h1>
                  <p className={`text-lg font-semibold ${badgeColor(investor.change)}`}>
                    {investor.change >= 0 ? "▲" : "▼"} {formatCurrency(Math.abs(investor.change))}
                  </p>
                </div>
                <p className="text-sm text-slate-400">
                  {formatPercent(investor.changePercent)} vs start
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-4 text-sm text-slate-300 shadow-lg shadow-cyan-500/20">
                <h2 className="text-lg font-semibold text-white">Quick stats</h2>
                <ul className="mt-3 space-y-1">
                  <li>Total invested: {formatCurrency(investor.totalInvested)}</li>
                  <li>Current value: {formatCurrency(investor.currentValue)}</li>
                  <li>Gain/Loss: {formatCurrency(investor.change)}</li>
                  <li>Return: {formatPercent(investor.changePercent)}</li>
                </ul>
              </div>
            </div>
          )}
        </header>

        {!loading && !error && investor && (
          <section className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-900/80 shadow-lg shadow-cyan-500/20">
            <div className="space-y-4 p-4">
              <HoldingsList holdings={investor.holdings} />
            </div>
          </section>
        )}

        {!loading && !error && !investor && (
          <p className="text-sm text-rose-300">
            Could not find this investor. Please go back and try again.
          </p>
        )}
      </main>
    </div>
  );
}
