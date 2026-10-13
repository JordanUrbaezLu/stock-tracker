"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { HoldingsList } from "../HoldingsList";
import { PortfolioChat } from "../PortfolioChat";
import { RoastHype } from "../RoastHype";
import { Badges } from "../../BadgeShelf";
import { useAdmin } from "../../AdminContext";
import { useSound } from "../../SoundContext";
import { Sparkline } from "../../Sparkline";
import { jerseyColor } from "../../avatar";
import { GUEST, getViewer } from "../../checkin";
import { celebrate } from "../../confetti";
import { isNewInvestor, investorSince } from "../../investorMeta";
import {
  fetchPortfolio,
  getCachedPortfolio,
  bustPortfolio,
} from "../../portfolioCache";
import type { Tick } from "../../TickerTape";
import { AppShell, weatherFor, weatherWords } from "../../ui/AppShell";
import { Avatar } from "../../ui/Avatar";
import { Button, LinkButton } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { ChartLegend, type ChartLegendItem } from "../../ui/ChartLegend";
import { Chip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { Delta } from "../../ui/Delta";
import { Field, Input } from "../../ui/Field";
import { FlapDisplay } from "../../ui/FlapDisplay";
import {
  firstName,
  formatCurrency,
  formatDate,
  formatPercent,
  formatSignedCurrency,
  gainLabel,
  toneText,
} from "../../ui/format";
import { IconEdit, IconInfo, IconPlus, IconTrash } from "../../ui/icons";
import { LevelBar, levelFor } from "../../ui/LevelBar";
import { Modal, ModalActions } from "../../ui/Modal";
import { BEATS, POP } from "../../ui/motion";
import { Rise, StampIn } from "../../ui/Reveal";
import { SectionHeader } from "../../ui/SectionHeader";
import { Segmented } from "../../ui/Segmented";
import { Skeleton } from "../../ui/Skeleton";
import { Stamp } from "../../ui/Stamp";
import { Stat, StatGroup } from "../../ui/Stat";
import { EmptyState, ErrorState } from "../../ui/States";

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
  /** contributed + sale proceeds − purchases. Below −$1 = "total invested" is stale. */
  uninvestedCash?: number;
  /** Inferred external cash deposits (epoch seconds, dollars). */
  contributions?: { time: number; amount: number }[];
};

type PortfolioResponse = {
  asOf: number;
  investors: InvestorValue[];
  symbols: string[];
};

/** Add-investment "Paid with" → POST body.fundedBy. */
type FundedBy = "new" | "proceeds";

const round2 = (n: number) => Math.round(n * 100) / 100;

const subscribeNever = () => () => {};

/** The one error line every admin modal (and the hero) shows. */
/** Today's LOCAL calendar day as a date-input value (yyyy-mm-dd). The UTC day
 *  (toISOString) is already tomorrow during US evenings, which pre-filled Add
 *  and Sell with a future date — and a future sale date breaks the chart. */
