// DB integrity + state check for the investors collection.
// Usage: npm run status  (needs .env.local with MONGODB_* and ALPACA_* keys)
//
// Verifies every allocation (id, invested, shares, date), reconciles each
// investor's money flow (contributed cash + sale proceeds vs purchases), and
// prints the live portfolio value each investor's page will show, plus the
// inferred cash-flow timeline the value chart and S&P comparison are built on.
// PROBLEMS fail the run (exit 1); WARNINGS are advisory and never fail it.
import { MongoClient } from "mongodb";

const H = {
  "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID,
  "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
};

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const col = client
  .db(process.env.MONGODB_DB)
  .collection(process.env.MONGODB_COLLECTION);
const doc = await col.findOne({ "investors.0": { $exists: true } });

const symbols = [
  ...new Set(doc.investors.flatMap((i) => (i.allocations ?? []).map((a) => a.symbol))),
];
let price = () => null;
if (H["APCA-API-KEY-ID"]) {
  const res = await fetch(
    "https://data.alpaca.markets/v2/stocks/snapshots?symbols=" + symbols.join(","),
    { headers: H },
  );
  const snaps = await res.json();
  price = (s) => snaps[s]?.latestTrade?.p ?? snaps[s]?.dailyBar?.c ?? null;
}

/** "YYYY-MM-DD" (UTC) of a stored date, or null when missing/invalid. */
const dayKey = (value) => {
  if (value == null) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
};
const cents = (n) => Math.round(n * 100) / 100;
const usd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

const warnings = [];

// Split-adjusted daily bars since the first purchase, to sanity-check each
// purchase's implied buy price (invested / shares) against that day's close.
const barsBySymbol = new Map(); // SYMBOL → [{ day, c, h, l }] ascending
if (H["APCA-API-KEY-ID"]) {
  const firstDay = doc.investors
    .flatMap((i) => (i.allocations ?? []).map((a) => dayKey(a.dateInvested)))
    .filter(Boolean)
    .sort()[0];
  const upper = [
    ...new Set(symbols.filter(Boolean).map((s) => String(s).trim().toUpperCase())),
  ];
  let pageToken;
  if (firstDay && upper.length) {
    do {
      const params = new URLSearchParams({
        symbols: upper.join(","),
        timeframe: "1Day",
        adjustment: "split",
        feed: "iex",
        start: `${firstDay}T00:00:00Z`,
        limit: "10000",
        sort: "asc",
      });
      if (pageToken) params.set("page_token", pageToken);
      const res = await fetch(
        `https://data.alpaca.markets/v2/stocks/bars?${params}`,
        { headers: H },
      );
      if (!res.ok) {
        warnings.push(`buy-price check incomplete: Alpaca bars HTTP ${res.status}`);
        break;
      }
      const data = await res.json();
      for (const [sym, list] of Object.entries(data.bars ?? {})) {
        barsBySymbol.set(
          sym,
          (barsBySymbol.get(sym) ?? []).concat(
            list.map((b) => ({ day: b.t.slice(0, 10), c: b.c, h: b.h, l: b.l })),
          ),
        );
      }
      pageToken = data.next_page_token ?? undefined;
    } while (pageToken);
  }
} else {
  warnings.push("buy-price check skipped: no ALPACA keys");
}

