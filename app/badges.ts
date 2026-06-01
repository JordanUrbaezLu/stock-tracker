/**
 * Achievement badges — a single declarative CATALOG, each entry deciding from
 * the live API data (holdings/returns + standing in the group) whether it's
 * earned and what it says. Fully dynamic: nothing is stored, everything is
 * recomputed from the portfolio payload, so the same data always yields the
 * same badges. `getBadges` returns the whole catalog with earned status (for
 * the achievements shelf); `computeBadges` returns just the earned ones (for
 * the compact card strip).
 */

export type BadgeTone = "gold" | "green" | "blue" | "purple" | "rose";

export type Badge = {
  id: string;
  emoji: string;
  label: string;
  /** Dynamic reason when earned, or the "how to earn it" hint when locked. */
  description: string;
  tone: BadgeTone;
};

export type BadgeStatus = Badge & { earned: boolean };

type BadgeHolding = {
  symbol: string;
  changePercent?: number | null;
  realizedChange?: number | null;
  status?: "open" | "closed";
  dateInvested?: string | null;
};

/** Structural shape — compatible with the home + detail page investor types. */
export type BadgeInvestor = {
  name: string;
  slug: string;
  currentValue: number;
  changePercent: number;
  alphaSpy?: number | null;
  holdings: BadgeHolding[];
};

const TONE_CLASSES: Record<BadgeTone, string> = {
  gold: "from-amber-400/20 to-yellow-500/10 text-amber-200 ring-amber-400/30",
  green: "from-emerald-400/20 to-teal-500/10 text-emerald-200 ring-emerald-400/30",
  blue: "from-sky-400/20 to-blue-500/10 text-sky-200 ring-sky-400/30",
  purple: "from-fuchsia-400/20 to-purple-500/10 text-fuchsia-200 ring-fuchsia-400/30",
  rose: "from-rose-400/20 to-pink-500/10 text-rose-200 ring-rose-400/30",
};

/** Tailwind classes (use with `bg-linear-to-br` + `ring-1`) for a badge tone. */
export function badgeToneClasses(tone: BadgeTone): string {
  return TONE_CLASSES[tone];
}

function earliestInvestedTs(inv: BadgeInvestor): number {
  const times = inv.holdings
    .map((h) => (h.dateInvested ? new Date(h.dateInvested).getTime() : NaN))
    .filter((n) => Number.isFinite(n));
  return times.length ? Math.min(...times) : Infinity;
}

type BadgeContext = {
  open: BadgeHolding[];
  closed: BadgeHolding[];
  bestPct: number;
  worstOpenPct: number;
  distinctOpen: number;
  alpha: number;
  changePercent: number;
  isTopValue: boolean;
  isTopReturn: boolean;
  isFirstIn: boolean;
};

type BadgeDef = {
  id: string;
  emoji: string;
  label: string;
  tone: BadgeTone;
  /** Returns the dynamic description if earned, else null (locked). */
  earn: (c: BadgeContext) => string | null;
  /** Shown when locked — how to earn it. */
  locked: string;
};

