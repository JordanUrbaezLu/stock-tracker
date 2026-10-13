import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import clientPromise from "@/lib/mongodb";
import {
  alpacaConfigured,
  fetchAsset,
  fetchDailyBars,
  fetchSnapshots,
  fmpLogoUrl,
} from "@/lib/alpaca";
import { fetchFinnhubLogos } from "@/lib/logos";

type SoldSeed = { date?: string; amount?: number; shares?: number };

type InvestorSeed = {
  name: string;
  originalAmountInvested?: number;
  allocations: {
    symbol: string;
    amount: number;
    shares?: number;
    dateInvested?: string;
    id?: string;
    allocationIndex?: number;
    sold?: SoldSeed;
  }[];
};

type SoldRaw = {
  date?: string | Date;
  amount?: number;
  proceeds?: number;
  price?: number;
  shares?: number;
};

type AllocationRaw = {
  symbol?: string;
  invested?: number;
  amount?: number;
  shares?: number;
  dateInvested?: string | Date;
  id?: string;
  sold?: SoldRaw;
  // Flat alternatives, also accepted.
  soldDate?: string | Date;
  soldAmount?: number;
  soldShares?: number;
};

type InvestorFile = {
  investors: Array<{
    name: string;
    originalAmountInvested?: number;
    allocations: Array<
      // dbIndex: the row's position in the stored array, kept so admin edits
      // that fall back to allocationIndex still hit the right row even if a
      // symbol-less row was skipped while loading.
      AllocationRaw & { symbol: string; sold?: SoldSeed; dbIndex?: number }
    >;
  }>;
};

type InvestorDbDoc = {
  investors?: Array<{
    name?: string;
    originalAmountInvested?: number;
    allocations?: AllocationRaw[];
  }>;
};

type SymbolHistoryPoint = { time: number; close: number };

type SymbolData = {
  currentPrice: number | null;
  prevClose: number | null;
  startPrice: number | null;
  history: SymbolHistoryPoint[];
  name?: string | null;
  logo?: string | null;
};

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
  // Today's move (current price vs previous close) for the open position.
  dayChange?: number | null;
  dayChangePercent?: number | null;
  dateInvested?: string | null;
  history: { time: number; value: number }[];
  allocationIndex?: number;
  id?: string;
  // Closed positions: set when an allocation has been sold.
  status?: "open" | "closed";
  soldDate?: string | null;
  proceeds?: number | null;
  realizedChange?: number | null;
  realizedChangePercent?: number | null;
};

/** A dated cash amount; `time` is epoch seconds of the UTC day (00:00Z). */
type CashFlow = { time: number; amount: number };

type InvestorValue = {
  name: string;
  slug: string;
  originalAmountInvested: number;
  totalInvested: number;
  currentValue: number;
  change: number;
  changePercent: number;
  // Today's aggregate move across open holdings (current vs previous close).
  dayChange: number;
  dayChangePercent: number;
  // When external cash came in (see inferContributions): one entry per UTC
  // day, sorted, summing to originalAmountInvested.
  contributions: CashFlow[];
  // Sale proceeds not yet reinvested: contributed + Σ sale proceeds − Σ
  // purchases, in cents (= currentValue − open market value). Below −$1 means
  // originalAmountInvested is stale (new cash added without bumping it).
  uninvestedCash: number;
  // Alpha League, money-weighted: the same contributions, on the same days,
  // put into the S&P 500 (SPY) instead.
  spyReturn: number | null; // that S&P portfolio's % return on contributed
  alphaSpy: number | null; // investor return % minus spyReturn
  // That S&P portfolio's value over time, on valueHistory's timestamps.
  benchmarkHistory: { time: number; value: number }[];
  holdings: HoldingValue[];
  // Contributed-so-far + cumulative gains: steps up when new cash arrives and
  // ends exactly at currentValue.
  valueHistory: { time: number; value: number }[];
};

function getStartPriceForDate(
  history: SymbolHistoryPoint[],
  startTimestamp: number,
): number | null {
  if (!history.length) return null;
  const match = history.find((point) => point.time >= startTimestamp);
  if (match) return match.close;
  return history[0].close ?? null;
}

function normalizeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function normalizeDate(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return undefined;
}

/**
 * Reads a "sold" record from either the nested `sold` object or flat
 * soldDate/soldAmount/soldShares fields. Returns undefined when nothing
 * meaningful is present (i.e. the position is still open).
 */
function normalizeSold(allocation: AllocationRaw): SoldSeed | undefined {
  const nested = allocation.sold;
  const date = normalizeDate(nested?.date ?? allocation.soldDate);
  const amount = normalizeNumber(
    nested?.amount ?? nested?.proceeds ?? allocation.soldAmount,
  );
  const shares = normalizeNumber(nested?.shares ?? allocation.soldShares);
  if (!date && amount === undefined && shares === undefined) return undefined;
  return { date, amount, shares };
}

async function loadInvestorsFromDb(): Promise<InvestorFile | null> {
  try {
    const client = await clientPromise;
    const dbName = process.env.MONGODB_DB;
    if (!dbName) return null;
    const db = client.db(dbName);

    const collectionName = process.env.MONGODB_COLLECTION;
    if (!collectionName) return null;

    const doc =
      (await db
        .collection<InvestorDbDoc>(collectionName)
        .findOne({ "investors.0": { $exists: true } }, { projection: { investors: 1 } })) ||
      (await db
        .collection<InvestorDbDoc>(collectionName)
        .findOne({}, { projection: { investors: 1 } }));

    if (!doc?.investors?.length) return null;
    console.log("[portfolio] loaded investors from DB", {
      dbName,
      collectionName,
      investorsCount: doc.investors.length,
    });

    const investors = doc.investors
      .filter((inv) => inv?.name)
      .map((inv) => ({
        name: inv.name as string,
        originalAmountInvested: normalizeNumber(inv.originalAmountInvested),
        allocations: (inv.allocations ?? [])
          .map((allocation, dbIndex) => {
            const symbol = allocation?.symbol?.toString().trim();
            if (!symbol) return null;
            const invested = normalizeNumber(
              allocation.invested ?? allocation.amount,
            );
            const shares = normalizeNumber(allocation.shares);
            const dateInvested = normalizeDate(allocation.dateInvested);
            const sold = normalizeSold(allocation);
            return {
              symbol,
              invested: invested ?? 0,
              shares: shares ?? undefined,
              dateInvested,
              sold,
              // Pass the stable id through: admin edits resolve rows by id
              // first (it was being dropped, forcing the index fallback).
              id: allocation.id ? String(allocation.id) : undefined,
              dbIndex,
            };
          })
          .filter(Boolean) as InvestorFile["investors"][number]["allocations"],
      }));

    if (!investors.length) return null;
    return { investors };
  } catch (error) {
    console.error("Failed to load investors from MongoDB", error);
    return null;
  }
}

async function loadInvestorsFromFile(): Promise<InvestorFile | null> {
  const filePath = path.join(process.cwd(), "data", "investors.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as InvestorFile;
    if (!parsed.investors) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function loadInvestors(): Promise<InvestorFile | null> {
  // Prefer MongoDB; fall back to local seed file if DB is unavailable.
  const fromDb = await loadInvestorsFromDb();
  if (fromDb) return fromDb;
  return loadInvestorsFromFile();
}

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Sum a set of time series into one, forward-filled: at each timestamp add each
 * series' last-known value while it's active (skipped before its first point /
 * after its last). Used for both the portfolio value line and the capital-flow
 * benchmark so they stay perfectly aligned.
 */
function combineSeries(
  seriesList: { time: number; value: number }[][],
): { time: number; value: number }[] {
  const series = seriesList
    .map((s) => [...s].sort((a, b) => a.time - b.time))
    .filter((points) => points.length > 0);
  const allTimes = Array.from(
    new Set(series.flatMap((points) => points.map((p) => p.time))),
  ).sort((a, b) => a - b);

  return allTimes.map((time) => {
    let value = 0;
    for (const points of series) {
      if (time < points[0].time || time > points[points.length - 1].time) {
        continue;
      }
      let lastValue = 0;
      for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].time <= time) {
          lastValue = points[i].value;
          break;
        }
      }
      value += lastValue;
    }
    return { time, value };
  });
}

