// DB integrity + state check for the investors collection.
// Usage: npm run status  (needs .env.local with MONGODB_* and ALPACA_* keys)
//
// Verifies every allocation (id, invested, shares, date), reconciles each
// investor's money flow (contributed cash + sale proceeds vs purchases), and
// prints the live portfolio value each investor's page will show.
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

const problems = [];
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
  if (override != null && Math.abs(drift) > 1)
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
}

console.log(
  problems.length ? "\nPROBLEMS:\n" + problems.join("\n") : "\nAll integrity checks passed.",
);
await client.close();
process.exit(problems.length ? 1 : 0);
