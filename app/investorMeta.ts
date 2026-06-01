/** How recently an investor must have started to still count as "new". */
const NEW_WINDOW_DAYS = 30;

/**
 * True when an investor joined within the last NEW_WINDOW_DAYS (by their
 * earliest holding's purchase date) — used to flag freshly-added investors with
 * a "NEW" badge. Recency-based so it auto-applies to future newcomers and fades
 * on its own; client-only (uses Date.now), which is fine since investor views
 * render after a client-side fetch.
 */
export function isNewInvestor(
  holdings: { dateInvested?: string | null }[] | undefined,
): boolean {
  const times = (holdings ?? [])
    .map((h) => (h.dateInvested ? new Date(h.dateInvested).getTime() : NaN))
    .filter((n) => Number.isFinite(n));
  if (times.length === 0) return false;
  const earliest = Math.min(...times);
  return (Date.now() - earliest) / 86_400_000 <= NEW_WINDOW_DAYS;
}

/**
 * Short "joined" label from the earliest holding's purchase date, e.g.
 * "Nov 2025" — for a subtle "Investor since …" on the detail page. Null when no
 * dated holdings exist.
 */
export function investorSince(
  holdings: { dateInvested?: string | null }[] | undefined,
): string | null {
  const times = (holdings ?? [])
    .map((h) => (h.dateInvested ? new Date(h.dateInvested).getTime() : NaN))
    .filter((n) => Number.isFinite(n));
  if (times.length === 0) return null;
  // Format in UTC — purchase dates are stored as UTC midnight, so local
  // formatting would shift e.g. "2026-06-01" back to May in western timezones.
  return new Date(Math.min(...times)).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
