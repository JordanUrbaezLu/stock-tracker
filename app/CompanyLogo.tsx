"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { fmpLogoUrl } from "@/lib/alpaca";
import { useSound } from "./SoundContext";

type Props = {
  symbol: string;
  name?: string | null;
  logo?: string | null;
  size?: number;
  /** Stagger entrance animation (ms). */
  delay?: number;
  /** Client-navigate to lookup with this symbol pre-filled and searched. */
  linkToLookup?: boolean;
};

/**
 * Animated, consistently-framed company mark. Uses the real brand logo when
 * available (Finnhub profile), and falls back to a gradient monogram so every
 * holding looks cohesive even when no logo exists (e.g. ETFs like SPY).
 */
export function CompanyLogo({
  symbol,
  name,
  logo,
  size = 40,
  delay = 0,
  linkToLookup = false,
}: Props) {
  const router = useRouter();
  const { play } = useSound();
  // Try the provided logo (Finnhub) first, then FMP's CDN, then a monogram.
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const candidates = [logo, fmpLogoUrl(symbol)].filter(
    (u): u is string => Boolean(u),
  );
  const src = candidates.find((u) => !failed[u]);
  const showImg = Boolean(src);

  const inner = (
    <span className="company-logo__bob" style={{ animationDelay: `${-delay}ms` }}>
      <span className="company-logo__ring" aria-hidden />
      {showImg ? (
        <span className="company-logo__inner company-logo__inner--img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src as string}
            alt={`${name || symbol} logo`}
            className="company-logo__img"
            loading="lazy"
            onError={() =>
              setFailed((prev) => ({ ...prev, [src as string]: true }))
            }
          />
        </span>
      ) : (
        <span
          className="company-logo__inner company-logo__mono"
          style={{ fontSize: size * 0.3 }}
          aria-label={`${name || symbol} logo`}
        >
          {symbol.slice(0, 3)}
        </span>
      )}
    </span>
  );

  // Keep the rounded-SQUARE look consistent across sizes. The CSS sets a fixed
  // 0.8rem radius, which on small marks (e.g. the 26px top-holdings logos)
  // approaches half the box and renders as a circle. Scaling the radius with
  // size keeps every logo a rounded square like the larger holding cards.
  const style = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.26),
    animationDelay: `${delay}ms`,
  };

  if (!linkToLookup) {
    return (
      <span className="company-logo" style={style}>
        {inner}
      </span>
    );
  }

  const goLookup = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("nav");
    router.push(`/lookup?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
  };

  return (
    <button
      type="button"
      onClick={goLookup}
      className="company-logo"
      style={style}
      aria-label={`Look up ${symbol}`}
    >
      {inner}
    </button>
  );
}
