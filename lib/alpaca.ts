/**
 * Alpaca market-data helpers. Replaces Finnhub (+ the unofficial Yahoo history
 * scrape) as the single source for quotes, daily history, and asset metadata.
 * Alpaca covers ETFs that Finnhub's free tier missed (TQQQ, VOO, QQQ, …).
 *
 * Auth: header keys APCA-API-KEY-ID / APCA-API-SECRET-KEY (env ALPACA_KEY_ID /
 * ALPACA_SECRET_KEY). Market data lives at data.alpaca.markets; asset metadata
 * at the trading host. Logos are NOT on the free data plan, so we use FMP's
 * hotlinkable image CDN (no key) and lean on the monogram fallback for misses.
 */

const DATA = "https://data.alpaca.markets";
const TRADING = "https://paper-api.alpaca.markets";

function alpacaHeaders(): Record<string, string> | null {
  const id = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!id || !secret) return null;
  return { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret };
}

export function alpacaConfigured(): boolean {
  return alpacaHeaders() !== null;
}

/**
 * Fallback logo source (covers ETFs Finnhub misses), keyless + hotlinkable.
 * Primary logos come from Finnhub's profile API (see lib/logos.ts); <CompanyLogo>
 * walks Finnhub → FMP → gradient monogram at render time.
 */
