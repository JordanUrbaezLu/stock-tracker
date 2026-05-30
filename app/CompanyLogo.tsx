"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

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
  const [errored, setErrored] = useState(false);
  const showImg = Boolean(logo) && !errored;

  const inner = (
    <span className="company-logo__bob" style={{ animationDelay: `${-delay}ms` }}>
      <span className="company-logo__ring" aria-hidden />
      {showImg ? (
        <span className="company-logo__inner company-logo__inner--img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo as string}
            alt={`${name || symbol} logo`}
            className="company-logo__img"
            loading="lazy"
            onError={() => setErrored(true)}
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

  const style = { width: size, height: size, animationDelay: `${delay}ms` };

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
