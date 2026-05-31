import { NextRequest, NextResponse } from "next/server";
import {
  alpacaConfigured,
  fetchAsset,
  fetchSnapshots,
  fmpLogoUrl,
} from "@/lib/alpaca";
import { fetchFinnhubLogo } from "@/lib/logos";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

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

  const upper = symbol.toUpperCase();
  console.log("[quote] GET", { symbol: upper });

  try {
    const [snapshots, asset, finnhubLogo] = await Promise.all([
      fetchSnapshots([upper]),
      fetchAsset(upper),
      fetchFinnhubLogo(upper),
    ]);
    const snap = snapshots.get(upper);

    if (!snap || snap.price == null) {
      return NextResponse.json(
        { error: `No quote data found for symbol ${upper}.` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      symbol: upper,
      name: asset?.name ?? null,
      exchange: asset?.exchange ?? null,
      currency: "USD",
      industry: null, // Alpaca does not expose sector/industry
      logo: finnhubLogo ?? fmpLogoUrl(upper),
      price: snap.price,
      change: snap.change ?? 0,
      changePercent:
        snap.changePercent != null ? `${snap.changePercent.toFixed(2)}%` : "0%",
      high: snap.high,
      low: snap.low,
      open: snap.open,
      previousClose: snap.prevClose,
      timestamp: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    console.error("Quote lookup failed", error);
    return NextResponse.json(
      { error: "Unable to fetch quote right now." },
      { status: 500 },
    );
  }
}