export function fmpLogoUrl(symbol: string): string {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(
    symbol.toUpperCase(),
  )}.png`;
}

function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Alpaca asset names are verbose ("… Common Stock", ADR boilerplate); trim to
 *  a clean display label. */
function cleanName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+American Depositary Shares.*$/i, "")
    .replace(/\s+Ordinary Shares.*$/i, "")
    .replace(/\s+Common Stock$/i, "")
    .replace(/,?\s+Inc\.?$/i, " Inc.")
    .trim();
}

export type Snapshot = {
  price: number | null; // latest trade, falling back to the daily close
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number | null; // price - prevClose (today's $ move)
  changePercent: number | null; // today's % move
};

type RawSnapshot = {
  latestTrade?: { p?: number } | null;
  dailyBar?: { o?: number; h?: number; l?: number; c?: number } | null;
  prevDailyBar?: { c?: number } | null;
};

/** Batched snapshots for many symbols in one call. Keyed by UPPERCASE symbol. */
export async function fetchSnapshots(
  symbols: string[],
): Promise<Map<string, Snapshot>> {
  const out = new Map<string, Snapshot>();
  const headers = alpacaHeaders();
  const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(
    Boolean,
  );
  if (!headers || uniq.length === 0) return out;

  const url = `${DATA}/v2/stocks/snapshots?symbols=${encodeURIComponent(
    uniq.join(","),
  )}&feed=iex`;
  try {
    const res = await fetch(url, { headers, next: { revalidate: 0 } });
    if (!res.ok) {
      console.error("[alpaca] snapshots not ok", res.status);
      return out;
    }
    const data = (await res.json()) as Record<string, RawSnapshot>;
    for (const sym of uniq) {
      const s = data[sym];
      if (!s) continue;
      const price = toNum(s.latestTrade?.p) ?? toNum(s.dailyBar?.c);
      const prevClose = toNum(s.prevDailyBar?.c);
      const change = price != null && prevClose != null ? price - prevClose : null;
      const changePercent =
        change != null && prevClose ? (change / prevClose) * 100 : null;
      out.set(sym, {
        price,
        prevClose,
        open: toNum(s.dailyBar?.o),
        high: toNum(s.dailyBar?.h),
        low: toNum(s.dailyBar?.l),
        change,
        changePercent,
      });
    }
  } catch (error) {
    console.error("[alpaca] snapshots failed", error);
  }
  return out;
}

export type Bar = { time: number; close: number }; // time = epoch seconds (ascending)

/** Batched split/dividend-adjusted daily bars. Keyed by UPPERCASE symbol. */
export async function fetchDailyBars(
  symbols: string[],
  fromSec: number,
  toSec: number,
): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>();
  const headers = alpacaHeaders();
  const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(
    Boolean,
  );
  if (!headers || uniq.length === 0) return out;

  const start = new Date(fromSec * 1000).toISOString();
  const end = new Date(toSec * 1000).toISOString();
  let pageToken: string | undefined;
  try {
    do {
      const params = new URLSearchParams({
        symbols: uniq.join(","),
        timeframe: "1Day",
        adjustment: "all",
        feed: "iex",
        start,
        end,
        limit: "10000",
        sort: "asc",
      });
      if (pageToken) params.set("page_token", pageToken);
      const res = await fetch(`${DATA}/v2/stocks/bars?${params.toString()}`, {
        headers,
        next: { revalidate: 600 },
      });
      if (!res.ok) {
        console.error("[alpaca] bars not ok", res.status);
        break;
      }
      const data = (await res.json()) as {
        bars?: Record<string, Array<{ t: string; c: number }>>;
        next_page_token?: string | null;
      };
      const bars = data.bars ?? {};
      for (const sym of Object.keys(bars)) {
        const points = (bars[sym] ?? [])
          .map((b) => ({
            time: Math.floor(new Date(b.t).getTime() / 1000),
            close: Number(b.c),
          }))
          .filter((p) => Number.isFinite(p.close) && Number.isFinite(p.time));
        out.set(sym, (out.get(sym) ?? []).concat(points));
      }
      pageToken = data.next_page_token ?? undefined;
    } while (pageToken);
  } catch (error) {
    console.error("[alpaca] bars failed", error);
  }
  return out;
}

/** Single-symbol convenience wrapper around fetchDailyBars. */
export async function fetchDailyBarsOne(
  symbol: string,
  fromSec: number,
  toSec: number,
): Promise<Bar[]> {
  const map = await fetchDailyBars([symbol], fromSec, toSec);
  return map.get(symbol.toUpperCase()) ?? [];
}

export type AssetInfo = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  tradable: boolean;
};

type RawAsset = {
  symbol?: string;
  name?: string;
  exchange?: string;
  class?: string;
  tradable?: boolean;
  status?: string;
};

/** Asset metadata (name/exchange/tradable). Used for quote labels + validation. */
export async function fetchAsset(symbol: string): Promise<AssetInfo | null> {
  const headers = alpacaHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(
      `${TRADING}/v2/assets/${encodeURIComponent(symbol.toUpperCase())}`,
      { headers, next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const a = (await res.json()) as RawAsset;
    if (!a?.symbol) return null;
    return {
      symbol: a.symbol,
      name: a.name ? cleanName(a.name) : null,
      exchange: a.exchange ?? null,
      tradable: Boolean(a.tradable),
    };
  } catch {
    return null;
  }
}

export type SearchableAsset = {
  symbol: string;
  name: string;
  exchange: string;
};

// The full active-equity list is large; cache it in module memory (12h).
let assetListCache: { at: number; list: SearchableAsset[] } | null = null;

export async function fetchActiveAssets(): Promise<SearchableAsset[]> {
  const headers = alpacaHeaders();
  if (!headers) return [];
  if (assetListCache && Date.now() - assetListCache.at < 12 * 3600 * 1000) {
    return assetListCache.list;
  }
  try {
    const res = await fetch(
      `${TRADING}/v2/assets?status=active&asset_class=us_equity`,
      { headers, next: { revalidate: 86400 } },
    );
    if (!res.ok) return assetListCache?.list ?? [];
    const arr = (await res.json()) as RawAsset[];
    const list = arr
      .filter((a) => a.tradable && a.symbol)
      .map((a) => ({
        symbol: a.symbol as string,
        name: a.name ? cleanName(a.name) : "",
        exchange: a.exchange ?? "",
      }));
    assetListCache = { at: Date.now(), list };
    return list;
  } catch {
    return assetListCache?.list ?? [];
  }
}
