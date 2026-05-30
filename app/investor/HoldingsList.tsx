"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CompanyLogo } from "../CompanyLogo";

type Holding = {
  symbol: string;
  name?: string | null;
  logo?: string | null;
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
  status?: "open" | "closed";
  soldDate?: string | null;
  proceeds?: number | null;
  realizedChange?: number | null;
  realizedChangePercent?: number | null;
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
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function tonePill(change: number | null) {
  if (change == null || change === 0)
    return "bg-slate-500/15 text-slate-200 ring-slate-400/20";
  return change > 0
    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/25"
    : "bg-rose-500/15 text-rose-300 ring-rose-400/25";
}

function changeArrow(change: number | null) {
  if (change == null || change === 0) return "•";
  return change > 0 ? "▲" : "▼";
}

export function HoldingsList({
  holdings,
  isAdmin = false,
  onEdit,
  onDelete,
}: Props) {
  const [filter, setFilter] = useState("");

  const maxValue = useMemo(() => {
    return Math.max(
      1,
      ...holdings.map((h) => {
        const inv = h.amountInvested ?? 0;
        const cur =
          h.status === "closed" ? (h.proceeds ?? 0) : (h.currentValue ?? inv);
        return Math.max(inv, cur) || 0;
      }),
    );
  }, [holdings]);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const byText = term
      ? holdings.filter((h) => {
          const symbolMatch = h.symbol.toLowerCase().includes(term);
          const nameMatch = h.name
            ? h.name.toLowerCase().includes(term)
            : false;
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
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          🔍
        </span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter holdings (e.g., AAPL)"
          className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/50 pl-9 pr-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((holding, idx) => {
          const invested = holding.amountInvested ?? 0;
          const closed = holding.status === "closed";
          const current = closed
            ? (holding.proceeds ?? 0)
            : (holding.currentValue ?? invested);
          const gain = closed
            ? (holding.realizedChange ?? current - invested)
            : current - invested;
          const investedPct = Math.min(100, (invested / maxValue) * 100);
          const currentPct = Math.min(100, (current / maxValue) * 100);
          const investedDate = holding.dateInvested
            ? new Date(holding.dateInvested).toLocaleDateString()
            : null;
          const soldDate = holding.soldDate
            ? new Date(holding.soldDate).toLocaleDateString()
            : null;

          return (
            <motion.div
              key={`${holding.symbol}-${idx}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(idx, 8) * 0.05,
                type: "spring",
                stiffness: 320,
                damping: 30,
              }}
              whileHover={{ y: -3 }}
              className={`group space-y-3 rounded-2xl border p-4 transition ${
                closed
                  ? "border-amber-400/15 bg-amber-400/3 hover:border-amber-400/25"
                  : "border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <CompanyLogo
                    symbol={holding.symbol}
                    name={holding.name}
                    logo={holding.logo}
                    size={44}
                    delay={idx * 60}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-white">
                        {holding.symbol}
                      </p>
                      {closed && (
                        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 ring-1 ring-amber-300/30">
                          Sold
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {holding.name || "—"}
                    </p>
                    {investedDate && (
                      <p className="mt-0.5 text-[11px] text-cyan-200/80">
                        Bought {investedDate}
                        {soldDate && (
                          <span className="text-amber-200/80">
                            {" · "}Sold {soldDate}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tonePill(
                    holding.change,
                  )}`}
                >
                  {changeArrow(holding.change)}{" "}
                  {formatPercent(holding.changePercent)}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Start amount</span>
                  <span className="font-semibold text-fuchsia-200">
                    {formatCurrency(invested)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-fuchsia-500 to-fuchsia-300"
                    style={{ width: `${investedPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    {closed ? "Sold for" : "Current value"}
                  </span>
                  <span
                    className={`font-semibold ${
                      closed ? "text-amber-200" : "text-cyan-200"
                    }`}
                  >
                    {formatCurrency(current)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full bg-linear-to-r ${
                      closed
                        ? "from-amber-500 to-amber-300"
                        : "from-cyan-500 to-cyan-300"
                    }`}
                    style={{ width: `${currentPct}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    Shares
                  </p>
                  <p className="text-slate-200">
                    {holding.shares ? holding.shares.toFixed(4) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    Gain/Loss
                  </p>
                  <p
                    className={
                      gain >= 0 ? "text-emerald-300" : "text-rose-300"
                    }
                  >
                    {formatCurrency(gain)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    Price
                  </p>
                  <p className="text-slate-200">
                    {formatCurrency(holding.currentPrice)}
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onEdit?.(holding)}
                    className="flex-1 cursor-pointer rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-500/10 hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete?.(holding)}
                    className="flex-1 cursor-pointer rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/10 hover:text-white"
                  >
                    Delete
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500">No holdings match that filter.</p>
      )}
    </div>
  );
}
