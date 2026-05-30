import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import clientPromise from "@/lib/mongodb";

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

type CandleResponse = {
  c?: number[];
  t?: number[];
  s?: string;
};

type FinnhubQuote = {
  c: number | null;
  d: number | null;
  dp: number | null;
  h: number | null;
  l: number | null;
  o: number | null;
  pc: number | null;
  t: number | null;
  [key: string]: unknown;
};

type FinnhubProfile = {
  name?: string | null;
  ticker?: string | null;
  logo?: string | null;
  [key: string]: unknown;
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
  holdings: HoldingValue[];
  valueHistory: { time: number; value: number }[];
};

const QUOTE_URL = "https://finnhub.io/api/v1/quote";
const CANDLE_URL = "https://finnhub.io/api/v1/stock/candle";
const PROFILE_URL = "https://finnhub.io/api/v1/stock/profile2";

async function fetchQuote(
  symbol: string,
  apiKey: string,
): Promise<FinnhubQuote | null> {
  const url = `${QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) return null;
    return (await response.json()) as FinnhubQuote;
  } catch (error) {
    console.error("Quote fetch failed", { symbol, error });
    return null;
  }
}

async function fetchCandle(
  symbol: string,
  from: number,
  to: number,
  apiKey: string,
): Promise<SymbolHistoryPoint[]> {
  const url = `${CANDLE_URL}?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${apiKey}`;
  try {
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) return [];
    const data = (await response.json()) as CandleResponse;
    if (data.s !== "ok" || !data.c || !data.t) return [];
    return data.t.map((time, index) => ({
      time,
      close: data.c?.[index] ?? 0,
    }));
  } catch (error) {
    console.error("Candle fetch failed", { symbol, error });
    return [];
  }
}

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }> | null;
    error?: unknown;
  };
};

/**
 * Yahoo Finance exposes free, keyless daily history. Returns ascending daily
 * closes within [from, to] (epoch seconds), dropping non-trading null gaps.
 */
async function fetchYahooHistory(
  symbol: string,
  from: number,
  to: number,
): Promise<SymbolHistoryPoint[]> {
  const url = `${YAHOO_CHART_URL}${encodeURIComponent(
    symbol,
  )}?period1=${from}&period2=${to}&interval=1d`;
  try {
    const response = await fetch(url, {
      next: { revalidate: 1800 },
      headers: { "User-Agent": "Mozilla/5.0 (stock-tracker)" },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as YahooChartResponse;
    const result = data.chart?.result?.[0];
    const timestamps = result?.timestamp;
    const closes = result?.indicators?.quote?.[0]?.close;
    if (!timestamps?.length || !closes?.length) return [];
    const points: SymbolHistoryPoint[] = [];
    timestamps.forEach((time, i) => {
      const close = closes[i];
      if (typeof close === "number" && Number.isFinite(close)) {
        points.push({ time, close });
      }
    });
    return points;
  } catch (error) {
    console.error("Yahoo history fetch failed", { symbol, error });
    return [];
  }
}

/**
 * Daily history with graceful fallback: Yahoo first (free/keyless), then
 * Finnhub candles (premium-gated on many keys, hence the fallback order).
 */
async function fetchHistory(
  symbol: string,
  from: number,
  to: number,
  apiKey: string,
): Promise<SymbolHistoryPoint[]> {
  const yahoo = await fetchYahooHistory(symbol, from, to);
  if (yahoo.length) return yahoo;
  return fetchCandle(symbol, from, to, apiKey);
}

async function fetchProfile(
  symbol: string,
  apiKey: string,
): Promise<FinnhubProfile | null> {
  const url = `${PROFILE_URL}?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  try {
    const response = await fetch(url, { next: { revalidate: 600 } });
    if (!response.ok) return null;
    const data = (await response.json()) as FinnhubProfile;
    if (!data || (!data.name && !data.ticker)) return null;
    return data;
  } catch (error) {
    console.error("Profile fetch failed", { symbol, error });
    return null;
  }
}

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

export async function GET() {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Finnhub API key not configured." },
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
  // Background card graph reflects roughly the last month of progress; pull a
  // little extra (35d) so weekends/holidays still leave ~22 trading points.
  const monthAgoSec = Math.floor((Date.now() - 35 * 86_400_000) / 1000);
  const from = Math.max(Math.floor(earliestStartMs / 1000), monthAgoSec);
  const to = Math.floor(Date.now() / 1000);

  const symbols = Array.from(
    new Set(
      investorsSeed.flatMap((investor) =>
        investor.allocations.map((allocation) => allocation.symbol.toUpperCase()),
      ),
    ),
  );

  const [quotes, histories, profiles] = await Promise.all([
    Promise.all(symbols.map((symbol) => fetchQuote(symbol, apiKey))),
    Promise.all(symbols.map((symbol) => fetchHistory(symbol, from, to, apiKey))),
    Promise.all(symbols.map((symbol) => fetchProfile(symbol, apiKey))),
  ]);
  console.log("[portfolio] finnhub responses", {
    symbols,
    quotes: quotes.map((q, i) => ({ symbol: symbols[i], price: q?.c ?? null })),
    historyLengths: histories.map((h, i) => ({
      symbol: symbols[i],
      points: h?.length ?? 0,
    })),
    profiles: profiles.map((p, i) => ({
      symbol: symbols[i],
      name: p?.name ?? null,
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

  symbols.forEach((symbol, index) => {
    const history = histories[index] ?? [];
    const quote = quotes[index];
    const profile = profiles[index];
    const baselinePrice = priceFromFile.get(symbol) ?? null;

    const startPrice =
      getStartPriceForDate(history, from) ?? baselinePrice ?? null;
    const currentPrice =
      (quote?.c && quote.c > 0 ? quote.c : null) ??
      history.at(-1)?.close ??
      baselinePrice ??
      null;

    symbolData.set(symbol, {
      currentPrice,
      startPrice,
      history,
      name: profile?.name ?? null,
      logo: typeof profile?.logo === "string" ? profile.logo : null,
    });
  });

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

    const currentValue = holdings.reduce(
      (sum, holding) => sum + (holding.currentValue ?? holding.amountInvested),
      0,
    );
    const change = currentValue - totalInvested;
    const changePercent = totalInvested
      ? (change / totalInvested) * 100
      : 0;

    // Forward-filled aggregate. At each timestamp we sum every holding's
    // last-known value (0 before it was bought / after it was sold), instead
    // of only the holdings that happen to have a point at that exact instant.
    // Without this, an off-grid point — e.g. a sale recorded at its precise
    // sale timestamp — is the only holding present at that timestamp, so the
    // summed total craters to that single value and the line shows a fake dip.
    const series = holdings
      .map((holding) => [...holding.history].sort((a, b) => a.time - b.time))
      .filter((points) => points.length > 0);
    const allTimes = Array.from(
      new Set(series.flatMap((points) => points.map((p) => p.time))),
    ).sort((a, b) => a - b);

    const valueHistory = allTimes.map((time) => {
      let value = 0;
      for (const points of series) {
        // Only counts while the holding was actually held.
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
      holdings,
      valueHistory,
    };
  });

  return NextResponse.json({
    asOf: Date.now(),
    investors,
    symbols,
  });
}
