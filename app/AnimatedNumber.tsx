"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
};

/**
 * Counts up to `value` on mount and tweens between subsequent values, so
 * growth feels tangible. Respects prefers-reduced-motion.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 1000,
  className,
}: Props) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || !Number.isFinite(value)) {
      fromRef.current = Number.isFinite(value) ? value : 0;
      setDisplay(fromRef.current);
      return;
    }

    const from = fromRef.current;
    const to = value;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs]);

  // Every hero figure shares the display face + tabular figures so it reads as
  // one confident, non-jittering number.
  return (
    <span className={`font-display tnum ${className ?? ""}`}>
      {format(display)}
    </span>
  );
}
