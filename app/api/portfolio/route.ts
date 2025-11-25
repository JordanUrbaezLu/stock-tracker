import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

type InvestorSeed = {
  name: string;
  allocations: {
    symbol: string;
    amount: number;
    shares?: number;
    dateInvested?: string;
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
  [key: string]: unknown;
};

type InvestorFile = {
  investors: Array<{
    name: string;
    allocations: {
      symbol: string;
      invested: number;
      shares: number;
      dateInvested: string;
    }[];
  }>;
};

type SymbolHistoryPoint = { time: number; close: number };

type SymbolData = {
  currentPrice: number | null;
  startPrice: number | null;
  history: SymbolHistoryPoint[];
  name?: string | null;
};

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
  history: { time: number; value: number }[];
};

type InvestorValue = {
  name: string;
  slug: string;
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

async function loadInvestors(): Promise<InvestorFile | null> {
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

  const investorFile = await loadInvestors();
  const fallbackDate = new Date().toISOString();

  const grouped = new Map<
    string,
    { name: string; allocations: InvestorSeed["allocations"] }
  >();

  const sourceInvestors = investorFile?.investors;

  sourceInvestors?.forEach((investor) => {
    const existing = grouped.get(investor.name);

    const mappedAllocations = investor.allocations.map((allocation) => ({
      symbol: allocation.symbol,
      amount:
        "invested" in allocation && typeof allocation.invested === "number"
          ? allocation.invested
          : "amount" in allocation && typeof allocation.amount === "number"
            ? allocation.amount
            : 0,
      shares:
        "shares" in allocation && typeof allocation.shares === "number"
          ? allocation.shares
          : undefined,
      dateInvested:
        "dateInvested" in allocation && allocation.dateInvested
          ? allocation.dateInvested
          : fallbackDate,
    }));

    if (existing) {
      existing.allocations.push(...mappedAllocations);
    } else {
      grouped.set(investor.name, {
        name: investor.name,
        allocations: mappedAllocations,
      });
    }
  });

  const investorsSeed: InvestorSeed[] = Array.from(grouped.values());

  const earliestStartMs = Math.min(
    ...investorsSeed.flatMap((investor) =>
      investor.allocations.map((allocation) =>
        new Date(allocation?.dateInvested || fallbackDate).getTime(),
      ),
    ),
  );
  const from = Math.floor(earliestStartMs / 1000);
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
    Promise.all(symbols.map((symbol) => fetchCandle(symbol, from, to, apiKey))),
    Promise.all(symbols.map((symbol) => fetchProfile(symbol, apiKey))),
  ]);

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
      ({ symbol, amount, shares: sharesFromFile, dateInvested }) => {
        const upperSymbol = symbol.toUpperCase();
        const data = symbolData.get(upperSymbol);

        if (!data) {
          return {
            symbol: upperSymbol,
            name: upperSymbol,
            amountInvested: amount,
            startPrice: null,
            currentPrice: null,
            shares: null,
            currentValue: null,
            change: null,
            changePercent: null,
            history: [],
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

        if (!shares || shares <= 0) {
          return {
            symbol: upperSymbol,
            name: data.name ?? upperSymbol,
            amountInvested: amount,
            startPrice: startPrice ?? null,
            currentPrice: data.currentPrice,
            shares: null,
            currentValue: null,
            change: null,
            changePercent: null,
            dateInvested,
            history: [],
          };
        }

        const currentPrice = data.currentPrice ?? startPrice ?? null;
        const currentValue = shares * (currentPrice || 1);
        const change = currentValue - amount;
        const changePercent = (change / amount) * 100;

        const historyValues = data.history.map((point) => ({
          time: point.time,
          value: point.close * shares,
        }));

        return {
          symbol: upperSymbol,
          name: data.name ?? upperSymbol,
          amountInvested: amount,
          startPrice,
          currentPrice,
          shares,
          currentValue,
          change,
          changePercent,
          dateInvested,
          history: historyValues,
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

    const timeline = new Map<number, number>();
    holdings.forEach((holding) => {
      holding.history.forEach((point) => {
        const next = (timeline.get(point.time) ?? 0) + point.value;
        timeline.set(point.time, next);
      });
    });

    const valueHistory = Array.from(timeline.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time, value }));

    return {
      name: investor.name,
      slug: slugify(investor.name),
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
