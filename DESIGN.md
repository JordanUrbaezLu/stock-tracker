# "Club Arena" — design system & redesign spec

The family stock club as a **game league at the stock exchange**. Every screen
is built from physical, playable objects: a split-flap **scoreboard** whose
weather shows the market's mood, a **scratch-off ticket** for the daily
check-in, holographic **player cards**, a **race track** for the standings,
**stickers** for achievements, **levels** for money milestones, a **podium**
for the best picks, rubber **stamps** for verdicts. Fun first — but every
object does exactly one job, in plain words, so it is *easier* to read than a
brokerage app, not harder.

- **Who:** 7 family investors (mixed ages, mostly iPhone home-screen PWA, some
  iPad, occasional desktop) + one admin who logs buys/sells.
- **Job of every screen:** "How are we doing, how am I doing, what changed
  since I last looked?" — answered at a glance, and rewarding enough that people
  come back daily and want to add money (levels, streaks, the race).
- **Signature:** the split-flap `FlapDisplay` on the dark scoreboard. Each page
  shows ONE flap value in its board header (club value, an investor's value, a
  stock price, the best pick's return, the admin lock state).
- **Flows are frozen.** Every existing action, destination, API call, sound
  cue, localStorage key and admin mutation keeps working. New interactions
  (flip, scratch, level-up, race) are additive. (Checklists at the bottom.)
- **Readability rules:** one primary number per block; labels in sentence case
  (not tiny mono caps); plain-language summaries ("Up $12.34 since starting");
  ≥12px everywhere except mono data labels (11px); ≥16px body.

---

## 1. Tokens

All color comes from semantic CSS variables exposed as Tailwind colors
(`bg-surface`, `text-ink`, `border-line`, `text-gain`, `bg-loss-soft`, …).
**Page code never uses raw Tailwind palette colors** (`slate-*`, `emerald-*`,
`white/…`, `black/…`) — only tokens (+ jersey colors via `jerseyColor()`).

### Context scopes
- `:root` = light theme. `@media (prefers-color-scheme: dark)` = dark theme.
- `.on-board` re-points every semantic token to its board value, so any
  primitive placed on the dark scoreboard renders correctly with no variant.

### Light (`:root`)
| token | value | use |
|---|---|---|
| `--hall` | `#ECEAF8` | page background (soft periwinkle "arena floor") |
| `--surface` | `#FFFFFF` | cards |
| `--surface-2` | `#F5F4FC` | wells, inputs, tracks |
| `--surface-3` | `#E7E5F5` | pressed, progress tracks |
| `--line` | `#E1DFF0` | hairlines |
| `--line-strong` | `#CBC8E2` | input borders |
| `--lip` | `#D5D2EC` | the solid bottom "lip" under cards/keys |
| `--ink` | `#16141F` | primary text |
| `--ink-2` | `#3E3B4E` | secondary text |
| `--muted` | `#66627A` | labels, captions |
| `--faint` | `#A19DB5` | decoration only (2.4:1 — input placeholders use `--muted`) |
| `--gain` / `--gain-soft` | `#087A49` / `#EAF8F0` | |
| `--loss` / `--loss-soft` | `#C52F38` / `#FEF0F0` | |
| `--amber` / `--amber-soft` | `#8F5600` / `#FFF1D6` | amber TEXT on light / tints |
| `--amber-bright` / `--amber-lip` | `#FFB547` / `#D4891C` | THE action color (primary keys, active tab, streak) |
| `--pop-pink` `--pop-blue` `--pop-lime` `--pop-violet` | `#FF4F9A` `#3E6BFF` `#7BD23C` `#7B5CFF` | fun accents: stickers, confetti, podium trim, race lanes |

### Dark (`prefers-color-scheme: dark`)
`--hall #100F17` · `--surface #1A1824` · `--surface-2 #211F2D` ·
`--surface-3 #2A2838` · `--line #2B2939` · `--line-strong #3A374B` ·
`--lip #07060B` · `--ink #F2F0FA` · `--ink-2 #C9C6D8` · `--muted #9A96AF` ·
`--faint #625E75` · `--gain #3DDC8E` · `--gain-soft rgb(61 220 142/.12)` ·
`--loss #FF6B70` · `--loss-soft rgb(255 107 112/.12)` · `--amber #FFB547` ·
`--amber-soft rgb(255 181 71/.12)`; amber-bright/lip and pops unchanged.

### Scoreboard (same in both themes)
`--board #141219` (dark theme `#17151E`) · `--board-2 #1D1B24` ·
`--tile #26242D` · `--tile-top #2E2C36` · `--seam #08070B` ·
`--board-ink #F6F1E6` · `--board-muted #A6A2B5` · `--board-amber #FFB547` ·
`--board-gain #45DC95` · `--board-loss #FF7378`. Inside `.on-board` every
semantic token maps to these (surface → board-2, ink → board-ink, …).

### Jersey colors (each investor's identity — avatars, player cards, page tint)
alexa `#D9468A` · lucas `#138A5B` · brandon `#2A6FDB` · jordan `#D33A3F` ·
aj `#D9620B`; others hash into `#6E55E8` `#0E8486` `#A87700` `#4855C9`
`#A63BAE` `#1680B8` `#4F8516`. White text on them for large type; small text
sits on a white inner panel — or, on a player card, on `jerseyCard(name)`:
the jersey deepened in linear light until white reads ≥4.9:1 (≥6.4 under a
foil, whose overlay sheen — 0.24 metals, 0.2 holo — lightens it again). In
`.on-jersey`, `--muted` is white and wells/pills are dark tints, never light
ones. Measured: every jersey × foil keeps 13–15px text ≥4.5:1.

### Type
- **Archivo** (variable `wdth` + `wght`) is the voice.
  - `type-display`: condensed (72%) 800, tabular — big numbers, names,
    **UPPERCASE section headers** (sporty broadcast feel).
  - `type-title`: 85% width 700 — card titles.
  - `type-label`: 13px 600 sentence case, `text-muted` — every stat label.
  - Body 16px (15px minimum in dense rows).
- **Martian Mono** (`type-eyebrow`, 11px caps) — ONLY on the scoreboard,
  the ticker tape, chart axes and tiny data stamps. Not for hall labels.
- Minus sign is `−` (U+2212). Numbers tabular.

### Shape, depth, motion
- **Everything is a physical object.** Cards and keys have a solid bottom
  lip: cards `0 3px 0 var(--lip)` + soft ambient shadow; keys `0 4px 0
  <darker shade>`. Hover lifts 2px (hover-capable only); press sinks 3px and
  the lip collapses. Radius: cards 24px, keys 16px, pills full, tiles 0.1em.
- Springs are bouncy (`stiffness 420, damping 18` for pops; `320/28` for
  layout). Entrances: flaps settle → numbers count → objects pop/slap/stamp.
- Ambient life: ticker tape, board weather, chart tip pulse, streak flame,
  holo shine. All honor `prefers-reduced-motion` (static, final states).

---

## 2. Layout system

```
███████████████████████████████████████████  ← scoreboard (.on-board), full-bleed
█ BrandBar (sticky, safe-area top)          █   logo · wordmark · status | nav (≥md) | sound · admin
█ TickerTape (optional)                     █
█ Weather layer (sun / clouds / rain)       █   behind the hero, from the day's move
█ Hero (page-specific, ONE FlapDisplay)     █
███████████████████████████████████████████
  Hall (periwinkle floor), max-w 1200
  first block overlaps the board edge (-mt-14) — objects resting on the board
[TabBar — phone only, fixed bottom]  Home · Stocks · Lookup
```
- AppShell props: `active`, `hero`, `ticker`, `status`, `back`, `actions`,
  `width`, plus **`weather?: "sunny" | "cloudy" | "rainy" | null`** and
  **`tint?: string`** (a jersey color washed into the board — investor pages).
- Breakpoints: phone `<768` single column + TabBar · iPad `768–1023` 2-col
  grids, top nav · desktop `≥1024` 12-col layouts (left 8 / right 4 rail).
- Admin signed in: amber "Admin" chip + amber edge on the brand bar.
- Mobile rules (hard-won, keep): `min-h-dvh`; safe-area paddings; inputs
  `text-base`; ≥44px targets; `overscroll-contain` inner scrollers; modals
  top-anchored on phones (`max-h-[85dvh]`, `app/scrollLock.ts`); no
  `backdrop-filter` on scrolling surfaces.

---

## 3. Components (`app/ui/*`)

Core: `AppShell` (+ `BrandMark`, `weatherFor`/`weatherWords`), `FlapDisplay`,
`Card` (+`CardHeader`), `SectionHeader` (UPPERCASE display + optional emoji +
sub), `Button`/`LinkButton`/`IconButton` (**chunky keys**: `primary` = amber
key with dark text, `ink`, `secondary` = white key, `ghost`, `danger`,
`gain`), `Delta` (`inline` / `pill` / `phrase` — a move that prints as zero
reads "Flat"), `Stat`/`StatGroup` (optional `+`/`=` operators), `Avatar`,
`Chip`, `Medal`, `Segmented` (chunky pill tabs), `Menu`, `Modal` (+
`ModalActions`), `Field`/`Input`, `ProgressBar`, `Skeleton`, `EmptyState`,
`ErrorState`, `ListRow` + `RankMarker`, `AiNote` / `ThinkingDots` /
`TypingCaret`, `ChartLegend`, `StreakFlame`, `Reveal` (`Rise` / `FlipIn` /
`StampIn`), `motion.ts` (springs + load beats), `icons`, `format`, `cx`.

Arena objects (new, shared):
| component | what it is |
|---|---|
| `Sticker` | a die-cut sticker (emoji/icon, thick white outline, drop shadow, deterministic tilt). `earned`/locked (`?` dashed outline), `isNew` burst, slap-in animation. Badges everywhere. |
| `Stamp` | a rubber stamp: rotated text in a double-ruled frame with ink texture; slams in. "CHECKED IN", "SOLD", "BULLISH"/"BEARISH"/"STEADY", "UNLOCKED". |
| `LevelBar` | money levels: Level badge + segmented XP bar + "$40.00 to Level 3 ($250)". Ladder $100 · $250 · $500 · $1k · $2.5k · $5k · $10k · $25k · $50k · $100k (Level 1 = under $100). |
| `TiltCard` | wrapper adding pointer/touch-drag 3D tilt + holographic sheen (`foil="gold" | "silver" | "bronze" | "holo" | null`). Optional flip (front/back faces). |
| `Podium` | three blocks (2nd · 1st · 3rd) with items popping onto them. |
| `Weather` (inside AppShell) | the scoreboard's mood layer: sunny = warm light rays; cloudy = drifting haze; rainy = fine diagonal rain. Low opacity, behind content. |

Weather rule: club/investor day change `> +0.25%` sunny · `< −0.25%` rainy ·
else cloudy. Show it in words too ("☀️ Sunny day for the club").

---

## 4. Copy & tone

Playful, plain, short. Sentence case for UI text; UPPERCASE condensed only
for section headers and board eyebrows.
- **Value** (worth now) · **Invested** (real cash put in) · **Gain / Loss**
  (value − invested; label flips with sign) · **Return** (the %).
- Summaries in words: "Up $12.34 since starting (+5.6%)", "Today: down $1.23".
- Section headers: "THE RACE", "PLAYER CARDS", "HOT PICKS", "STICKER BOOK",
  "HOLDINGS", "YOUR LEVEL", "ROAST OR HYPE", "ASK THE AI".
- Buttons say what happens: "Add investment", "Save changes", "Confirm sale",
  "Scratch to reveal", "Open portfolio", "See all picks".
- Errors explain the fix, never apologize. Keep only data-driven NEW tags.
- Never print family dollar amounts into committed files (repo is public).

---

## 5. Page specs

### Home `/`
```
SCOREBOARD  weather by the club's day · eyebrow "MON · OCT 12 — CLUB VALUE"
            [$][1][,][2][3][4][.][5][6]        "☀️ Sunny day — the club is up $12.34 today"
            Up $123.45 since starting (+11.1%) · 30-day chart vs S&P (dashed)
HALL        DAILY TICKET (overlaps the board): streak flame + flap count, 7 day
              stamps; scratch-off "Your day" (viewer's day $ and %; guests see the
              club's); after reveal → "CHECKED IN" stamp, greeting, AI brief
            THE RACE: tabs Today · All-time · Value; one lane per investor, the
              avatar runner springs to its spot (diverging around 0 for %);
              leader gets a 👑; tap a lane → their page
            PLAYER CARDS: carousel (phone) / 2-col (iPad) / grid in the left
              column (desktop); TiltCard with foil by rank; flip for holdings
            HOT PICKS: Podium of the top 3 open holdings + "See all picks"
```
Desktop: left 8 = ticket + player cards; right 4 = race + hot picks (hot
picks pins under the brand bar while the cards scroll). A level-up banner
tops the hall when the chosen viewer reaches a new level.

**Player card (front):** jersey-color frame, rank medal, big name, value
(AnimatedNumber), return pill, 30-day mini line (white), "Best pick: AAPL
+12%", 2–3 badge stickers slapped on the edge, "NEW"/"YOU" stickers,
"Open portfolio" key. **Back (flip button ↻):** white panel — Invested · Gain,
top holdings (logo → Lookup), AI insight, "Open portfolio". Tapping the card
body still opens the investor page (flow unchanged); the flip is its own
button.

### Investor `/investor/[slug]`
```
SCOREBOARD  tinted with the investor's jersey color; weather by their day
            Avatar + NAME + NEW; "Investor since Jan 2026 · 3 holdings"
            [$][3][4][5][.][6][7]   Up $45.67 since starting (+12.3%) · Today …
            YOU vs S&P 500 matchup: +12.3%  VS  +4.5%  (crown on the winner)
            6-month chart: portfolio vs "same money in the S&P 500" (dashed)
HALL        YOUR LEVEL (LevelBar) · MONEY: Invested + Gain = Value tiles
            HOLDINGS (filter · All/Open/Sold · sort; holding cards; SOLD stamp)
            STICKER BOOK (earned stickers + "?" locked, progress)
            ROAST OR HYPE (big two-sided switch) · ASK THE AI (chat)
            ADMIN TOOLS (admin): Rename · Edit invested amount · Delete
            + money check: if "total invested" is too low, a warning with a
              one-tap fix
```
Desktop: left 8 = level, money, holdings; right 4 = sticker book, roast/hype,
ask, admin tools.

### Lookup `/lookup`
Scoreboard: "LOOK UP A STOCK" + search key on the board + suggestions; after
a result: logo, symbol, name; price flap; span move in words. Hall: timespan
pill tabs with returns, "TICKER ANALYSIS" card (expand → AI read with
typewriter; forecast box with a verdict `Stamp` BULLISH / BEARISH / STEADY
from the prediction direction), chart card (forecast dashed amber). Phones
keep the analysis ABOVE the chart so it is visible without scrolling; from
1024 the chart is the left column and the analysis the right rail. Empty:
quick-pick keys (AAPL · NVDA · VOO · TQQQ).

### Stocks `/stocks`
Scoreboard: "HOT PICKS · 12 HOLDINGS", flap of the best return, "AAPL · held
by Taylor". Hall: `Podium` (top 3) → controls (holder filter menu, best/worst
key, count) → ranked rows (logo → Lookup, holder avatar, value, gain, return
pill; ≥768 table columns; the podium moves to a right rail from 1280). The
rank shown is the pick's club-wide rank, so it stays true under any filter
or sort.

