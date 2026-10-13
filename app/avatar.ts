/** Up to two initials from a name, e.g. "Jordan Urbaez" → "JU". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstNameKey(name: string) {
  return name.trim().toLowerCase().split(/\s+/)[0] ?? "";
}

function hashOf(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// Named jerseys keep each founding investor's established color (matched by
// first name). Everyone else hashes into a palette that deliberately avoids
// those five hues, so a newcomer never wears someone else's color. All take
// white initials at ≥3.6:1.
const JERSEY_OVERRIDES: Record<string, string> = {
  alexa: "#D9468A", // pink
  lucas: "#138A5B", // green
  brandon: "#2A6FDB", // blue
  jordan: "#D33A3F", // red
  aj: "#D9620B", // orange
};

const JERSEY_COLORS = [
  "#6E55E8", // violet
  "#0E8486", // teal
  "#A87700", // gold
  "#4855C9", // indigo
  "#A63BAE", // magenta
  "#1680B8", // sky
  "#4F8516", // lime
];

/** Flat "jersey" color for an investor — stable across every screen. Hashes
 *  the first name (like the overrides) so "Nicky" and "nicky" always match. */
export function jerseyColor(name: string): string {
  const first = firstNameKey(name);
  return (
    JERSEY_OVERRIDES[first] ?? JERSEY_COLORS[hashOf(first) % JERSEY_COLORS.length]
  );
}

/** WCAG relative luminance (0–1) of a #rrggbb color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The face of a player card: the jersey, deepened only as far as its small
 *  white text needs. Several jerseys put white at 3.7–4.5:1 — fine for big
 *  initials, not for the card's 13–15px lines. `contrast` is the white-text
 *  ratio to reach (default 4.9: the 4.5 bar plus headroom for the card's
 *  dimmed pill captions); a card under a metal foil asks for more, because
 *  the sheen lightens the face again. Scaling in linear light keeps the hue
 *  and saturation, so the jersey stays itself (already-deep ones are left
 *  alone). A CSS color string — use it in style props. */
export function jerseyCard(name: string, contrast = 4.9): string {
  const color = jerseyColor(name);
  // White on a color of luminance L is 1.05 / (L + 0.05) : 1.
  const keep = (1.05 / contrast - 0.05) / luminance(color);
  return keep >= 1
    ? color
    : `color-mix(in srgb-linear, ${color} ${(keep * 100).toFixed(1)}%, #000)`;
}

/** The solid lip under a jersey-colored object (player card, podium step):
 *  the same hue, darker, e.g. style={{ boxShadow: "0 4px 0 " + jerseyLip(name) }}.
 *  A CSS color string (color-mix), so use it in style props, not classes. */
export function jerseyLip(name: string): string {
  return `color-mix(in oklab, ${jerseyColor(name)} 68%, #000)`;
}
