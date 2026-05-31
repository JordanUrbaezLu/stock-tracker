/**
 * Logos: Finnhub's profile2 logo URL is the preferred source (best-looking),
 * but its filenames don't always match the ticker (e.g. GOOGL → GOOG.png), so
 * we read the authoritative `logo` field from the profile API rather than
 * guessing the CDN path. Finnhub is kept ONLY for logos here; all price/history
 * data comes from Alpaca. ETFs (no Finnhub logo) and any misses fall back to
 * FMP's CDN, then a gradient monogram (handled in <CompanyLogo>).
 */
const PROFILE_URL = "https://finnhub.io/api/v1/stock/profile2";

export async function fetchFinnhubLogos(
  symbols: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const key = process.env.FINNHUB_API_KEY;
  const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(
    Boolean,
  );
  if (!key || uniq.length === 0) return out;

  await Promise.all(
    uniq.map(async (sym) => {
      try {
        const res = await fetch(
          `${PROFILE_URL}?symbol=${encodeURIComponent(sym)}&token=${key}`,
          { next: { revalidate: 86400 } },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { logo?: string };
        if (typeof data?.logo === "string" && data.logo) {
          out.set(sym, data.logo);
        }
      } catch {
        // ignore — falls back to FMP/monogram
      }
    }),
  );
  return out;
}

export async function fetchFinnhubLogo(symbol: string): Promise<string | null> {
  const map = await fetchFinnhubLogos([symbol]);
  return map.get(symbol.toUpperCase()) ?? null;
}
