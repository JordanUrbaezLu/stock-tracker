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

const FMP_HOST = "financialmodelingprep.com";

/**
 * Classify a logo by sampling a downscaled copy (FMP only — it sends CORS, so
 * the canvas read won't taint):
 *  - "empty": basically no opaque content (a truly missing logo) → use monogram.
 *  - "light": a light/white logo on transparency (e.g. QQQ) → it's invisible on
 *     the default white chip, so render it on a dark backdrop instead.
 *  - "dark":  everything else (dark/colored marks, or a logo on its own white
 *     tile like AAPL) → the white chip is fine.
 * Any failure falls back to "dark" so we never hide a real logo.
 */
function analyzeLogo(img: HTMLImageElement): "empty" | "light" | "dark" {
  try {
    const N = 32;
    const canvas = document.createElement("canvas");
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "dark";
    ctx.drawImage(img, 0, 0, N, N);
    const { data } = ctx.getImageData(0, 0, N, N);
    const total = N * N;
    let transparent = 0;
    let opaque = 0;
    let lightOpaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) {
        transparent += 1;
        continue;
      }
      opaque += 1;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum > 200) lightOpaque += 1;
    }
    if (opaque < total * 0.02) return "empty";
    // A light mark sitting on transparency would be invisible on white.
    if (transparent > total * 0.1 && lightOpaque / opaque > 0.7) return "light";
    return "dark";
  } catch {
    return "dark";
  }
}

/** Monogram font size so the full ticker fits the chip across lengths. */
function monoFontSize(symbol: string, size: number): number {
  const len = symbol.length;
  const ratio = len <= 2 ? 0.42 : len === 3 ? 0.33 : len === 4 ? 0.27 : 0.22;
  return Math.round(size * ratio);
}

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
  // Logos that are light/white on transparency need a dark backdrop to show.
  const [lightLogos, setLightLogos] = useState<Record<string, boolean>>({});
  const candidates = [logo, fmpLogoUrl(symbol)].filter(
    (u): u is string => Boolean(u),
  );
  const src = candidates.find((u) => !failed[u]);
  const showImg = Boolean(src);
  const onDark = src ? lightLogos[src] : false;

  const inner = (
    <span className="company-logo__bob" style={{ animationDelay: `${-delay}ms` }}>
      <span className="company-logo__ring" aria-hidden />
      {showImg ? (
        <span
          className="company-logo__inner company-logo__inner--img"
          style={onDark ? { background: "#0b1224" } : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src as string}
            alt={`${name || symbol} logo`}
            className="company-logo__img"
            loading="lazy"
            crossOrigin={src?.includes(FMP_HOST) ? "anonymous" : undefined}
            onError={() =>
              setFailed((prev) => ({ ...prev, [src as string]: true }))
            }
            onLoad={(e) => {
              // FMP logos are CORS-readable, so classify them: a truly empty
              // image falls through to the monogram, while a light/white logo
              // (e.g. QQQ) gets a dark backdrop so it's actually visible.
              if (!src?.includes(FMP_HOST)) return;
              const tone = analyzeLogo(e.currentTarget);
              if (tone === "empty") {
                setFailed((prev) => ({ ...prev, [src]: true }));
              } else if (tone === "light") {
                setLightLogos((prev) => ({ ...prev, [src]: true }));
              }
            }}
          />
        </span>
      ) : (
        <span
          className="company-logo__inner company-logo__mono"
          style={{ fontSize: monoFontSize(symbol, size) }}
          aria-label={`${name || symbol} logo`}
        >
          {symbol.toUpperCase()}
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