function todayInputValue(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Forms that can erase money by default (Sell is pre-filled; a blank "total
 *  invested" clears the override) are confirmed with their key only — never by
 *  a stray Enter in a field. */
function blockEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
}

function ErrorLine({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className={cx(
        "flex items-start gap-1.5 text-[15px] font-semibold leading-snug text-loss",
        className,
      )}
    >
      <IconInfo size={18} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/* ------------------------------------------------------------- Matchup -- */

function MatchupSide({
  label,
  lead,
  value,
  winner,
}: {
  label: string;
  lead: ReactNode;
  value: number;
  winner: boolean;
}) {
  return (
    <div
      className={cx(
        "relative flex min-w-0 flex-col items-center gap-2 rounded-2xl px-2 pb-3 pt-3.5 text-center",
        winner
          ? "bg-amber-soft shadow-[0_0_0_2px_var(--amber-bright),0_0_30px_-6px_var(--amber-bright)]"
          : "bg-surface-2",
      )}
    >
      {winner && (
        <motion.span
          aria-hidden
          className="absolute -top-5 left-1/2 -ml-3.5 text-[26px] leading-none"
          initial={{ opacity: 0, y: -18, rotate: 24 }}
          animate={{ opacity: 1, y: 0, rotate: -10 }}
          transition={{ ...POP, delay: BEATS.chart + 0.25 }}
        >
          👑
        </motion.span>
      )}
      <p className="type-eyebrow flex min-w-0 items-center gap-1.5 text-muted">
        {lead}
        <span className="truncate">{label}</span>
      </p>
      <p className={cx("type-display text-[32px] md:text-[38px]", toneText(value))}>
        {formatPercent(value, 1)}
      </p>
      {winner && <span className="sr-only">Winner</span>}
    </div>
  );
}

/** Mini scoreboard: this investor's return vs the same money in the S&P 500. */
function Matchup({
  name,
  label,
  you,
  spy,
}: {
  name: string;
  label: string;
  you: number;
  spy: number;
}) {
  // A tie is whatever prints as the same one-decimal number.
  const tie = formatPercent(you, 1) === formatPercent(spy, 1);
  return (
    <section
      aria-label={`${label} versus the S&P 500`}
      className="rounded-3xl border border-line bg-surface p-2.5 shadow-lip"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2.5">
        <MatchupSide
          label={label}
          lead={<Avatar name={name} size={24} ring className="shrink-0" />}
          value={you}
          winner={!tie && you > spy}
        />
        <span aria-hidden className="type-display self-center text-[24px] text-amber">
          VS
        </span>
        <MatchupSide
          label="S&P 500"
          lead={
            // Same dashed stroke as the S&P line in the chart legend.
            <span aria-hidden className="w-4 shrink-0 border-t-2 border-dashed border-muted" />
          }
          value={spy}
          winner={!tie && spy > you}
        />
      </div>
      <p className="mt-2.5 text-center text-[13px] font-medium leading-snug text-muted">
        {tie ? "Neck and neck. " : ""}Same money, same days, in the S&amp;P 500
      </p>
    </section>
  );
}

/* ------------------------------------------------------------ Skeletons -- */

function HeroSkeleton() {
  return (
    <div className="pb-8" role="status">
      <span className="sr-only">Loading portfolio…</span>
      <Skeleton className="h-3 w-36" />
      <div className="mt-4 flex items-center gap-4">
        <Skeleton className="size-16 rounded-[30%]" />
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
      <Skeleton className="mt-5 h-[clamp(49px,15vw,94px)] w-[min(100%,28rem)] rounded-[10px]" />
      <Skeleton className="mt-4 h-5 w-64 max-w-full" />
      <Skeleton className="mt-2.5 h-4 w-44" />
      <Skeleton className="mt-5 h-32 w-[min(100%,28rem)] rounded-3xl" />
    </div>
  );
}

function HallSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8" aria-hidden>
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-8 lg:gap-8">
        <Card raised padding="lg" className="relative -mt-14">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
        </Card>
        <Card padding="lg">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-4 h-24 w-full rounded-2xl" />
        </Card>
        <Card padding="lg">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-4 h-40 w-full rounded-2xl" />
        </Card>
      </div>
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-4 lg:gap-8">
        <Card padding="lg">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-4 h-36 w-full rounded-2xl" />
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Page -- */

export default function InvestorDetail() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug?.toString().toLowerCase() ?? "";
  const router = useRouter();

  const [data, setData] = useState<PortfolioResponse | null>(() =>
    getCachedPortfolio<PortfolioResponse>(),
  );
  const [loading, setLoading] = useState(() => !getCachedPortfolio());
  const [error, setError] = useState<string | null>(null);
  const { isAdmin } = useAdmin();
  const { play } = useSound();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<HoldingValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [investorError, setInvestorError] = useState<string | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showInvested, setShowInvested] = useState(false);
  const [investedValue, setInvestedValue] = useState("");
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [formSymbol, setFormSymbol] = useState("");
  const [formInvested, setFormInvested] = useState("");
  const [formShares, setFormShares] = useState("");
  const [formDate, setFormDate] = useState(
    todayInputValue(),
  );
  // Add mode only: where the money for this buy came from.
  const [fundedBy, setFundedBy] = useState<FundedBy>("new");
  const [confirmHolding, setConfirmHolding] = useState<HoldingValue | null>(null);
  // Sell flow: which holding is being sold + the proceeds/date inputs.
  const [sellHolding, setSellHolding] = useState<HoldingValue | null>(null);
  const [sellAmount, setSellAmount] = useState("");
  const [sellDate, setSellDate] = useState(
    todayInputValue(),
  );
  // Reopen flow: the sold holding waiting on a confirm (it erases the sale).
  const [reopenHolding, setReopenHolding] = useState<HoldingValue | null>(null);
  const [confirmInvestor, setConfirmInvestor] = useState(false);
  // Device-local: the level went up since this device last looked.
  const [leveledUp, setLeveledUp] = useState(false);

  // Whoever this device belongs to ("Who's checking in?"). Null on the server.
  const viewer = useSyncExternalStore(subscribeNever, getViewer, () => null);

  const loadPortfolio = useCallback(async (force = false) => {
    setError(null);
    try {
      const json = await fetchPortfolio<PortfolioResponse>(force);
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

  // "Try again": back to the skeleton while the forced refetch runs (otherwise
  // the page would flash "not found" between the error and the data).
  const retryLoad = useCallback(() => {
    setLoading(true);
    loadPortfolio(true).catch(() => null);
  }, [loadPortfolio]);

  const investor = useMemo(() => {
    if (!data) return null;
    return data.investors.find(
      (inv) => inv.slug.toLowerCase() === slug.toLowerCase(),
    );
  }, [data, slug]);

  const uninvestedCash = investor?.uninvestedCash ?? 0;

  const resetForm = useCallback(() => {
    setFormSymbol("");
    setFormInvested("");
    setFormShares("");
    setFormDate(todayInputValue());
  }, []);

  const openAddModal = useCallback(() => {
    play("open");
    setModalMode("add");
    setEditingHolding(null);
    resetForm();
    setInvestorError(null);
    // Sale money sitting uninvested is the likelier source for the next buy.
    setFundedBy(uninvestedCash >= 1 ? "proceeds" : "new");
    setShowAddModal(true);
  }, [resetForm, play, uninvestedCash]);

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
        : todayInputValue(),
    );
    setInvestorError(null);
    setShowAddModal(true);
  }, []);

  const closeInvestmentModal = useCallback(() => {
    if (saving) return;
    setShowAddModal(false);
    setEditingHolding(null);
    resetForm();
    setInvestorError(null);
  }, [saving, resetForm]);

  // Every dismissal (Cancel, ✕, Escape, scrim) also drops the last error, so
  // one modal's validation message never shows up under the hero or inside
  // the next modal.
  const closeRename = useCallback(() => {
    if (saving) return;
    setShowRename(false);
    setRenameValue("");
    setInvestorError(null);
  }, [saving]);

  const closeInvested = useCallback(() => {
    if (saving) return;
    setShowInvested(false);
    setInvestorError(null);
  }, [saving]);

  const closeConfirmHolding = useCallback(() => {
    if (saving) return;
    setConfirmHolding(null);
    setInvestorError(null);
  }, [saving]);

  const closeSell = useCallback(() => {
    if (saving) return;
    setSellHolding(null);
    setInvestorError(null);
  }, [saving]);

  const closeReopen = useCallback(() => {
    if (saving) return;
    setReopenHolding(null);
    setInvestorError(null);
  }, [saving]);

  const closeConfirmInvestor = useCallback(() => {
    if (saving) return;
    setConfirmInvestor(false);
    setInvestorError(null);
  }, [saving]);

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
              // "Paid with": new money bumps total invested, sale money doesn't.
              body: JSON.stringify({ ...body, fundedBy }),
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
      await loadPortfolio(true);
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
    fundedBy,
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
      setInvestorError(null);
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
        await loadPortfolio(true);
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

  const handleSell = useCallback(
    (holding: HoldingValue) => {
      if (!isAdmin) {
        setInvestorError("Admin access required.");
        return;
      }
      play("open");
      // Default the proceeds to the holding's current value (sell at today's
      // price) and the date to today — both editable.
      const current = holding.currentValue ?? holding.amountInvested ?? 0;
      setSellAmount(current > 0 ? current.toFixed(2) : "");
      setSellDate(todayInputValue());
      setInvestorError(null);
      setSellHolding(holding);
    },
    [isAdmin, play],
  );

  const performSell = useCallback(async () => {
    if (!investor || !isAdmin || !sellHolding) {
      setInvestorError("Admin access required.");
      return;
    }
    const amount = Number(sellAmount);
    // Number("") is 0 — a cleared field must not record a 100% loss.
    if (sellAmount.trim() === "" || !Number.isFinite(amount) || amount < 0) {
      setInvestorError("Enter a valid sale amount.");
      return;
    }
    if (!sellDate) {
      setInvestorError("Pick a sale date.");
      return;
    }
    setSaving(true);
    setInvestorError(null);
    try {
      const res = await fetch(
        `/api/admin/investors/${investor.slug}/allocations`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: sellHolding.id,
            allocationIndex: sellHolding.allocationIndex,
            soldAmount: amount,
            soldDate: new Date(sellDate).toISOString(),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Unable to sell holding.");
      }
      play("success");
      await loadPortfolio(true);
      setSellHolding(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sell holding.";
      setInvestorError(message);
      play("error");
    } finally {
      setSaving(false);
    }
  }, [investor, isAdmin, sellHolding, sellAmount, sellDate, loadPortfolio, play]);

  // Reopening clears the recorded sale amount and date, so — like Delete — it
  // asks first instead of firing from a single tap in a row of keys.
  const handleReopen = useCallback(
    (holding: HoldingValue) => {
      if (!isAdmin) {
        setInvestorError("Admin access required.");
        return;
      }
      setInvestorError(null);
      setReopenHolding(holding);
    },
    [isAdmin],
  );

  const performReopen = useCallback(
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
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: holding.id,
              allocationIndex: holding.allocationIndex,
              clearSold: true,
            }),
          },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || "Unable to reopen holding.");
        }
        play("toggle");
        await loadPortfolio(true);
        setReopenHolding(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to reopen holding.";
        setInvestorError(message);
        play("error");
      } finally {
        setSaving(false);
      }
    },
    [investor, isAdmin, loadPortfolio, play],
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
        await loadPortfolio(true);
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

  // Set the "total contributed" (real external cash put in). Overrides the
  // auto-sum; blank clears it back to the auto-sum.
  const handleSetInvested = useCallback(
    async (raw: string) => {
      if (!investor || !isAdmin) {
        setInvestorError("Admin access required.");
        return;
      }
      const trimmed = raw.trim();
      const original = trimmed === "" ? null : Number(trimmed);
      if (original !== null && (!Number.isFinite(original) || original < 0)) {
        setInvestorError("Enter a positive dollar amount (or leave blank to auto-sum).");
        return;
      }
      setSaving(true);
      setInvestorError(null);
      try {
        const res = await fetch(`/api/admin/investors/${investor.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ originalAmountInvested: original }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || "Unable to update total contributed.");
        }
        await loadPortfolio(true);
        setShowInvested(false);
        setInvestedValue("");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to update total contributed.";
        setInvestorError(message);
      } finally {
        setSaving(false);
      }
    },
    [investor, isAdmin, loadPortfolio],
  );

  const handleDeleteInvestor = useCallback(async () => {
    if (!investor || !isAdmin) return;
    setInvestorError(null);
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
      bustPortfolio(); // investor removed — force Home to refetch fresh data
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

  // Level-up moment: this device remembers the last level it saw per investor
  // (`pulse:level:<slug>`). The write waits with the celebration so a
  // cancelled effect (dev double-mount, quick navigation) can't swallow it.
  const level = investor ? levelFor(investor.currentValue).level : null;
  const investorSlug = investor?.slug ?? null;
  useEffect(() => {
    if (level == null || !investorSlug) return;
    const key = `pulse:level:${investorSlug}`;
    let seen: number | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      seen = raw == null ? null : Number(raw);
    } catch {
      return;
    }
    // High-water mark, like the home page: never store a lower level, or a
    // portfolio hovering around a rung would "level up" again after every dip.
    const known = seen != null && Number.isFinite(seen);
    if (known && level <= (seen as number)) return;
    const up = known && level > (seen as number);
    const timer = window.setTimeout(
      () => {
        try {
          window.localStorage.setItem(key, String(level));
        } catch {
          /* private mode — just skip remembering */
        }
        if (up) {
          setLeveledUp(true);
          celebrate(() => play("success")).catch(() => null);
        }
      },
      up ? 1400 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [level, investorSlug, play]);

  /* ------------------------------------------------------- derived view -- */

  const ready = !loading && !error && !!investor;
  const notFound = !loading && !error && !investor;
  const anyModalOpen =
    showAddModal ||
    showRename ||
    showInvested ||
    !!confirmHolding ||
    !!sellHolding ||
    !!reopenHolding ||
    confirmInvestor;

  const first = investor ? firstName(investor.name) : "";
  // The page talks to its investor ("You…") unless this device belongs to
  // someone else, who reads it in the third person.
  const someoneElse =
    !!investor && !!viewer && viewer !== GUEST && viewer !== investor.slug.toLowerCase();
  const who = someoneElse ? first : "You";

  const holdings = investor?.holdings ?? [];
  const soldCount = holdings.filter((h) => h.status === "closed").length;
  const openCount = holdings.length - soldCount;
  const since = investor ? investorSince(investor.holdings) : null;

  // Ticker tape: this investor's open holdings, biggest movers first.
  const ticker = useMemo<Tick[] | null>(() => {
    if (!investor) return null;
    const seen = new Set<string>();
    const ticks = investor.holdings
      .filter((h) => h.status !== "closed")
      .map((h) => ({ symbol: h.symbol, changePercent: h.changePercent }))
      .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
      .filter((t) => (seen.has(t.symbol) ? false : (seen.add(t.symbol), true)));
    return ticks.length ? ticks : null;
  }, [investor]);

  const hasChart = !!investor && (investor.valueHistory?.length ?? 0) > 1;
  const hasBenchmark = !!investor && (investor.benchmarkHistory?.length ?? 0) > 1;
  const hasMatchup =
    !!investor &&
    typeof investor.alphaSpy === "number" &&
    typeof investor.spyReturn === "number";

  const weather = investor ? weatherFor(investor.dayChangePercent) : null;

  // Money check (admin): total invested is stale when purchases outran it.
  const staleBy = uninvestedCash < -1 ? -uninvestedCash : 0;
  const fixedInvested = investor
    ? round2(investor.originalAmountInvested - uninvestedCash)
    : 0;

  const sellNumber = Number(sellAmount);
  const realized =
    sellHolding && sellAmount.trim() !== "" && !Number.isNaN(sellNumber)
      ? sellNumber - (sellHolding.amountInvested ?? 0)
      : null;

  /* --------------------------------------------------------------- hero -- */

  let hero: ReactNode = undefined;
  if (loading) {
    hero = <HeroSkeleton />;
  } else if (ready && investor) {
    const legend: ChartLegendItem[] = [
      { label: "Portfolio", kind: "line", tone: originalGain >= 0 ? "gain" : "loss" },
    ];
    if (hasBenchmark) {
      legend.push({ label: "Same money in the S&P 500", kind: "dashed", tone: "muted" });
    }
    const value = formatCurrency(investor.currentValue);
    hero = (
      // Extra bottom room: the level card overlaps the board's last 32px.
      <div className="pb-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="type-eyebrow text-amber">{weather ? weatherWords(weather) : ""}</p>
          {/* No Admin chip here: the brand bar right above already wears one
              on every width, and it stays on screen while scrolling. */}
          <p className="type-eyebrow text-muted">
            {asOfDate ? `As of ${asOfDate}` : "Loading…"}
          </p>
        </div>

        <div className="mt-4 grid gap-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <Avatar name={investor.name} size={64} ring className="shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h1 className="type-display truncate py-0.5 text-[44px] text-ink uppercase lg:text-[56px]">
                    {investor.name}
                  </h1>
                  {isNewInvestor(investor.holdings) && (
                    <Chip size="xs" tone="new" className="shrink-0">
                      New
                    </Chip>
                  )}
                </div>
                <p className="mt-1 text-[15px] leading-snug text-muted">
                  {since ? `Investor since ${since} · ` : ""}
                  {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}
                </p>
              </div>
            </div>

            <FlapDisplay
              value={value}
              size="hero"
              sound
              label={`${investor.name}’s value: ${value}`}
              className="mt-5"
            />

            <Rise delay={BEATS.deltas} className="mt-4 flex flex-col gap-2">
              <Delta
                variant="phrase"
                size="xl"
                value={originalGain}
                percent={originalGainPct}
                decimals={1}
                suffix="since starting"
              />
              {typeof investor.dayChangePercent === "number" && (
                <Delta
                  variant="phrase"
                  prefix="Today:"
                  value={investor.dayChange ?? 0}
                  percent={investor.dayChangePercent}
                />
              )}
            </Rise>

            {hasMatchup && (
              <Rise delay={BEATS.chart} className="mt-6">
                <Matchup
                  name={investor.name}
                  label={who}
                  you={(investor.alphaSpy ?? 0) + (investor.spyReturn ?? 0)}
                  spy={investor.spyReturn ?? 0}
                />
              </Rise>
            )}
          </div>

          {hasChart && (
            <div className="flex h-60 min-w-0 flex-col gap-3 lg:h-auto lg:min-h-72">
              <Rise delay={BEATS.chart} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <h2 className="type-eyebrow text-muted">Last 6 months</h2>
                <ChartLegend items={legend} />
              </Rise>
              <Sparkline
                points={investor.valueHistory}
                benchmark={investor.benchmarkHistory}
                positive={originalGain >= 0}
                strokeWidth={2}
                showAxes
                fill
                delay={BEATS.chart * 1000}
                className="w-full"
              />
            </div>
          )}
        </div>

        {!anyModalOpen && <ErrorLine className="mt-5">{investorError}</ErrorLine>}
      </div>
    );
  } else if (error) {
    // Keep the board lit while the hall explains the fix.
    hero = (
      <div className="pb-2">
        <p className="type-eyebrow text-muted">Investor · /{slug || "?"}</p>
        <FlapDisplay value="NO SIGNAL" size="lg" tone="loss" className="mt-3" />
      </div>
    );
  } else if (notFound) {
    hero = (
      <div className="pb-2">
        <p className="type-eyebrow text-amber">Investor · /{slug || "?"}</p>
        <FlapDisplay value="NOBODY HERE" size="lg" tone="amber" className="mt-3" />
      </div>
    );
  }

  /* --------------------------------------------------------------- hall -- */

  return (
    <AppShell
      active="home"
      back
      status={loading ? "loading" : error ? "error" : "live"}
      weather={ready ? weather : null}
      tint={ready && investor ? jerseyColor(investor.name) : undefined}
      ticker={loading ? "loading" : ready ? ticker : null}
      hero={hero}
    >
      {loading && <HallSkeleton />}

      {!loading && error && (
        <ErrorState
          title="Couldn't load this portfolio"
          message={`${error.replace(/[.!?\s]+$/, "")}. Check your connection, then try again.`}
          onRetry={retryLoad}
        />
      )}

      {notFound && (
        <Card padding="none">
          <EmptyState
            icon="🕵️"
            title="We couldn't find that investor"
            body="The link may be old, or the name changed. Everyone in the club is on the home page."
            action={<LinkButton href="/">Back to the club</LinkButton>}
          />
        </Card>
      )}

      {ready && investor && (
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-8 lg:gap-8">
            {/* YOUR LEVEL — rests on the board's edge. */}
            <StampIn delay={BEATS.ticket} className="relative -mt-14">
              <Card raised as="section" padding="lg" aria-labelledby="h-level">
                <SectionHeader
                  id="h-level"
                  emoji="🎮"
                  title={someoneElse ? `${first}’s level` : "Your level"}
                  sub={
                    someoneElse
                      ? `Every dollar ${first} adds moves the bar.`
                      : "Every dollar you add moves the bar."
                  }
                />
                <LevelBar value={investor.currentValue} />
              </Card>
              {leveledUp && (
                <div className="pointer-events-none absolute -top-3 right-3 md:right-5">
                  <Stamp tone="gain" rotate={7}>
                    Level up!
                  </Stamp>
                </div>
              )}
            </StampIn>

            {/* MONEY */}
            <section aria-labelledby="h-money">
              <SectionHeader id="h-money" emoji="💰" title="Money" />
              <Card padding="lg">
                <StatGroup operators={["+", "="]}>
                  <Stat
                    label="Invested"
                    value={formatCurrency(investor.originalAmountInvested)}
                  />
                  <Stat
                    label={gainLabel(originalGain)}
                    tone={originalGain < 0 ? "loss" : "gain"}
                    value={formatSignedCurrency(originalGain)}
                  />
                  <Stat label="Value" value={formatCurrency(investor.currentValue)} />
                </StatGroup>
                <p className="mt-4 text-[16px] leading-snug text-ink-2 text-pretty">
                  {who} put in{" "}
                  <strong className="font-bold text-ink">
                    {formatCurrency(investor.originalAmountInvested)}
                  </strong>{" "}
                  {Math.abs(originalGain) < 0.005 ? (
                    "and the market hasn’t moved it yet."
                  ) : (
                    <>
                      and the market {originalGain > 0 ? "added" : "took"}{" "}
                      <strong className={cx("font-bold", toneText(originalGain))}>
                        {formatCurrency(Math.abs(originalGain))}
                      </strong>
                      .
                    </>
                  )}
                </p>
                {uninvestedCash > 1 && (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl bg-surface-2 px-3.5 py-3 text-[15px] leading-snug text-ink-2">
                    <IconInfo size={18} className="mt-0.5 shrink-0 text-muted" />
                    <span>
                      {investor.name} has{" "}
                      <strong className="font-bold text-ink">
                        {formatCurrency(uninvestedCash)}
                      </strong>{" "}
                      from a sale waiting to be reinvested.
                    </span>
                  </p>
                )}
              </Card>
            </section>

            {/* MONEY CHECK (admin) — total invested fell behind the purchases. */}
            {isAdmin && staleBy > 0 && (
              <Card as="section" tone="loss" padding="lg" aria-labelledby="h-money-check">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <h2 id="h-money-check" className="type-title text-[19px] text-ink">
                      ⚠️ Money check
                    </h2>
                    <p className="mt-1.5 text-[16px] leading-snug text-ink-2 text-pretty">
                      Total invested looks{" "}
                      <strong className="font-bold text-loss">
                        {formatCurrency(staleBy)}
                      </strong>{" "}
                      too low — money was added without updating it.
                    </p>
                    <p className="mt-1 text-[14px] leading-snug text-muted">
                      The fix sets it to {formatCurrency(fixedInvested)}.
                    </p>
                  </div>
                  <div className="shrink-0 pb-1">
                    <Button
                      variant="danger"
                      loading={saving}
                      onClick={() => handleSetInvested(String(fixedInvested))}
                    >
                      Fix total invested
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* HOLDINGS */}
            <section aria-labelledby="h-holdings">
              <SectionHeader
                id="h-holdings"
                emoji="📈"
                title="Holdings"
                sub={
                  holdings.length === 0
                    ? "Nothing here yet."
                    : soldCount > 0
                      ? `${openCount} open · ${soldCount} sold`
                      : `${openCount} open`
                }
                action={
                  isAdmin ? (
                    <div className="pb-1">
                      <Button icon={<IconPlus />} onClick={openAddModal}>
                        Add investment
                      </Button>
                    </div>
                  ) : undefined
                }
              />
              {/* Errors from keys with no modal (Fix) show here too;
                  the hero line is the one screen readers hear. */}
              {!anyModalOpen && investorError && (
                <p aria-hidden className="mb-4 text-[15px] font-semibold leading-snug text-loss">
                  {investorError}
                </p>
              )}
              <HoldingsList
                holdings={investor.holdings}
                isAdmin={isAdmin}
                onEdit={(holding) => openEditModal(holding)}
                onDelete={(holding) => handleDeleteHolding(holding)}
                onSell={(holding) => handleSell(holding)}
                onReopen={(holding) => handleReopen(holding)}
              />
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-6 lg:col-span-4 lg:gap-8">
            <Badges investor={investor} allInvestors={data?.investors ?? []} />
            <RoastHype investor={investor} />
            <PortfolioChat
              askerName={investor.name}
              investors={data?.investors ?? []}
            />

            {/* ADMIN TOOLS */}
            {isAdmin && (
              <section aria-labelledby="h-admin">
                <SectionHeader id="h-admin" emoji="🛠️" title="Admin tools" />
                {/* One column on phones and in the desktop rail; a row of
                    three on the iPad, where the card spans the page. */}
                <Card className="grid gap-3.5 pb-5 md:grid-cols-3 md:pb-6 lg:grid-cols-1">
                  <Button
                    variant="secondary"
                    fullWidth
                    icon={<IconEdit />}
                    onClick={() => {
                      setRenameValue(investor.name);
                      setInvestorError(null);
                      setShowRename(true);
                    }}
                  >
                    Rename investor
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth
                    icon={
                      <span aria-hidden className="type-display text-[19px]">
                        $
                      </span>
                    }
                    onClick={() => {
                      setInvestedValue(
                        investor.originalAmountInvested != null
                          ? String(investor.originalAmountInvested)
                          : "",
                      );
                      setInvestorError(null);
                      setShowInvested(true);
                    }}
                  >
                    Edit invested amount
                  </Button>
                  <Button
                    variant="danger"
                    fullWidth
                    icon={<IconTrash />}
                    onClick={handleDeleteInvestor}
                  >
                    Delete investor
                  </Button>
                </Card>
              </section>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- modals -- */}

      <Modal
        open={showAddModal}
        title={modalMode === "add" ? "Add investment" : "Edit investment"}
        description={
          modalMode === "add" && investor
            ? `Log a buy for ${investor.name}.`
            : undefined
        }
        onClose={closeInvestmentModal}
        dismissible={!saving}
        footer={
          <ModalActions>
            <Button variant="secondary" onClick={closeInvestmentModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="investment-form" loading={saving}>
              {modalMode === "add" ? "Add investment" : "Save changes"}
            </Button>
          </ModalActions>
        }
      >
        <form
          id="investment-form"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (saving) return;
            handleSaveInvestment();
          }}
        >
          <Field label="Symbol">
            <Input
              value={formSymbol}
              onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={saving}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invested ($)">
              <Input
                value={formInvested}
                onChange={(e) => setFormInvested(e.target.value)}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="100"
                disabled={saving}
              />
            </Field>
            <Field label="Shares">
              <Input
                value={formShares}
                onChange={(e) => setFormShares(e.target.value)}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.0001"
                placeholder="0.1234"
                disabled={saving}
              />
            </Field>
          </div>
          <Field label="Date invested">
            <Input
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              type="date"
              disabled={saving}
            />
          </Field>
          {modalMode === "add" && (
            <div className="flex flex-col gap-2">
              <p className="text-[15px] font-bold leading-tight text-ink">
                Paid with
              </p>
              <Segmented<FundedBy>
                ariaLabel="Paid with"
                fullWidth
                value={fundedBy}
                onChange={setFundedBy}
                options={[
                  { value: "new", label: "New money" },
                  // Short enough for half a 320px sheet; the line below explains.
                  { value: "proceeds", label: "Sale money" },
                ]}
              />
              <p className="text-[14px] leading-snug text-muted" aria-live="polite">
                {fundedBy === "new"
                  ? `Fresh cash — it counts toward ${first}’s total invested.`
                  : `Reinvested sale money — ${first}’s total invested stays the same.`}
              </p>
              {uninvestedCash >= 1 && (
                <p className="flex items-start gap-2 rounded-2xl bg-amber-soft px-3.5 py-2.5 text-[14px] font-semibold leading-snug text-amber">
                  <IconInfo size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {first} has {formatCurrency(uninvestedCash)} from a sale to reinvest
                  </span>
                </p>
              )}
            </div>
          )}
          <ErrorLine>{investorError}</ErrorLine>
        </form>
      </Modal>

      <Modal
        open={showRename}
        title="Rename investor"
        onClose={closeRename}
        dismissible={!saving}
        footer={
          <ModalActions>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={closeRename}
            >
              Cancel
            </Button>
            <Button type="submit" form="rename-form" loading={saving}>
              Save changes
            </Button>
          </ModalActions>
        }
      >
        <form
          id="rename-form"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (saving) return;
            handleRename(renameValue);
          }}
        >
          <Field label="Name" hint="Shown on the board, the race and their player card.">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Investor name"
              autoComplete="off"
              disabled={saving}
            />
          </Field>
          <ErrorLine>{investorError}</ErrorLine>
        </form>
      </Modal>

      <Modal
        open={showInvested}
        title="Edit invested amount"
        onClose={closeInvested}
        dismissible={!saving}
        footer={
          <ModalActions>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={closeInvested}
            >
              Cancel
            </Button>
            <Button type="submit" form="invested-form" loading={saving}>
              Save changes
            </Button>
          </ModalActions>
        }
      >
        <form
          id="invested-form"
          noValidate
          onKeyDown={blockEnterSubmit}
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (saving) return;
            handleSetInvested(investedValue);
          }}
        >
          <Field
            label="Total invested (USD)"
            hint={
              <>
                The real external cash {investor?.name ?? "this investor"} has put
                in. Bump it when they add new money — reinvesting the proceeds of a
                sale doesn&apos;t count. Leave blank to auto-sum every holding.
              </>
            }
          >
            <Input
              value={investedValue}
              onChange={(e) => setInvestedValue(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 200"
              disabled={saving}
            />
          </Field>
          <ErrorLine>{investorError}</ErrorLine>
        </form>
      </Modal>

      <Modal
        open={!!confirmHolding}
        size="sm"
        title="Delete investment"
        onClose={closeConfirmHolding}
        dismissible={!saving}
        footer={
          <ModalActions>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={closeConfirmHolding}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<IconTrash />}
              loading={saving}
              onClick={() => confirmHolding && performDeleteHolding(confirmHolding)}
            >
              Delete investment
            </Button>
          </ModalActions>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[16px] leading-snug text-ink-2 text-pretty">
            Remove <strong className="font-bold text-ink">{confirmHolding?.symbol}</strong>{" "}
            from {investor?.name}? This cannot be undone.
          </p>
          <ErrorLine>{investorError}</ErrorLine>
        </div>
      </Modal>

      <Modal
        open={!!sellHolding}
        title={`Sell ${sellHolding?.symbol ?? ""}`}
        description={`Close out ${sellHolding?.symbol ?? "it"} and lock in the proceeds. It moves to sold holdings.`}
        onClose={closeSell}
        dismissible={!saving}
        footer={
          <ModalActions>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={closeSell}
            >
              Cancel
            </Button>
            <Button type="submit" form="sell-form" loading={saving}>
              Confirm sale
            </Button>
          </ModalActions>
        }
      >
        <form
          id="sell-form"
          noValidate
          onKeyDown={blockEnterSubmit}
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (saving) return;
            performSell();
          }}
        >
          {/* Stacked on the narrowest phones: half a 320px sheet clips the
              date ("10/13/2…"). */}
          <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
            <Field label="Sold for ($)">
              <Input
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                disabled={saving}
              />
            </Field>
            <Field label="Sale date">
              <Input
                value={sellDate}
                onChange={(e) => setSellDate(e.target.value)}
                type="date"
                disabled={saving}
              />
            </Field>
          </div>
          {sellHolding && realized != null && (
            <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[15px] leading-snug text-ink-2">
              Cost basis {formatCurrency(sellHolding.amountInvested)} → realized{" "}
              <strong className={cx("type-display text-[18px]", toneText(realized))}>
                {formatSignedCurrency(realized)}
              </strong>
            </p>
          )}
          <ErrorLine>{investorError}</ErrorLine>
        </form>
      </Modal>

      <Modal
        open={!!reopenHolding}
        size="sm"
        title={`Reopen ${reopenHolding?.symbol ?? ""}`}
        onClose={closeReopen}
        dismissible={!saving}
        footer={
          <ModalActions>
            <Button variant="secondary" disabled={saving} onClick={closeReopen}>
              Cancel
            </Button>
            <Button
              loading={saving}
              onClick={() => reopenHolding && performReopen(reopenHolding)}
            >
              Reopen holding
            </Button>
          </ModalActions>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[16px] leading-snug text-ink-2 text-pretty">
            Move <strong className="font-bold text-ink">{reopenHolding?.symbol}</strong>{" "}
            back to open holdings? This erases its recorded sale
            {reopenHolding?.proceeds != null && (
              <>
                {" "}
                (<span className="tnum">{formatCurrency(reopenHolding.proceeds)}</span>
                {formatDate(reopenHolding.soldDate)
                  ? ` on ${formatDate(reopenHolding.soldDate)}`
                  : ""}
                )
              </>
            )}
            .
          </p>
          <ErrorLine>{investorError}</ErrorLine>
        </div>
      </Modal>

      <Modal
        open={confirmInvestor}
        size="sm"
        title="Delete investor"
        onClose={closeConfirmInvestor}
        dismissible={!saving}
        footer={
          <ModalActions>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={closeConfirmInvestor}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<IconTrash />}
              loading={saving}
              onClick={performDeleteInvestor}
            >
              Delete investor
            </Button>
          </ModalActions>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[16px] leading-snug text-ink-2 text-pretty">
            Delete investor{" "}
            <strong className="font-bold text-ink">{investor?.name}</strong>? This
            cannot be undone.
          </p>
          <ErrorLine>{investorError}</ErrorLine>
        </div>
      </Modal>
    </AppShell>
  );
}
