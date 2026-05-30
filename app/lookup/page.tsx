"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CompanyLogo } from "../CompanyLogo";

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
type HistoryPoint = { time: number; close: number };

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function HistoryChart({ history }: { history: HistoryPoint[] }) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    price: number;
    time: number;
  } | null>(null);
  useEffect(() => {
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const monthCompressed = useMemo(() => {
    const sorted = [...history].sort((a, b) => a.time - b.time);
    const out: HistoryPoint[] = [];
    sorted.forEach((point) => {
      const d = new Date(point.time * 1000);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      const last = out[out.length - 1];
      const lastKey =
        last &&
        (() => {
          const ld = new Date(last.time * 1000);
          return `${ld.getUTCFullYear()}-${ld.getUTCMonth()}`;
        })();
      if (last && lastKey === key) {
        out[out.length - 1] = point;
      } else {
        out.push(point);
      }
    });
    return out;
  }, [history]);

  if (!history.length) {
    return <p className="text-sm text-slate-400">No history to show.</p>;
  }

  const windowPoints = isMobile ? 180 : 365; // 6mo on small screens, 12mo otherwise
  let trimmed = monthCompressed.slice(-windowPoints);
  if (isMobile && trimmed.length <= 24) {
    const keep = Math.min(trimmed.length, 6);
    trimmed = trimmed.slice(-keep);
  }
  if (trimmed.length < 2) {
    return <p className="text-sm text-slate-400">Not enough history to chart.</p>;
  }

  const targetPoints = isMobile ? 40 : 60;
  const step = Math.max(1, Math.floor(trimmed.length / targetPoints));
  const sampled = trimmed.filter((_, idx) => idx % step === 0);

  const width = 540;
  const height = isMobile ? 240 : 200;
  const min = Math.min(...sampled.map((p) => p.close));
  const max = Math.max(...sampled.map((p) => p.close));
  const range = max - min || 1;

  const plotted = sampled.map((point, index) => {
    const x =
      sampled.length === 1 ? width : (index / (sampled.length - 1)) * width;
    const y = height - ((point.close - min) / range) * height;
    return { ...point, x, y };
  });

  const path = plotted
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  const first = sampled[0]?.close ?? 0;
  const last = sampled.at(-1)?.close ?? first;
  const change = last - first;
  const changePct = first ? (change / first) * 100 : 0;
  const changeColor =
    change === 0 ? "text-slate-200" : change > 0 ? "text-emerald-400" : "text-rose-400";

  const startLabel = sampled[0]?.time
    ? new Date(sampled[0].time * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const gradientId = `historyGradient-${sampled[0]?.time ?? "g"}`;
  const yTicks = [max, min + range * 0.5, min];
  const changeLabel = isMobile ? "6-month change" : "1-year change";

  return (
    <div className="space-y-3">
        <div className="flex items-end justify-between text-sm text-slate-300">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {changeLabel}
            </p>
            <p
              className={`${changeColor} font-semibold ${
                isMobile ? "text-base" : "text-lg"
              }`}
            >
              {change > 0 ? "▲" : change < 0 ? "▼" : "•"} ${Math.abs(change).toFixed(2)} (
              {formatPercent(changePct)})
            </p>
        </div>
        <p className="text-xs text-slate-500">
          Starting {startLabel || "—"}
        </p>
      </div>
      <div className="relative z-30 overflow-visible rounded-2xl border border-white/8 bg-slate-950/50 p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          className="h-64 w-full text-cyan-300"
          aria-label="1 year price trend"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={0} y1={height} x2={width} y2={height} stroke="#1e293b" strokeWidth="1" />
          <line x1={0} y1={0} x2={0} y2={height} stroke="#1e293b" strokeWidth="1" />
          {yTicks.map((tick) => {
            const y = height - ((tick - min) / range) * height;
            return (
              <g key={tick}>
                <line
                  x1={0}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="0.5"
                  strokeDasharray="4 4"
                />
                <text
                  x={6}
                  y={y - 2}
                  fill="#e2e8f0"
                  fontSize={isMobile ? "25" : "14"}
                  fontWeight="800"
                  textAnchor="start"
                >
                  ${tick.toFixed(2)}
                </text>
              </g>
            );
          })}
          <path
            d={`${path} L${width},${height} L0,${height} Z`}
            fill={`url(#${gradientId})`}
            stroke="none"
          />
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" />
          {plotted.map((point, index) => (
            <circle
              key={`${point.time}-${index}`}
              cx={point.x}
              cy={point.y}
              r={6}
              fill="currentColor"
              className="opacity-80 cursor-pointer"
              onMouseEnter={() =>
                setHover({
                  x: point.x,
                  y: point.y,
                  price: point.close,
                  time: point.time,
                })
              }
              onMouseLeave={() => setHover(null)}
              onClick={() =>
                setHover({
                  x: point.x,
                  y: point.y,
                  price: point.close,
                  time: point.time,
                })
              }
              onTouchStart={() =>
                setHover({
                  x: point.x,
                  y: point.y,
                  price: point.close,
                  time: point.time,
                })
              }
            />
          ))}
          {plotted.map((point, index) => (
            <circle
              key={`hit-${point.time}-${index}`}
              cx={point.x}
              cy={point.y}
              r={16}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() =>
                setHover({
                  x: point.x,
                  y: point.y,
                  price: point.close,
                  time: point.time,
                })
              }
              onMouseLeave={() => setHover(null)}
              onClick={() =>
                setHover({
                  x: point.x,
                  y: point.y,
                  price: point.close,
                  time: point.time,
                })
              }
              onTouchStart={() =>
                setHover({
                  x: point.x,
                  y: point.y,
                  price: point.close,
                  time: point.time,
                })
              }
            />
          ))}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-20 rounded-lg border border-cyan-400/40 bg-slate-900/95 px-3 py-2 text-sm text-slate-100 shadow-lg backdrop-blur"
            style={{
              left: "50%",
              top: 10,
              transform: "translateX(-50%)",
            }}
          >
            <div className="font-semibold">
              {new Date(hover.time * 1000).toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              })}
            </div>
            <div className="text-cyan-200">${hover.price.toFixed(2)}</div>
          </div>
        )}
        <div className="mt-1 flex items-center justify-between text-xs text-slate-300 font-semibold">
          <span>
            {new Date(sampled[0].time * 1000).toLocaleDateString(undefined, {
              month: "short",
              year: "numeric",
            })}
          </span>
          <span>
            {new Date(sampled.at(-1)!.time * 1000).toLocaleDateString(undefined, {
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LookupPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

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
    setHistory(null);
    setHistoryError(null);

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

      const parsedQuote = data as Quote;
      setQuote(parsedQuote);
      void fetchHistory(symbol);
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

  const fetchHistory = async (symbol: string) => {
    setHistoryLoading(true);
    setHistoryError(null);
    setHistory(null);
    try {
      const res = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}`);
      const data = (await res.json()) as { history?: HistoryPoint[]; error?: string };
      if (!res.ok || !data.history) {
        const message =
          data.error || `No history found for ${symbol.toUpperCase()}.`;
        throw new Error(message);
      }
      // Normalize and ensure sorted
      const sorted = [...data.history].sort((a, b) => a.time - b.time);
      setHistory(sorted);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load history.";
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const trendLabel = isMobile ? "6-month trend" : "1-year trend";

  return (
    <div className="app-backdrop min-h-screen text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <header className="glass sticky top-3 z-30 rounded-2xl px-4 py-3 shadow-xl shadow-black/30 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-cyan-400 via-fuchsia-500 to-indigo-500 text-base">
                🔍
              </span>
              <div className="leading-tight">
                <p className="gradient-text text-base font-bold tracking-tight">
                  Ticker lookup
                </p>
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                  Live quotes &amp; trends
                </p>
              </div>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-semibold text-cyan-100 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:text-white"
            >
              ← Back
            </Link>
          </div>
        </header>

        <section className="glass rounded-3xl p-4 shadow-2xl shadow-black/30 sm:p-6">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-2 sm:flex-row sm:gap-3"
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
              className="h-12 flex-1 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-lg uppercase tracking-wide text-slate-100 outline-none transition focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-12 cursor-pointer rounded-xl bg-linear-to-r from-cyan-500 to-fuchsia-500 px-5 text-base font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
            >
              {loading ? "Fetching..." : "Get price"}
            </button>
          </form>

          <div className="mt-4 space-y-2 text-sm text-slate-400">
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
                  className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-cyan-100 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:text-white"
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

          <div className="mt-6 rounded-2xl border border-white/8 bg-white/2 p-5">
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
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CompanyLogo
                      symbol={quote.symbol}
                      name={quote.name}
                      size={48}
                    />
                    <div className="space-y-0.5">
                      <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">
                        {quote.symbol}
                      </p>
                      {quote.name && (
                        <p className="text-sm text-slate-300">{quote.name}</p>
                      )}
                      <p className="text-3xl font-bold tracking-tight text-white">
                        ${quote.price.toFixed(2)}
                      </p>
                    </div>
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
                      vs previous close
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-3">
                  {[
                    { label: "Open", value: quote.open ? `$${quote.open.toFixed(2)}` : "—" },
                    { label: "High", value: quote.high ? `$${quote.high.toFixed(2)}` : "—" },
                    { label: "Low", value: quote.low ? `$${quote.low.toFixed(2)}` : "—" },
                    {
                      label: "Prev close",
                      value: quote.previousClose
                        ? `$${quote.previousClose.toFixed(2)}`
                        : "—",
                    },
                    { label: "Currency", value: quote.currency ?? "—" },
                    { label: "Exchange", value: quote.exchange ?? "—" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-white/5 bg-white/3 px-3 py-2"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">
                        {stat.label}
                      </p>
                      <p className="mt-0.5 font-semibold text-slate-100">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-100">
                      {trendLabel}
                    </p>
                    {historyLoading && (
                      <span className="text-xs text-slate-400">Loading...</span>
                    )}
                  </div>
                  {historyError && (
                    <p className="mt-2 text-sm text-rose-300" role="alert">
                      {historyError}
                    </p>
                  )}
                  {!historyError && historyLoading && (
                    <p className="mt-2 text-sm text-slate-400">
                      Fetching price history...
                    </p>
                  )}
                  {!historyError && !historyLoading && history && (
                    <div className="mt-3">
                      <HistoryChart history={history} />
                    </div>
                  )}
                  {!historyError && !historyLoading && !history && (
                    <p className="mt-2 text-sm text-slate-400">
                      Fetch a ticker to see its recent performance.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
