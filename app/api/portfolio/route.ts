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
      AllocationRaw & { symbol: string; sold?: SoldSeed }
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
  // Alpha League: return vs the S&P 500 (SPY) since this investor's inception.
  spyReturn: number | null; // SPY's % return over the same window
  alphaSpy: number | null; // investor return % minus spyReturn
  // SPY's path indexed to this portfolio's starting value (for chart overlay).
  benchmarkHistory: { time: number; value: number }[];
  holdings: HoldingValue[];
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
          .map((allocation) => {
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
          allocationIndex: idx,
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
  // from the earliest investment to now — so we can price it at each
  // investor's inception and overlay it on the charts.
  const benchFrom = Math.min(Math.floor(earliestStartMs / 1000), from);
  const [benchBars, benchSnaps] = await Promise.all([
    fetchDailyBars(["SPY"], benchFrom, to),
    fetchSnapshots(["SPY"]),
  ]);
  const spyBars = benchBars.get("SPY") ?? [];
  const spyNow =
    benchSnaps.get("SPY")?.price ?? spyBars.at(-1)?.close ?? null;
  // SPY price at-or-after a timestamp, forward-filled to the latest/live price
  // for "today" points (the current day has no daily bar yet). Used to grow
  // each holding's cost basis by SPY from its own purchase date.
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

    // Total value over time = original capital + cumulative per-holding gains.
    // Each holding contributes (value − its own cost basis) while held; a closed
    // holding freezes at its realized gain from the sale date to the window end.
    // Built this way the line stays continuous across a sell→rebuy (the principal
    // just moves between holdings) and its final point equals currentValue
    // exactly — including realized profit that the open-positions-only sum
    // previously dropped, which made the graph end below the headline value.
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
      value: originalInvested + p.value,
    }));

    // Alpha vs SPY since this investor's inception, on the same return basis
    // the cards show (total gain vs original cash contributed).
    const investorReturnPct = changePercent;
    const spyReturn = spyReturnSince(investorStartTs);
    const alphaSpy = spyReturn != null ? investorReturnPct - spyReturn : null;
    // Benchmark: the investor's original external capital invested in SPY at
    // inception. Reinvesting (sell A → buy B) is internal, so it never resets or
    // inflates this line — keeping the dashed overlay consistent with the
    // "vs S&P since inception" alpha metric above (final point lands exactly
    // origInvested × (1 + spyReturn)). Original capital is assumed to enter at
    // inception, matching how investors are seeded; later holdings are funded by
    // sales, and a brand-new investor's line starts at their own inception so
    // the group S&P still jumps with the added capital.
    const spyAtInception = getStartPriceForDate(spyBars, investorStartTs);
    const benchmarkHistory =
      spyAtInception && spyAtInception > 0
        ? valueHistory.map((p) => ({
            time: p.time,
            value:
              originalInvested *
              ((spyClose(p.time) ?? spyAtInception) / spyAtInception),
          }))
        : [];

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
