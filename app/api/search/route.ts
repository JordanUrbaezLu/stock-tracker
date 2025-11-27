import { NextRequest, NextResponse } from "next/server";

const SEARCH_URL = "https://finnhub.io/api/v1/search";

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

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Finnhub API key not configured." },
      { status: 500 },
    );
  }

  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&token=${apiKey}`;

  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Ticker search failed." },
        { status: 502 },
      );
    }

    const data = await res.json();
    type FinnhubSearchItem = {
      symbol?: string;
      description?: string;
      type?: string | null;
    };

    const results: { symbol: string; description: string; type: string | null }[] = [];

    const allowedTypes = new Set(["Common Stock", "EQS", "ETF"]);

    if (Array.isArray(data.result) && data.result.length) {
      const seen = new Set<string>();
      for (const item of data.result as FinnhubSearchItem[]) {
        if (
          !item.symbol ||
          !item.description ||
          String(item.symbol).includes(".") ||
          String(item.symbol).includes(":") ||
          String(item.symbol).includes("/") ||
          (item.type && !allowedTypes.has(item.type))
        ) {
          continue;
        }
        const sym = String(item.symbol).toUpperCase();
        if (seen.has(sym)) continue;
        seen.add(sym);
        results.push({
          symbol: sym,
          description: item.description as string,
          type: item.type ?? null,
        });
        if (results.length >= 8) break;
      }
    }

    console.log("[search] results", { count: results.length, sample: results.slice(0, 3) });
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Ticker search failed", error);
    return NextResponse.json(
      { error: "Unable to search tickers right now." },
      { status: 500 },
    );
  }
}
