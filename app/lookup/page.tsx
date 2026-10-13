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
import { CompanyLogo } from "@/app/CompanyLogo";
import { RichText } from "@/app/RichText";
import { useSound } from "@/app/SoundContext";
import { Sparkline } from "@/app/Sparkline";
import { ThinkingDots, TypingCaret } from "@/app/ui/Ai";
import { AppShell } from "@/app/ui/AppShell";
import { Button } from "@/app/ui/Button";
import { Card, CardHeader } from "@/app/ui/Card";
import { ChartLegend, type ChartLegendItem } from "@/app/ui/ChartLegend";
import { Chip } from "@/app/ui/Chip";
import { cx } from "@/app/ui/cx";
import { Delta } from "@/app/ui/Delta";
import { Input } from "@/app/ui/Field";
import { FlapDisplay } from "@/app/ui/FlapDisplay";
import { formatCurrency, formatPercent, toneText } from "@/app/ui/format";
import { IconChevronDown, IconSearch, IconSparkle } from "@/app/ui/icons";
import { Rise } from "@/app/ui/Reveal";
import { Segmented } from "@/app/ui/Segmented";
import { Skeleton } from "@/app/ui/Skeleton";
import { Stamp, type StampTone } from "@/app/ui/Stamp";
import { EmptyState } from "@/app/ui/States";

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

type Prediction = {
  m1: number;
  m2: number;
  m3: number;
  direction: "up" | "down" | "flat";
  rationale: string;
};

/**
 * Build a forward forecast series from the monthly price targets, sampled at the
 * SAME cadence as the visible history slice — so the 3-month projection reads
 * proportionally on the chart (e.g. ~half of a 3-month view, a sliver of a 5-year
 * view) rather than as a fixed, distorted handful of points.
 */
function buildForecast(slice: HistoryPoint[], pred: Prediction): HistoryPoint[] {
  if (slice.length < 2) return [];
  const lastTime = slice[slice.length - 1].time;
  const lastClose = slice[slice.length - 1].close;
  const spacing = (lastTime - slice[0].time) / (slice.length - 1) || DAY;
  const end = lastTime + 90 * DAY;
  const wp = [
    { t: lastTime, v: lastClose },
    { t: lastTime + 30 * DAY, v: pred.m1 },
    { t: lastTime + 60 * DAY, v: pred.m2 },
    { t: end, v: pred.m3 },
  ];
  const interp = (t: number) => {
    if (t <= wp[0].t) return wp[0].v;
    for (let i = 1; i < wp.length; i++) {
      if (t <= wp[i].t) {
        const a = wp[i - 1];
        const b = wp[i];
        return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t || 1));
      }
    }
    return wp[wp.length - 1].v;
  };
  const pts: HistoryPoint[] = [];
  for (let t = lastTime + spacing; t < end; t += spacing) {
    pts.push({ time: Math.round(t), close: interp(t) });
  }
  pts.push({ time: end, close: pred.m3 }); // pin the +3mo target exactly
  return pts;
}

function sanitizeSymbol(raw: string) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9.\-]/g, "");
}


/** One-tap tickers on the empty board — same submit path as the form. */
const QUICK_PICKS = ["AAPL", "NVDA", "VOO", "TQQQ"] as const;

/** What the board shows before a price lands: the tiles flip from here. */
const BLANK_PRICE = "$---.--";

/** The forecast's direction as a rubber-stamp verdict. */
const VERDICT: Record<Prediction["direction"], { word: string; tone: StampTone }> = {
  up: { word: "Bullish", tone: "gain" },
  down: { word: "Bearish", tone: "loss" },
  flat: { word: "Steady", tone: "amber" },
};

/** Card titles in the hall read like the section headers: condensed caps.
 *  Size is set where it is used — two text-[…] utilities on one element don't
 *  override by order. */
