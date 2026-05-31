import { NextRequest, NextResponse } from "next/server";
import { alpacaConfigured, fetchActiveAssets } from "@/lib/alpaca";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  console.log("[search] GET", { q: query });

  if (!query) {
    return NextResponse.json(
      { error: "Missing required query param: q" },
      { status: 400 },
    );
  }

  if (!alpacaConfigured()) {
    return NextResponse.json(
      { error: "Market data API not configured." },
      { status: 500 },
    );
  }

  try {
    const assets = await fetchActiveAssets();
    const q = query.trim().toUpperCase();

    // Rank: exact symbol > symbol prefix > symbol contains > name contains.
    const score = (a: { symbol: string; name: string }) => {
      const sym = a.symbol.toUpperCase();
      const name = a.name.toUpperCase();
      if (sym === q) return 0;
      if (sym.startsWith(q)) return 1;
      if (sym.includes(q)) return 2;
      if (name.includes(q)) return 3;
      return 99;
    };

    const results = assets
      .filter(
        (a) =>
          a.symbol &&
          !a.symbol.includes(".") &&
          !a.symbol.includes(":") &&
          !a.symbol.includes("/") &&
          score(a) < 99,
      )
      .sort((a, b) => score(a) - score(b) || a.symbol.localeCompare(b.symbol))
      .slice(0, 8)
      .map((a) => ({
        symbol: a.symbol.toUpperCase(),
        description: a.name || a.symbol.toUpperCase(),
        type: null as string | null,
      }));

    console.log("[search] results", {
      count: results.length,
      sample: results.slice(0, 3),
    });
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Ticker search failed", error);
    return NextResponse.json(
      { error: "Unable to search tickers right now." },
      { status: 500 },
    );
  }
}