// Mirror of inferContributions() in app/api/portfolio/route.ts, on raw DB rows
// (sales need soldAmount here; the route can also price a sale from shares).
// Keep the two in sync. Returns per-day new cash (sums to `contributed`) plus
// the residual that was dated at inception.
const DUST = 1; // the ±$1 rounding tolerance of the money reconciliation
function inferContributions(allocations, contributed) {
  const today = dayKey(Date.now());
  const dayOf = (value) => {
    const key = dayKey(value) ?? today;
    return key > today ? today : key; // money can't arrive in the future
  };
  const tsOf = (value) => {
    const ms = value == null ? NaN : new Date(value).getTime();
    return Number.isFinite(ms) ? ms : Date.now();
  };
  const SALE = 0;
  const PURCHASE = 1;
  const SAME_DAY_SALE = 2; // sold the day it was bought
  const events = [];
  for (const a of allocations) {
    if (!String(a.symbol ?? "").trim()) continue;
    const bought = dayOf(a.dateInvested);
    const invested = Number(a.invested ?? a.amount);
    events.push({
      day: bought,
      order: PURCHASE,
      ts: tsOf(a.dateInvested),
      amount: Number.isFinite(invested) ? Math.max(0, invested) : 0,
    });
    if (a.soldDate && a.soldAmount > 0) {
      const sold = dayOf(a.soldDate);
      events.push({
        day: sold,
        order: sold === bought ? SAME_DAY_SALE : SALE,
        ts: tsOf(a.soldDate),
        amount: Number(a.soldAmount),
      });
    }
  }
  events.sort((x, y) =>
    x.day < y.day ? -1 : x.day > y.day ? 1 : x.order - y.order || x.ts - y.ts,
  );
  const inceptionDay =
    events.filter((e) => e.order === PURCHASE).map((e) => e.day).sort()[0] ?? today;

  let pool = 0;
  const newCash = new Map();
  for (const e of events) {
    if (e.order !== PURCHASE) {
      pool += e.amount;
      continue;
    }
    const fromPool = pool >= DUST ? Math.min(pool, e.amount) : 0;
    pool -= fromPool;
    const fresh = e.amount - fromPool;
    if (fresh >= DUST) newCash.set(e.day, (newCash.get(e.day) ?? 0) + fresh);
  }
  const flows = [...newCash]
    .map(([day, amount]) => ({ day, amount: cents(amount) }))
    .sort((x, y) => (x.day < y.day ? -1 : 1));

  let residual = contributed - flows.reduce((s, f) => s + f.amount, 0);
  const rawResidual = residual;
  const first = flows.find((f) => f.day === inceptionDay);
  // No inception deposit to absorb a shortfall → trim newest-first too.
  if (residual < -DUST || (residual < 0 && !first)) {
    for (let i = flows.length - 1; i >= 0 && residual < 0; i--) {
      if (flows[i].day <= inceptionDay) break;
      const cut = Math.min(flows[i].amount, -residual);
      flows[i].amount = cents(flows[i].amount - cut);
      residual += cut;
    }
  }
  if (first) first.amount = cents(first.amount + residual);
  else flows.unshift({ day: inceptionDay, amount: cents(residual) });
  return { flows: flows.filter((f) => f.amount !== 0), residual: cents(rawResidual) };
}

