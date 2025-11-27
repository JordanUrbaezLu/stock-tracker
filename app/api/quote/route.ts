import { NextRequest, NextResponse } from "next/server";

type FinnhubQuote = {
  c: number | null; // current price
  d: number | null; // change
  dp: number | null; // change percent
  h: number | null; // high
  l: number | null; // low
  o: number | null; // open
  pc: number | null; // previous close
  t: number | null; // timestamp (unix)
  [key: string]: unknown;
};

type FinnhubProfile = {
  name?: string;
  exchange?: string;
  exchangeShortName?: string;
  currency?: string;
  finnhubIndustry?: string;
  [key: string]: unknown;
} | null;

const QUOTE_URL = "https://finnhub.io/api/v1/quote";
const PROFILE_URL = "https://finnhub.io/api/v1/stock/profile2";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json(
      { error: "Missing required query param: symbol" },
      { status: 400 },
    );
  }

  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Finnhub API key not configured." },
      { status: 500 },
    );
  }

  const quoteUrl = `${QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const profileUrl = `${PROFILE_URL}?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  console.log("[quote] GET", { symbol });

  try {
    const [quoteResponse, profileResponse] = await Promise.all([
      fetch(quoteUrl, { next: { revalidate: 0 } }),
      fetch(profileUrl, { next: { revalidate: 300 } }),
    ]);

    if (!quoteResponse.ok) {
      return NextResponse.json(
        { error: "Quote provider returned an error." },
        { status: 502 },
      );
    }

    const body = (await quoteResponse.json()) as FinnhubQuote;
    let profile: FinnhubProfile = null;

    if (profileResponse.ok) {
      try {
        profile = (await profileResponse.json()) as FinnhubProfile;
        console.log("[quote] profile", {
          symbol: symbol.toUpperCase(),
          name: profile?.name ?? null,
        });
      } catch (error) {
        console.error("Failed to parse profile response", error);
      }
    }

    // Finnhub returns { c: current, d: change, dp: changePercent, h: high, l: low, o: open, pc: prevClose, t: timestamp }
    const looksEmpty =
      (body.c === 0 || body.c == null) &&
      body.pc === 0 &&
      (body.t === 0 || body.t == null);

    if (body.c == null || looksEmpty) {
      return NextResponse.json(
        {
          error: `No quote data found for symbol ${symbol.toUpperCase()}.`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      name: profile?.name ?? null,
      exchange: profile?.exchange ?? profile?.exchangeShortName ?? null,
      currency: profile?.currency ?? null,
      industry: profile?.finnhubIndustry ?? null,
      price: Number(body.c),
      change: Number(body.d ?? 0),
      changePercent:
        typeof body.dp === "number" ? `${body.dp.toFixed(2)}%` : "0%",
      high: body.h ?? null,
      low: body.l ?? null,
      open: body.o ?? null,
      previousClose: body.pc ?? null,
      timestamp: body.t ?? null,
      rawQuote: body,
      rawProfile: profile,
    });
  } catch (error) {
    console.error("Quote lookup failed", error);
    return NextResponse.json(
      { error: "Unable to fetch quote right now." },
      { status: 500 },
    );
  }
}
