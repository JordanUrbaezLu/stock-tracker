"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompanyLogo } from "@/app/CompanyLogo";
import { useSound } from "@/app/SoundContext";
import { fetchPortfolio, getCachedPortfolio } from "@/app/portfolioCache";
import type { Tick } from "@/app/TickerTape";
import { AppShell } from "@/app/ui/AppShell";
import { Avatar } from "@/app/ui/Avatar";
import { Button } from "@/app/ui/Button";
import { Card } from "@/app/ui/Card";
import { Delta } from "@/app/ui/Delta";
import { FlapDisplay } from "@/app/ui/FlapDisplay";
import { ListRow, RankMarker } from "@/app/ui/ListRow";
import { Menu } from "@/app/ui/Menu";
import { Podium, type PodiumItem } from "@/app/ui/Podium";
import { Rise } from "@/app/ui/Reveal";
import { SectionHeader } from "@/app/ui/SectionHeader";
import { Skeleton } from "@/app/ui/Skeleton";
import { EmptyState, ErrorState } from "@/app/ui/States";
import { cx } from "@/app/ui/cx";
import {
  formatCurrency,
  formatPercent,
  formatPercentAbs,
  formatSignedCurrency,
  toneText,
} from "@/app/ui/format";
import { IconFilter, IconSort } from "@/app/ui/icons";
import { BEATS } from "@/app/ui/motion";

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

/* The table columns right of the stock (≥768): Holder · Value · Gain · Return.
 * Fixed widths, so the header and every row line up without a real <table>
 * (each row stays one big link). */