### Admin `/admin` (narrow)
Scoreboard: "ADMIN ACCESS", flap LOCKED → UNLOCKED (re-flips on success) +
"UNLOCKED" stamp. Hall: password card, chunky "Unlock admin" key,
success/error callouts, "Lock admin".

---

## 6. Money math (API contract — `app/api/portfolio`)

- `currentValue = contributed + Σ gains` (= open market value + uninvested
  cash). `contributed` = `originalAmountInvested` override, else auto-sum.
- **Cash-flow timeline:** contributions are inferred per investor by walking
  purchases and sales in date order — sale proceeds fund later purchases
  first; whatever proceeds don't cover is new cash on that purchase's date.
  Residual vs `contributed` is placed at inception. Exposed as
  `contributions: { time, amount }[]` and `uninvestedCash`.
- **Value history** steps up on the day new money arrives (no more
  back-dating today's invested total to day one).
- **S&P comparison** = "the same money, on the same days, in the S&P 500":
  `benchmarkHistory`, `spyReturn` and `alphaSpy` use that money-weighted
  basis, so adding money never makes anyone look like they're losing to the
  index.
- Admin "Add investment" takes **Paid with: New money / Sale money**
  (`fundedBy: "new" | "proceeds"`): new money bumps `originalAmountInvested`
  by the amount (or leaves auto-sum alone); money from a sale freezes the
  auto-sum into the override so proceeds are never double-counted.
- Admin money check: `uninvestedCash < −$1` means "total invested" is stale →
  warning + one-tap fix (sets it to purchases − sale proceeds).

---

## 7. Flow checklists (must all still work)

**Global:** sound toggle (`sound_enabled`) · admin state (`admin_auth_<UTC
date>`, `html[data-admin]`) · nav Home/Stocks/Lookup/Admin · back button ·
PWA manifest + apple icon · reduced motion · safe areas.

**Home:** portfolio load (session cache first) · skeleton · error + Try
again · empty (admin vs viewer copy) · live/updating/offline status · ticker
(biggest movers first) · Daily Pulse logic: date, streak (milestone confetti
3/7/14/30/50/100), "Who's checking in?" picker incl. "Just browsing",
greetings, Switch, daily AI brief (`pulse:brief:<date>`, fallback never
cached), day rollover on wake · club value, all-time gain, today, 30-day chart
+ S&P · top holdings (top 3 open, owner, → investor, See all → /stocks;
multi-investor only) · standings by Value + Return (+ Today), rows → investor
· investor cards (shuffled, viewer first; carousel + swipe sound + dots +
virtualize on phone, grid ≥768; AI insight `pulse:insight:<slug>` never the
fallback; badge teaser never navigates; logo → lookup; card → investor) ·
confetti once when the club is green · logo preloading · install nudge ·
admin "Add investor" modal.

**Investor:** load/skeleton/error/not-found · back · admin chip · as-of ·
identity · value, return, today, vs S&P · invested/gain · admin Rename (slug
redirect), Edit invested (blank = auto-sum), Delete investor (→ `/`, bust
cache) · achievements (earned/locked, NEW until tapped, one-time confetti,
detail popup) · 6-month chart · Roast/Hype · Assistant chat · holdings filter
/ status / sort, cards, admin Edit / Sell / Reopen / Delete with their modals
(add/edit: symbol, invested, shares, date, **paid with**; sell: amount
defaulting to current value, date, realized preview) · Add investment.

**Lookup:** `?symbol=`/`?ticker=` auto-load · default input AAPL (not
auto-searched) · sanitize + URL sync · debounced type-ahead (≤6, focused only,
hidden for the loaded symbol, mousedown-safe) · loading/error/empty · quote ·
timespans 3M/6M/1Y/5Y (default 6M, magnitude sounds) · lazy AI analysis per
symbol (searching loop, typewriter) · 3-month forecast + disclaimer · chart
with dashed forecast · payoff tone once per symbol · Suspense fallback.

**Stocks:** load/skeleton/error + Try again (force)/empty · count · holder
filter (outside-click close, sounds) · best/worst toggle · rows → investor,
logo → lookup · empty-filter message.

**Admin:** back · password → login API → success/error (+sounds) · loading
label · already-admin state, inputs disabled while admin/checking · lock
(logout API).

---

## 8. Verification

- Per change: `npx tsc --noEmit`, `npx eslint <files>`; whole app: `npm run
  lint` + `npm run build`; data: `npm run status`.
- Visual: `node scripts/screenshot.mjs [--scheme dark] [--viewer guest|<slug>]
  [--admin] [--click <selector>] <paths…>` → `.screenshots/` at 390/834/1440.
  `--admin` only flips the client flag — **never submit an admin mutation
  during QA** (it writes the family's real data).
- Token check (page code must print nothing):
  `grep -nE "(slate|emerald|rose|cyan|fuchsia|violet|indigo|amber|orange|sky|teal|pink|purple|blue|green|red|yellow|lime|zinc|gray|neutral|stone)-[0-9]{2,3}|(text|bg|border|ring)-(white|black)" app/page.tsx app/*/page.tsx app/investor/*.tsx app/DailyPulse.tsx app/Carousel.tsx app/InstallNudge.tsx app/BadgeShelf.tsx`
