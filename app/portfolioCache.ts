// Client-side session cache for /api/portfolio. The data is fetched once per
// app load and reused across client route changes (so navigating between Home,
// Stocks and an investor page is instant and doesn't refetch). A full page
// refresh resets this module → fresh "live" data. Admin mutations pass
// force=true (or call bustPortfolio) to refetch.

let cached: unknown = null;
let inflight: Promise<unknown> | null = null;

/** Fetch the portfolio, served from the session cache unless force=true. */
export async function fetchPortfolio<T = unknown>(force = false): Promise<T> {
  if (!force && cached) return cached as T;
  if (!force && inflight) return inflight as Promise<T>;

  const p = (async () => {
    const res = await fetch("/api/portfolio", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(
        (json && typeof json.error === "string" && json.error) ||
          "Could not load data.",
      );
    }
    cached = json;
    return json;
  })();

  inflight = p;
  try {
    return (await p) as T;
  } finally {
    inflight = null;
  }
}

/** Synchronous read of the cached payload (null until first load resolves). */
export function getCachedPortfolio<T = unknown>(): T | null {
  return (cached as T) ?? null;
}

/** Drop the cache so the next fetch hits the network (after a mutation). */
export function bustPortfolio() {
  cached = null;
  inflight = null;
}