const CARD_TITLE = "type-display uppercase tracking-[0.01em] text-ink";

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
  // 3-month forward projection — fetched alongside the analysis (once per
  // symbol) and drawn as a dashed forecast on the trend chart.
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const analysisFor = useRef<string | null>(null);
  // The timespan the reader is analyzing — drives the chart range and the AI read.
  const [span, setSpan] = useState<SpanKey>("6m");
  // Controls the type-ahead dropdown — only shown while the input is focused.
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);

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
      setPrediction(null);
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

  // Dashed 3-month projection, sampled at the visible chart's cadence so it
  // reads proportionally. Only present once the analysis (and its prediction)
  // has loaded for this symbol.
  const forecastSlice = useMemo(
    () => (prediction && perf ? buildForecast(perf.slice, prediction) : []),
    [prediction, perf],
  );

  // AI read — generated lazily, only after the user expands the card, and
  // re-generated when the symbol OR the chosen timespan changes (guarded so it
  // fires once per symbol+span). Leaving the card closed skips the API call.
  useEffect(() => {
    if (!analysisOpen || !quote || !history || history.length < 2) return;
    // Keyed to the SYMBOL only — one general take per stock, independent of the
    // chart's timespan, so flipping 3M/6M/1Y/5Y never refetches.
    if (analysisFor.current === quote.symbol) return;
    analysisFor.current = quote.symbol;
    const symbol = quote.symbol;
    let settled = false;
    const controller = new AbortController();
    setTake(null);
    setAnalysisDone(false);
    setPrediction(null);
    startSearching(); // looped "analyzing" motif while we wait
    const yearCloses = sliceDays(history, 365).map((p) => p.close);
    const ret1m = returnOver(history, 30);
    const ret6m = returnOver(history, 183);
    const ret1y = returnOver(history, 365);
    const yearLow = yearCloses.length ? Math.min(...yearCloses) : null;
    const yearHigh = yearCloses.length ? Math.max(...yearCloses) : null;
    // 3-month forward projection, drawn dashed on the trend chart.
    fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        symbol: quote.symbol,
        name: quote.name,
        price: quote.price,
        ret1m,
        ret6m,
        ret1y,
        yearLow,
        yearHigh,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { prediction?: Prediction } | null) => {
        if (j?.prediction) setPrediction(j.prediction);
      })
      .catch(() => null);
    fetch("/api/stock-take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        symbol: quote.symbol,
        name: quote.name,
        price: quote.price,
        todayPct: parseFloat(quote.changePercent) || null,
        ret1m,
        ret6m,
        ret1y,
        yearLow,
        yearHigh,
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
        // An aborted request (card collapsed, new ticker) never finished.
        if (controller.signal.aborted) return;
        settled = true;
        setAnalysisDone(true);
        stopSearching();
      });
    return () => {
      controller.abort();
      stopSearching();
      // Collapsed mid-request: drop the claim so reopening fetches again
      // instead of sticking on "No analysis available right now."
      if (!settled && analysisFor.current === symbol) analysisFor.current = null;
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

  // Type-ahead — shown while the input is focused and the current text isn't
  // the already-loaded symbol. Gating on the loaded symbol (instead of
  // toggling `focused` manually) keeps the popover from getting stuck hidden
  // when the input keeps DOM focus after a search.
  const showSuggestions =
    focused &&
    results.length > 0 &&
    !loading &&
    sanitizeSymbol(ticker) !== quote?.symbol;

  // Close shortly after focus leaves — unless it moved into the popover
  // (keyboard users tabbing to a suggestion) or back to the input.
  const closeSuggestionsSoon = () =>
    window.setTimeout(() => {
      const el = document.activeElement;
      if (el === inputRef.current || suggestionsRef.current?.contains(el)) return;
      setFocused(false);
    }, 120);

  // On a phone the analysis card sits low on the page, so its answer would
  // open under the fold: bring the card up under the brand bar instead. Higher
  // up (desktop rail, tall screens) it stays put.
  const revealAnalysis = () => {
    const el = analysisRef.current;
    if (!el || el.getBoundingClientRect().top < window.innerHeight * 0.4) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      el.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" }),
    );
  };

  const todayPct = quote ? parseFloat(quote.changePercent) : NaN;
  const hasChart = !!perf && perf.slice.length > 1;
  const chartUp = (perf?.spanReturn ?? 0) >= 0;
  const legend: ChartLegendItem[] = [
    { label: "Price", kind: "line", tone: chartUp ? "gain" : "loss" },
  ];
  if (forecastSlice.length > 0) {
    legend.push({ label: "3-month forecast", kind: "dashed", tone: "amber" });
  }
  const verdict = prediction ? VERDICT[prediction.direction] ?? VERDICT.flat : null;

  const hero = (
    // Extra bottom room: the hall's first block overlaps the board's edge.
    <div className="grid gap-5 pb-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12">
      <div className="min-w-0">
        <h1 className="type-eyebrow text-amber">Look up a stock</h1>
        <form
          onSubmit={handleSubmit}
          className="relative mt-3 flex items-start gap-2 sm:gap-3"
        >
          <label className="sr-only" htmlFor="ticker">
            Ticker symbol
          </label>
          <div className="relative min-w-0 flex-1">
            <IconSearch
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted"
            />
            <Input
              ref={inputRef}
              id="ticker"
              name="ticker"
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value);
                setFocused(true);
              }}
              onFocus={() => setFocused(true)}
              onBlur={closeSuggestionsSoon}
              onKeyDown={(e) => {
                if (e.key === "Escape") setFocused(false);
                else if (e.key === "ArrowDown" && showSuggestions) {
                  e.preventDefault();
                  suggestionsRef.current?.querySelector("button")?.focus();
                }
              }}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              placeholder="Search a ticker (e.g. AAPL, TQQQ)"
              className="pl-11 text-ellipsis uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal"
            />
          </div>
          {/* Before the submit key in the DOM (it is absolutely placed, so
              nothing moves): Tab from the input lands on the first
              suggestion instead of skipping past the list and closing it. */}
          {showSuggestions && (
            <motion.div
              ref={suggestionsRef}
              role="group"
              aria-label="Suggestions"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.14 }}
              onBlur={closeSuggestionsSoon}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  inputRef.current?.focus();
                  setFocused(false);
                  return;
                }
                if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                // Arrows walk the list; Up from the first one returns to the input.
                e.preventDefault();
                const items = Array.from(e.currentTarget.querySelectorAll("button"));
                const at = items.indexOf(document.activeElement as HTMLButtonElement);
                const next = e.key === "ArrowDown" ? at + 1 : at - 1;
                if (next < 0) inputRef.current?.focus();
                else items[Math.min(next, items.length - 1)]?.focus();
              }}
              className="absolute left-0 right-0 top-full z-30 mt-3 max-h-[60dvh] overflow-y-auto overscroll-contain rounded-[20px] border border-line bg-surface p-1.5 shadow-pop"
            >
              <p className="type-eyebrow px-2.5 pb-1.5 pt-2 text-muted">Suggestions</p>
              {results.slice(0, 6).map((res) => (
                <button
                  key={res.symbol}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const symbol = sanitizeSymbol(res.symbol);
                    inputRef.current?.focus();
                    setTicker(symbol);
                    void handleSubmit(undefined, symbol);
                  }}
                  className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[14px] px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2 active:bg-surface-3"
                >
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-3 font-mono text-[12px] font-bold text-amber"
                  >
                    {res.symbol.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold leading-tight text-ink">
                      {res.symbol}
                    </span>
                    <span className="block truncate text-[13px] leading-snug text-muted">
                      {res.description}
                    </span>
                  </span>
                </button>
              ))}
            </motion.div>
          )}

          <Button type="submit" loading={loading} className="shrink-0">
            Look up
          </Button>
        </form>
        <p className="mt-4 hidden max-w-sm text-[15px] leading-relaxed text-muted lg:block">
          Any US stock or fund. Type its ticker, press Look up, and the board
          flips to today&rsquo;s price.
        </p>
      </div>

      <div className="min-w-0">
        {/* One line that changes with the state, so the flap never jumps. */}
        <div className="flex min-h-[60px] items-center">
          {loading ? (
            <p className="flex items-center gap-3 text-[17px] font-semibold text-ink-2">
              Contacting the market…
              <ThinkingDots label="Loading the quote" className="text-amber" />
            </p>
          ) : error ? (
            <p role="alert" className="text-[16px] font-semibold leading-snug text-loss text-pretty">
              {error}
            </p>
          ) : quote ? (
            <div className="flex min-w-0 items-center gap-3">
              <CompanyLogo
                symbol={quote.symbol}
                name={quote.name}
                logo={quote.logo}
                size={52}
              />
              <div className="min-w-0">
                <h2 className="type-display text-[32px] text-ink">{quote.symbol}</h2>
                {/* A long fund name gives way; the exchange always shows. */}
                <p className="mt-1 flex min-w-0 text-[15px] text-muted">
                  <span className="truncate">{quote.name || "—"}</span>
                  {quote.exchange ? (
                    <span className="shrink-0 whitespace-pre"> · {quote.exchange}</span>
                  ) : null}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[16px] leading-snug text-muted text-pretty">
              No stock on the board yet. Search one to flip the tiles.
            </p>
          )}
        </div>

        <FlapDisplay
          value={quote ? `$${quote.price.toFixed(2)}` : BLANK_PRICE}
          label={
            quote
              ? `${quote.symbol} price $${quote.price.toFixed(2)}`
              : "No price on the board yet"
          }
          size="hero"
          sound={!!quote}
          className="mt-4"
        />

        {quote && !loading && (
          <div className="mt-4 flex flex-col gap-2">
            {perf && perf.change != null ? (
              <Delta
                variant="phrase"
                size="xl"
                value={perf.change}
                suffix={`over ${activeSpan.label} (${formatPercent(perf.spanReturn, 1)})`}
              />
            ) : historyLoading ? (
              <Skeleton className="h-7 w-64 max-w-full" />
            ) : null}
            {Number.isFinite(todayPct) && (
              <Delta
                variant="phrase"
                prefix="Today:"
                value={quote.change}
                percent={todayPct}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <AppShell
      active="lookup"
      back
      status={loading || historyLoading ? "loading" : quote ? "live" : null}
      hero={hero}
    >
      {quote && !loading ? (
        // `relative` paints it above the board edge it overlaps.
        <Rise
          key={quote.symbol}
          className="relative -mt-14 grid gap-6 lg:grid-cols-12 lg:gap-8"
        >
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6 lg:col-span-7 xl:col-span-8">
            {/* Timespan — picks the chart's window and doubles as a
                per-window return readout. */}
            <Card raised padding="none" className="order-1 min-w-0 p-1.5 lg:order-none">
              <Segmented
                fullWidth
                ariaLabel="Timespan"
                value={span}
                onChange={(next: SpanKey) => {
                  const pct = perf?.returns[next] ?? null;
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
                  setSpan(next);
                }}
                options={SPANS.map((s) => {
                  const v = perf?.returns[s.key] ?? null;
                  return {
                    value: s.key,
                    label: s.short,
                    sub: (
                      <span className={cx("tnum", toneText(v))}>
                        {v == null ? "—" : formatPercent(v, 1)}
                      </span>
                    ),
                  };
                })}
              />
            </Card>

            {/* Trend chart for the selected timespan */}
            <Card
              as="section"
              aria-label={`${activeSpan.title} trend`}
              className="order-3 min-w-0 lg:order-none"
            >
              <CardHeader
                as="h2"
                eyebrow={`${quote.symbol} price`}
                title={
                  <span className={cx(CARD_TITLE, "text-[22px]")}>
                    {activeSpan.title} trend
                  </span>
                }
                action={
                  perf ? (
                    <Delta
                      variant="pill"
                      size="sm"
                      value={perf.change}
                      percent={perf.spanReturn}
                      decimals={1}
                    />
                  ) : null
                }
              />
              {hasChart && perf ? (
                <div className="flex h-[232px] flex-col gap-3 md:h-[292px]">
                  <ChartLegend items={legend} />
                  <Sparkline
                    key={span}
                    points={perf.slice.map((p) => ({
                      time: p.time,
                      value: p.close,
                    }))}
                    forecast={forecastSlice.map((p) => ({
                      time: p.time,
                      value: p.close,
                    }))}
                    positive={chartUp}
                    strokeWidth={2}
                    showAxes
                    fill
                    className="w-full"
                  />
                </div>
              ) : (
                <p className="py-12 text-center text-[15px] text-muted">
                  {historyLoading
                    ? "Loading price history…"
                    : "Not enough history to chart."}
                </p>
              )}
            </Card>
          </div>

          {/* AI analysis — expandable; the AI read is only generated on first
              expand (which also reveals the 3-month forecast). */}
          <div
            ref={analysisRef}
            className="relative order-2 min-w-0 scroll-mt-[calc(var(--shell-top,4rem)+1.75rem)] lg:order-none lg:col-span-5 xl:col-span-4"
          >
            {/* Pinned over the card's edge, where the old "New" tag sat. */}
            <Chip
              size="xs"
              tone="amber"
              icon={<IconSparkle size={12} />}
              className="absolute -top-3 right-5 z-10 border border-amber/30 shadow-lip"
            >
              AI
            </Chip>
            <Card as="section" padding="sm" raised aria-labelledby="h-analysis">
              <h2>
                <button
                  type="button"
                  onClick={() => {
                    play(analysisOpen ? "close" : "open");
                    setAnalysisOpen((o) => !o);
                    if (!analysisOpen) revealAnalysis();
                  }}
                  aria-expanded={analysisOpen}
                  aria-controls="analysis-body"
                  data-variant="secondary"
                  data-live=""
                  className="ui-key relative flex min-h-[76px] w-full cursor-pointer items-center gap-2.5 rounded-[20px] px-2.5 py-3 text-left [--key-lip-size:4px] sm:gap-3 sm:px-3"
                >
                  <span
                    aria-hidden
                    className="on-amber grid size-11 shrink-0 place-items-center rounded-[14px] bg-amber-bright text-ink shadow-lip"
                  >
                    <IconSparkle size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      id="h-analysis"
                      className={cx(CARD_TITLE, "block text-[18px] min-[375px]:text-[20px]")}
                    >
                      <span aria-hidden>🧠 </span>Ticker analysis
                    </span>
                    <span className="mt-1 block text-[14px] font-medium leading-snug text-muted">
                      {analysisOpen
                        ? "Performance, market standing & a buy/sell verdict"
                        : "Tap for an AI take on this ticker"}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cx(
                      "grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 transition-transform duration-200 ease-board motion-reduce:transition-none",
                      analysisOpen && "rotate-180",
                    )}
                  >
                    <IconChevronDown size={18} />
                  </span>
                </button>
              </h2>

              {analysisOpen && (
                <div id="analysis-body" className="px-1.5 pb-1.5 pt-6 md:px-1 md:pb-1">
                  {take ? (
                    <>
                      <p aria-hidden className="text-[16px] leading-7 text-ink-2">
                        <RichText text={take.slice(0, shown)} />
                        {shown < take.length && <TypingCaret className="text-amber" />}
                      </p>
                      <p className="sr-only">
                        <RichText text={take} />
                      </p>
                    </>
                  ) : analysisDone || (!historyLoading && !perf) ? (
                    <p className="text-[15px] text-muted">
                      No analysis available right now.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <p className="flex items-center gap-2.5 text-[15px] font-semibold text-ink-2">
                        <ThinkingDots
                          label={`Analyzing ${quote.symbol}`}
                          className="text-amber"
                        />
                        Analyzing {quote.symbol}…
                      </p>
                      <div aria-hidden className="flex flex-col gap-2">
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-11/12" />
                        <Skeleton className="h-3.5 w-4/5" />
                      </div>
                    </div>
                  )}

                  {prediction && verdict && (
                    <Rise className="mt-5 rounded-[20px] border border-amber/25 bg-amber-soft p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="type-label flex items-center gap-2 text-ink">
                            <span
                              aria-hidden
                              className="inline-block h-0 w-5 shrink-0 border-t-[3px] border-dashed border-amber-bright"
                            />
                            3-month forecast
                          </p>
                          <p className="type-display mt-2.5 text-[32px] text-ink">
                            {formatCurrency(prediction.m3)}
                          </p>
                          <p
                            className={cx(
                              "mt-1.5 text-[15px] font-bold",
                              toneText(prediction.m3 - quote.price),
                            )}
                          >
                            {formatPercent((prediction.m3 / quote.price - 1) * 100, 1)}{" "}
                            <span className="font-medium text-muted">from today</span>
                          </p>
                        </div>
                        <Stamp tone={verdict.tone} rotate={6} className="mr-1 mt-2 shrink-0">
                          {verdict.word}
                        </Stamp>
                      </div>
                      <p className="mt-3 text-[15px] leading-6 text-ink-2">
                        {prediction.rationale}
                      </p>
                      <p className="mt-3 text-[12px] leading-snug text-muted">
                        Speculative AI projection · not financial advice
                      </p>
                    </Rise>
                  )}
                </div>
              )}
            </Card>
          </div>
        </Rise>
      ) : loading ? (
        <div aria-hidden className="relative -mt-14 grid gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6 lg:col-span-7 xl:col-span-8">
            <Card raised padding="none" className="order-1 min-w-0 p-1.5 lg:order-none">
              <Skeleton className="h-14 rounded-[18px]" />
            </Card>
            <Card className="order-3 min-w-0 lg:order-none">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-6 w-44" />
              <Skeleton className="mt-5 h-[232px] rounded-2xl md:h-[292px]" />
            </Card>
          </div>
          <div className="order-2 min-w-0 lg:order-none lg:col-span-5 xl:col-span-4">
            <Card padding="sm" raised>
              <Skeleton className="h-[76px] rounded-[20px]" />
            </Card>
          </div>
        </div>
      ) : (
        <div className="relative -mt-14">
          <Card raised padding="none">
            <EmptyState
              icon={<IconSearch />}
              title={error ? "Try another ticker" : "Look up any stock"}
              body={
                error
                  ? "Type a different ticker in the search box above."
                  : "Search a ticker to see its price, trend, and an AI read."
              }
              action={
                <div>
                  <p className="type-label mb-3">Or tap a quick pick</p>
                  <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5 pb-1 sm:grid-cols-4">
                    {QUICK_PICKS.map((symbol) => (
                      <Button
                        key={symbol}
                        variant="secondary"
                        fullWidth
                        onClick={() => {
                          setTicker(symbol);
                          void handleSubmit(undefined, symbol);
                        }}
                      >
                        {symbol}
                      </Button>
                    ))}
                  </div>
                </div>
              }
            />
          </Card>
        </div>
      )}
    </AppShell>
  );
}

/** Suspense fallback: the same shell with a skeleton board, so the page
 *  doesn't jump when the search params resolve. */
function LookupFallback() {
  return (
    <AppShell
      active="lookup"
      back
      status="loading"
      hero={
        <div className="grid gap-5 pb-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12">
          <div className="min-w-0">
            <p className="type-eyebrow text-amber">Look up a stock</p>
            <div className="mt-3 flex gap-2 sm:gap-3">
              <Skeleton className="h-12 flex-1 rounded-2xl" />
              <Skeleton className="h-12 w-28 rounded-2xl" />
            </div>
          </div>
          <div className="min-w-0">
            <Skeleton className="h-[60px] w-56 max-w-full" />
            <Skeleton className="mt-4 h-[clamp(49px,15vw,94px)] w-[min(100%,28rem)] rounded-[10px]" />
          </div>
        </div>
      }
    >
      <div aria-hidden className="relative -mt-14">
        <Card raised padding="none">
          <div className="flex flex-col items-center gap-3 px-6 py-12">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default function LookupPage() {
  return (
    <Suspense fallback={<LookupFallback />}>
      <LookupContent />
    </Suspense>
  );
}
