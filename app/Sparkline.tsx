"use client";

import { useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";
import { useSound } from "./SoundContext";

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
};

const PAD = 4;

function compactMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) {
    return `$${(n / 1000).toLocaleString("en-US", {
      maximumFractionDigits: 1,
    })}k`;
  }
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

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
 * as HTML so they never distort.
 *
 * An EKG-style pulse — a round glowing ball — sweeps along the line every few
 * seconds. It's a positioned HTML element animated through the real data points
 * (via the Web Animations API), so it stays a perfect circle regardless of the
 * SVG's non-uniform stretch, and always reaches the final point.
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
}: Props) {
  const id = useId();
  const ballRef = useRef<HTMLSpanElement>(null);
  const { play } = useSound();
  const clean = (points ?? []).filter((p) => Number.isFinite(p.value));
  const benchClean = (benchmark ?? []).filter((p) => Number.isFinite(p.value));

  const values = clean.map((p) => p.value);
  const benchValues = benchClean.map((p) => p.value);
  const valuesKey = values.join(",");

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

    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const rng = mx - mn || 1;
    const usable = height - PAD * 2;
    const duration = 5094; // ~5.1s per pulse (spaced out by +1.5s)
    const sweep = 0.4; // ~1s of travel, then it rests at the tip and fades
    const fadeEnd = 0.54;

    const frames: Keyframe[] = vals.map((v, i) => {
      const x = (i / (n - 1)) * 100;
      const y = PAD + (1 - (v - mn) / rng) * usable;
      return {
        offset: (i / (n - 1)) * sweep,
        left: `${x}%`,
        top: `${(y / height) * 100}%`,
        opacity: 1,
      };
    });
    frames[0] = { ...frames[0], opacity: 0 };

    // Hold the ball on the final point as it fades. Pinning left/top here is
    // essential: otherwise the browser fills the missing values from the base
    // style (left/top: 0) and the ball drifts backward — the "boomerang".
    const lastY = PAD + (1 - (vals[n - 1] - mn) / rng) * usable;
    const lastLeft = "100%";
    const lastTop = `${(lastY / height) * 100}%`;
    frames.push({ offset: fadeEnd, left: lastLeft, top: lastTop, opacity: 0 });
    frames.push({ offset: 1, left: lastLeft, top: lastTop, opacity: 0 });

    const anim = el.animate(frames, {
      duration,
      iterations: Infinity,
      easing: "linear",
    });

    // A whisper tick each time the pulse reaches the tip of the line, synced to
    // the sweep so the sound matches the motion. Muted/locked audio is a no-op.
    let tickTimer: number | undefined;
    const startTick = window.setTimeout(() => {
      play("pulse");
      tickTimer = window.setInterval(() => play("pulse"), duration);
    }, sweep * duration);

    return () => {
      anim.cancel();
      window.clearTimeout(startTick);
      if (tickTimer) window.clearInterval(tickTimer);
    };
  }, [valuesKey, height, play]);

  if (clean.length < 2) return null;

  // Scale across both series so the benchmark overlay shares the y-axis.
  const allValues = benchValues.length ? values.concat(benchValues) : values;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const width = 100;
  const step = width / (clean.length - 1);
  const usable = height - PAD * 2;

  const toPath = (vals: number[]) =>
    vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * width;
        const y = PAD + (1 - (v - min) / range) * usable;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

  const coords = values.map((v, i) => {
    const x = i * step;
    const y = PAD + (1 - (v - min) / range) * usable;
    return [x, y] as const;
  });

  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const benchLine = benchValues.length >= 2 ? toPath(benchValues) : null;

  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const stroke = positive ? "#34d399" : "#fb7185";
  const fillTop = positive ? "rgba(52,211,153,0.28)" : "rgba(251,113,133,0.28)";

  const chart = (
    <svg
      className="block w-full"
      width="100%"
      height={fill ? "100%" : height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop} />
          <stop offset="100%" stopColor="rgba(8,11,26,0)" />
        </linearGradient>
      </defs>
      {/* Faint top/bottom gridlines */}
      <line
        x1="0"
        y1={PAD}
        x2={width}
        y2={PAD}
        stroke="rgba(148,163,184,0.14)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="0"
        y1={height - PAD}
        x2={width}
        y2={height - PAD}
        stroke="rgba(148,163,184,0.14)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <path d={area} fill={`url(#spark-${id})`} stroke="none" />
      {benchLine && (
        <path
          d={benchLine}
          fill="none"
          stroke="rgba(148,163,184,0.65)"
          strokeWidth={1.25}
          strokeDasharray="3 3"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        className="spark-line"
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );

  const pulse = (
    <span
      ref={ballRef}
      aria-hidden
      className="spark-pulse"
      style={{ "--c": stroke } as CSSProperties}
    />
  );

  if (!showAxes) {
    return (
      <div
        className={`relative ${className ?? ""}`}
        style={fill ? undefined : { height }}
      >
        {chart}
        {pulse}
      </div>
    );
  }

  const spanDays =
    (clean[clean.length - 1].time - clean[0].time) / 86_400 || 0;

  return (
    // With `fill`, stretch to the parent's height: the chart row grows and the
    // SVG (height 100%) follows, while the date axis stays pinned to the bottom.
    <div className={`${fill ? "flex h-full flex-col " : ""}${className ?? ""}`}>
      <div className={fill ? "flex min-h-0 flex-1" : "flex"}>
        {/* Y axis: amount range */}
        <div
          className="flex flex-col justify-between pr-1.5 text-right text-[9px] font-medium tabular-nums text-slate-500"
          style={fill ? undefined : { height }}
        >
          <span>{compactMoney(max)}</span>
          <span>{compactMoney(min)}</span>
        </div>
        <div className="relative flex-1" style={fill ? undefined : { height }}>
          {chart}
          {pulse}
        </div>
      </div>
      {/* X axis: date range */}
      <div className="mt-1 flex justify-between pl-9 text-[9px] font-medium text-slate-500">
        <span>{axisDate(clean[0].time, spanDays)}</span>
        <span>{axisDate(clean[clean.length - 1].time, spanDays)}</span>
      </div>
    </div>
  );
}
