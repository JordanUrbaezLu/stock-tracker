import { NextRequest, NextResponse } from "next/server";

type CandleResponse = {
  c?: number[];
  t?: number[];
  s?: string;
};

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        adjclose?: Array<{ adjclose?: number[] }>;
        quote?: Array<{ close?: number[] }>;
      };
    }>;
    error?: unknown;
  };
};

const CANDLE_URL = "https://finnhub.io/api/v1/stock/candle";
const QUOTE_URL = "https://finnhub.io/api/v1/quote";
const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const ONE_DAY = 24 * 60 * 60;

async function fetchHistoryRange(
  symbol: string,
  from: number,
  to: number,
  apiKey: string,
  resolution: "D" | "W" = "D",
) {
  const url = `${CANDLE_URL}?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${apiKey}`;
  try {
    const response = await fetch(url, { next: { revalidate: 600 } });
    if (!response.ok) {
      console.warn("History provider not ok", { symbol, status: response.status });
      return { points: null, status: response.status };
    }
    const data = (await response.json()) as CandleResponse;
    if (data.s !== "ok" || !data.c?.length || !data.t?.length) {
      return { points: null, status: response.status };
    }
    console.log("[history] fetched candles", {
      symbol,
      resolution,
      points: data.t.length,
      status: response.status,
    });
    return {
      points: data.t.map((time, index) => ({
        time,
        close: data.c?.[index] ?? 0,
      })),
      status: response.status,
    };
  } catch (error) {
    console.error("History fetch failed", { symbol, error });
    return { points: null, status: 500 };
  }
}

async function fetchQuote(symbol: string, apiKey: string) {
  const url = `${QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const response = await fetch(url, { next: { revalidate: 0 } });
  if (!response.ok) return null;
  try {
    const json = await response.json();
    return {
      current: typeof json?.c === "number" ? json.c : null,
      prevClose: typeof json?.pc === "number" ? json.pc : null,
    };
  } catch {
    return null;
  }
}

async function fetchYahooHistory(symbol: string) {
  const url = `${YAHOO_URL}/${encodeURIComponent(symbol)}?interval=1mo&range=1y`;
  try {
    const response = await fetch(url, { next: { revalidate: 1800 } });
    if (!response.ok) {
      console.warn("Yahoo history not ok", { symbol, status: response.status });
      return null;
    }
    const data = (await response.json()) as YahooChart;
    const result = data?.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const adj = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
    const close = result?.indicators?.quote?.[0]?.close ?? [];

    const prices = adj.length ? adj : close;
    const points =
      Array.isArray(timestamps) && Array.isArray(prices)
        ? timestamps
            .map((t, idx) => {
              const price = prices[idx];
              if (typeof t !== "number" || price == null || Number.isNaN(price)) {
                return null;
              }
              return { time: t, close: Number(price) };
            })
            .filter(Boolean) as { time: number; close: number }[]
        : [];
    console.log("[history] fetched Yahoo", {
      symbol,
      points: points.length,
    });
    if (points.length < 2) return null;
    return points;
  } catch (error) {
    console.error("Yahoo history fetch failed", { symbol, error });
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  console.log("[history] GET", { symbol });

  if (!symbol) {
    return NextResponse.json(
      { error: "Missing required query param: symbol" },
      { status: 400 },
    );
  }

  const normalized = symbol.toUpperCase();
  const to = Math.floor(Date.now() / 1000);
  const ranges = [450, 400, 365, 240, 120, 60]; // progressive fallbacks

  try {
    // Prefer Yahoo (no API key required)
    let history = await fetchYahooHistory(normalized);

    // If Yahoo failed, try Finnhub if configured
    let lastStatus: number | undefined;
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!history && apiKey) {
      for (const days of ranges) {
        const from = to - days * ONE_DAY;
        const result = await fetchHistoryRange(normalized, from, to, apiKey, "D");
        lastStatus = result?.status ?? lastStatus;
        if (result?.points && result.points.length > 1) {
          history = result.points;
          break;
        }
      }
    }

    // Last-resort fallback: synthesize a 2-point series from quote data.
    if (!history && apiKey) {
      const quote = await fetchQuote(normalized, apiKey);
      console.log("[history] fallback to quote", {
        symbol: normalized,
        current: quote?.current,
        prevClose: quote?.prevClose,
      });
      if (quote?.current != null) {
        history = [
          { time: to - 7 * ONE_DAY, close: quote.prevClose ?? quote.current },
          { time: to, close: quote.current },
        ];
      }
    }

    if (!history) {
      const status =
        lastStatus === 403 || lastStatus === 429 ? 429 : lastStatus ?? 404;
      const message =
        status === 429
          ? "History temporarily unavailable (provider rate limit). Please try again shortly."
          : `No history found for ${normalized}.`;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({
      symbol: normalized,
      history,
    });
  } catch (error) {
    console.error("History lookup failed", error);
    return NextResponse.json(
      { error: "Unable to fetch price history right now." },
      { status: 500 },
    );
  }
}