const TRAIL_COLS =
  "md:grid md:grid-cols-[7.5rem_5.5rem_5.5rem_6.5rem] md:items-center md:gap-x-4 lg:grid-cols-[9rem_6.5rem_6.5rem_7rem] xl:grid-cols-[7rem_5.5rem_5.5rem_6.5rem] xl:gap-x-3";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function StocksPage() {
  const [data, setData] = useState<PortfolioResponse | null>(() =>
    getCachedPortfolio<PortfolioResponse>(),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !getCachedPortfolio());
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterSlug, setFilterSlug] = useState<string>("all");
  // The filter menu's "close" cue belongs to its trigger only: picking a
  // holder plays "toggle", and an outside tap / Esc closes silently.
  const triggerTapRef = useRef(false);
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

  // The true standings — best return first, whatever the sort key or the
  // holder filter say. Feeds the podium, the board hero and each row's rank.
  const ranked = useMemo(
    () => [...rows].sort((a, b) => b.changePercent - a.changePercent),
    [rows],
  );
  const rankOf = useMemo(
    () => new Map(ranked.map((r, i) => [r.key, i + 1])),
    [ranked],
  );
  const best = ranked[0] ?? null;

  // Ticker: every open holding, biggest move first (one tick per symbol).
  const ticks = useMemo<Tick[]>(() => {
    const seen = new Set<string>();
    return [...rows]
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .filter((r) => (seen.has(r.symbol) ? false : (seen.add(r.symbol), true)))
      .map((r) => ({ symbol: r.symbol, changePercent: r.changePercent }));
  }, [rows]);

  const score = useMemo(
    () => ({
      up: rows.filter((r) => r.changePercent > 0).length,
      down: rows.filter((r) => r.changePercent < 0).length,
    }),
    [rows],
  );

  const failed = Boolean(error) && !loading;
  const ready = !loading && !error;
  const hasRows = ready && rows.length > 0;

  const podiumItems: PodiumItem[] = ranked.slice(0, 3).map((r, i) => ({
    key: r.key,
    top: <CompanyLogo symbol={r.symbol} name={r.name} logo={r.logo} size={48} />,
    label: (
      <span className="flex flex-col items-center gap-1.5">
        <span>{r.symbol}</span>
        <Delta percent={r.changePercent} variant="pill" size="sm" decimals={1} />
      </span>
    ),
    sub: (
      <span className="inline-flex max-w-full items-center gap-1.5">
        <Avatar name={r.investorName} size={18} />
        <span className="truncate">{r.investorName}</span>
      </span>
    ),
    href: `/investor/${r.slug}`,
    ariaLabel: `${["1st", "2nd", "3rd"][i]} place: ${r.symbol}, ${
      r.changePercent < 0 ? "down" : "up"
    } ${formatPercentAbs(r.changePercent)}, held by ${r.investorName}`,
  }));

  const hero = loading ? (
    <div className="pb-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading the picks…
      </span>
      <Skeleton className="h-3 w-48" />
      <Skeleton className="mt-3 h-[clamp(49px,15vw,94px)] w-[min(100%,20rem)] rounded-[10px]" />
      <Skeleton className="mt-5 h-5 w-60" />
    </div>
  ) : hasRows && best ? (
    // Extra bottom room: the podium card overlaps the board's last 32px
    // (from 1280 it sits in the right rail, clear of the hero text).
    <div className="pb-6 xl:pb-2">
      <h1 className="type-eyebrow text-amber">
        Hot picks · {plural(rows.length, "holding")}
      </h1>
      <FlapDisplay
        value={formatPercent(best.changePercent)}
        size="hero"
        tone={best.changePercent >= 0 ? "gain" : "loss"}
        label={`Best pick return ${formatPercent(best.changePercent)}`}
        sound
        className="mt-3"
      />
      <Rise
        delay={BEATS.deltas}
        className="mt-2.5 flex flex-wrap items-center gap-x-2 text-[18px] leading-snug font-semibold text-ink"
      >
        <span>
          <span className="font-medium text-ink-2">Best pick:</span> {best.symbol}
        </span>
        <span aria-hidden className="text-faint max-[359px]:hidden">
          ·
        </span>
        <Link
          href={`/investor/${best.slug}`}
          onClick={() => play("nav")}
          className="group inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl"
        >
          <span className="shrink-0 font-medium whitespace-nowrap text-ink-2">held by</span>
          <Avatar name={best.investorName} size={22} ring className="shrink-0" />
          <span className="min-w-0 underline decoration-line-strong decoration-2 underline-offset-4 group-hover:decoration-amber">
            {best.investorName}
          </span>
        </Link>
      </Rise>
    </div>
  ) : (
    <div>
      <h1 className="type-eyebrow text-amber">Hot picks</h1>
      <p className="mt-3 text-[18px] leading-snug font-semibold text-ink text-pretty">
        {failed ? "The board is offline right now." : "Nobody has picked a stock yet."}
      </p>
    </div>
  );

  return (
    <AppShell
      active="stocks"
      back
      status={loading ? "loading" : error ? "error" : "live"}
      ticker={loading ? "loading" : hasRows ? ticks : null}
      hero={hero}
    >
      {loading && <HallSkeleton />}

      {failed && (
        <ErrorState
          title="Couldn't load the picks"
          message={`${(error ?? "").replace(/[.\s]*$/, "")}. Check your connection, then try again.`}
          onRetry={() => {
            setLoading(true);
            load(true);
          }}
        />
      )}

      {ready && rows.length === 0 && (
        <Card padding="none">
          <EmptyState
            icon="📈"
            title="No holdings yet"
            body="Add investments to see the leaderboard."
          />
        </Card>
      )}

      {hasRows && (
        <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-8">
          {/* The podium rests on the board's edge; from 1280 it is a sticky
              rail beside the list. */}
          <div className="relative -mt-14 min-w-0 xl:sticky xl:top-[calc(var(--shell-top)+16px)] xl:col-start-2 xl:row-start-1">
            <Card raised as="section" padding="lg" aria-labelledby="h-podium">
              <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] md:items-center md:gap-8 xl:block">
                <div>
                  <h2 id="h-podium" className="type-title text-[21px] leading-tight text-ink">
                    {ranked.length >= 3 ? "Top 3 picks" : ranked.length === 2 ? "Top 2 picks" : "Top pick"}
                  </h2>
                  <p className="mt-1 text-[15px] leading-snug text-muted">
                    {score.up} of {plural(rows.length, "pick")}{" "}
                    {score.up === 1 ? "is" : "are"} up right now.
                  </p>
                  <ScoreBar up={score.up} down={score.down} total={rows.length} />
                </div>
                {/* Each spot links to its holder — same "nav" cue as the rows. */}
                <div
                  className="mt-6 md:mt-0 xl:mt-6"
                  onClickCapture={(e) => {
                    if ((e.target as Element).closest("a")) play("nav");
                  }}
                >
                  <Podium items={podiumItems} />
                </div>
              </div>
            </Card>
          </div>

          <section aria-labelledby="h-picks" className="min-w-0 xl:col-start-1 xl:row-start-1">
            <SectionHeader
              id="h-picks"
              emoji="📈"
              title="All picks"
              meta={
                <span aria-live="polite">
                  {filterSlug !== "all"
                    ? `${filtered.length} of ${plural(rows.length, "holding")}`
                    : plural(filtered.length, "holding")}
                </span>
              }
              action={
                <div
                  // SectionHeader's action slot never shrinks; cap the keys at
                  // the hall's width so they wrap on the narrowest phones.
                  className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2.5 pb-1"
                  onClickCapture={(e) => {
                    if ((e.target as Element).closest('[aria-haspopup="menu"]')) {
                      triggerTapRef.current = true;
                    }
                  }}
                >
                  <Menu
                    label={`Filter: ${filterSlug === "all" ? "All holders" : activeFilterName}`}
                    icon={<IconFilter />}
                    value={filterSlug}
                    // The closed popover lingers (invisible) while its exit
                    // spring settles; don't let it swallow taps on the rows.
                    // It is also tall enough to show the whole family.
                    className="[&:has(>button[aria-expanded=false])>[role=menu]]:pointer-events-none [&>[role=menu]]:max-h-[min(26rem,60dvh)]"
                    onOpenChange={(open) => {
                      if (open) play("open");
                      else if (triggerTapRef.current) play("close");
                      triggerTapRef.current = false;
                    }}
                    onSelect={(slug) => {
                      play("toggle");
                      setFilterSlug(slug);
                    }}
                    items={[
                      { value: "all", label: "All holders" },
                      ...investorOptions.map((opt) => ({
                        value: opt.slug,
                        label: (
                          <span className="flex items-center gap-2.5">
                            <Avatar name={opt.name} size={22} />
                            <span className="truncate">{opt.name}</span>
                          </span>
                        ),
                      })),
                    ]}
                  />
                  {/* Same pill key as the Menu trigger beside it. */}
                  <button
                    type="button"
                    data-variant="secondary"
                    data-live=""
                    onClick={() => {
                      play("toggle");
                      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                    }}
                    aria-label={`Sorted ${
                      sortDir === "desc" ? "best to worst" : "worst to best"
                    } — tap to reverse`}
                    className="ui-key relative inline-flex h-11 cursor-pointer select-none items-center gap-2 rounded-full pr-4 pl-3.5 text-[15px] font-bold [--key-lip-size:3px]"
                  >
                    <IconSort
                      size={18}
                      className={cx(
                        "shrink-0 text-ink-2 transition-transform duration-200 ease-board motion-reduce:transition-none",
                        sortDir === "asc" && "-scale-y-100",
                      )}
                    />
                    {sortDir === "desc" ? "Best first" : "Worst first"}
                  </button>
                </div>
              }
            />

            <Card padding="none" className="p-1.5 max-[359px]:p-1">
              {/* Column heads — the rows below are links, so this is a visual
                  guide; each row carries the same facts in its own label. */}
              <div
                aria-hidden
                className={cx(
                  "type-label mx-3 hidden items-center gap-3 border-b border-line pt-2 pb-2.5",
                  filtered.length > 0 && "md:flex",
                )}
              >
                <span className="flex w-8 shrink-0 justify-center whitespace-nowrap">Rank</span>
                <span className="min-w-0 flex-1">Stock</span>
                <span className={cx(TRAIL_COLS, "shrink-0 text-right")}>
                  <span className="text-left">Holder</span>
                  <span>Value</span>
                  <span>Gain</span>
                  <span>Return</span>
                </span>
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                  <p className="text-base font-semibold text-ink-2">
                    No holdings for {activeFilterName}.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      play("toggle");
                      setFilterSlug("all");
                    }}
                  >
                    Show all holders
                  </Button>
                </div>
              ) : (
                // Re-keyed so the rows rise in again after a sort or filter.
                <ol key={`${sortDir}:${filterSlug}`} className="md:pt-1">
                  {filtered.map((row, idx) => {
                    const rank = rankOf.get(row.key) ?? idx + 1;
                    const step = Math.min(idx, 12);
                    // Some tickers come back with the symbol as their name.
                    const company =
                      row.name && row.name.trim().toUpperCase() !== row.symbol.toUpperCase()
                        ? row.name
                        : null;
                    return (
                      <Rise as="li" key={row.key} delay={step * 0.04}>
                        <ListRow
                          href={`/investor/${row.slug}`}
                          onClick={() => play("nav")}
                          // Narrowest phones: trade row padding for the holder's name.
                          className="max-[359px]:px-1.5"
                          ariaLabel={`Rank ${rank}: ${row.symbol}${
                            company ? `, ${company}` : ""
                          }, held by ${row.investorName}. Return ${formatPercent(
                            row.changePercent,
                          )}, value ${formatCurrency(row.currentValue)}, ${
                            row.gain <= -0.005 ? "loss" : "gain"
                          } ${formatCurrency(Math.abs(row.gain))}. Open ${
                            row.investorName
                          }'s page.`}
                          lead={
                            <>
                              <RankMarker rank={rank} delay={step * 40} />
                              <CompanyLogo
                                symbol={row.symbol}
                                name={row.name}
                                logo={row.logo}
                                size={40}
                                delay={Math.min(idx, 8) * 60}
                                linkToLookup
                              />
                            </>
                          }
                          title={row.symbol}
                          subtitle={
                            <>
                              {company && <span className="block truncate">{company}</span>}
                              <span className="mt-0.5 flex items-center gap-1.5 md:hidden">
                                <span
                                  className={
                                    row.investorName.length > 8
                                      ? "sr-only"
                                      : "max-[359px]:sr-only"
                                  }
                                >
                                  Held by
                                </span>
                                <Avatar name={row.investorName} size={16} />
                                <span className="truncate font-semibold text-ink-2">
                                  {row.investorName}
                                </span>
                              </span>
                            </>
                          }
                          trail={
                            <span className={cx("flex flex-col items-end gap-0.5", TRAIL_COLS)}>
                              <span className="mb-0.5 md:order-4 md:mb-0 md:justify-self-end">
                                <Delta percent={row.changePercent} variant="pill" size="sm" />
                              </span>
                              <span className="hidden min-w-0 items-center gap-2 text-left text-[15px] font-semibold text-ink-2 md:order-1 md:flex">
                                <Avatar name={row.investorName} size={22} />
                                <span className="truncate">{row.investorName}</span>
                              </span>
                              <span className="tnum text-[14px] font-semibold text-ink-2 md:order-2 md:text-[15px] md:text-ink">
                                <span className="font-medium text-muted md:hidden">Now </span>
                                {formatCurrency(row.currentValue)}
                              </span>
                              <span
                                className={cx(
                                  "tnum text-[14px] font-bold md:order-3 md:text-[15px]",
                                  // Under half a cent prints "$0.00" — no tone.
                                  toneText(row.gain, 0.005),
                                )}
                              >
                                {formatSignedCurrency(row.gain)}
                              </span>
                            </span>
                          }
                          footer={<ReturnLane pct={row.changePercent} max={maxPct} />}
                        />
                      </Rise>
                    );
                  })}
                </ol>
              )}
            </Card>
          </section>
        </div>
      )}
    </AppShell>
  );
}

