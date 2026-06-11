"use client";

type Tick = { symbol: string; changePercent: number | null };

function fmt(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/**
 * A live, infinitely-scrolling broadcast ticker of every holding across the
 * league — the "market is alive" cue. Pure-CSS marquee (GPU transform), edge-
 * faded, color-coded green/red. Duplicated once so the loop is seamless.
 */
export function TickerTape({ ticks }: { ticks: Tick[] }) {
  if (ticks.length === 0) return null;
  const row = [...ticks, ...ticks];
  return (
    <div className="ticker-tape relative overflow-hidden">
      <div className="ticker-track flex w-max items-center">
        {row.map((t, i) => {
          const up = (t.changePercent ?? 0) >= 0;
          return (
            <span
              key={i}
              className="flex items-center gap-1.5 px-3.5 text-[11px] font-medium tracking-tight"
              aria-hidden={i >= ticks.length}
            >
              <span className="font-display font-semibold text-slate-200">
                {t.symbol}
              </span>
              <span
                className={`tnum ${up ? "text-emerald-400" : "text-rose-400"}`}
              >
                {up ? "▲" : "▼"} {fmt(t.changePercent)}
              </span>
              <span className="text-slate-600">·</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
