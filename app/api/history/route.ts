import { NextRequest, NextResponse } from "next/server";
import { alpacaConfigured, fetchDailyBarsOne, fetchSnapshots } from "@/lib/alpaca";

const ONE_DAY = 24 * 60 * 60;

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

  if (!alpacaConfigured()) {
    return NextResponse.json(
      { error: "Market data API not configured." },
      { status: 500 },
    );
  }

  const normalized = symbol.toUpperCase();
  const to = Math.floor(Date.now() / 1000);
  // ~5 years of split/dividend-adjusted daily bars (paginated). The lookup page
  // slices this down to the chosen timespan; newer listings just return less.
  const from = to - 1900 * ONE_DAY;

  try {
    let history = await fetchDailyBarsOne(normalized, from, to);

    // Last-resort: synthesize a 2-point series from the snapshot so the chart
    // still renders for very new or thinly-traded symbols.
    if (history.length < 2) {
      const snap = (await fetchSnapshots([normalized])).get(normalized);
      if (snap?.price != null) {
        history = [
          { time: to - 7 * ONE_DAY, close: snap.prevClose ?? snap.price },
          { time: to, close: snap.price },
        ];
      }
    }

    if (history.length < 1) {
      return NextResponse.json(
        { error: `No history found for ${normalized}.` },
        { status: 404 },
      );
    }

    return NextResponse.json({ symbol: normalized, history });
  } catch (error) {
    console.error("History lookup failed", error);
    return NextResponse.json(
      { error: "Unable to fetch price history right now." },
      { status: 500 },
    );
  }
}
