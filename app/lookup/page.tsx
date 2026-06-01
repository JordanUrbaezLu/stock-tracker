"use client";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { CompanyLogo } from "../CompanyLogo";
import { Sparkline } from "../Sparkline";
import { RichText } from "../RichText";
import { useSound } from "../SoundContext";
import { BackButton } from "../BackButton";

type Quote = {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  logo?: string | null;
  price: number;
  change: number;
  changePercent: string;
};

type SearchResult = { symbol: string; description: string; type: string | null };
type HistoryPoint = { time: number; close: number };

const DAY = 86400;

type SpanKey = "3m" | "6m" | "1y" | "5y";
const SPANS: {
  key: SpanKey;
  short: string;
  label: string;
  title: string;
  days: number;
}[] = [
  { key: "3m", short: "3M", label: "3 months", title: "3-month", days: 91 },
  { key: "6m", short: "6M", label: "6 months", title: "6-month", days: 183 },
  { key: "1y", short: "1Y", label: "1 year", title: "1-year", days: 365 },
  { key: "5y", short: "5Y", label: "5 years", title: "5-year", days: 1826 },
];

function fmtPct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function fmtMoney(v: number) {
  return `$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function toneText(v: number | null | undefined) {
  if (v == null || v === 0) return "text-slate-300";
  return v > 0 ? "text-emerald-400" : "text-rose-400";
}

/** % return between `days` ago and the latest close. */
function returnOver(history: HistoryPoint[], days: number): number | null {
  if (!history || history.length < 2) return null;
  const last = history[history.length - 1];
  const cutoff = last.time - days * DAY;
  const start = history.find((p) => p.time >= cutoff) ?? history[0];
  if (!start.close) return null;
  return ((last.close - start.close) / start.close) * 100;
}

function sliceDays(history: HistoryPoint[], days: number): HistoryPoint[] {
  if (!history.length) return [];
  const cutoff = history[history.length - 1].time - days * DAY;
  const sliced = history.filter((p) => p.time >= cutoff);
  return sliced.length >= 2 ? sliced : history;
}

function sanitizeSymbol(raw: string) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9.\-]/g, "");
}

function LookupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { play, startSearching, stopSearching } = useSound();
  const lastLoaded = useRef<string | null>(null);
  const resultToneFor = useRef<string | null>(null);

  const urlSymbol = sanitizeSymbol(
    searchParams.get("symbol") ?? searchParams.get("ticker") ?? "",
  );

  const [ticker, setTicker] = useState(urlSymbol || "AAPL");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [take, setTake] = useState<string | null>(null);
  // The analysis is generated lazily — only once the user expands the card —
  // and re-fetched per symbol. analysisDone marks a finished request so we can
  // tell "still loading" apart from "finished but empty". `shown` drives the
  // typewriter reveal of the answer.
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [shown, setShown] = useState(0);
  const analysisFor = useRef<string | null>(null);
  // The timespan the reader is analyzing — drives the chart range and the AI read.
  const [span, setSpan] = useState<SpanKey>("6m");
  // Controls the type-ahead dropdown — only shown while the input is focused.
  const [focused, setFocused] = useState(false);

  const fetchHistory = useCallback(async (symbol: string) => {
    setHistoryLoading(true);
    setHistory(null);
    try {
      const res = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}`);
      const data = (await res.json()) as { history?: HistoryPoint[] };
      if (res.ok && data.history) {
        setHistory([...data.history].sort((a, b) => a.time - b.time));
      }
    } catch {
      // chart simply won't render; quote still shows
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadQuote = useCallback(
    async (rawSymbol: string, syncUrl = false) => {
      const symbol = sanitizeSymbol(rawSymbol);
      if (!symbol) {
        setError("Enter a ticker symbol to look up.");
        setQuote(null);
        return;
      }
      lastLoaded.current = symbol;
      setTicker(symbol);
      if (syncUrl) {
        router.replace(`/lookup?symbol=${encodeURIComponent(symbol)}`, {
          scroll: false,
        });
      }
      setLoading(true);
      setError(null);
      setQuote(null);
      setHistory(null);
      setTake(null);
      setAnalysisOpen(false);
      setAnalysisDone(false);
      analysisFor.current = null;
      try {
        const response = await fetch(`/api/quote?symbol=${symbol}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? `No data found for ${symbol}. Check the ticker and try again.`
              : typeof data.error === "string"
                ? data.error
                : "Could not fetch quote.",
          );
        }
        setQuote(data as Quote);
        void fetchHistory(symbol);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [fetchHistory, router],
  );

  const handleSubmit = async (
    event?: FormEvent<HTMLFormElement>,
    overrideSymbol?: string,
  ) => {
    event?.preventDefault();
    play("send");
    await loadQuote(overrideSymbol ?? ticker, true);
  };

  // Auto-search when arriving via ?symbol= (e.g. logo click elsewhere).
  useEffect(() => {
    if (!urlSymbol || urlSymbol === lastLoaded.current) return;
    void loadQuote(urlSymbol);
  }, [urlSymbol, loadQuote]);

  // Type-ahead suggestions (top 3).
  useEffect(() => {
    const term = ticker.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { results?: SearchResult[] };
        setResults(res.ok && Array.isArray(data.results) ? data.results : []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(handler);
  }, [ticker]);

  const activeSpan = SPANS.find((s) => s.key === span) ?? SPANS[2];

  const perf = useMemo(() => {
    if (!history || history.length < 2) return null;
    const slice = sliceDays(history, activeSpan.days);
    const closes = slice.map((p) => p.close);
    return {
      // Returns for every window — drive the selectable timespan tiles.
      returns: Object.fromEntries(
        SPANS.map((s) => [s.key, returnOver(history, s.days)]),
      ) as Record<SpanKey, number | null>,
      // The selected span's slice + stats — drive the chart.
      slice,
      spanReturn: returnOver(history, activeSpan.days),
      low: closes.length ? Math.min(...closes) : null,
      high: closes.length ? Math.max(...closes) : null,
      change:
        slice.length >= 2 ? slice[slice.length - 1].close - slice[0].close : null,
    };
  }, [history, activeSpan.days]);

  // AI read — generated lazily, only after the user expands the card, and
  // re-generated when the symbol OR the chosen timespan changes (guarded so it
  // fires once per symbol+span). Leaving the card closed skips the API call.
  useEffect(() => {
    if (!analysisOpen || !quote || !history || history.length < 2) return;
    // Keyed to the SYMBOL only — one general take per stock, independent of the
    // chart's timespan, so flipping 3M/6M/1Y/5Y never refetches.
    if (analysisFor.current === quote.symbol) return;
    analysisFor.current = quote.symbol;
    const controller = new AbortController();
    setTake(null);
    setAnalysisDone(false);
    startSearching(); // looped "analyzing" motif while we wait
    const yearCloses = sliceDays(history, 365).map((p) => p.close);
    fetch("/api/stock-take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        symbol: quote.symbol,
        name: quote.name,
        price: quote.price,
        todayPct: parseFloat(quote.changePercent) || null,
        ret1m: returnOver(history, 30),
        ret6m: returnOver(history, 183),
        ret1y: returnOver(history, 365),
        yearLow: yearCloses.length ? Math.min(...yearCloses) : null,
        yearHigh: yearCloses.length ? Math.max(...yearCloses) : null,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { read?: string | null; note?: string } | null) => {
        if (j) {
          setTake(j.read ?? j.note ?? null);
          setShown(0); // begin the typewriter reveal from the start
        }
      })
      .catch(() => null)
      .finally(() => {
        setAnalysisDone(true);
        stopSearching();
      });
    return () => {
      controller.abort();
      stopSearching();
    };
  }, [analysisOpen, quote, history, startSearching, stopSearching]);

  // Typewriter reveal for the analysis (25ms/step), with a soft key tick every
  // ~12 chars — matches the Portfolio Assistant.
  useEffect(() => {
    if (!take || shown >= take.length) return;
    const id = window.setTimeout(() => {
      const next = Math.min(take.length, shown + 3);
      if (Math.floor(next / 12) !== Math.floor(shown / 12)) play("type");
      setShown(next);
    }, 25);
    return () => window.clearTimeout(id);
  }, [take, shown, play]);

  // Payoff tone once a looked-up stock's data lands — a coin for a winner,
  // a soft tap otherwise. Once per symbol (so changing timespans is quiet).
  useEffect(() => {
    if (!quote || !perf) return;
    if (resultToneFor.current === quote.symbol) return;
    resultToneFor.current = quote.symbol;
    play((perf.spanReturn ?? 0) >= 0 ? "coin" : "tap");
  }, [quote, perf, play]);

  return (
    <div className="app-backdrop min-h-screen overflow-x-clip text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <header className="glass relative overflow-hidden rounded-2xl px-3 py-3 shadow-xl shadow-black/30 sm:px-5">
          <div className="relative flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-cyan-400 via-fuchsia-500 to-indigo-500 text-base">
                🔍
              </span>
              <div className="min-w-0 leading-tight">
                <p className="gradient-text truncate text-base font-bold tracking-tight">
                  Ticker Lookup
                </p>
                <p className="truncate text-[10px] uppercase tracking-widest text-slate-400 sm:tracking-[0.2em]">
                  Performance &amp; trend
                </p>
              </div>
            </div>
            <BackButton />
          </div>
        </header>

        <section className="glass relative rounded-3xl p-4 shadow-2xl shadow-black/30 sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          >
            <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
          </div>
          <form
            onSubmit={handleSubmit}
            className="relative flex items-center gap-2 sm:gap-3"
          >
            <label className="sr-only" htmlFor="ticker">
              Ticker symbol
            </label>
            <input
              id="ticker"
              name="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => window.setTimeout(() => setFocused(false), 120)}
              autoComplete="off"
              placeholder="Search a ticker (e.g. AAPL, TQQQ)"
              className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/50 px-4 text-base uppercase tracking-wide text-slate-100 outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 focus:border-cyan-400/60"
            />
            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.96 }}
              className="h-12 shrink-0 cursor-pointer rounded-xl bg-linear-to-r from-cyan-500 to-fuchsia-500 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
            >
              {loading ? "…" : "Look up"}
            </motion.button>

            {/* Type-ahead dropdown — shown while the input is focused and the
                current text isn't the already-loaded symbol. Gating on the
                loaded symbol (instead of toggling `focused` manually) keeps the
                dropdown from getting stuck hidden when the input keeps DOM
                focus after a search. */}
            {focused &&
              results.length > 0 &&
              !loading &&
              sanitizeSymbol(ticker) !== quote?.symbol && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.14 }}
                className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl"
              >
                <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Suggestions
                </p>
                {results.slice(0, 6).map((res) => (
                  <button
                    key={res.symbol}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const symbol = sanitizeSymbol(res.symbol);
                      setTicker(symbol);
                      void handleSubmit(undefined, symbol);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/5"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-[11px] font-bold text-cyan-100 ring-1 ring-white/10">
                      {res.symbol.slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">
                        {res.symbol}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {res.description}
                      </span>
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </form>

          {loading && (
            <p className="relative mt-6 animate-pulse text-slate-300">
              Contacting the market…
            </p>
          )}

          {error && !loading && (
            <p className="relative mt-6 text-rose-300" role="alert">
              {error}
            </p>
          )}

          {!quote && !error && !loading && (
            <p className="relative mt-6 text-sm text-slate-400">
              Search a ticker to see its performance and 6-month trend.
            </p>
          )}

          {quote && !loading && (
            <div className="relative mt-5 space-y-4">
              {/* Identity + price */}
              <div className="flex items-start gap-3">
                <CompanyLogo
                  symbol={quote.symbol}
                  name={quote.name}
                  logo={quote.logo}
                  size={48}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold leading-tight text-white">
                    {quote.symbol}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {quote.name || "—"}
                    {quote.exchange ? ` · ${quote.exchange}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-end">
                <span className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  ${quote.price.toFixed(2)}
                </span>
              </div>

              {/* Timespan filter — selects the window for the chart and the AI
                  read, and doubles as a per-window return tile. */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Timespan
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {SPANS.map((s) => {
                    const v = perf?.returns[s.key] ?? null;
                    const active = span === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => {
                          const pct = perf?.returns[s.key] ?? null;
                          play(
                            pct == null
                              ? "toggle"
                              : pct >= 500
                                ? "gainHigh"
                                : pct >= 50
                                  ? "gainMid"
                                  : pct >= 0
                                    ? "gainLow"
                                    : pct > -25
                                      ? "lossLow"
                                      : pct > -50
                                        ? "lossMid"
                                        : "lossHigh",
                          );
                          setSpan(s.key);
                        }}
                        aria-pressed={active}
                        className={`cursor-pointer rounded-2xl border px-2 py-2.5 text-left transition ${
                          active
                            ? "border-cyan-400/40 bg-cyan-500/10 ring-1 ring-cyan-400/30"
                            : "border-white/5 bg-white/3 hover:border-white/15 hover:bg-white/5"
                        }`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {s.short}
                        </p>
                        <p
                          className={`mt-0.5 text-sm font-semibold ${toneText(v)}`}
                        >
                          {fmtPct(v)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI 6-month analysis — expandable; the AI read is only generated
                  on first expand. Kept above the chart so it's ATF on mobile. */}
              <div className="overflow-hidden rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/8">
                <button
                  type="button"
                  onClick={() => {
                    play(analysisOpen ? "close" : "open");
                    setAnalysisOpen((o) => !o);
                  }}
                  aria-expanded={analysisOpen}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-left transition hover:bg-fuchsia-500/5"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-linear-to-br from-cyan-400 via-fuchsia-500 to-indigo-500 text-sm shadow-sm shadow-black/30">
                    📊
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-fuchsia-100">
                      Ticker Analysis
                    </span>
                    <span className="block text-[11px] leading-tight text-slate-400">
                      {analysisOpen
                        ? "Performance, market standing & a buy/sell verdict"
                        : "Tap for an AI take on this ticker"}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition-transform duration-200 ${
                      analysisOpen ? "rotate-180" : ""
                    }`}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </button>
                {analysisOpen && (
                  <div className="px-3 pb-3">
                    {take ? (
                      <p className="text-sm leading-5 text-slate-100">
                        <RichText text={take.slice(0, shown)} />
                        {shown < take.length && (
                          <span className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse bg-fuchsia-300/90 align-middle" />
                        )}
                      </p>
                    ) : analysisDone ? (
                      <p className="text-sm text-slate-400">
                        No analysis available right now.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-fuchsia-200/90">
                          <span
                            aria-hidden
                            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-fuchsia-300/30 border-t-fuchsia-300"
                          />
                          Analyzing {quote.symbol}…
                        </div>
                        <div className="space-y-1.5 pt-0.5">
                          <div className="skeleton h-3 w-full rounded" />
                          <div className="skeleton h-3 w-11/12 rounded" />
                          <div className="skeleton h-3 w-4/5 rounded" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Trend chart for the selected timespan */}
              <div className="rounded-2xl border border-white/5 bg-white/2 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {activeSpan.title} trend
                  </p>
                  {perf && (
                    <p
                      className={`text-xs font-semibold ${toneText(perf.spanReturn)}`}
                    >
                      {fmtPct(perf.spanReturn)}
                      {perf.change != null
                        ? ` (${perf.change >= 0 ? "+" : "−"}${fmtMoney(
                            perf.change,
                          )})`
                        : ""}
                    </p>
                  )}
                </div>
                {historyLoading && !perf && (
                  <p className="py-6 text-center text-sm text-slate-400">
                    Loading price history…
                  </p>
                )}
                {perf && perf.slice.length > 1 && (
                  <Sparkline
                    points={perf.slice.map((p) => ({
                      time: p.time,
                      value: p.close,
                    }))}
                    positive={(perf.spanReturn ?? 0) >= 0}
                    height={170}
                    strokeWidth={2}
                    showAxes
                    className="w-full"
                  />
                )}
                {!historyLoading && !perf && (
                  <p className="py-6 text-center text-sm text-slate-400">
                    Not enough history to chart.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function LookupPage() {
  return (
    <Suspense
      fallback={
        <div className="app-backdrop flex min-h-screen items-center justify-center text-slate-400">
          Loading lookup…
        </div>
      }
    >
      <LookupContent />
    </Suspense>
  );
}
