"use client";

import { useMemo, useState } from "react";

type Holding = {
  symbol: string;
  name?: string | null;
  amountInvested: number;
  currentValue: number | null;
  startPrice: number | null;
  currentPrice: number | null;
  change: number | null;
  changePercent: number | null;
  shares: number | null;
  dateInvested?: string | null;
  history: { time: number; value: number }[];
  allocationIndex?: number;
  id?: string;
};

type Props = {
  holdings: Holding[];
  isAdmin?: boolean;
  onEdit?: (holding: Holding) => void;
  onDelete?: (holding: Holding) => void;
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

function changeArrow(change: number | null) {
  if (change == null || change === 0) return "•";
  return change > 0 ? "▲" : "▼";
}

export function HoldingsList({ holdings, isAdmin = false, onEdit, onDelete }: Props) {
  const [filter, setFilter] = useState("");

  const maxValue = useMemo(() => {
    return Math.max(
      1,
      ...holdings.map(
        (h) => (h.currentValue ?? h.amountInvested ?? 0) || 0,
      ),
    );
  }, [holdings]);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const byText = term
      ? holdings.filter((h) => {
          const symbolMatch = h.symbol.toLowerCase().includes(term);
          const nameMatch = h.name ? h.name.toLowerCase().includes(term) : false;
          return symbolMatch || nameMatch;
        })
      : holdings;

    return [...byText].sort((a, b) => {
      const aPct = a.changePercent ?? -Infinity;
      const bPct = b.changePercent ?? -Infinity;
      return bPct - aPct;
    });
  }, [filter, holdings]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter holdings (e.g., AAPL)"
          className="h-10 w-full rounded-lg border border-cyan-500/30 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
        />
      </div>
      {filtered.map((holding, idx) => {
        const changeClass = badgeColor(holding.change);
        const invested = holding.amountInvested ?? 0;
        const current = holding.currentValue ?? invested;
        const investedPct = Math.min(100, (invested / maxValue) * 100);
        const currentPct = Math.min(100, (current / maxValue) * 100);
        const investedDate = holding.dateInvested
          ? new Date(holding.dateInvested).toLocaleDateString()
          : null;

        return (
          <div
            key={`${holding.symbol}-${idx}`}
            className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-base font-semibold text-white">
                  {holding.symbol}
                </p>
                <p className="text-xs text-slate-500">
                  {holding.name || "Loading"}
                </p>
                {investedDate && (
                  <p className="text-[11px] font-semibold text-cyan-200">
                    Bought {investedDate}
                  </p>
                )}
              </div>
              <div className={`text-sm font-semibold ${changeClass}`}>
                {changeArrow(holding.change)} {formatPercent(holding.changePercent)}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Invested</span>
                <span>{formatCurrency(invested)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-fuchsia-500"
                  style={{ width: `${investedPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Current</span>
                <span>{formatCurrency(current)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-400"
                  style={{ width: `${currentPct}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs text-slate-300">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Invested
                </p>
                <p>{formatCurrency(holding.amountInvested)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Shares
                </p>
                <p>{holding.shares ? holding.shares.toFixed(4) : "—"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Value
                </p>
                <p>{formatCurrency(holding.currentValue)}</p>
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEdit?.(holding)}
                  className="flex-1 cursor-pointer rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300 hover:text-white"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete?.(holding)}
                  className="flex-1 cursor-pointer rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
      {filtered.length === 0 && (
        <p className="text-sm text-slate-500">No holdings match that filter.</p>
      )}
    </div>
  );
}
