# stock-tracker

Family stock-club tracker (Next.js 16 + MongoDB + Alpaca market data) in the
"Club Arena" design language ([DESIGN.md](DESIGN.md) — fun, game-like, still
easy to read). Investors: Jordan, Alexa, Brandon, Lucas, AJ, Nicky, CJ.

## Commands

- `npm run dev` · `npm run lint` · `npm run build`
- `npm run status` — DB integrity + live values + inferred deposit timeline
  ([scripts/db-status.mjs](scripts/db-status.mjs)). Run it FIRST when investor
  data is in question; PROBLEMS fail it, WARNINGS (copy-pasted shares,
  buy price vs close, auto-sum double count) are advisory.
- `node scripts/screenshot.mjs [--scheme dark] [--viewer guest|<slug>]
  [--admin] [--click <sel>] [--viewport] <paths…>` → `.screenshots/` at
  390/834/1440 (system Chrome; scrolls first; slices very tall pages).

## Code map

- `app/api/portfolio/route.ts` — the core: loads investors from Mongo, prices
  via Alpaca, computes holdings/gains/history, deposits, SPY benchmark
- `app/api/admin/**` — admin CRUD (daily `admin_auth_<date>` cookie);
  `utils.ts` has the DB doc shape (`DbInvestor`, `DbAllocation`)
- `app/ui/*` — design system (AppShell, FlapDisplay, keys, cards, Sticker,
  Stamp, LevelBar, TiltCard, Podium, Weather…); pages: `app/page.tsx`,
  `app/investor/[slug]`, `app/lookup`, `app/stocks`, `app/admin`
- `lib/alpaca.ts` (env `ALPACA_KEY_ID`/`ALPACA_SECRET_KEY`) · `lib/mongodb.ts`
  (env `MONGODB_URI`/`MONGODB_DB`/`MONGODB_COLLECTION`) ·
  `app/portfolioCache.ts` (client session cache; admin mutations bust it)

## Data model (single Mongo doc)

`{ investors: [{ name, originalAmountInvested?, allocations }] }`. Allocation:
`{ id: uuid, symbol, invested, shares, dateInvested: ISO-midnight-UTC string,
soldAmount?, soldDate?, soldShares? }` (`amount` is a legacy alias for
`invested` — readers accept it, never write it).

## Hard-won facts — do not re-learn

- **`originalAmountInvested` = real external cash contributed** (override;
  unset → auto-sum of `invested`, which double-counts reinvested proceeds).
  `currentValue = contributed + Σ gains` = open market value + uninvested cash.
  Invariant: `contributed + soldProceeds − Σ purchases ≈ 0` (± ~$1), exposed
  as `uninvestedCash`.
- **Recurring data mess-up (now guarded):** Add-investment POST takes
  `fundedBy: "new" | "proceeds"` (the UI's "Paid with"): new money bumps the
  override; sale money freezes auto-sum into it. Missing `fundedBy` = old
  behavior (no bump). Editing/deleting an allocation never touches the
  override — the investor page (admin) warns when `uninvestedCash < −$1` and
  offers a one-tap fix.
- **Deposits are inferred** (`contributions`): sales on a day before buys;
  proceeds fund later buys first; the rest is new cash that day; <$1 dust
  ignored; residual at inception; never negative (a shortfall trims the newest
  deposits). Mirrored in db-status.mjs — keep the two in sync.
- `valueHistory` = contributed-so-far + gains → it STEPS UP on deposit days;
  never compute a period gain as last − first. `benchmarkHistory`/`spyReturn`/
  `alphaSpy` = the same money on the same days in SPY (money-weighted).
- The API passes each allocation's `id` (+ stored index); admin edits resolve
  by id. Known gaps: a future `soldDate` makes the last history point ≠
  currentValue; a partial sale closes the whole holding.
- Symbol validation uses Alpaca's asset registry (Finnhub quotes return c=0
  for ETFs). Bars use `feed=iex`; Finnhub only for logos. Mongo is the only
  data source. Slugs = `slugify(name)`, matched case-insensitively.
- The local dev Anthropic key may be out of credits → AI endpoints return
  templated fallbacks (cards hide insight fallbacks by design).

## Design system — spec in DESIGN.md, do not re-derive

- Tokens only (`bg-surface`, `text-ink`, `text-gain`, `bg-amber-bright`…).
  Scopes `.on-board` / `.on-jersey` / `.on-amber` re-point every token (in
  `@layer base`); a `var()` inside a `:root` custom property resolves at
  `:root`, so lips/focus reference tokens at the point of use.
- next/font puts font variables on `<body>`; globals.css re-declares the
  stacks on `body` (on `:root` only, everything silently falls back).
- Keys/cards own CSS `translate` (press/lift) — wrap them, don't add
  `translate-*`. Primary key = amber, one main action per view.
- Never branch markup on motion's `useReducedMotion()` (hydration mismatch) —
  use `MotionConfig reducedMotion="user"` + CSS media queries.
- `html` AND `body` are `overflow-x: clip` (body alone clips nothing: a stamp
  slamming in at 2.2× moved the fixed tab bar). Measure overflow with
  `document.body.scrollWidth − innerWidth`, not `documentElement`.
- Each page mounts its own AppShell (layoutId can't cross routes). The board
  header must not become a stacking context — the hall's first block is
  pulled over its edge (`-mt-14`).
- TiltCard: foil paints over the face, so stickers go in `decals`; only the
  faces take pointer events. Player-card face = `jerseyCard(name)` (jersey
  deepened until white text is ≥4.9:1; foil overlay 0.24, holo 0.2) — change
  those only with a contrast re-measure.
- Date inputs default to the LOCAL day (`todayInputValue()`), stored as
  UTC-midnight — `toISOString()` is tomorrow on US evenings. Money-moving
  forms (Sell, Edit invested) never submit on Enter; Reopen confirms first.
- Dev quirk: a `globals.css` edit is sometimes not served until re-saved.
- Mobile: `min-h-dvh`, safe-area paddings, inputs `text-base`, ≥44px targets,
  `overscroll-contain`, modals top-anchored on phones (`max-h-[85dvh]` +
  `app/scrollLock.ts`, no autofocus on touch), no `backdrop-filter`.

## Engagement layer (device-local, no user auth by design)

- localStorage: `pulse:days` (streak ledger, forgives ≤2-day gaps),
  `pulse:viewer`, `pulse:brief:<date>`, `pulse:insight:<slug>`,
  `pulse:nudge-dismissed`, `pulse:scratch:<date>` (ticket revealed),
  `pulse:level:<slug>` (high-water level → level-up celebration),
  `badges_acked_<slug>`, `badges_celebrated_<slug>`, `sound_enabled`.
- `app/DailyPulse.tsx` — the daily ticket: streak, day stamps, scratch-off
  "your day", greeting, AI club brief (`app/api/daily-brief`, one Claude
  call/day, cached server-side + per date).
- Backlog (researched, not built): The House (Claude as a competing
  investor); Pick'em daily prediction game; Web Push via service worker.

## Verification bar

Data changes: `npm run status` must pass. App changes: `npm run lint` + `npm
run build`, plus screenshots of affected pages (light + dark, 390/834/1440).
Never submit admin mutations while testing — it is the family's real money.
