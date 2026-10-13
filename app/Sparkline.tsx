"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import { useSound } from "./SoundContext";
import { compactMoney } from "./ui/format";
import "./ui/spark.css";

type Point = { time: number; value: number };

type Props = {
  points: Point[];
  positive?: boolean;
  height?: number;
  className?: string;
  /** Stretch to fill the parent (use as a background layer). */
  fill?: boolean;
  strokeWidth?: number;
  /** Render light X (date) and Y (amount) axis labels around the chart. */
  showAxes?: boolean;
  /** Optional benchmark series (e.g. S&P 500), drawn as a dashed line on the
   *  same scale. Should share the main series' timestamps for clean overlay. */
  benchmark?: Point[];
  /** Optional forward projection drawn as a dashed line that CONTINUES past the
   *  last real point (times after `points`). Extends the x-axis to the right and
   *  drops a "now" divider at the boundary. */
  forecast?: Point[];
  /** ms before the line draws in (the tip pulse follows) — lets a hero chart
   *  wait for the flaps to settle. Default 0. */
  delay?: number;
};

const PAD = 4;
// Matches the draw-in in spark.css; the pulse waits for the line to finish
// drawing so the two motions don't compete.
const DRAW_MS = 900;
const PULSE_MS = 5094; // ~5.1s per pulse
const SWEEP = 0.4; // ~2s of travel, then it rests at the tip and fades
const FADE_END = 0.54;

