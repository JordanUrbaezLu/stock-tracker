"use client";

import { useState } from "react";

type Props = {
  symbol: string;
  name?: string | null;
  logo?: string | null;
  size?: number;
  /** Stagger entrance animation (ms). */
  delay?: number;
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
}: Props) {
  const [errored, setErrored] = useState(false);
  const showImg = Boolean(logo) && !errored;

  return (
    <span
      className="company-logo"
      style={{ width: size, height: size, animationDelay: `${delay}ms` }}
    >
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
    </span>
  );
}
