"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatPercentAbs, toneOf, toneText } from "./ui/format";
import { IconTriangleDown, IconTriangleUp } from "./ui/icons";
import "./ui/ticker.css";

export type Tick = { symbol: string; changePercent: number | null };

// Constant reading speed regardless of how many holdings there are.
const SPEED_PX_PER_S = 44;
// Pre-measure guess (SSR + first paint) at how many quotes fill a wide strip.
const MIN_ITEMS = 12;

/**
 * The board's ticker tape — every holding's move scrolling past, the "market
 * is alive" cue. CSS marquee (GPU transform) that pauses on hover; with
 * reduced motion it's a still, swipeable strip. The quote list is repeated
 * to fill wide screens and then doubled so the loop is seamless; only the
 * first copy is exposed to assistive tech.
 */
export function TickerTape({ ticks }: { ticks: Tick[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLUListElement>(null);
  const [copies, setCopies] = useState(() =>
    Math.max(1, Math.ceil(MIN_ITEMS / Math.max(1, ticks.length))),
  );
  const [duration, setDuration] = useState<number | null>(null);
  const hasTicks = ticks.length > 0;

  useEffect(() => {
    const root = rootRef.current;
    const set = setRef.current;
    if (!root || !set) return;
    const measure = () => {
      const setWidth = set.offsetWidth;
      if (!setWidth) return;
      // Half the track (what one loop scrolls past) must cover the strip.
      const needed = Math.max(1, Math.ceil(root.clientWidth / setWidth));
      setCopies(needed);
      setDuration((needed * setWidth) / SPEED_PX_PER_S);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(set);
    return () => observer.disconnect();
  }, [hasTicks]);

  if (!hasTicks) return null;

  const style = duration
    ? ({ "--qb-ticker-duration": `${duration.toFixed(1)}s` } as CSSProperties)
    : undefined;

  return (
    <div ref={rootRef} className="qb-ticker no-scrollbar" style={style}>
      <div className="qb-ticker__track">
        {Array.from({ length: copies * 2 }, (_, copy) => (
          <ul
            key={copy}
            ref={copy === 0 ? setRef : undefined}
            className="qb-ticker__set"
            aria-label={copy === 0 ? "Market moves" : undefined}
            aria-hidden={copy > 0 ? true : undefined}
          >
            {ticks.map((tick, i) => (
              <TickQuote key={`${tick.symbol}-${i}`} tick={tick} />
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

function TickQuote({ tick }: { tick: Tick }) {
  const tone = toneOf(tick.changePercent);
  return (
    <li className="qb-ticker__item">
      <span className="qb-ticker__sym">{tick.symbol}</span>
      <span className={`qb-ticker__chg ${toneText(tick.changePercent)}`}>
        {tone === "gain" ? (
          <IconTriangleUp size={8} />
        ) : tone === "loss" ? (
          <IconTriangleDown size={8} />
        ) : null}
        {tone !== "flat" ? (
          <span className="sr-only">{tone === "gain" ? "up" : "down"}</span>
        ) : null}
        {formatPercentAbs(tick.changePercent, 2)}
      </span>
    </li>
  );
}

/** Same-height placeholder for the tape while quotes load. */
export function TickerTapeSkeleton() {
  return (
    <div className="qb-ticker-skeleton" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex flex-none items-center gap-2">
          <span className="skeleton h-2 w-8 rounded-full" />
          <span className="skeleton h-2 w-11 rounded-full opacity-60" />
        </span>
      ))}
    </div>
  );
}
