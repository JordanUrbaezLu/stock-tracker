"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { useSound } from "./SoundContext";
import { celebrate } from "./confetti";
import { RichText } from "./RichText";
import {
  GUEST,
  getViewer,
  setViewer,
  recordCheckin,
  recentDays,
  type RecentDay,
} from "./checkin";
import { AiNote } from "./ui/Ai";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { cx } from "./ui/cx";
import { Delta } from "./ui/Delta";
import { FlapDisplay } from "./ui/FlapDisplay";
import { firstName as firstNameOf, formatPercent, toneOf, toneText } from "./ui/format";
import { IconCheck } from "./ui/icons";
import { StampIn } from "./ui/Reveal";
import { Stamp } from "./ui/Stamp";
import { StreakFlame } from "./ui/StreakFlame";

export type PulseInvestor = {
  name: string;
  slug: string;
  /** Today's move in dollars — the number under the viewer's scratch-off. */
  dayChange?: number | null;
  dayChangePercent?: number | null;
};

type DailyPulseProps = {
  investors: PulseInvestor[];
  /** The club's move today, in dollars (what a guest's scratch-off reveals). */
  groupDayChange: number;
  groupDayChangePercent: number;
  groupGainPct: number;
  topHolding: { symbol: string; changePercent: number | null } | null;
  /** Lets the home page pin the viewer's own card first. */
  onViewerChange?: (slug: string | null) => void;
};

