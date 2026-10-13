"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { CompanyLogo } from "@/app/CompanyLogo";
import { useSound } from "@/app/SoundContext";
import { Button, IconButton } from "@/app/ui/Button";
import { Card } from "@/app/ui/Card";
import { Delta } from "@/app/ui/Delta";
import { Input } from "@/app/ui/Field";
import { Menu } from "@/app/ui/Menu";
import { ProgressBar, type ProgressTone } from "@/app/ui/ProgressBar";
import { Segmented } from "@/app/ui/Segmented";
import { Stamp } from "@/app/ui/Stamp";
import { Stat, StatGroup } from "@/app/ui/Stat";
import { EmptyState } from "@/app/ui/States";
import { cx } from "@/app/ui/cx";
import {
  formatCurrency,
  formatDate,
  formatSignedCurrency,
  gainLabel,
} from "@/app/ui/format";
import {
  IconClose,
  IconEdit,
  IconSearch,
  IconSort,
  IconTag,
  IconTrash,
  IconUndo,
} from "@/app/ui/icons";

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

type SortKey = "return" | "value" | "name";
type StatusKey = "all" | "open" | "sold";

const SORT_LABELS: Record<SortKey, string> = {
  return: "Return",
  value: "Value",
  name: "Name",
};

const SORT_ITEMS = (Object.keys(SORT_LABELS) as SortKey[]).map((value) => ({
  value,
  label: SORT_LABELS[value],
}));

const STATUS_OPTIONS: { value: StatusKey; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "sold", label: "Sold" },
];

/**
 * One money row of a holding card: label left, amount right, and a chunky bar
 * underneath. Every bar in the list shares one scale (the biggest amount on
 * the page), so a longer bar always means more money — and the two bars of a
 * card compare directly: "now" longer than "bought for" means it grew.
 */
function MoneyBar({
  label,
  value,
  percent,
  tone,
  primary = false,
}: {
  label: string;
  value: string;
  percent: number;
  tone: ProgressTone;
  primary?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx("type-label", primary && "text-ink")}>{label}</span>
        <span
          className={cx(
            "type-display",
            primary ? "text-[24px] text-ink" : "text-[19px] text-ink-2",
          )}
        >
          {value}
        </span>
      </div>
      <ProgressBar
        value={percent / 100}
        tone={tone}
        size="lg"
        label={`${label} ${value}`}
        className="mt-1.5"
      />
    </div>
  );
}

