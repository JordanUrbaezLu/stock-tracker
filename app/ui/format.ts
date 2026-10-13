/**
 * Shared display formatting. One spelling of every number in the app: real
 * minus signs (−, U+2212), explicit "+" on gains, "—" for missing values.
 */

export const MINUS = "−";

const usd = (fractionDigits: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

const USD2 = usd(2);

function isMissing(value: number | null | undefined): value is null | undefined {
  return value == null || Number.isNaN(value);
}

/** "$1,234.56" · "−$5.67" · "—" */
export function formatCurrency(value: number | null | undefined): string {
  if (isMissing(value)) return "—";
  const s = USD2.format(Math.abs(value));
  return value < 0 && Math.abs(value) >= 0.005 ? `${MINUS}${s}` : s;
}

/** Always signed: "+$12.34" · "−$5.67" · "$0.00" */
export function formatSignedCurrency(value: number | null | undefined): string {
  if (isMissing(value)) return "—";
  if (Math.abs(value) < 0.005) return USD2.format(0);
  return `${value > 0 ? "+" : MINUS}${USD2.format(Math.abs(value))}`;
}

/** Signed percent: "+5.67%" · "−2.50%" · "0.00%" */
export function formatPercent(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (isMissing(value)) return "—";
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return `${(0).toFixed(decimals)}%`;
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded).toFixed(decimals)}%`;
}

/** Unsigned magnitude percent for copy like "3.1% ahead of the S&P 500". */
export function formatPercentAbs(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (isMissing(value)) return "—";
  return `${Math.abs(value).toFixed(decimals)}%`;
}

/** Axis-friendly money: "$1.2k" · "$345" */
export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? MINUS : "";
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toLocaleString("en-US", {
      maximumFractionDigits: 1,
    })}k`;
  }
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export type Tone = "gain" | "loss" | "flat";

/** Direction of a change. Values within ±epsilon read as flat. */
export function toneOf(value: number | null | undefined, epsilon = 0): Tone {
  if (isMissing(value) || Math.abs(value) <= epsilon) return "flat";
  return value > 0 ? "gain" : "loss";
}

/** Text color utility for a change. */
export function toneText(value: number | null | undefined, epsilon = 0): string {
  const t = toneOf(value, epsilon);
  return t === "gain" ? "text-gain" : t === "loss" ? "text-loss" : "text-muted";
}

/** Soft pill colors (background + text) for a change. */
export function toneSoft(value: number | null | undefined, epsilon = 0): string {
  const t = toneOf(value, epsilon);
  return t === "gain"
    ? "bg-gain-soft text-gain"
    : t === "loss"
      ? "bg-loss-soft text-loss"
      : "bg-surface-2 text-muted";
}

/** "Gain" or "Loss" — the label flips with the sign. */
export function gainLabel(value: number | null | undefined): "Gain" | "Loss" {
  return !isMissing(value) && value < 0 ? "Loss" : "Gain";
}

/**
 * Calendar date for stored ISO dates. Purchase/sale dates are saved as UTC
 * midnight, so format in UTC or western time zones show the previous day.
 */
export function formatDate(
  iso: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