function localDateKey(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "Thu, Jul 31" — the date printed on the ticket stub. */
function dateLabel(): string {
  const d = new Date();
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  const mo = d.toLocaleDateString("en-US", { month: "short" });
  return `${wd}, ${mo} ${d.getDate()}`;
}

function daypart(): string {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

/* ----------------------------------------------------- scratch ledger -- */

// Which viewers already scratched today's ticket on this device: a JSON array
// of viewer slugs per local day, so the reveal survives a reload.
const scratchKey = (day: string) => `pulse:scratch:${day}`;

function readScratched(day: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(scratchKey(day));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function markScratched(day: string, who: string) {
  if (typeof window === "undefined") return;
  try {
    const list = readScratched(day);
    if (list.includes(who)) return;
    window.localStorage.setItem(scratchKey(day), JSON.stringify([...list, who]));
  } catch {
    // Storage blocked — it stays revealed for this session only.
  }
}

/** The stamped days counted as of "now" — today always counts once the visit
 *  is recorded, even when storage is blocked and the ledger can't say so. */
function stampedDays(): RecentDay[] {
  return recentDays(7).map((d) => (d.isToday ? { ...d, stamped: true } : d));
}

export function DailyPulse({
  investors,
  groupDayChange,
  groupDayChangePercent,
  groupGainPct,
  topHolding,
  onViewerChange,
}: DailyPulseProps) {
  const { play } = useSound();
  // Lazy init so a returning viewer never sees the picker flash on load.
  const [viewer, setViewerState] = useState<string | null>(() => getViewer());
  const [streak, setStreak] = useState(0);
  const [isNewDay, setIsNewDay] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  // The local day this card currently represents. State (not a render-time
  // call) so a day rollover re-runs the brief fetch and re-renders the date.
  const [dayKey, setDayKey] = useState(() => localDateKey());
  const dayKeyRef = useRef(dayKey);
  const checkedIn = useRef(false);
  // The week of day stamps on the stub. Read before the visit is recorded,
  // so on a new day today's circle starts empty and its stamp slams in.
  const [days, setDays] = useState<RecentDay[]>(() => recentDays(7));
  // Who has scratched today's ticket on this device, and which reveal just
  // happened in this session (that one gets the stamp slam).
  const [scratched, setScratched] = useState<string[]>(() => readScratched(dayKey));
  const [freshReveal, setFreshReveal] = useState<string | null>(null);

  // Stamp the visit once per mount. The check-in is the celebrated act — it
  // fires regardless of market color, and milestones get the full confetti.
  useEffect(() => {
    if (checkedIn.current) return;
    checkedIn.current = true;
    const result = recordCheckin();
    setStreak(result.streak);
    setIsNewDay(result.isNewDay);
    setDays(stampedDays());
    if (result.milestone) {
      const t = setTimeout(() => celebrate(() => play("success")), 600);
      return () => clearTimeout(t);
    }
    if (result.isNewDay) play("open");
  }, [play]);

  // Day rollover: an installed PWA resumes from memory instead of reloading,
  // so a mount-only stamp would silently miss days (and eventually zero a
  // streak the user earned). Re-stamp whenever the app wakes on a new local
  // day; this also rolls the date, hands out a fresh scratch-off and
  // refetches the day's brief.
  useEffect(() => {
    const onWake = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = localDateKey();
      if (now === dayKeyRef.current) return;
      dayKeyRef.current = now;
      setDayKey(now);
      setBrief(null);
      setScratched(readScratched(now));
      setFreshReveal(null);
      const result = recordCheckin();
      setStreak(result.streak);
      setIsNewDay(result.isNewDay);
      setDays(stampedDays());
      if (result.milestone) celebrate(() => play("success"));
      else if (result.isNewDay) play("open");
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [play]);

  // Today's club brief — cached per local date on the device, so the network
  // is hit once a day and the card never flashes empty on revisits.
  useEffect(() => {
    if (typeof window === "undefined" || investors.length === 0) return;
    const cacheKey = `pulse:brief:${dayKey}`;
    try {
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        setBrief(cached);
        return;
      }
    } catch {
      // Storage blocked — fetch anyway.
    }
    const controller = new AbortController();
    fetch("/api/daily-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        date: dayKey,
        groupDayChangePercent,
        groupGainPct,
        investorCount: investors.length,
        investors: investors.map((i) => ({
          name: i.name,
          dayChangePercent: i.dayChangePercent ?? null,
        })),
        topHolding,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { message?: string; source?: string } | null) => {
        if (!j?.message) return;
        setBrief(j.message);
        // Show a fallback line, but never pin it for the day — a transient
        // API hiccup on the first open shouldn't hide the real brief until
        // midnight.
        if (j.source === "fallback") return;
        try {
          window.localStorage.setItem(cacheKey, j.message);
        } catch {
          // Fine — refetches tomorrow.
        }
      })
      .catch(() => null);
    return () => controller.abort();
    // Refetching on every price tick would churn the inputs; once per day
    // (dayKey) with the values in hand is the intended cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investors.length, dayKey]);

  const pickViewer = (slug: string) => {
    setViewer(slug);
    setViewerState(slug);
    play("tap");
    onViewerChange?.(slug);
  };

  const viewerInvestor = investors.find((i) => i.slug === viewer);
  const firstName = viewerInvestor?.name.trim().split(/\s+/)[0];
  const red = groupDayChangePercent < -0.05;

  const greeting = firstName
    ? isNewDay && red
      ? `${daypart()}, ${firstName} — showing up on a red day. Respect.`
      : isNewDay
        ? `${daypart()}, ${firstName} — you're checked in.`
        : `${daypart()}, ${firstName}.`
    : isNewDay
      ? "Checked in — the day is stamped."
      : "Welcome back.";

  // What the scratch-off hides: the viewer's own day, or the club's for a
  // guest (and for a stored viewer who is no longer on the roster).
  // Dollars snap to whole cents: a sub-cent move would print "Up $0.00" (and
  // throw confetti for it) — that is a flat day.
  const rawDayValue = viewerInvestor ? (viewerInvestor.dayChange ?? null) : groupDayChange;
  const dayValue = rawDayValue == null ? null : Math.round(rawDayValue * 100) / 100 || 0;
  const rawDayPercent = viewerInvestor
    ? (viewerInvestor.dayChangePercent ?? null)
    : groupDayChangePercent;
  const dayPercent = dayValue === 0 ? 0 : rawDayPercent;
  const dayTone = toneOf(dayValue ?? dayPercent, 0.005);
  const dayUp = dayTone === "gain";

  // Today's MVP: the investor with the highest dayChangePercent (only a
  // contest with 2+ investors, and not while nothing has moved yet).
  const best =
    investors.length > 1
      ? investors.reduce<PulseInvestor | null>((top, inv) => {
          const pct = inv.dayChangePercent;
          if (pct == null || Number.isNaN(pct)) return top;
          return top === null || pct > (top.dayChangePercent ?? -Infinity) ? inv : top;
        }, null)
      : null;
  const mvp = best && toneOf(best.dayChangePercent, 0.005) !== "flat" ? best : null;

  const scratchId = `${dayKey}:${viewer ?? ""}`;
  const revealed = viewer !== null && scratched.includes(viewer);

  const reveal = useCallback(() => {
    if (viewer === null) return;
    markScratched(dayKey, viewer);
    setScratched((prev) => (prev.includes(viewer) ? prev : [...prev, viewer]));
    setFreshReveal(`${dayKey}:${viewer}`);
    if (dayUp) {
      play("coin");
      void celebrate();
    } else {
      play("tap");
    }
  }, [viewer, dayKey, dayUp, play]);

  return (
    <section aria-label="Daily ticket" className="relative">
      <StampIn>
        <Card raised padding="none" className="relative">
          <div className="@container">
            {/* ---- The stub: streak + the week's day stamps ---- */}
            <div className="flex flex-col gap-4 px-4 pt-4 pb-3 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-6 @xl:px-6 @xl:pt-5">
              <div
                className="flex min-w-0 items-center gap-3"
                title={`${streak}-day check-in streak on this device`}
              >
                <StreakFlame size={34} lit={streak > 0} className="shrink-0" />
                <div className="shrink-0">
                  <FlapDisplay value={String(streak)} size="sm" className="[--flap-size:32px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[17px] font-bold leading-tight text-ink">day streak</p>
                  <p className="type-label mt-0.5 truncate">Daily ticket · {dateLabel()}</p>
                </div>
              </div>
              <DayStamps days={days} slamToday={isNewDay} />
            </div>

            {/* ---- The perforation: tear line + a half-circle notch each side ---- */}
            <div aria-hidden className="relative h-5">
              <span className="absolute -left-px top-0 h-5 w-[11px] overflow-hidden">
                <span className="absolute -left-2.5 top-0 size-5 rounded-full border border-line bg-hall dark:border-line-strong" />
              </span>
              <span className="absolute -right-px top-0 h-5 w-[11px] overflow-hidden">
                <span className="absolute -right-2.5 top-0 size-5 rounded-full border border-line bg-hall dark:border-line-strong" />
              </span>
              <span className="absolute inset-x-4 top-1/2 -mt-px border-t-2 border-dashed border-line-strong" />
            </div>

            {/* ---- The ticket body ---- */}
            <div className="px-4 pt-2 pb-5 @xl:px-6 @xl:pb-6">
              <AnimatePresence mode="wait" initial={false}>
                {viewer === null ? (
                  <motion.div
                    key="picker"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <h2 className="type-display text-[24px] uppercase tracking-[0.01em] text-ink">
                      Who&apos;s checking in?
                    </h2>
                    <p className="mt-1 text-[15px] text-muted">
                      Pick your name to scratch today&apos;s ticket.
                    </p>
                    {/* gap-y leaves room for each key's lip. */}
                    <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-3.5">
                      {investors.map((inv) => (
                        <Button
                          key={inv.slug}
                          variant="secondary"
                          icon={<Avatar name={inv.name} size={28} />}
                          onClick={() => pickViewer(inv.slug)}
                        >
                          {firstNameOf(inv.name)}
                        </Button>
                      ))}
                      <Button variant="ghost" onClick={() => pickViewer(GUEST)}>
                        Just browsing
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="ticket"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="grid gap-4 @xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] @xl:gap-6"
                  >
                    <ScratchPanel
                      key={scratchId}
                      title={viewerInvestor ? "Your day" : "The club's day"}
                      tone={dayTone}
                      revealed={revealed}
                      fresh={freshReveal === scratchId}
                      onReveal={reveal}
                    >
                      {dayValue == null && dayPercent == null ? (
                        <p className="text-[16px] font-semibold text-ink-2">
                          No price moves yet today.
                        </p>
                      ) : (
                        <Delta
                          variant="phrase"
                          size="lg"
                          value={dayValue}
                          percent={dayPercent}
                          suffix="today"
                          className="justify-center"
                        />
                      )}
                      {mvp ? (
                        <p className="flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[15px] leading-tight text-ink-2">
                          <Avatar name={mvp.name} size={22} />
                          <span>
                            Today&apos;s MVP:{" "}
                            <strong className="font-bold text-ink">
                              {mvp.slug === viewer ? "You" : firstNameOf(mvp.name)}
                            </strong>
                          </span>
                          <span className={cx("font-bold tabular-nums", toneText(mvp.dayChangePercent))}>
                            {formatPercent(mvp.dayChangePercent)}
                          </span>
                        </p>
                      ) : null}
                    </ScratchPanel>

                    <div className="flex min-w-0 flex-col gap-3">
                      <div className="flex min-h-11 items-start justify-between gap-3">
                        <p className="type-title pt-2 text-[20px] leading-snug text-ink text-pretty">
                          {greeting}
                        </p>
                        {/* Escape hatch for mis-taps, shared devices, and roster
                            changes — clears the greeting back to the picker without
                            wiping the stored choice until a new one is made. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            play("tap");
                            setViewerState(null);
                            onViewerChange?.(null);
                          }}
                        >
                          Switch
                        </Button>
                      </div>
                      {brief && (
                        <AiNote label="Today's brief">
                          <RichText text={brief} />
                        </AiNote>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Card>
      </StampIn>
    </section>
  );
}

/* --------------------------------------------------------- day stamps -- */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

/** A steady, per-day tilt (−11°…11°) so the row looks hand-stamped. */
function tiltOf(key: string): number {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
  return (h % 23) - 11;
}

/** The last seven days as a row of postmarks: a ✓ stamp for every day the
 *  app was opened, an empty dashed circle for a missed one. */
function DayStamps({ days, slamToday }: { days: RecentDay[]; slamToday: boolean }) {
  return (
    <ol
      aria-label="Check-ins, last 7 days"
      className="flex items-start justify-between gap-1 @xl:shrink-0 @xl:justify-end @xl:gap-2"
    >
      {days.map((d) => (
        // min-w-0: on a 320px phone seven 36px cells don't fit, so they give
        // up their slack (the stamp itself is 30px) instead of poking out.
        <li key={d.key} className="flex w-9 min-w-0 flex-col items-center gap-1.5">
          <span className="grid h-9 w-full place-items-center">
            {d.stamped ? (
              <Stamp
                shape="round"
                size="sm"
                tone={d.isToday ? "gain" : "ink"}
                rotate={tiltOf(d.key)}
                animate={d.isToday && slamToday}
                delay={0.55}
              >
                <IconCheck strokeWidth={3} />
              </Stamp>
            ) : (
              <span className="size-[30px] rounded-full border-2 border-dashed border-line-strong" />
            )}
          </span>
          <span
            aria-hidden
            className={cx(
              "grid h-5 min-w-5 place-items-center rounded-full px-1 text-[12px] font-bold leading-none",
              d.isToday ? "on-amber bg-amber-bright text-ink" : "text-muted",
            )}
          >
            {d.label}
          </span>
          <span className="sr-only">
            {d.isToday ? "Today" : weekdayOf(d.key)}: {d.stamped ? "checked in" : "missed"}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------- scratch-off -- */

const FADE_MS = 320;
/** Share of the foil that must be scratched away before it lets go. */
const CLEAR_AT = 0.5;
/** The cleared share is measured on a tiny copy of the canvas. */
const SAMPLE_W = 48;
const SAMPLE_H = 18;

// The sheen that sweeps the untouched foil ("scratch me"). Local keyframes:
// motion/react would freeze a transform loop mid-way under reduced motion.
const FOIL_CSS = `
@keyframes ticket-foil-sheen {
  0%, 58% { transform: translateX(-160%) skewX(-18deg); }
  100% { transform: translateX(520%) skewX(-18deg); }
}
.ticket-foil-sheen { animation: ticket-foil-sheen 3.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .ticket-foil-sheen { animation: none; opacity: 0; }
}
`;

// A coin for a cursor while over the foil (mouse only). Literal colors — a
// data-URL cursor can't read CSS variables (--amber-bright / --amber-lip).
const COIN_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="17" r="12" fill="#D4891C"/><circle cx="16" cy="15" r="12" fill="#FFB547" stroke="#16141F" stroke-width="2"/><circle cx="16" cy="15" r="7.5" fill="none" stroke="#D4891C" stroke-width="1.5"/></svg>',
)}") 16 16, crosshair`;

const TONE_WELL = {
  gain: "border-gain/25 bg-gain-soft",
  loss: "border-loss/25 bg-loss-soft",
  flat: "border-line bg-surface-2",
} as const;

function ScratchPanel({
  title,
  tone,
  revealed,
  fresh,
  onReveal,
  children,
}: {
  title: string;
  tone: "gain" | "loss" | "flat";
  /** Already scratched (today, by this viewer): no foil. */
  revealed: boolean;
  /** Revealed just now, in this session: the stamp slams in. */
  fresh: boolean;
  /** Called once the foil has let go (scratched ≥50% or the Reveal key). */
  onReveal: () => void;
  children: ReactNode;
}) {
  const [fading, setFading] = useState(false);
  const [touched, setTouched] = useState(false);
  const started = useRef(false);
  const focusResult = useRef(false);
  const timer = useRef<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  // The Reveal key unmounts once the ticket is revealed; hand keyboard focus
  // to the result so it is read out and tabbing carries on from there.
  useEffect(() => {
    if (revealed && focusResult.current) {
      focusResult.current = false;
      resultRef.current?.focus({ preventScroll: true });
    }
  }, [revealed]);

  const letGo = useCallback(
    (fromKey: boolean) => {
      if (started.current) return;
      started.current = true;
      focusResult.current = fromKey;
      setFading(true);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      if (reduce) onReveal();
      else timer.current = window.setTimeout(onReveal, FADE_MS);
    },
    [onReveal],
  );

  const onScratched = useCallback(() => letGo(false), [letGo]);
  const onTouched = useCallback(() => setTouched(true), []);

  return (
    <div className="relative min-w-0">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h3 className="type-display text-[20px] uppercase tracking-[0.01em] text-ink">{title}</h3>
        {revealed ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            data-scratch-reveal=""
            aria-label={`Reveal ${title.toLowerCase()} without scratching`}
            onClick={() => letGo(true)}
          >
            Reveal
          </Button>
        )}
      </div>

      <div
        className={cx(
          "relative mt-1 min-h-[124px] overflow-hidden rounded-2xl border",
          TONE_WELL[tone],
        )}
      >
        <div
          ref={resultRef}
          tabIndex={-1}
          aria-hidden={revealed ? undefined : true}
          className="flex min-h-[122px] flex-col items-center justify-center gap-2.5 rounded-[inherit] px-4 py-4 text-center"
        >
          {children}
        </div>
        {revealed ? null : (
          <>
            <style>{FOIL_CSS}</style>
            <ScratchFoil fading={fading} onScratched={onScratched} onTouched={onTouched} />
            {touched ? null : (
              <span
                aria-hidden
                className="ticket-foil-sheen pointer-events-none absolute inset-y-0 left-0 w-1/5"
                style={{
                  // Light on metal — the foil is silver in both themes.
                  background:
                    "linear-gradient(90deg, transparent, rgb(255 255 255 / 0.7), transparent)",
                }}
              />
            )}
          </>
        )}
      </div>

      {/* The verdict lands on the ticket's corner, over the scratch window. */}
      {revealed ? (
        <span className="pointer-events-none absolute right-1.5 top-2.5 z-10">
          <Stamp tone="gain" rotate={-7} animate={fresh} delay={0.05}>
            Checked in
          </Stamp>
        </span>
      ) : null}
    </div>
  );
}

/** Small seeded PRNG so the foil's grain is the same on every repaint. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Paints the scratch-off coating: brushed silver with grain, a soft highlight
 * band and "SCRATCH TO REVEAL". Literal colors on purpose — a canvas can't
 * read CSS variables, and the foil is the same metal in light and dark.
 */
function paintFoil(ctx: CanvasRenderingContext2D, w: number, h: number, monoFont: string) {
  const rand = mulberry32(20251012);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, w, h);

  const metal = ctx.createLinearGradient(0, 0, w, h);
  metal.addColorStop(0, "#C5C8D3");
  metal.addColorStop(0.2, "#ECEEF3");
  metal.addColorStop(0.42, "#B2B6C4");
  metal.addColorStop(0.62, "#E2E4EB");
  metal.addColorStop(0.82, "#A9ADBC");
  metal.addColorStop(1, "#D3D6DF");
  ctx.fillStyle = metal;
  ctx.fillRect(0, 0, w, h);

  // Brushed streaks: hairlines of light and shade along the grain.
  for (let y = 0; y < h; y += 1) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.22})` : `rgba(22,20,31,${(0.5 - v) * 0.1})`;
    ctx.fillRect(0, y, w, 1);
  }
  // Grain.
  const specks = Math.round((w * h) / 9);
  for (let i = 0; i < specks; i++) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.1 + rand() * 0.25})` : `rgba(22,20,31,${0.04 + rand() * 0.1})`;
    ctx.fillRect(rand() * w, rand() * h, 1, 1);
  }
  // Security-print hatching, barely there.
  ctx.strokeStyle = "rgba(22,20,31,0.045)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -h; x < w; x += 9) {
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
  }
  ctx.stroke();

  // The scratch window's printed frame.
  ctx.strokeStyle = "rgba(22,20,31,0.2)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.roundRect?.(8, 8, w - 16, h - 16, 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // The instruction, in the mono face, pressed into the metal.
  const size = w < 300 ? 12 : 13;
  ctx.font = `700 ${size}px ${monoFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "2px";
  } catch {
    // Older engines: default tracking.
  }
  const text = "SCRATCH TO REVEAL";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText(text, w / 2, h / 2 + 1);
  ctx.fillStyle = "rgba(22,20,31,0.74)";
  ctx.fillText(text, w / 2, h / 2);

  // A coin either side of the words.
  const half = ctx.measureText(text).width / 2;
  for (const dir of [-1, 1]) {
    const cx0 = w / 2 + dir * (half + 20);
    if (cx0 < 22 || cx0 > w - 22) continue;
    ctx.beginPath();
    ctx.arc(cx0, h / 2, 6.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(22,20,31,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx0, h / 2, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(22,20,31,0.55)";
    ctx.fill();
  }
}

/**
 * The foil itself: a canvas you rub away with a finger, pen or mouse (round
 * brush, destination-out). `touch-action: none` is on the canvas only — it is
 * short, so the page still scrolls from anywhere else.
 */
function ScratchFoil({
  fading,
  onScratched,
  onTouched,
}: {
  fading: boolean;
  onScratched: () => void;
  onTouched: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);
  const sampledAt = useRef(0);
  const touchedRef = useRef(false);
  const doneRef = useRef(false);

  // Paint the foil at the canvas's laid-out size (not its transformed rect —
  // the ticket scales while it stamps in) and repaint if that size changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const paint = (force = false) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (!force && w === sizeRef.current.w && h === sizeRef.current.h) return;
      sizeRef.current = { w, h };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintFoil(ctx, w, h, window.getComputedStyle(canvas).fontFamily || "monospace");
    };
    paint();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => paint());
    ro?.observe(canvas);
    // The mono face may land after first paint — redo the lettering once,
    // unless a scratch is already under way.
    let alive = true;
    document.fonts?.ready
      .then(() => {
        if (alive && !touchedRef.current) paint(true);
      })
      .catch(() => null);
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, []);

  const pointOf = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { w, h } = sizeRef.current;
    return {
      x: ((e.clientX - rect.left) / (rect.width || 1)) * w,
      y: ((e.clientY - rect.top) / (rect.height || 1)) * h,
    };
  };

  const rub = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    radius: number,
  ) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = radius * 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  /** Share of the foil already rubbed away, read off a downscaled copy. */
  const clearedShare = () => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return 0;
    const small = (sampleRef.current ??= document.createElement("canvas"));
    small.width = SAMPLE_W;
    small.height = SAMPLE_H;
    const sctx = small.getContext("2d", { willReadFrequently: true });
    if (!sctx) return 0;
    sctx.clearRect(0, 0, SAMPLE_W, SAMPLE_H);
    sctx.drawImage(canvas, 0, 0, SAMPLE_W, SAMPLE_H);
    const data = sctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 96) clear += 1;
    return clear / (SAMPLE_W * SAMPLE_H);
  };

  const check = () => {
    if (doneRef.current) return;
    if (clearedShare() >= CLEAR_AT) {
      doneRef.current = true;
      lastRef.current = null;
      onScratched();
    }
  };

  const radiusOf = (e: ReactPointerEvent<HTMLCanvasElement>) =>
    e.pointerType === "mouse" ? 17 : 21;

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (doneRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety — scratching works without it.
    }
    if (!touchedRef.current) {
      touchedRef.current = true;
      onTouched();
    }
    const p = pointOf(e);
    lastRef.current = p;
    rub(p, p, radiusOf(e));
  };

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const from = lastRef.current;
    if (!from || doneRef.current) return;
    const p = pointOf(e);
    rub(from, p, radiusOf(e));
    lastRef.current = p;
    if (e.timeStamp - sampledAt.current > 120) {
      sampledAt.current = e.timeStamp;
      check();
    }
  };

  const onEnd = () => {
    if (!lastRef.current) return;
    lastRef.current = null;
    check();
  };

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      className={cx(
        "absolute inset-0 size-full select-none rounded-[inherit] font-mono transition-opacity ease-out motion-reduce:transition-none",
        fading ? "pointer-events-none opacity-0" : "opacity-100",
      )}
      style={{
        touchAction: "none",
        cursor: COIN_CURSOR,
        transitionDuration: `${FADE_MS}ms`,
        WebkitTouchCallout: "none",
      }}
    />
  );
}
