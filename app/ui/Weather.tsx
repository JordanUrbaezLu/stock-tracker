import type { CSSProperties } from "react";
import "./weather.css";

/*
 * No "use client": the weather is pure CSS, so this module (and its helpers)
 * can be used from server and client components alike.
 */

export type WeatherKind = "sunny" | "cloudy" | "rainy";

/** DESIGN §3 weather rule: day change > +0.25% sunny · < −0.25% rainy · else
 *  cloudy (missing data reads as cloudy). */
export function weatherFor(dayChangePercent: number | null | undefined): WeatherKind {
  if (dayChangePercent == null || Number.isNaN(dayChangePercent)) return "cloudy";
  if (dayChangePercent > 0.25) return "sunny";
  if (dayChangePercent < -0.25) return "rainy";
  return "cloudy";
}

const WORDS: Record<WeatherKind, string> = {
  sunny: "☀️ Sunny day",
  cloudy: "☁️ Cloudy day",
  rainy: "🌧️ Rainy day",
};

/** The weather said in words, e.g. "☀️ Sunny day" — pair it with the move:
 *  `${weatherWords(w)} — the club is up $12.34 today`. */
export function weatherWords(w: WeatherKind): string {
  return WORDS[w];
}

// Glints sit in the sun's quarter (offsets from the top-right corner).
const SPARKLES = [
  { x: "11%", y: "14%", s: 12, d: 5.8, delay: 0.3 },
  { x: "27%", y: "9%", s: 8, d: 6.6, delay: 2.1 },
  { x: "19%", y: "36%", s: 10, d: 7.2, delay: 1.2 },
  { x: "6%", y: "52%", s: 7, d: 6.1, delay: 3.4 },
  { x: "36%", y: "24%", s: 6, d: 7.8, delay: 4.6 },
];

export type WeatherProps = {
  kind: WeatherKind;
  /** Freeze the animations (AppShell sets it once the board scrolls away). */
  paused?: boolean;
  className?: string;
};

/**
 * The scoreboard's mood layer: sunny = warm light and slow rays from the top
 * right, cloudy = drifting haze, rainy = fine slanted rain under a cooler
 * tint. Absolutely fills its positioned parent, behind later siblings;
 * decorative (aria-hidden), never takes pointer events. AppShell renders it
 * from its `weather` prop — pages rarely need it directly.
 */
export function Weather({ kind, paused = false, className }: WeatherProps) {
  return (
    <div
      aria-hidden
      data-kind={kind}
      data-paused={paused ? "" : undefined}
      className={className ? `wx ${className}` : "wx"}
    >
      {kind === "sunny" ? (
        <>
          <div className="wx__glow" />
          <div className="wx__rays" />
          {SPARKLES.map((s, i) => (
            <span
              key={i}
              className="wx__sparkle"
              style={
                {
                  "--x": s.x,
                  "--y": s.y,
                  "--s": `${s.s}px`,
                  "--d": `${s.d}s`,
                  "--delay": `${s.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </>
      ) : null}
      {kind === "cloudy" ? (
        <>
          <div className="wx__veil" />
          <div className="wx__haze wx__haze--1" />
          <div className="wx__haze wx__haze--2" />
          <div className="wx__haze wx__haze--3" />
        </>
      ) : null}
      {kind === "rainy" ? (
        <>
          <div className="wx__tint" />
          <div className="wx__rain wx__rain--far" />
          <div className="wx__rain wx__rain--near" />
        </>
      ) : null}
    </div>
  );
}
