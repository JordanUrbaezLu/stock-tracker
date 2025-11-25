"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Quote = {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  currency?: string | null;
  industry?: string | null;
  price: number;
  change: number;
  changePercent: string;
  high?: number | null;
  low?: number | null;
  open?: number | null;
  previousClose?: number | null;
  timestamp?: number | null;
  rawQuote?: unknown;
  rawProfile?: unknown;
};

type SearchResult = { symbol: string; description: string; type: string | null };

export default function LookupPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const sanitizeSymbol = (raw: string) =>
    raw
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9.\-]/g, "");

  const handleSubmit = async (
    event?: FormEvent<HTMLFormElement>,
    overrideSymbol?: string,
  ) => {
    event?.preventDefault();
    const symbol = sanitizeSymbol(overrideSymbol ?? ticker);

    if (!symbol) {
      setError("Enter a ticker symbol to look up.");
      setQuote(null);
      return;
    }

    setLoading(true);
    setError(null);
    setQuote(null);

    try {
      const response = await fetch(`/api/quote?symbol=${symbol}`);
      const data = await response.json();

      if (!response.ok) {
        const fallbackMessage = "Could not fetch quote.";
        const notFoundMessage = `No data found for ${symbol}. Check the ticker and try again.`;
        const message =
          response.status === 404
            ? notFoundMessage
            : typeof data.error === "string"
              ? data.error
              : fallbackMessage;
        throw new Error(message);
      }

      setQuote(data as Quote);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const changeColor =
    quote && quote.change !== 0
      ? quote.change > 0
        ? "text-emerald-400"
        : "text-rose-400"
      : "text-slate-200";

  useEffect(() => {
    const term = ticker.trim();
    if (!term) {
      setResults([]);
      return;
    }

    const handler = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { results?: SearchResult[]; error?: string };
        if (res.ok && Array.isArray(data.results)) {
          setResults(data.results);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [ticker]);

  const topSuggestion = useMemo(() => results[0]?.symbol ?? "", [results]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-black text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-5 py-12 sm:px-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            Ticker lookup
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Check a stock&apos;s latest price
          </h1>
          <p className="text-sm text-slate-400">
            Enter a symbol like AAPL, MSFT, or TSLA to fetch the current quote.
          </p>
        </header>

        <section className="rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-6 shadow-lg shadow-cyan-500/20">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <label className="sr-only" htmlFor="ticker">
              Ticker symbol
            </label>
            <input
              id="ticker"
              name="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="AAPL"
              className="h-12 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 text-lg uppercase tracking-wide text-slate-100 outline-none ring-2 ring-transparent transition focus:border-cyan-500 focus:ring-cyan-900"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-12 rounded-xl bg-cyan-500 px-6 text-base font-semibold text-cyan-950 transition hover:bg-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-700/60 cursor-pointer"
            >
              {loading ? "Fetching..." : "Get price"}
            </button>
          </form>

          <div className="mt-3 space-y-2 text-sm text-slate-400">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                Suggestions
              </p>
              {searching && <p className="text-xs text-slate-500">Searching...</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {results.slice(0, 6).map((res) => (
                <button
                  key={res.symbol}
                  type="button"
                  onClick={() => {
                    const symbol = sanitizeSymbol(res.symbol);
                    setTicker(symbol);
                    void handleSubmit(undefined, symbol);
                  }}
                  className="cursor-pointer rounded-full border border-cyan-500/30 bg-slate-900 px-3 py-1 text-xs text-cyan-100 transition hover:border-cyan-300"
                >
                  {res.symbol} · {res.description}
                </button>
              ))}
              {!results.length && <p className="text-xs text-slate-500">No suggestions yet.</p>}
            </div>
            {topSuggestion && (
              <p className="text-xs text-slate-500">
                Tip: press enter to fetch {topSuggestion}
              </p>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
            {!quote && !error && !loading && (
              <p className="text-slate-400">
                Search for a ticker to see the latest price.
              </p>
            )}

            {loading && (
              <p className="animate-pulse text-slate-300">
                Contacting the market...
              </p>
            )}

            {error && (
              <p className="text-rose-300" role="alert">
                {error}
              </p>
            )}

            {quote && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm uppercase tracking-[0.35em] text-slate-400">
                      {quote.symbol}
                    </p>
                    {quote.name && (
                      <p className="text-sm text-slate-300">{quote.name}</p>
                    )}
                    <p className="text-3xl font-semibold">
                      ${quote.price.toFixed(2)}
                    </p>
                  </div>
                  <div className={`text-right text-lg font-semibold ${changeColor}`}>
                    <p>
                      {quote.change > 0 ? "▲" : quote.change < 0 ? "▼" : "•"}{" "}
                      {quote.change.toFixed(2)}
                    </p>
                    <p className="text-sm text-slate-400">
                      {quote.changePercent}
                    </p>
                    <p className="text-xs font-normal text-slate-500">
                      Change vs previous close (daily)
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm text-slate-400 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Open
                    </p>
                    <p>{quote.open ? `$${quote.open.toFixed(2)}` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      High
                    </p>
                    <p>{quote.high ? `$${quote.high.toFixed(2)}` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Low
                    </p>
                    <p>{quote.low ? `$${quote.low.toFixed(2)}` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Prev close
                    </p>
                    <p>
                      {quote.previousClose
                        ? `$${quote.previousClose.toFixed(2)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Currency
                    </p>
                    <p>{quote.currency ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Exchange
                    </p>
                    <p>{quote.exchange ?? "—"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
