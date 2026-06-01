"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CompanyLogo } from "../CompanyLogo";
import { useSound } from "../SoundContext";

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
  onSell?: (holding: Holding) => void;
  onReopen?: (holding: Holding) => void;
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

const SORT_LABELS: Record<"return" | "value" | "name", string> = {
  return: "Return",
  value: "Value",
  name: "Name",
};

export function HoldingsList({
  holdings,
  isAdmin = false,
  onEdit,
  onDelete,
  onSell,
  onReopen,
}: Props) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"return" | "value" | "name">("return");
  const [status, setStatus] = useState<"all" | "open" | "sold">("all");
  const [sortOpen, setSortOpen] = useState(false);
  const { play } = useSound();

  const valueOf = (h: Holding) =>
    h.status === "closed"
      ? (h.proceeds ?? 0)
      : (h.currentValue ?? h.amountInvested ?? 0);

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
    const list = holdings.filter((h) => {
      if (status === "open" && h.status === "closed") return false;
      if (status === "sold" && h.status !== "closed") return false;
      if (!term) return true;
      const nameMatch = h.name ? h.name.toLowerCase().includes(term) : false;
      return h.symbol.toLowerCase().includes(term) || nameMatch;
    });

    return [...list].sort((a, b) => {
      if (sort === "name") return a.symbol.localeCompare(b.symbol);
      if (sort === "value") return valueOf(b) - valueOf(a);
      return (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity);
    });
  }, [filter, status, sort, holdings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            🔍
          </span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or ticker"
            className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/50 pl-9 pr-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60"
          />
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          {/* Status filter */}
          <div className="flex rounded-full border border-white/10 bg-white/5 p-0.5 text-xs">
            {(["all", "open", "sold"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  play("toggle");
                  setStatus(s);
                }}
                className={`cursor-pointer rounded-full px-3 py-1 font-medium capitalize transition ${
                  status === s
                    ? "bg-cyan-500/20 text-cyan-100"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {/* Sort menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                play(sortOpen ? "close" : "open");
                setSortOpen((o) => !o);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-300/40 hover:text-white"
            >
              <span className="text-slate-400">Sort:</span>
              {SORT_LABELS[sort]}
              <span aria-hidden className="text-slate-400">
                ▾
              </span>
            </button>
            {sortOpen && (
              <>
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setSortOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-1.5 w-36 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 p-1 shadow-xl shadow-black/40 backdrop-blur">
                  {(["return", "value", "name"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        play("toggle");
                        setSort(s);
                        setSortOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs transition ${
                        sort === s
                          ? "bg-cyan-500/15 text-cyan-100"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {SORT_LABELS[s]}
                      {sort === s && <span aria-hidden>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              className={`group flex h-full flex-col gap-3 rounded-2xl border p-4 transition ${
                closed
                  ? "border-amber-400/15 bg-amber-400/3 hover:border-amber-400/25"
                  : "border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <CompanyLogo
                    symbol={holding.symbol}
                    name={holding.name}
                    logo={holding.logo}
                    size={44}
                    delay={idx * 60}
                    linkToLookup
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-semibold text-white">
                        {holding.symbol}
                      </p>
                      {closed && (
                        <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 ring-1 ring-amber-300/30">
                          Sold
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-400">
                      {holding.name || "—"}
                    </p>
                    {investedDate && (
                      <p className="mt-0.5 truncate text-[11px] text-cyan-200/80">
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
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tonePill(
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

              <div className="mt-auto grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-xs">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    Shares
                  </p>
                  <p className="truncate text-slate-200">
                    {holding.shares ? holding.shares.toFixed(4) : "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    Gain/Loss
                  </p>
                  <p
                    className={`truncate ${
                      gain >= 0 ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {formatCurrency(gain)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    Price
                  </p>
                  <p className="truncate text-slate-200">
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
                  {closed ? (
                    <button
                      type="button"
                      onClick={() => onReopen?.(holding)}
                      className="flex-1 cursor-pointer rounded-lg border border-amber-400/30 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-300 hover:bg-amber-400/10 hover:text-white"
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSell?.(holding)}
                      className="flex-1 cursor-pointer rounded-lg border border-amber-400/30 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-300 hover:bg-amber-400/10 hover:text-white"
                    >
                      Sell
                    </button>
                  )}
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
