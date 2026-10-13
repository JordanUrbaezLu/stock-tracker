import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Club Arena board palette (DESIGN.md §1) — literal hex because the image
// renders outside the page's CSS.
const BOARD = "#141219";
const TILE_TOP = "#2E2C36";
const TILE = "#26242D";
const SEAM = "#08070B";
const AMBER = "#FFB547";

/**
 * Home-screen icon: the BrandMark at app-icon scale — one split-flap tile on
 * the board, carrying the amber ▲ split by the flap seam. Full-bleed square;
 * iOS applies its own corner mask.
 */
export default function AppleIcon() {
  // Rounded-corner triangle (stroke-linejoin round, same color as the fill).
  const triangle = "M90 54 L130.5 123 H49.5 Z";
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", background: BOARD }}>
        <svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1A1821" />
              <stop offset="1" stopColor="#0F0E14" />
            </linearGradient>
            <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3A3743" />
              <stop offset="1" stopColor={TILE_TOP} />
            </linearGradient>
            <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={TILE} />
              <stop offset="1" stopColor="#1E1C25" />
            </linearGradient>
            <clipPath id="tile">
              <rect x="28" y="28" width="124" height="124" rx="24" />
            </clipPath>
            <clipPath id="upper">
              <rect x="0" y="0" width="180" height="90" />
            </clipPath>
            <clipPath id="lower">
              <rect x="0" y="90" width="180" height="90" />
            </clipPath>
            {/* Hinge notches cut out of both tile edges at the seam. */}
            <mask id="notches">
              <rect width="180" height="180" fill="#FFFFFF" />
              <circle cx="28" cy="90" r="9" fill="#000000" />
              <circle cx="152" cy="90" r="9" fill="#000000" />
            </mask>
          </defs>

          <rect width="180" height="180" fill="url(#bg)" />
          <g mask="url(#notches)">
            {/* Soft contact shadow under the tile. */}
            <rect x="30" y="34" width="120" height="124" rx="24" fill="#000000" opacity="0.45" />
            <g clipPath="url(#tile)">
              <rect x="28" y="28" width="124" height="62" fill="url(#top)" />
              <rect x="28" y="90" width="124" height="62" fill="url(#bottom)" />
              <g clipPath="url(#upper)">
                <path d={triangle} fill={AMBER} stroke={AMBER} strokeWidth="9" strokeLinejoin="round" />
              </g>
              <g clipPath="url(#lower)">
                <path d={triangle} fill="#EFA53E" stroke="#EFA53E" strokeWidth="9" strokeLinejoin="round" />
              </g>
              {/* The flap seam and a faint lit edge under it. */}
              <rect x="28" y="88" width="124" height="4" fill={SEAM} />
              <rect x="28" y="92" width="124" height="1" fill="#FFFFFF" opacity="0.05" />
            </g>
            <rect
              x="28.5"
              y="28.5"
              width="123"
              height="123"
              rx="23.5"
              fill="none"
              stroke="#F6F1E6"
              strokeOpacity="0.08"
            />
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