const problems = [];
const priceChecks = { compared: 0, uncheckable: 0 };
for (const inv of doc.investors) {
  let allocSum = 0;
  let soldProceeds = 0;
  let gain = 0;
  for (const a of inv.allocations ?? []) {
    allocSum += a.invested ?? 0;
    if (!a.id) problems.push(`${inv.name} ${a.symbol}: missing id`);
    if (a.amount != null) problems.push(`${inv.name} ${a.symbol}: legacy amount field`);
    if (!(a.invested > 0)) problems.push(`${inv.name} ${a.symbol}: bad invested ${a.invested}`);
    if (!(a.shares > 0)) problems.push(`${inv.name} ${a.symbol}: bad shares ${a.shares}`);
    if (isNaN(Date.parse(a.dateInvested)))
      problems.push(`${inv.name} ${a.symbol}: bad dateInvested ${a.dateInvested}`);
    if (a.soldDate && isNaN(Date.parse(a.soldDate)))
      problems.push(`${inv.name} ${a.symbol}: bad soldDate ${a.soldDate}`);
    if (a.soldAmount != null) {
      soldProceeds += a.soldAmount;
      gain += a.soldAmount - a.invested;
    } else {
      const p = price(a.symbol);
      if (p) gain += a.shares * p - a.invested;
    }
  }

  const override = inv.originalAmountInvested ?? null;
  const contributed = override ?? allocSum;
  // Cash in + sale proceeds should cover every purchase; a large gap means the
  // contributed override wasn't bumped when new cash came in (the usual way
  // data "gets messed up") or a sale is missing its soldAmount.
  const drift = Math.round((contributed + soldProceeds - allocSum) * 100) / 100;
  const staleOverride = override != null && Math.abs(drift) > 1;
  if (staleOverride)
    problems.push(
      `${inv.name}: contributed(${contributed}) + proceeds(${soldProceeds}) − purchases(${allocSum}) = ${drift} — override likely stale`,
    );

  const value = contributed + gain;
  console.log(
    inv.name.padEnd(8),
    `contributed $${contributed}`.padEnd(18),
    `value $${value.toFixed(2)}`.padEnd(15),
    `(${gain >= 0 ? "+" : ""}${((gain / contributed) * 100).toFixed(1)}%)`.padEnd(9),
    `positions: ${(inv.allocations ?? []).filter((a) => a.soldAmount == null).length} open / ${(inv.allocations ?? []).filter((a) => a.soldAmount != null).length} closed`,
  );

  // ---- Advisory checks (warnings never fail the run) ----
  const allocs = inv.allocations ?? [];
  const sold = allocs.filter((a) => a.soldAmount != null);
  // Uninvested cash = contributed + proceeds − purchases (the drift above).
  if (!staleOverride && Math.abs(drift) >= 1)
    warnings.push(`${inv.name}: ${usd(drift)} uninvested cash (contributed + sale proceeds − purchases)`);
  if (override == null && sold.length)
    warnings.push(
      `${inv.name}: contributed is the auto-sum, but ${sold.length} position(s) were sold for ${usd(soldProceeds)} — any proceeds reinvested are counted twice; set "total invested" to the real cash put in`,
    );

  // Implied buy price (invested / shares) vs that day's close — the next
  // trading day's for weekends/holidays. null when it can't be checked.
  const buyPrice = (a) => {
    const day = dayKey(a.dateInvested);
    if (!day || !(a.invested > 0) || !(a.shares > 0)) return null;
    const bar = barsBySymbol
      .get(String(a.symbol).trim().toUpperCase())
      ?.find((b) => b.day >= day);
    if (!bar) return null;
    const implied = a.invested / a.shares;
    return { day, bar, implied, off: implied / bar.c - 1 };
  };
  const PRICE_TOLERANCE = 0.05;

  // Same symbol, exactly the same share count, bought on different days.
  const bySymbolShares = new Map();
  for (const a of allocs) {
    if (!(a.shares > 0)) continue;
    const key = `${String(a.symbol).trim().toUpperCase()}|${a.shares}`;
    bySymbolShares.set(key, [...(bySymbolShares.get(key) ?? []), a]);
  }
  for (const [key, group] of bySymbolShares) {
    const days = [...new Set(group.map((a) => dayKey(a.dateInvested) ?? "?"))].sort();
    if (days.length < 2) continue;
    const [sym, shares] = key.split("|");
    const sameInvested = new Set(group.map((a) => a.invested)).size === 1;
    // Each buy's implied price vs its day's close: one buy noticeably off
    // points at pasted shares; all close to 0% suggests a legit repeat buy.
    const offs = group
      .map((a) => {
        const check = buyPrice(a);
        if (!check) return `${dayKey(a.dateInvested) ?? "?"} n/a`;
        return `${check.day} ${check.off >= 0 ? "+" : ""}${(check.off * 100).toFixed(1)}%`;
      })
      .join(", ");
    warnings.push(
      `${inv.name} ${sym}: buys on ${days.join(", ")} have identical shares (${shares})${sameInvested ? " and invested" : ""} — copy-pasted shares${sameInvested ? " or a duplicate entry" : ""}? (implied price vs that day's close: ${offs})`,
    );
  }

  for (const a of allocs) {
    const check = buyPrice(a);
    if (!check) {
      priceChecks.uncheckable++;
      continue;
    }
    priceChecks.compared++;
    if (Math.abs(check.off) <= PRICE_TOLERANCE) continue;
    const { day, bar, implied, off } = check;
    const inRange = implied >= bar.l && implied <= bar.h;
    warnings.push(
      `${inv.name} ${a.symbol} bought ${day}: implied price ${usd(implied)} (invested/shares) is ${off > 0 ? "+" : ""}${(off * 100).toFixed(1)}% vs the ${bar.day === day ? "" : `${bar.day} `}close ${usd(bar.c)}${inRange ? " (inside that day's range)" : `, outside that day's ${usd(bar.l)}–${usd(bar.h)} range`} — typo in invested or shares?`,
    );
  }

  // Cash-flow timeline (terminal only).
  const { flows, residual } = inferContributions(allocs, contributed);
  const later = flows.slice(1);
  console.log(
    "".padEnd(8),
    `timeline: ${flows.length ? `first ${usd(flows[0].amount)} on ${flows[0].day}` : "no contributions"}` +
      ` · ${later.length} later deposit${later.length === 1 ? "" : "s"}` +
      (later.length
        ? ` (+${usd(later.reduce((s, f) => s + f.amount, 0))}, last ${later.at(-1).day})`
        : "") +
      ` · uninvested cash ${usd(drift)}` +
      (Math.abs(residual) >= 1 ? ` · ${usd(residual)} unexplained by purchases/sales` : ""),
  );
}

console.log(
  `\nBuy-price check: ${priceChecks.compared} purchase(s) compared with that day's close (±5%)` +
    (priceChecks.uncheckable ? `, ${priceChecks.uncheckable} without price data` : ""),
);
if (warnings.length) console.log("\nWARNINGS (advisory, not failing):\n" + warnings.join("\n"));
console.log(
  problems.length ? "\nPROBLEMS:\n" + problems.join("\n") : "\nAll integrity checks passed.",
);
await client.close();
process.exit(problems.length ? 1 : 0);