/** The full list of every badge, ordered by prestige (rarest first). */
export const BADGE_CATALOG: BadgeDef[] = [
  {
    id: "most-valuable",
    emoji: "🏆",
    label: "Most Valuable",
    tone: "gold",
    earn: (c) => (c.isTopValue ? "Biggest portfolio in the group" : null),
    locked: "Hold the biggest portfolio in the group",
  },
  {
    id: "top-dog",
    emoji: "🥇",
    label: "Top Dog",
    tone: "gold",
    earn: (c) => (c.isTopReturn ? "Best total return in the group" : null),
    locked: "Post the best total return in the group",
  },
  {
    id: "moonshot",
    emoji: "🚀",
    label: "Moonshot",
    tone: "purple",
    earn: (c) => (c.bestPct >= 50 ? `A pick is up +${c.bestPct.toFixed(0)}%` : null),
    locked: "Own a pick that's up 50% or more",
  },
  {
    id: "market-slayer",
    emoji: "🐉",
    label: "Market Slayer",
    tone: "green",
    earn: (c) =>
      c.alpha > 0 ? `Beating the S&P 500 by ${c.alpha.toFixed(1)}%` : null,
    locked: "Beat the S&P 500's return",
  },
  {
    id: "profit-taker",
    emoji: "💰",
    label: "Profit Taker",
    tone: "gold",
    earn: (c) =>
      c.closed.some((h) => (h.realizedChange ?? 0) > 0)
        ? "Sold a position for a realized gain"
        : null,
    locked: "Sell a position for a realized gain",
  },
  {
    id: "og",
    emoji: "🌱",
    label: "OG Investor",
    tone: "green",
    earn: (c) => (c.isFirstIn ? "First one in the game" : null),
    locked: "Be one of the first to join",
  },
  {
    id: "diversified",
    emoji: "🎯",
    label: "Diversified",
    tone: "blue",
    earn: (c) =>
      c.distinctOpen >= 4 ? `Holding ${c.distinctOpen} different stocks` : null,
    locked: "Hold 4 or more different stocks",
  },
  {
    id: "in-the-green",
    emoji: "📈",
    label: "In the Green",
    tone: "green",
    earn: (c) =>
      c.changePercent > 0 ? `Portfolio up +${c.changePercent.toFixed(1)}%` : null,
    locked: "Get your total return into the green",
  },
  {
    id: "diamond-hands",
    emoji: "💎",
    label: "Diamond Hands",
    tone: "blue",
    earn: (c) =>
      c.worstOpenPct <= -10 && c.worstOpenPct > -25
        ? "Holding through a double-digit dip"
        : null,
    locked: "Hold a position through a 10%+ dip",
  },
  {
    id: "bag-holder",
    emoji: "🐻",
    label: "Bag Holder",
    tone: "rose",
    earn: (c) =>
      c.worstOpenPct <= -25 ? "Riding out a rough position — respect" : null,
    locked: "Hold a position that's down 25% or more",
  },
];

function buildContext(inv: BadgeInvestor, all: BadgeInvestor[]): BadgeContext {
  const open = inv.holdings.filter((h) => h.status !== "closed");
  const closed = inv.holdings.filter((h) => h.status === "closed");
  const hasRivals = all.length > 1;
  const topByValue = [...all].sort((a, b) => b.currentValue - a.currentValue)[0];
  const topByReturn = [...all].sort((a, b) => b.changePercent - a.changePercent)[0];
  const myStart = earliestInvestedTs(inv);
  return {
    open,
    closed,
    bestPct: inv.holdings.reduce(
      (m, h) => Math.max(m, h.changePercent ?? -Infinity),
      -Infinity,
    ),
    worstOpenPct: open.reduce(
      (m, h) => Math.min(m, h.changePercent ?? Infinity),
      Infinity,
    ),
    distinctOpen: new Set(open.map((h) => h.symbol)).size,
    alpha: inv.alphaSpy ?? 0,
    changePercent: inv.changePercent,
    isTopValue: hasRivals && topByValue?.slug === inv.slug,
    isTopReturn: hasRivals && topByReturn?.slug === inv.slug,
    isFirstIn:
      hasRivals &&
      Number.isFinite(myStart) &&
      all.every((o) => o.slug === inv.slug || earliestInvestedTs(o) >= myStart),
  };
}

/** Every badge with its earned status (description is dynamic if earned, else
 *  the "how to earn it" hint). Use for the achievements shelf. */
export function getBadges(
  inv: BadgeInvestor,
  all: BadgeInvestor[],
): BadgeStatus[] {
  const c = buildContext(inv, all);
  return BADGE_CATALOG.map((def) => {
    const earnedDescription = def.earn(c);
    return {
      id: def.id,
      emoji: def.emoji,
      label: def.label,
      tone: def.tone,
      earned: earnedDescription !== null,
      description: earnedDescription ?? def.locked,
    };
  });
}

/** Just the earned badges, in catalog order (e.g. for the compact card strip). */
export function computeBadges(inv: BadgeInvestor, all: BadgeInvestor[]): Badge[] {
  return getBadges(inv, all).filter((b) => b.earned);
}