const DAY_SECONDS = 86_400;

/** Epoch seconds of the UTC day containing `ts`. Dates are stored as ISO
 *  midnight UTC, so this is the calendar day an event was recorded on. */
function utcDayStart(ts: number): number {
  return Math.floor(ts / DAY_SECONDS) * DAY_SECONDS;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function toEpochSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * When did external cash actually enter this investor's account?
 *
 * Walks purchases and sales in date order, a day's sales before its purchases
 * (so a same-day sell→rebuy is funded by the sale; a position bought and sold
 * on the same day is sold after it's bought). Sale proceeds go into a pool;
 * each purchase draws on the pool first and whatever the pool can't cover is
 * new cash on that purchase's day. Rounding dust (under $1) is not a cash
 * flow: a pool down to cents doesn't fund later buys, and a rebuy a few cents
 * over its proceeds isn't a deposit.
 *
 * The residual between `contributed` and the inferred new cash (that dust,
 * cash that was never invested) dates from inception. A material shortfall
 * instead (inferred new cash exceeding what was contributed by more than $1:
 * a stale override, or a rebuy dated before the sale that funded it), or any
 * shortfall when nothing new arrived at inception, trims the newest deposits
 * first, so the timeline never shows money that was never contributed and no
 * deposit is negative (given contributed ≥ 0).
 *
 * Returns one entry per UTC day, sorted, summing to `contributed` (to the
 * cent). Mirrored in scripts/db-status.mjs — keep the two in sync.
 */
function inferContributions(
  holdings: HoldingValue[],
  contributed: number,
  nowTs: number,
): CashFlow[] {
  // Money can't arrive in the future: clamp mis-dated events to today so the
  // timeline is complete by the last point of the value series.
  const today = utcDayStart(nowTs);
  const dayOf = (ts: number) => Math.min(utcDayStart(ts), today);

  type Event = { day: number; order: number; ts: number; amount: number };
  const SALE = 0;
  const PURCHASE = 1;
  const SAME_DAY_SALE = 2; // sold the day it was bought
  const events: Event[] = [];
  for (const holding of holdings) {
    const boughtTs = toEpochSeconds(holding.dateInvested) ?? nowTs;
    events.push({
      day: dayOf(boughtTs),
      order: PURCHASE,
      ts: boughtTs,
      amount: Math.max(0, holding.amountInvested),
    });
    if (
      holding.status === "closed" &&
      holding.proceeds != null &&
      holding.proceeds > 0
    ) {
      const soldTs = toEpochSeconds(holding.soldDate) ?? nowTs;
      const day = dayOf(soldTs);
      events.push({
        day,
        order: day === dayOf(boughtTs) ? SAME_DAY_SALE : SALE,
        ts: soldTs,
        amount: holding.proceeds,
      });
    }
  }
  events.sort((a, b) => a.day - b.day || a.order - b.order || a.ts - b.ts);

  const purchaseDays = events
    .filter((e) => e.order === PURCHASE)
    .map((e) => e.day);
  const inceptionDay = purchaseDays.length ? Math.min(...purchaseDays) : today;

  const DUST = 1; // the ±$1 rounding tolerance of the money reconciliation
  let pool = 0;
  const newCashByDay = new Map<number, number>();
  for (const event of events) {
    if (event.order !== PURCHASE) {
      pool += event.amount;
      continue;
    }
    const fromPool = pool >= DUST ? Math.min(pool, event.amount) : 0;
    pool -= fromPool;
    const newCash = event.amount - fromPool;
    if (newCash >= DUST) {
      newCashByDay.set(event.day, (newCashByDay.get(event.day) ?? 0) + newCash);
    }
  }

  const flows: CashFlow[] = Array.from(newCashByDay, ([time, amount]) => ({
    time,
    amount: roundCents(amount),
  })).sort((a, b) => a.time - b.time);

  let residual =
    contributed - flows.reduce((sum, flow) => sum + flow.amount, 0);
  const inception = flows.find((flow) => flow.time === inceptionDay);
  // Trim newest-first when the shortfall is material, or when there's no
  // inception deposit to absorb it (the first buy was funded by a sale dated
  // before it) — otherwise it would surface as a negative "deposit".
  if (residual < -DUST || (residual < 0 && !inception)) {
    for (let i = flows.length - 1; i >= 0 && residual < 0; i--) {
      if (flows[i].time <= inceptionDay) break;
      const cut = Math.min(flows[i].amount, -residual);
      flows[i].amount = roundCents(flows[i].amount - cut);
      residual += cut;
    }
  }
  if (inception) inception.amount = roundCents(inception.amount + residual);
  else flows.unshift({ time: inceptionDay, amount: roundCents(residual) });

  return flows.filter((flow) => flow.amount !== 0);
}

/**
 * Running total of the contributions dated at or before `t`. The last total
 * is pinned to `contributed` itself, so a value series built on it ends on
 * exactly the same float as currentValue (no rounding drift).
 */
function contributionsUpTo(
  flows: CashFlow[],
  contributed: number,
): (t: number) => number {
  const totals: number[] = [];
  let running = 0;
  for (const flow of flows) {
    running += flow.amount;
    totals.push(running);
  }
  if (totals.length) totals[totals.length - 1] = contributed;
  return (t) => {
    let total = 0;
    for (let i = 0; i < flows.length && flows[i].time <= t; i++) {
      total = totals[i];
    }
    return total;
  };
}

/**
 * Value at time `t` (SPY priced at `spyAtT`) of the same contributions put
 * into SPY instead: each deposit buys SPY at its own day's price
 * (`spyAtFlow[i]`, aligned with `flows`) and grows with it from there.
 */
function spyWeightedValue(
  flows: CashFlow[],
  spyAtFlow: number[],
  t: number,
  spyAtT: number,
): number {
  let value = 0;
  for (let i = 0; i < flows.length && flows[i].time <= t; i++) {
    value += flows[i].amount * (spyAtT / spyAtFlow[i]);
  }
  return value;
}

export async function GET() {
  if (!alpacaConfigured()) {
    return NextResponse.json(
      { error: "Market data API not configured." },
      { status: 500 },
    );
  }

  console.log("[portfolio] GET invoked");
  const investorFile = await loadInvestors();
  console.log("[portfolio] data source", {
    investorsFromFile: investorFile?.investors?.length ?? 0,
  });
  const fallbackDate = new Date().toISOString();

  const grouped = new Map<
    string,
    {
      name: string;
      originalAmountInvested?: number;
      allocations: InvestorSeed["allocations"];
    }
  >();

  const sourceInvestors = investorFile?.investors;

  sourceInvestors?.forEach((investor) => {
    if (!investor?.name) return;
    const existing = grouped.get(investor.name);

    const mappedAllocations = (investor.allocations ?? [])
      .map((allocation, idx) => {
        const symbol = allocation.symbol?.toString().trim();
        if (!symbol) return null;

        const amount =
          typeof allocation.invested === "number"
            ? allocation.invested
            : typeof allocation.amount === "number"
              ? allocation.amount
              : 0;

        const shares =
          typeof allocation.shares === "number"
            ? allocation.shares
            : undefined;

        const dateInvested = allocation.dateInvested
          ? String(allocation.dateInvested)
          : fallbackDate;
        const id = allocation.id ? String(allocation.id) : undefined;
        const sold = normalizeSold(allocation);

        return {
          symbol,
          amount,
          shares,
          dateInvested,
          id,
          allocationIndex: allocation.dbIndex ?? idx,
          sold,
        };
      })
      .filter(Boolean) as InvestorSeed["allocations"];

    const originalAmountInvested =
      typeof investor.originalAmountInvested === "number"
        ? investor.originalAmountInvested
        : undefined;

    if (existing) {
      existing.allocations.push(...mappedAllocations);
      // Multiple source entries for the same investor: sum their contributions.
      if (typeof originalAmountInvested === "number") {
        existing.originalAmountInvested =
          (existing.originalAmountInvested ?? 0) + originalAmountInvested;
      }
    } else {
      grouped.set(investor.name, {
        name: investor.name,
        originalAmountInvested,
        allocations: mappedAllocations,
      });
    }
  });

  const investorsSeed: InvestorSeed[] = Array.from(grouped.values()).map(
    (inv) => ({
      ...inv,
      allocations: inv.allocations ?? [],
    }),
  );

  if (!investorsSeed.length) {
    return NextResponse.json(
      {
        error:
          "No investor data found. Set MONGODB_DB and MONGODB_COLLECTION with investor data, or provide data/investors.json.",
      },
      { status: 404 },
    );
  }

  const investmentTimestamps = investorsSeed
    .flatMap((investor) =>
      investor.allocations.map((allocation) =>
        new Date(allocation?.dateInvested || fallbackDate).getTime(),
      ),
    )
    .filter((value) => Number.isFinite(value));

  const earliestStartMs = investmentTimestamps.length
    ? Math.min(...investmentTimestamps)
    : Date.now();
  // Graphs cover up to the last 6 months of progress (the investor detail page
  // shows the full span); pull a little extra (185d) so the window comfortably
  // spans ~6 calendar months of trading days. The home cards slice this down to
  // their last ~30 days client-side for the "30D trend".
  const sixMonthsAgoSec = Math.floor((Date.now() - 185 * 86_400_000) / 1000);
  const from = Math.max(Math.floor(earliestStartMs / 1000), sixMonthsAgoSec);
  const to = Math.floor(Date.now() / 1000);

  const symbols = Array.from(
    new Set(
      investorsSeed.flatMap((investor) =>
        investor.allocations.map((allocation) => allocation.symbol.toUpperCase()),
      ),
    ),
  );

  // Alpaca: batched snapshots (live price + previous close), batched adjusted
  // daily bars (history), and per-symbol asset metadata (names). Logos come
  // from Finnhub's profile API (preferred look), falling back to FMP per symbol.
  const [snapshots, barsMap, assets, finnhubLogos] = await Promise.all([
    fetchSnapshots(symbols),
    fetchDailyBars(symbols, from, to),
    Promise.all(symbols.map((symbol) => fetchAsset(symbol))),
    fetchFinnhubLogos(symbols),
  ]);
  const assetBySymbol = new Map(
    assets
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .map((a) => [a.symbol.toUpperCase(), a] as const),
  );
  console.log("[portfolio] alpaca responses", {
    symbols,
    prices: symbols.map((s) => ({ symbol: s, price: snapshots.get(s)?.price ?? null })),
    historyLengths: symbols.map((s) => ({
      symbol: s,
      points: barsMap.get(s)?.length ?? 0,
    })),
  });

  const priceFromFile = new Map<string, number>();
  investorsSeed.forEach((investor) => {
    investor.allocations.forEach((allocation) => {
      if (allocation.shares && allocation.shares > 0 && allocation.amount > 0) {
        const price = allocation.amount / allocation.shares;
        const key = allocation.symbol.toUpperCase();
        if (!priceFromFile.has(key)) {
          priceFromFile.set(key, price);
        }
      }
    });
  });

  const symbolData = new Map<string, SymbolData>();

  symbols.forEach((symbol) => {
    const history = barsMap.get(symbol) ?? [];
    const snap = snapshots.get(symbol);
    const asset = assetBySymbol.get(symbol);
    const baselinePrice = priceFromFile.get(symbol) ?? null;

    const startPrice =
      getStartPriceForDate(history, from) ?? baselinePrice ?? null;
    const currentPrice =
      (snap?.price && snap.price > 0 ? snap.price : null) ??
      history.at(-1)?.close ??
      baselinePrice ??
      null;

    symbolData.set(symbol, {
      currentPrice,
      prevClose: snap?.prevClose ?? null,
      startPrice,
      history,
      name: asset?.name ?? null,
      logo: finnhubLogos.get(symbol) ?? fmpLogoUrl(symbol),
    });
  });

  // Alpha League benchmark: SPY (S&P 500) over the widest window we need —
  // from the day of the earliest investment to now — so we can price it on
  // every contribution day and overlay it on the charts.
  const benchFrom = Math.min(
    utcDayStart(Math.floor(earliestStartMs / 1000)),
    from,
  );
  const [benchBars, benchSnaps] = await Promise.all([
    fetchDailyBars(["SPY"], benchFrom, to),
    fetchSnapshots(["SPY"]),
  ]);
  const spyBars = benchBars.get("SPY") ?? [];
  const spyNow =
    benchSnaps.get("SPY")?.price ?? spyBars.at(-1)?.close ?? null;
  // SPY price at-or-after a timestamp, forward-filled to the latest/live price
  // for "today" points (the current day has no daily bar yet). Used to grow
  // each contribution by SPY from its own day.
  const latestSpy = spyNow ?? spyBars.at(-1)?.close ?? null;
  const spyClose = (t: number): number | null =>
    spyBars.find((b) => b.time >= t)?.close ?? latestSpy;

  /** SPY's % return between `sinceTs` and now. */
  const spyReturnSince = (sinceTs: number): number | null => {
    const start = getStartPriceForDate(spyBars, sinceTs);
    if (!start || !spyNow) return null;
    return (spyNow / start - 1) * 100;
  };

  const investors: InvestorValue[] = investorsSeed.map((investor) => {
    const investorStartTs = Math.min(
      ...investor.allocations.map((allocation) =>
        Math.floor(
          new Date(allocation?.dateInvested || fallbackDate).getTime() /
            1000,
        ),
      ),
    );

    const holdings: HoldingValue[] = investor.allocations.map(
      (
        {
          symbol,
          amount,
          shares: sharesFromFile,
          dateInvested,
          id,
          allocationIndex,
          sold,
        },
        idx,
      ) => {
        const upperSymbol = symbol.toUpperCase();
        const data = symbolData.get(upperSymbol);

        if (!data) {
          return {
            symbol: upperSymbol,
            name: upperSymbol,
            logo: null,
            amountInvested: amount,
            startPrice: null,
            currentPrice: null,
            shares: null,
            currentValue: null,
            change: null,
            changePercent: null,
            history: [],
            allocationIndex: allocationIndex ?? idx,
            id,
          };
        }

        const allocationStartTs = dateInvested
          ? Math.floor(new Date(dateInvested).getTime() / 1000)
          : investorStartTs;

        const startPrice =
          getStartPriceForDate(data.history, allocationStartTs) ??
          data.startPrice;

        const shares =
          sharesFromFile && sharesFromFile > 0
            ? sharesFromFile
            : startPrice && startPrice > 0
              ? amount / startPrice
              : null;

        // Closed position: value the holding from purchase up to the sale date,
        // realize the proceeds, then drop out of current totals/graphs.
        if (sold?.date) {
          const soldTs = Math.floor(new Date(sold.date).getTime() / 1000);
          const usableShares = shares && shares > 0 ? shares : null;
          const soldShares =
            sold.shares && sold.shares > 0 ? sold.shares : usableShares;
          const sellPrice =
            getStartPriceForDate(data.history, soldTs) ??
            data.currentPrice ??
            startPrice ??
            null;
          const proceeds =
            typeof sold.amount === "number" && sold.amount > 0
              ? sold.amount
              : soldShares && sellPrice && sellPrice > 0
                ? soldShares * sellPrice
                : null;
          // Prorate the cost basis to the shares actually sold (full sale → amount).
          const costBasis =
            usableShares && soldShares
              ? amount * Math.min(1, soldShares / usableShares)
              : amount;
          const realizedChange = proceeds != null ? proceeds - costBasis : null;
          const realizedChangePercent =
            realizedChange != null && costBasis > 0
              ? (realizedChange / costBasis) * 100
              : null;

          const historyValues = usableShares
            ? data.history
                .filter(
                  (point) =>
                    point.time >= allocationStartTs && point.time <= soldTs,
                )
                .map((point) => ({
                  time: point.time,
                  value: point.close * (soldShares ?? usableShares),
                }))
            : [];
          if (proceeds != null) {
            historyValues.push({ time: soldTs, value: proceeds });
          }

          return {
            symbol: upperSymbol,
            name: data.name ?? upperSymbol,
            logo: data.logo ?? null,
            amountInvested: amount,
            startPrice: startPrice ?? null,
            currentPrice: data.currentPrice,
            shares: usableShares,
            currentValue: 0,
            change: realizedChange,
            changePercent: realizedChangePercent,
            dateInvested,
            history: historyValues,
            allocationIndex: allocationIndex ?? idx,
            id,
            status: "closed",
            soldDate: sold.date ?? null,
            proceeds,
            realizedChange,
            realizedChangePercent,
          };
        }

        if (!shares || shares <= 0) {
          return {
            symbol: upperSymbol,
            name: data.name ?? upperSymbol,
            logo: data.logo ?? null,
            amountInvested: amount,
            startPrice: startPrice ?? null,
            currentPrice: data.currentPrice,
            shares: null,
            currentValue: null,
            change: null,
            changePercent: null,
            dateInvested,
            history: [],
            allocationIndex: allocationIndex ?? idx,
            id,
          };
        }

        const currentPrice = data.currentPrice ?? startPrice ?? null;
        const currentValue = shares * (currentPrice || 1);
        const change = currentValue - amount;
        const changePercent = (change / amount) * 100;

        // Today's move: current price vs the previous daily close.
        const prevClose = data.prevClose;
        const dayChange =
          prevClose != null && currentPrice != null
            ? shares * (currentPrice - prevClose)
            : null;
        const dayChangePercent =
          prevClose && currentPrice != null
            ? ((currentPrice - prevClose) / prevClose) * 100
            : null;

        // Only count the holding from its purchase date onward, then anchor
        // the final point to the live current value.
        const historyValues = data.history
          .filter((point) => point.time >= allocationStartTs)
          .map((point) => ({
            time: point.time,
            value: point.close * shares,
          }));
        if (currentValue > 0) {
          historyValues.push({ time: to, value: currentValue });
        }

        return {
          symbol: upperSymbol,
          name: data.name ?? upperSymbol,
          logo: data.logo ?? null,
          amountInvested: amount,
          startPrice,
          currentPrice,
          shares,
          currentValue,
          change,
          changePercent,
          dayChange,
          dayChangePercent,
          dateInvested,
          history: historyValues,
          allocationIndex: allocationIndex ?? idx,
          id,
        };
      },
    );

    const totalInvested = holdings.reduce(
      (sum, holding) => sum + holding.amountInvested,
      0,
    );
    const originalInvested = investor.originalAmountInvested ?? totalInvested;

    // Total gain = unrealized gains on open positions + realized gains on closed
    // positions, each measured from its OWN cost basis. This telescopes correctly
    // even when a sale's proceeds were reinvested into a new holding, so realized
    // profit is no longer dropped from the headline gain.
    const totalGain = holdings.reduce(
      (sum, holding) => sum + (holding.change ?? 0),
      0,
    );
    // Current value = original capital + total gain: open market value plus any
    // realized cash. Equals live market value when sales were fully reinvested.
    const currentValue = originalInvested + totalGain;
    const change = totalGain;
    const changePercent = originalInvested
      ? (totalGain / originalInvested) * 100
      : 0;

    // Today's aggregate move across open holdings; % is vs yesterday's close.
    const dayChange = holdings.reduce(
      (sum, holding) => sum + (holding.dayChange ?? 0),
      0,
    );
    const prevCloseValue = currentValue - dayChange;
    const dayChangePercent = prevCloseValue
      ? (dayChange / prevCloseValue) * 100
      : 0;

    // Cash-flow timeline: when external money actually came in, inferred from
    // purchases and sales (sale proceeds fund later buys first). Proceeds still
    // sitting in the account are uninvested cash.
    const contributions = inferContributions(holdings, originalInvested, to);
    const saleProceeds = holdings.reduce(
      (sum, holding) =>
        sum + (holding.status === "closed" ? (holding.proceeds ?? 0) : 0),
      0,
    );
    const uninvestedCash = roundCents(
      originalInvested + saleProceeds - totalInvested,
    );
    const contributedUpTo = contributionsUpTo(contributions, originalInvested);

    // Total value over time = cash contributed so far + cumulative per-holding
    // gains. Each holding contributes (value − its own cost basis) while held; a
    // closed holding freezes at its realized gain from the sale date to the
    // window end. Built this way the line stays continuous across a sell→rebuy
    // (the principal just moves between holdings), steps up on the day new cash
    // arrives (instead of back-dating today's total to day one), and its final
    // point equals currentValue exactly — including realized profit.
    const gainSeries = holdings
      .filter((h) => h.history.length > 0)
      .map((h) => {
        const gains = h.history.map((p) => ({
          time: p.time,
          value: p.value - h.amountInvested,
        }));
        if (h.status === "closed" && h.realizedChange != null) {
          // Lock in the realized gain at the sale and hold it to the window end
          // so the closed position isn't dropped from the summed line.
          const lastTime = gains[gains.length - 1].time;
          gains[gains.length - 1] = { time: lastTime, value: h.realizedChange };
          if (lastTime < to) gains.push({ time: to, value: h.realizedChange });
        }
        return gains;
      });
    const valueHistory = combineSeries(gainSeries).map((p) => ({
      time: p.time,
      value: contributedUpTo(p.time) + p.value,
    }));

    // Fair S&P comparison, "the same money, on the same days": each
    // contribution buys SPY at its own day's close. Money added later is only
    // compared against the S&P gains it could actually have earned, so adding
    // cash never makes anyone look like they're losing to the index. Selling
    // and reinvesting is internal and never touches this line. The dashed
    // overlay shares valueHistory's timestamps (the home page sums both
    // across investors) and its last point is the S&P value behind spyReturn.
    const spyAtFlow = contributions.map((flow) => spyClose(flow.time));
    const flowPrices = spyAtFlow.every((p) => p != null && p > 0)
      ? (spyAtFlow as number[])
      : null;
    const benchmarkReady =
      flowPrices != null && contributions.length > 0 && latestSpy != null;
    const benchmarkHistory = benchmarkReady
      ? valueHistory.map((p) => ({
          time: p.time,
          value: spyWeightedValue(
            contributions,
            flowPrices,
            p.time,
            spyClose(p.time) ?? latestSpy,
          ),
        }))
      : [];
    const benchNow = benchmarkReady
      ? spyWeightedValue(contributions, flowPrices, to, latestSpy)
      : null;

    // Alpha vs SPY on the same return basis the cards show (total gain vs cash
    // contributed): investor return % minus that S&P portfolio's return %.
    const spyReturn =
      benchNow != null && originalInvested > 0
        ? ((benchNow - originalInvested) / originalInvested) * 100
        : null;
    const alphaSpy = spyReturn != null ? changePercent - spyReturn : null;

    return {
      name: investor.name,
      slug: slugify(investor.name),
      // Real external cash contributed; falls back to the rotated invested
      // total when not explicitly recorded.
      originalAmountInvested: investor.originalAmountInvested ?? totalInvested,
      totalInvested,
      currentValue,
      change,
      changePercent,
      dayChange,
      dayChangePercent,
      contributions,
      uninvestedCash,
      spyReturn,
      alphaSpy,
      benchmarkHistory,
      holdings,
      valueHistory,
    };
  });

  // Group-level benchmark: SPY since the earliest investment + its window
  // closes (the frontend indexes these to the combined group series).
  const spyGroupReturn = spyReturnSince(Math.floor(earliestStartMs / 1000));
  const spyHistory = spyBars.filter((p) => p.time >= from);

  return NextResponse.json({
    asOf: Date.now(),
    investors,
    symbols,
    benchmark: { label: "S&P 500", spyGroupReturn, spyHistory },
  });
}