function axisDate(epochSeconds: number, spanDays: number): string {
  const d = new Date(epochSeconds * 1000);
  // Short windows show month+day; longer ones show month+year.
  return spanDays <= 75
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * Lightweight dependency-free SVG sparkline. The line/area live in an SVG with
 * preserveAspectRatio="none" (so it stretches), while axis labels are rendered
 * as HTML so they never distort. The line draws itself in left → right on
 * mount and whenever the series changes, with the area fading in behind it.
 *
 * An EKG-style pulse — a round glowing ball — sweeps along the line every few
 * seconds. It's a positioned HTML element animated through the real data points
 * (via the Web Animations API), so it stays a perfect circle regardless of the
 * SVG's non-uniform stretch, and rests on the latest real point.
 *
 * A `forecast` series, when supplied, is drawn dashed beyond the last real
 * point on a shared, index-based x-axis: caller controls the visual length by
 * how many forecast points it passes (match the historical cadence so 3 months
 * of projection reads proportionally, not as a squished sliver).
 */
export function Sparkline({
  points,
  positive = true,
  height = 48,
  className,
  fill = false,
  strokeWidth = 1.75,
  showAxes = false,
  benchmark,
  forecast,
  delay = 0,
}: Props) {
  const id = useId();
  const ballRef = useRef<HTMLSpanElement>(null);
  const { play } = useSound();
  const clean = (points ?? []).filter((p) => Number.isFinite(p.value));
  const benchClean = (benchmark ?? []).filter((p) => Number.isFinite(p.value));
  const forecastClean = (forecast ?? []).filter((p) => Number.isFinite(p.value));

  const values = clean.map((p) => p.value);
  const benchValues = benchClean.map((p) => p.value);
  const forecastValues = forecastClean.map((p) => p.value);
  const valuesKey = values.join(",");
  const benchKey = benchValues.join(",");
  const forecastKey = forecastValues.join(",");

  useEffect(() => {
    const el = ballRef.current;
    if (!el || typeof el.animate !== "function") return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const vals = valuesKey ? valuesKey.split(",").map(Number) : [];
    const n = vals.length;
    if (n < 2) return;

    // Scale to the SAME min/max the line uses — across the portfolio, the
    // benchmark overlay, AND the forecast — so the pulse tracks the line.
    const benchVals = benchKey ? benchKey.split(",").map(Number) : [];
    const fcastVals = forecastKey ? forecastKey.split(",").map(Number) : [];
    const scaleVals = vals.concat(benchVals, fcastVals);
    const mn = Math.min(...scaleVals);
    const mx = Math.max(...scaleVals);
    const rng = mx - mn || 1;
    const usable = height - PAD * 2;
    // The x-axis spans history + forecast; the pulse sweeps the historical line
    // and rests at the last real point ("now"), not the forecast's far edge.
    const total = n + fcastVals.length;
    const denom = total > 1 ? total - 1 : 1;

    const frames: Keyframe[] = vals.map((v, i) => {
      const x = (i / denom) * 100;
      const y = PAD + (1 - (v - mn) / rng) * usable;
      return {
        offset: (i / (n - 1)) * SWEEP,
        left: `${x}%`,
        top: `${(y / height) * 100}%`,
        opacity: 1,
      };
    });
    frames[0] = { ...frames[0], opacity: 0 };

    // Hold the ball on the latest real point as it fades. Pinning left/top here
    // is essential: otherwise the browser fills the missing values from the base
    // style (left/top: 0) and the ball drifts backward — the "boomerang".
    const lastY = PAD + (1 - (vals[n - 1] - mn) / rng) * usable;
    const lastLeft = `${((n - 1) / denom) * 100}%`;
    const lastTop = `${(lastY / height) * 100}%`;
    frames.push({ offset: FADE_END, left: lastLeft, top: lastTop, opacity: 0 });
    frames.push({ offset: 1, left: lastLeft, top: lastTop, opacity: 0 });

    // The pulse waits for the line to finish drawing.
    const drawn = DRAW_MS + Math.max(0, delay);
    const anim = el.animate(frames, {
      duration: PULSE_MS,
      delay: drawn,
      iterations: Infinity,
      easing: "linear",
    });

    // A whisper tick each time the pulse reaches the tip of the line. It's
    // scheduled from the animation's own clock (not a free-running interval),
    // so it stays on the beat after off-screen pauses. Muted audio is a no-op.
    let visible = true;
    let tickTimer: number | undefined;
    const tip = SWEEP * PULSE_MS;
    const scheduleTick = () => {
      window.clearTimeout(tickTimer);
      const now = Number(anim.currentTime ?? 0);
      let wait: number;
      if (now < drawn) {
        wait = drawn - now + tip;
      } else {
        const local = (now - drawn) % PULSE_MS;
        wait = local < tip ? tip - local : PULSE_MS - local + tip;
      }
      // The timeline only advances per frame; never double-tick one sweep.
      if (wait < 100) wait += PULSE_MS;
      tickTimer = window.setTimeout(() => {
        if (visible) play("pulse");
        scheduleTick();
      }, wait);
    };

    // Pause the pulse (and skip its tick) whenever the chart is off-screen —
    // swiped-away carousel slides and scrolled-off cards then do zero per-frame
    // work, which keeps sliding/scrolling smooth.
    const host = el.parentElement ?? el;
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting;
              if (visible) {
                anim.play();
                scheduleTick();
              } else {
                anim.pause();
                window.clearTimeout(tickTimer);
              }
            },
            { threshold: 0 },
          )
        : null;
    io?.observe(host);
    scheduleTick();

    return () => {
      anim.cancel();
      io?.disconnect();
      window.clearTimeout(tickTimer);
    };
  }, [valuesKey, benchKey, forecastKey, height, delay, play]);

  if (clean.length < 2) return null;

  // Scale across every series so the benchmark + forecast share the y-axis.
  const allValues = values.concat(benchValues, forecastValues);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const width = 100;
  const usable = height - PAD * 2;
  // Combined index axis: history occupies [0 .. clean.length-1], the forecast
  // continues at [clean.length ..]. With no forecast this collapses to plain
  // i/(clean.length-1) spacing.
  const total = clean.length + forecastClean.length;
  const denom = total > 1 ? total - 1 : 1;
  const xAt = (idx: number) => (idx / denom) * width;
  const yAt = (v: number) => PAD + (1 - (v - min) / range) * usable;

  const coords = values.map((v, i) => [xAt(i), yAt(v)] as const);
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const benchLine =
    benchValues.length >= 2
      ? benchValues
          .map(
            (v, i) =>
              `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`,
          )
          .join(" ")
      : null;

  const lastHist = coords[coords.length - 1];
  // Forecast dashed line continues from the last real point.
  const forecastLine =
    forecastValues.length >= 1
      ? `M ${lastHist[0].toFixed(2)} ${lastHist[1].toFixed(2)} ` +
        forecastValues
          .map(
            (v, j) =>
              `L ${xAt(clean.length + j).toFixed(2)} ${yAt(v).toFixed(2)}`,
          )
          .join(" ")
      : null;

  // Fill only under the historical line (stop at "now").
  const area = `${line} L ${lastHist[0].toFixed(2)} ${height} L 0 ${height} Z`;
  const gradientId = `spark-${id}`;
  const viewBox = `0 0 ${width} ${height}`;

  const frame = (
    <svg
      className="spark-chart__svg spark-chart__frame"
      viewBox={viewBox}
      preserveAspectRatio="none"
      aria-hidden
    >
      <line
        className="spark-chart__grid"
        x1="0"
        y1={PAD}
        x2={width}
        y2={PAD}
        vectorEffect="non-scaling-stroke"
      />
      <line
        className="spark-chart__grid"
        x1="0"
        y1={height - PAD}
        x2={width}
        y2={height - PAD}
        vectorEffect="non-scaling-stroke"
      />
      {/* "Now" divider where the real data ends and the forecast begins. */}
      {forecastLine && (
        <line
          className="spark-chart__now"
          x1={lastHist[0]}
          y1={PAD}
          x2={lastHist[0]}
          y2={height - PAD}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );

  const chart = (
    <svg
      // Keyed by the series so new data re-runs the draw-in.
      key={`${valuesKey}|${benchKey}|${forecastKey}`}
      className="spark-chart__svg spark-chart__data"
      width="100%"
      height={fill ? "100%" : height}
      viewBox={viewBox}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="spark-chart__stop" stopOpacity={0.22} />
          <stop offset="100%" className="spark-chart__stop" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path className="spark-chart__area" d={area} fill={`url(#${gradientId})`} />
      {benchLine && (
        <path
          className="spark-chart__bench"
          d={benchLine}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {forecastLine && (
        <path
          className="spark-chart__forecast"
          d={forecastLine}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        className="spark-chart__line"
        d={line}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );

  const pulse = <span ref={ballRef} aria-hidden className="spark-chart__pulse" />;
  const tone = positive ? "gain" : "loss";
  const delayVar = { "--spark-delay": `${Math.max(0, delay)}ms` } as CSSProperties;

  if (!showAxes) {
    return (
      // Positioning comes from spark.css's components layer, so a caller's
      // utility (e.g. `absolute inset-0` for a background chart) wins.
      <div
        className={`spark-chart spark-chart__plot ${className ?? ""}`}
        data-tone={tone}
        style={fill ? delayVar : { ...delayVar, height }}
      >
        {frame}
        {chart}
        {pulse}
      </div>
    );
  }

  // Right edge of the axis is the forecast end when projecting, else the last
  // real point.
  const lastTime = forecastClean.length
    ? forecastClean[forecastClean.length - 1].time
    : clean[clean.length - 1].time;
  const spanDays = (lastTime - clean[0].time) / 86_400 || 0;

  return (
    // With `fill`, grow to fill the remaining space in a flex-col parent (so a
    // sibling legend doesn't squeeze the date axis out of a height-capped card):
    // the chart row grows, the SVG (height 100%) follows, and the date axis
    // stays pinned to the bottom.
    <div
      className={`spark-chart spark-axes ${fill ? "spark-axes--fill " : ""}${className ?? ""}`}
      data-tone={tone}
      style={delayVar}
    >
      {/* Y axis: amount range */}
      <div className="spark-axes__y" style={fill ? undefined : { height }}>
        <span className="spark-axes__label">{compactMoney(max)}</span>
        <span className="spark-axes__label">{compactMoney(min)}</span>
      </div>
      <div className="spark-chart__plot" style={fill ? undefined : { height }}>
        {frame}
        {chart}
        {pulse}
      </div>
      {/* X axis: date range */}
      <div className="spark-axes__x">
        <span className="spark-axes__label">{axisDate(clean[0].time, spanDays)}</span>
        <span className="spark-axes__label">{axisDate(lastTime, spanDays)}</span>
      </div>
    </div>
  );
}