export function HoldingsList({
  holdings,
  isAdmin = false,
  onEdit,
  onDelete,
  onSell,
  onReopen,
}: Props) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("return");
  const [status, setStatus] = useState<StatusKey>("all");
  const { play } = useSound();
  // Picking a sort already plays "toggle"; skip the menu's "close" cue then.
  const pickedSort = useRef(false);

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
    <div className="@container flex flex-col gap-4">
      {/* Nothing to filter or sort until there is a holding. */}
      <div
        className={cx(
          "flex flex-col gap-3 @xl:flex-row @xl:items-center",
          holdings.length === 0 && "hidden",
        )}
      >
        <div className="relative min-w-0 flex-1">
          <IconSearch
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 z-10 -translate-y-1/2 text-muted"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or ticker"
            aria-label="Filter holdings by name or ticker"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className={cx("pl-12!", filter && "pr-12!")}
          />
          {filter && (
            // Keys own `translate` and `position`, so a wrapper places it.
            <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2">
              <IconButton label="Clear filter" size="sm" onClick={() => setFilter("")}>
                <IconClose />
              </IconButton>
            </span>
          )}
        </div>
        {/* Fits one row down to ~350px; narrower, the sort key wraps under. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <Segmented
            size="sm"
            ariaLabel="Show holdings"
            value={status}
            onChange={(next) => {
              play("toggle");
              setStatus(next);
            }}
            options={STATUS_OPTIONS}
          />
          <Menu
            // Phones: the icon says "sort"; the word stays for screen readers.
            label={
              <>
                <span className="@max-sm:sr-only">Sort: </span>
                {SORT_LABELS[sort]}
              </>
            }
            icon={<IconSort />}
            align="end"
            value={sort}
            items={SORT_ITEMS}
            onSelect={(next) => {
              pickedSort.current = true;
              play("toggle");
              setSort(next as SortKey);
            }}
            onOpenChange={(open) => {
              if (pickedSort.current) {
                pickedSort.current = false;
                return;
              }
              play(open ? "open" : "close");
            }}
          />
        </div>
      </div>

      {filtered.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @6xl:grid-cols-3">
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
            const investedDate = formatDate(holding.dateInvested);
            const soldDate = formatDate(holding.soldDate);

            return (
              <motion.li
                key={holding.id ?? `${holding.symbol}-${holding.allocationIndex ?? idx}`}
                layout="position"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 320,
                  damping: 30,
                  delay: Math.min(idx, 8) * 0.05,
                  layout: { type: "spring", stiffness: 320, damping: 28 },
                }}
                className="min-w-0"
              >
                <Card
                  as="article"
                  tone={closed ? "amber" : "default"}
                  aria-label={`${holding.symbol}${closed ? ", sold" : ""}`}
                  className="@container flex h-full flex-col gap-4"
                >
                  <header className="flex items-start gap-3">
                    <CompanyLogo
                      symbol={holding.symbol}
                      name={holding.name}
                      logo={holding.logo}
                      size={44}
                      delay={idx * 60}
                      linkToLookup
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="type-title truncate text-[21px] leading-tight text-ink">
                        {holding.symbol}
                      </h3>
                      <p className="truncate text-[15px] leading-snug text-muted">
                        {holding.name || "—"}
                      </p>
                    </div>
                    <Delta
                      variant="pill"
                      percent={holding.changePercent}
                      className="mt-0.5 shrink-0"
                    />
                  </header>

                  {/* The rubber stamp stands in for the word "Sold". */}
                  {(investedDate || closed) && (
                    <p className="-mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[14px] leading-snug text-muted">
                      {investedDate && <span>Bought {investedDate}</span>}
                      {closed && (
                        <span className="inline-flex items-center gap-2">
                          <Stamp tone="amber" size="sm" rotate={-5}>
                            Sold
                          </Stamp>
                          {soldDate && <span className="font-semibold text-amber">{soldDate}</span>}
                        </span>
                      )}
                    </p>
                  )}

                  <div className="flex flex-col gap-3">
                    <MoneyBar
                      label="Bought for"
                      value={formatCurrency(invested)}
                      percent={investedPct}
                      tone="violet"
                    />
                    <MoneyBar
                      primary
                      label={closed ? "Sold for" : "Now"}
                      value={formatCurrency(current)}
                      percent={currentPct}
                      tone={closed ? "amber" : gain >= 0 ? "gain" : "loss"}
                    />
                  </div>

                  <StatGroup className="mt-auto">
                    <Stat
                      size="sm"
                      label="Shares"
                      value={holding.shares ? holding.shares.toFixed(4) : "—"}
                    />
                    <Stat
                      size="sm"
                      label={gainLabel(gain)}
                      tone={gain >= 0 ? "gain" : "loss"}
                      value={formatSignedCurrency(gain)}
                    />
                    <Stat size="sm" label="Price" value={formatCurrency(holding.currentPrice)} />
                  </StatGroup>

                  {isAdmin && (
                    <div className="grid grid-cols-3 gap-2 pb-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        fullWidth
                        className="px-2!"
                        icon={<IconEdit className="@max-[17rem]:hidden" />}
                        aria-label={`Edit ${holding.symbol}`}
                        onClick={() => onEdit?.(holding)}
                      >
                        Edit
                      </Button>
                      {closed ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          fullWidth
                          className="px-2!"
                          icon={<IconUndo className="@max-[17rem]:hidden" />}
                          aria-label={`Reopen ${holding.symbol}`}
                          onClick={() => onReopen?.(holding)}
                        >
                          Reopen
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          fullWidth
                          className="px-2!"
                          icon={<IconTag className="@max-[17rem]:hidden" />}
                          aria-label={`Sell ${holding.symbol}`}
                          onClick={() => onSell?.(holding)}
                        >
                          Sell
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        fullWidth
                        className="px-2!"
                        icon={<IconTrash className="@max-[17rem]:hidden" />}
                        aria-label={`Delete ${holding.symbol}`}
                        onClick={() => onDelete?.(holding)}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </Card>
              </motion.li>
            );
          })}
        </ul>
      )}

      {filtered.length === 0 && (
        <Card padding="none">
          {holdings.length === 0 ? (
            <EmptyState
              icon="🌱"
              title="No holdings yet"
              body={
                isAdmin
                  ? "Use Add investment to log the first buy."
                  : "The first buy will show up here."
              }
            />
          ) : (
            <EmptyState
              icon="🔍"
              title="No holdings match that filter."
              action={
                <div className="pb-1">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      play("toggle");
                      setFilter("");
                      setStatus("all");
                    }}
                  >
                    Show all holdings
                  </Button>
                </div>
              }
            />
          )}
        </Card>
      )}
    </div>
  );
}
