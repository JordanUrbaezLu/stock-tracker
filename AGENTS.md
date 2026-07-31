# stock-tracker

Family stock-portfolio tracker (Next.js 16 + MongoDB + Alpaca market data),
"Aurora Terminal" design language. Investors: Jordan, Alexa, Brandon, Lucas,
AJ, Nicky, CJ.

## Commands

- `npm run dev` — dev server
- `npm run status` — DB integrity + live values check ([scripts/db-status.mjs](scripts/db-status.mjs)).
  Run this FIRST when anything about investor data is in question; green means
  the data lines up, don't re-verify by hand.
- `npm run lint` / `npm run build`

## Code map

- `app/api/portfolio/route.ts` — the core: loads investors from Mongo, prices
  via Alpaca, computes holdings/gains/history/SPY benchmark per investor
- `app/api/admin/**` — admin CRUD (cookie-auth via daily `admin_auth_<date>`
  cookie); `utils.ts` has the DB doc shape (`DbInvestor`, `DbAllocation`)
- `app/investor/[slug]` — investor detail page; `app/admin` — admin UI
- `lib/alpaca.ts` — Alpaca data API (env `ALPACA_KEY_ID`/`ALPACA_SECRET_KEY`);
  `lib/mongodb.ts` — client (env `MONGODB_URI`/`MONGODB_DB`/`MONGODB_COLLECTION`)
- `app/portfolioCache.ts` — client session cache; admin mutations bust it

## Data model (single Mongo doc)

One document: `{ investors: [{ name, originalAmountInvested?, allocations }] }`.
Allocation: `{ id: uuid, symbol, invested, shares, dateInvested: ISO-midnight-UTC
string, soldAmount?, soldDate?, soldShares? }`. All current rows use `invested`
(the `amount` field is a legacy alias readers still accept — don't write it).

## Hard-won facts — do not re-learn

- **`originalAmountInvested` = real external cash contributed.** It's an
  override; when unset, the app auto-sums allocation `invested` values. It is
  SET for investors whose sale proceeds were reinvested (auto-sum would
  double-count). Display math: `currentValue = contributed + Σ gains`,
  return % is measured against contributed.
- **THE recurring data mess-up:** the admin "add investment" endpoint
  (`app/api/admin/investors/[slug]/allocations/route.ts` POST) does NOT bump
  `originalAmountInvested`. Any investor with the override set who adds new
  cash gets a frozen contributed total → understated value, inflated return %.
  When adding new-cash allocations, ALWAYS bump the override by the cash
  amount in the same change (skip the bump when the purchase is funded by sale
  proceeds). `npm run status` flags this drift.
- Money reconciliation invariant per investor:
  `contributed + soldProceeds − Σ purchases ≈ 0` (± ~$1 rounding).
- Symbol validation for admin adds goes through Alpaca's asset registry
  (`fetchAsset`, tradable+active) — Finnhub quotes returned c=0 for ETFs like
  TQQQ/VOO/QQQ and used to block adding them.
- Alpaca IEX feed is used for bars (`feed=iex`); daily bars + snapshots are
  the price sources; Finnhub only supplies logos (FMP fallback).
- `data/investors.json` file fallback in the portfolio route is dead — no
  `data/` directory exists; Mongo is the only real source.
- Investor slugs are `slugify(name)` (lowercase, spaces→dashes); lookups match
  slug or raw name case-insensitively.

## Design system ("Aurora Terminal") — do not re-derive

- `.glass` (globals.css) is load-bearing and subtle: panel gradient as
  `background-image` ON the element (fills under the 1px border — moving it
  to a pseudo re-creates corner artifacts), blur on `::before`, everything in
  `@layer components` so Tailwind utilities (border-*/shadow-*/ring-*/bg-*)
  genuinely win. Coarse-pointer devices swap blur for a near-opaque gradient.
  Tint a glass card's edge with a border-color utility, NEVER `ring-*`
  (double 1px edge).
- Decorative blur balls inside glass cards live in an inner clipped wrapper
  (`absolute inset-0 overflow-hidden rounded-[inherit]` + `aria-hidden
  pointer-events-none`) — never `overflow-hidden` on the glass root (clips
  tooltips/shadows and the border-backing).
- Mobile conventions everywhere: `min-h-dvh` (not screen), safe-area
  `max(...)`/`env(safe-area-inset-*)` paddings on page roots+mains, inputs
  `text-base` (16px, else iOS zooms), touch targets ≥44px (tiny visuals go
  inside larger hit boxes), `overscroll-contain` on inner scrollers, modals
  top-anchored on phones with `max-h-[85dvh]` + `app/scrollLock.ts`.
- iPad ≥768px: home cards render as a 2-col grid; the carousel is phone-only.
- Type: Space Grotesk display, Geist body, Geist Mono for the dated
  eyebrow/data labels.

## Engagement layer (device-local, no user auth by design)

- `app/checkin.ts` — localStorage day-stamp ledger + streak (forgives ≤2-day
  gaps: weekends). Keys: `pulse:days`, `pulse:viewer`, `pulse:brief:<date>`,
  `pulse:insight:<slug>`, `pulse:nudge-dismissed`.
- `app/DailyPulse.tsx` — the home "ritual" card: date eyebrow, 🔥 streak chip
  (confetti at 3/7/14/30/50/100), "Who's checking in?" picker (pins that
  investor's card first), daily AI club brief.
- `app/api/daily-brief/route.ts` — one Claude call/day (claude-opus-5;
  thinking on by default, so max_tokens has headroom), cached by
  date+day-sign server-side and per-date in localStorage.
- Backlog (researched, not built): The House (Claude as a competing
  investor); Pick'em daily prediction game; Web Push via service worker
  (needs subscription storage + a sender — the install nudge exists already).

## Verification bar

For data changes: `npm run status` must pass. For app changes: `npm run lint`
+ `npm run build`, and load the affected page against dev (`npm run dev`,
screenshot at 390px + 834px widths for anything visual).
