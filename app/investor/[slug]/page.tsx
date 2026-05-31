"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { HoldingsList } from "../HoldingsList";
import { PortfolioChat } from "../PortfolioChat";
import { useAdmin } from "../../AdminContext";
import { useSound } from "../../SoundContext";
import { Sparkline } from "../../Sparkline";
import { initials, avatarGradient } from "../../avatar";

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
  dateInvested?: string | null;
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
  dayChange?: number;
  dayChangePercent?: number;
  spyReturn?: number | null;
  alphaSpy?: number | null;
  benchmarkHistory?: HistoryPoint[];
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
            className="glass w-full max-w-lg rounded-3xl p-6 shadow-2xl shadow-cyan-500/10"
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

function badgeColor(change: number | null) {
  if (change == null || change === 0) return "text-slate-300";
  return change > 0 ? "text-emerald-400" : "text-rose-400";
}

function tonePill(change: number | null) {
  if (change == null || change === 0)
    return "bg-slate-500/15 text-slate-200 ring-slate-400/20";
  return change > 0
    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/25"
    : "bg-rose-500/15 text-rose-300 ring-rose-400/25";
}

export default function InvestorDetail() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug?.toString().toLowerCase() ?? "";
  const router = useRouter();

  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAdmin } = useAdmin();
  const { play } = useSound();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<HoldingValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [investorError, setInvestorError] = useState<string | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [formSymbol, setFormSymbol] = useState("");
  const [formInvested, setFormInvested] = useState("");
  const [formShares, setFormShares] = useState("");
  const [formDate, setFormDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [confirmHolding, setConfirmHolding] = useState<HoldingValue | null>(null);
  const [confirmInvestor, setConfirmInvestor] = useState(false);

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", { cache: "no-store" });
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
  }, []);

  useEffect(() => {
    loadPortfolio().catch(() => null);
  }, [loadPortfolio]);

  const resetForm = useCallback(() => {
    setFormSymbol("");
    setFormInvested("");
    setFormShares("");
    setFormDate(new Date().toISOString().split("T")[0]);
  }, []);

  const openAddModal = useCallback(() => {
    play("open");
    setModalMode("add");
    setEditingHolding(null);
    resetForm();
    setShowAddModal(true);
  }, [resetForm, play]);

  const openEditModal = useCallback((holding: HoldingValue) => {
    setModalMode("edit");
    setEditingHolding(holding);
    setFormSymbol(holding.symbol);
    setFormInvested(
      holding.amountInvested ? holding.amountInvested.toString() : "",
    );
    setFormShares(holding.shares != null ? holding.shares.toString() : "");
    setFormDate(
      holding.dateInvested
        ? holding.dateInvested.split("T")[0]
        : new Date().toISOString().split("T")[0],
    );
    setShowAddModal(true);
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

  const handleSaveInvestment = useCallback(async () => {
    if (!investor || !isAdmin) {
      setInvestorError("Admin access required.");
      return;
    }
    setSaving(true);
    setInvestorError(null);
    try {
      const invested = Number(formInvested);
      const shares = Number(formShares);
      if (!formSymbol.trim()) {
        throw new Error("Ticker is required.");
      }
      if (Number.isNaN(invested) || invested <= 0) {
        throw new Error("Invested amount must be greater than 0.");
      }
      if (Number.isNaN(shares) || shares <= 0) {
        throw new Error("Shares must be greater than 0.");
      }
      if (!formDate) {
        throw new Error("Date invested is required.");
      }
      const body: Record<string, unknown> = {
        symbol: formSymbol,
        invested,
        dateInvested: formDate ? new Date(formDate).toISOString() : undefined,
      };
      body.shares = shares;

      const path = `/api/admin/investors/${investor.slug}/allocations`;
      const res =
        modalMode === "add"
          ? await fetch(path, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
          : await fetch(path, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...body,
                id: editingHolding?.id,
                allocationIndex: editingHolding?.allocationIndex,
              }),
            });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Unable to save investment.");
      }
      await loadPortfolio();
      setShowAddModal(false);
      setEditingHolding(null);
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save investment.";
      setInvestorError(message);
    } finally {
      setSaving(false);
    }
  }, [
    investor,
    formInvested,
    formShares,
    formSymbol,
    formDate,
    modalMode,
    editingHolding,
    loadPortfolio,
    resetForm,
    isAdmin,
  ]);

  const handleDeleteHolding = useCallback(
    async (holding: HoldingValue) => {
      if (!isAdmin) {
        setInvestorError("Admin access required.");
        return;
      }
      setConfirmHolding(holding);
    },
    [isAdmin],
  );

  const performDeleteHolding = useCallback(
    async (holding: HoldingValue) => {
      if (!investor || !isAdmin) {
        setInvestorError("Admin access required.");
        return;
      }
      setSaving(true);
      setInvestorError(null);
      try {
        const res = await fetch(
          `/api/admin/investors/${investor.slug}/allocations`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: holding.id,
              allocationIndex: holding.allocationIndex,
            }),
          },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || "Unable to delete investment.");
        }
        await loadPortfolio();
        setConfirmHolding(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to delete investment.";
        setInvestorError(message);
      } finally {
        setSaving(false);
      }
    },
    [investor, loadPortfolio, isAdmin],
  );

  const handleRename = useCallback(
    async (newName: string) => {
      if (!investor || !isAdmin) {
        setInvestorError("Admin access required.");
        return;
      }
      setSaving(true);
      setInvestorError(null);
      try {
        const res = await fetch(`/api/admin/investors/${investor.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || "Unable to rename investor.");
        }
        await loadPortfolio();
        setShowRename(false);
        setRenameValue("");
        if (json?.slug && json.slug !== investor.slug) {
          router.push(`/investor/${json.slug}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to rename investor.";
        setInvestorError(message);
      } finally {
        setSaving(false);
      }
    },
    [investor, loadPortfolio, router, isAdmin],
  );

  const handleDeleteInvestor = useCallback(async () => {
    if (!investor || !isAdmin) return;
    setConfirmInvestor(true);
  }, [investor, isAdmin]);

  const performDeleteInvestor = useCallback(async () => {
    if (!investor || !isAdmin) {
      setInvestorError("Admin access required.");
      return;
    }
    setSaving(true);
    setInvestorError(null);
    try {
      const res = await fetch(`/api/admin/investors/${investor.slug}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Unable to delete investor.");
      }
      router.push("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete investor.";
      setInvestorError(message);
    } finally {
      setSaving(false);
      setConfirmInvestor(false);
    }
  }, [investor, router, isAdmin]);

  const originalGain = investor
    ? investor.currentValue - investor.originalAmountInvested
    : 0;
  const originalGainPct =
    investor && investor.originalAmountInvested
      ? (originalGain / investor.originalAmountInvested) * 100
      : 0;

  return (
    <div className="app-backdrop min-h-screen text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        <header className="glass relative flex flex-col gap-4 overflow-hidden rounded-3xl p-5 shadow-2xl shadow-black/30 sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl"
          />
          <div className="relative flex items-center justify-between gap-4">
            <Link
              href="/"
              onClick={() => play("nav")}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:text-white"
            >
              ← Back
            </Link>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              {isAdmin && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-semibold uppercase tracking-wide text-emerald-200">
                  Admin
                </span>
              )}
              <span>{asOfDate ? `As of ${asOfDate}` : "Loading…"}</span>
            </div>
          </div>
          {loading && (
            <div className="space-y-3">
              <div className="skeleton h-4 w-28 rounded-full" />
              <div className="skeleton h-10 w-48 rounded-lg" />
              <div className="skeleton h-14 w-full rounded-xl" />
            </div>
          )}
          {error && (
            <p className="text-sm text-rose-300" role="alert">
              {error}
            </p>
          )}
          {investorError && (
            <p className="text-sm text-rose-300" role="alert">
              {investorError}
            </p>
          )}
          {!loading && !error && investor && (
            <div className="relative space-y-3.5">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`avatar-pulse flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${avatarGradient(
                    investor.name,
                  )} text-base font-bold text-white shadow-lg shadow-black/30 ring-1 ring-white/20`}
                >
                  {initials(investor.name)}
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-bold leading-tight text-white sm:text-3xl">
                    {investor.name}
                  </h1>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Investor portfolio · {(investor.holdings || []).length}{" "}
                    {(investor.holdings || []).length === 1
                      ? "holding"
                      : "holdings"}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Current value
                </p>
                <div className="mt-1 flex flex-wrap items-end gap-3">
                  <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    {formatCurrency(investor.currentValue)}
                  </span>
                  <span
                    className={`mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${tonePill(
                      originalGain,
                    )}`}
                  >
                    {originalGain >= 0 ? "▲" : "▼"} {formatPercent(originalGainPct)}
                  </span>
                </div>
                {/* Today + vs S&P share one line to keep the card compact. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
                  {typeof investor.dayChangePercent === "number" && (
                    <span className="text-slate-500">
                      Today{" "}
                      <span className={badgeColor(investor.dayChange ?? 0)}>
                        {formatPercent(investor.dayChangePercent)} (
                        {(investor.dayChange ?? 0) >= 0 ? "+" : "−"}
                        {formatCurrency(Math.abs(investor.dayChange ?? 0))})
                      </span>
                    </span>
                  )}
                  {typeof investor.alphaSpy === "number" && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ${tonePill(
                        investor.alphaSpy,
                      )}`}
                      title="Return vs the S&P 500 over the same period"
                    >
                      {investor.alphaSpy >= 0 ? "▲" : "▼"}{" "}
                      {`${investor.alphaSpy >= 0 ? "+" : "−"}${Math.abs(
                        investor.alphaSpy,
                      ).toFixed(1)}% vs S&P`}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  {
                    label: "Original invested",
                    value: formatCurrency(investor.originalAmountInvested),
                    tone: "text-white",
                    box: "border-white/5 bg-white/3",
                  },
                  {
                    label: "Total gain",
                    value: `${originalGain >= 0 ? "+" : "−"}${formatCurrency(
                      Math.abs(originalGain),
                    )}`,
                    tone: badgeColor(originalGain),
                    box:
                      originalGain >= 0
                        ? "border-emerald-400/20 bg-emerald-500/10"
                        : "border-rose-400/20 bg-rose-500/10",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`min-w-0 rounded-xl border px-3 py-2 ${stat.box}`}
                  >
                    <p className="truncate text-[10px] uppercase tracking-wider text-slate-400">
                      {stat.label}
                    </p>
                    <p className={`mt-0.5 truncate text-sm font-semibold ${stat.tone}`}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!loading && !error && investor && isAdmin && (
            <div className="relative flex flex-wrap gap-2 border-t border-white/5 pt-4">
              <button
                type="button"
                onClick={() => {
                  setRenameValue(investor.name);
                  setShowRename(true);
                }}
                className="cursor-pointer rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-500/10 hover:text-white"
              >
                Rename investor
              </button>
              <button
                type="button"
                onClick={handleDeleteInvestor}
                className="cursor-pointer rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/10 hover:text-white"
              >
                Delete investor
              </button>
            </div>
          )}
        </header>

        {!loading &&
          !error &&
          investor &&
          investor.valueHistory &&
          investor.valueHistory.length > 1 && (
            <section className="glass relative overflow-hidden rounded-3xl p-4 shadow-2xl shadow-black/30 sm:p-5">
              <div className="rounded-2xl border border-white/5 bg-white/2 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Portfolio value · 6-month trend
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider ${
                        originalGain >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`inline-block h-0 w-3 border-t-2 ${
                          originalGain >= 0
                            ? "border-emerald-400"
                            : "border-rose-400"
                        }`}
                      />
                      Portfolio
                    </span>
                    {investor.benchmarkHistory &&
                      investor.benchmarkHistory.length > 1 && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-slate-500">
                          <span
                            aria-hidden
                            className="inline-block h-0 w-3 border-t border-dashed border-slate-400/70"
                          />
                          S&amp;P 500
                        </span>
                      )}
                  </div>
                </div>
                <Sparkline
                  points={investor.valueHistory}
                  benchmark={investor.benchmarkHistory}
                  positive={originalGain >= 0}
                  height={120}
                  strokeWidth={2}
                  showAxes
                  className="w-full"
                />
              </div>
            </section>
          )}

        {!loading && !error && investor && (
          <PortfolioChat
            askerName={investor.name}
            investors={data?.investors ?? []}
          />
        )}

        {!loading && !error && investor && (
          <section className="glass overflow-hidden rounded-3xl p-5 shadow-2xl shadow-black/30 sm:p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Holdings</h2>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openAddModal}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-cyan-500/40 bg-white/5 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-500/10 hover:text-white"
                  >
                    <span aria-hidden>＋</span> Add investment
                  </button>
                )}
              </div>
              <HoldingsList
                holdings={investor.holdings}
                isAdmin={isAdmin}
                onEdit={(holding) => openEditModal(holding)}
                onDelete={(holding) => handleDeleteHolding(holding)}
              />
            </div>
          </section>
        )}

        {!loading && !error && !investor && (
          <p className="text-sm text-rose-300">
            Could not find this investor. Please go back and try again.
          </p>
        )}
      </main>

      <Modal
        open={showAddModal}
        title={modalMode === "add" ? "Add investment" : "Edit investment"}
        onClose={() => {
          if (saving) return;
          setShowAddModal(false);
          setEditingHolding(null);
          resetForm();
        }}
      >
        <div className="space-y-3">
          <label className="block text-sm text-slate-200">
            Symbol
            <input
              value={formSymbol}
              onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-slate-100 outline-none transition focus:border-cyan-400"
              placeholder="AAPL"
              disabled={saving}
            />
          </label>
          <label className="block text-sm text-slate-200">
            Invested ($)
            <input
              value={formInvested}
              onChange={(e) => setFormInvested(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-slate-100 outline-none transition focus:border-cyan-400"
              placeholder="100"
              disabled={saving}
            />
          </label>
          <label className="block text-sm text-slate-200">
            Shares
            <input
              value={formShares}
              onChange={(e) => setFormShares(e.target.value)}
              type="number"
              min="0"
              step="0.0001"
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-slate-100 outline-none transition focus:border-cyan-400"
              placeholder="0.1234"
              disabled={saving}
            />
          </label>
          <label className="block text-sm text-slate-200">
            Date invested
            <input
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              type="date"
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-slate-100 outline-none transition focus:border-cyan-400"
              disabled={saving}
            />
          </label>
          {investorError && (
            <p className="text-sm text-rose-300" role="alert">
              {investorError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (saving) return;
                setShowAddModal(false);
                setEditingHolding(null);
                resetForm();
              }}
              className="cursor-pointer rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveInvestment}
              disabled={saving}
              className="cursor-pointer rounded-xl bg-linear-to-r from-cyan-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : modalMode === "add" ? "Add" : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showRename}
        title="Rename investor"
        onClose={() => {
          if (saving) return;
          setShowRename(false);
          setRenameValue("");
        }}
      >
        <div className="space-y-3">
          <label className="block text-sm text-slate-200">
            Name
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-slate-100 outline-none transition focus:border-cyan-400"
              placeholder="Investor name"
              disabled={saving}
            />
          </label>
          {investorError && (
            <p className="text-sm text-rose-300" role="alert">
              {investorError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (saving) return;
                setShowRename(false);
                setRenameValue("");
              }}
              className="cursor-pointer rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleRename(renameValue)}
              disabled={saving}
              className="cursor-pointer rounded-xl bg-linear-to-r from-cyan-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!confirmHolding}
        title="Delete investment"
        onClose={() => {
          if (saving) return;
          setConfirmHolding(null);
        }}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-200">
            Remove {confirmHolding?.symbol} from {investor?.name}? This cannot be undone.
          </p>
          {investorError && (
            <p className="text-sm text-rose-300" role="alert">
              {investorError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (saving) return;
                setConfirmHolding(null);
              }}
              className="cursor-pointer rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => confirmHolding && performDeleteHolding(confirmHolding)}
              disabled={saving}
              className="cursor-pointer rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-700/60"
            >
              {saving ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmInvestor}
        title="Delete investor"
        onClose={() => {
          if (saving) return;
          setConfirmInvestor(false);
        }}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-200">
            Delete investor {investor?.name}? This cannot be undone.
          </p>
          {investorError && (
            <p className="text-sm text-rose-300" role="alert">
              {investorError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (saving) return;
                setConfirmInvestor(false);
              }}
              className="cursor-pointer rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={performDeleteInvestor}
              disabled={saving}
              className="cursor-pointer rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-700/60"
            >
              {saving ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