/* --------------------------------------------------------------- Pieces -- */

/** The lane under a row: its length is the pick's return next to the biggest
 * move on the board. Losing picks leave the lane empty. */
function ReturnLane({ pct, max }: { pct: number; max: number }) {
  const width = pct > 0 ? Math.max(4, (pct / max) * 100) : 0;
  return (
    <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-surface-3">
      {width > 0 && (
        <span className="block h-full rounded-full bg-gain" style={{ width: `${width}%` }} />
      )}
    </span>
  );
}

/** How many picks are winning vs losing, as one split bar. */
function ScoreBar({ up, down, total }: { up: number; down: number; total: number }) {
  const flat = Math.max(0, total - up - down);
  return (
    <div className="mt-3">
      <div
        role="img"
        aria-label={`${up} up, ${down} down${flat ? `, ${flat} flat` : ""}`}
        className="flex h-2.5 gap-1"
      >
        {up > 0 && <span className="basis-0 rounded-full bg-gain" style={{ flexGrow: up }} />}
        {flat > 0 && (
          <span className="basis-0 rounded-full bg-surface-3" style={{ flexGrow: flat }} />
        )}
        {down > 0 && <span className="basis-0 rounded-full bg-loss" style={{ flexGrow: down }} />}
      </div>
      <p aria-hidden className="mt-1.5 flex justify-between text-[13px] font-bold">
        <span className="text-gain">{up} up</span>
        <span className="text-loss">{down} down</span>
      </p>
    </div>
  );
}

function HallSkeleton() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-8"
    >
      <div className="relative -mt-14 min-w-0 xl:col-start-2 xl:row-start-1">
        <Card raised padding="lg">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-4 w-48" />
          <div className="mt-6 flex items-end justify-center gap-2">
            <Skeleton className="h-24 w-24 rounded-2xl" />
            <Skeleton className="h-32 w-24 rounded-2xl" />
            <Skeleton className="h-20 w-24 rounded-2xl" />
          </div>
        </Card>
      </div>
      <div className="min-w-0 xl:col-start-1 xl:row-start-1">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Skeleton className="h-8 w-44" />
          <div className="flex gap-2.5">
            <Skeleton className="h-11 w-48 rounded-full" />
            <Skeleton className="h-11 w-28 rounded-full" />
          </div>
        </div>
        <Card padding="none" className="flex flex-col gap-1.5 p-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-18 w-full rounded-2xl" />
          ))}
        </Card>
      </div>
    </div>
  );
}
