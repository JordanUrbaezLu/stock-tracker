"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { HoldingsList } from "../HoldingsList";
import { useAdmin } from "../../AdminContext";

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
      <div className="w-full max-w-lg rounded-2xl border border-cyan-500/30 bg-slate-950 p-5 shadow-xl shadow-cyan-500/20">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full px-3 py-1 text-sm text-slate-300 transition hover:bg-slate-800"
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
  return `${value.toFixed(2)}%`;
}

function badgeColor(change: number | null) {
  if (change == null || change === 0) return "text-slate-600";
  return change > 0 ? "text-emerald-500" : "text-rose-500";
}

export default function InvestorDetail() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug?.toString().toLowerCase() ?? "";
  const router = useRouter();

  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAdmin } = useAdmin();
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
    setModalMode("add");
    setEditingHolding(null);
    resetForm();
    setShowAddModal(true);
  }, [resetForm]);

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
            <div className="flex items-center gap-3 text-sm text-slate-400">
              {isAdmin && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                  Admin
                </span>
              )}
              <span>{asOfDate ? `Prices as of ${asOfDate}` : "Loading prices..."}</span>
            </div>
          </div>
          {loading && <p className="text-sm text-slate-400">Loading portfolio...</p>}
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
          {!loading && !error && investor && isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setRenameValue(investor.name);
                  setShowRename(true);
                }}
                className="cursor-pointer rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300 hover:text-white"
              >
                Rename investor
              </button>
              <button
                type="button"
                onClick={handleDeleteInvestor}
                className="cursor-pointer rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white"
              >
                Delete investor
              </button>
            </div>
          )}
        </header>

        {!loading && !error && investor && (
          <section className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-900/80 shadow-lg shadow-cyan-500/20">
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Holdings</h2>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openAddModal}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-cyan-500/40 bg-slate-900 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300 hover:text-white"
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
              className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
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
              className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
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
              className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
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
              className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
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
              className="cursor-pointer rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-700/60"
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
              className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
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
              className="cursor-pointer rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-700/60"
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
