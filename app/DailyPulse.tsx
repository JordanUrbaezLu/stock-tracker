"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useSound } from "./SoundContext";
import { celebrate } from "./confetti";
import { initials, avatarGradient } from "./avatar";
import { RichText } from "./RichText";
import { AnimatedNumber } from "./AnimatedNumber";
import { GUEST, getViewer, setViewer, recordCheckin } from "./checkin";

export type PulseInvestor = {
  name: string;
  slug: string;
  dayChangePercent?: number | null;
};

type DailyPulseProps = {
  investors: PulseInvestor[];
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

/** "THU · JUL 31" — the dated ticket eyebrow, set in the mono face. */
function dateEyebrow(): string {
  const d = new Date();
  const wd = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const mo = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${wd} · ${mo} ${d.getDate()}`;
}

function daypart(): string {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

export function DailyPulse({
  investors,
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

  // Stamp the visit once per mount. The check-in is the celebrated act — it
  // fires regardless of market color, and milestones get the full confetti.
  useEffect(() => {
    if (checkedIn.current) return;
    checkedIn.current = true;
    const result = recordCheckin();
    setStreak(result.streak);
    setIsNewDay(result.isNewDay);
    if (result.milestone) {
      const t = setTimeout(() => celebrate(() => play("success")), 600);
      return () => clearTimeout(t);
    }
    if (result.isNewDay) play("open");
  }, [play]);

  // Day rollover: an installed PWA resumes from memory instead of reloading,
  // so a mount-only stamp would silently miss days (and eventually zero a
  // streak the user earned). Re-stamp whenever the app wakes on a new local
  // day; this also rolls the date eyebrow and refetches the day's brief.
  useEffect(() => {
    const onWake = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = localDateKey();
      if (now === dayKeyRef.current) return;
      dayKeyRef.current = now;
      setDayKey(now);
      setBrief(null);
      const result = recordCheckin();
      setStreak(result.streak);
      setIsNewDay(result.isNewDay);
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
  const dayTone =
    groupDayChangePercent > 0.05
      ? "text-emerald-300"
      : red
        ? "text-rose-300"
        : "text-slate-400";

  const greeting = firstName
    ? isNewDay && red
      ? `${daypart()}, ${firstName} — showing up on a red day. Respect.`
      : isNewDay
        ? `${daypart()}, ${firstName} — you're checked in.`
        : `${daypart()}, ${firstName}.`
    : isNewDay
      ? "Checked in — the day is stamped."
      : "Welcome back.";

  return (
    <section
      aria-label="Daily pulse"
      className="glass relative rounded-3xl px-4 py-3.5 shadow-xl shadow-black/30 sm:px-5"
    >
      {/* Warm ember glow behind the streak corner — clipped by an inner
          wrapper so the glass border stays clean. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        <div className="absolute -right-14 -top-16 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <div className="relative flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">
          {dateEyebrow()}
          <span className="px-1.5 text-slate-700">|</span>
          {/* "today" not "club … today" — the longer form wraps at 390px. */}
          <span className={dayTone}>
            today {groupDayChangePercent >= 0 ? "+" : ""}
            {groupDayChangePercent.toFixed(2)}%
          </span>
        </p>
        {streak > 0 && (
          <motion.span
            initial={isNewDay ? { scale: 0.4, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.25 }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-amber-200"
            title={`${streak}-day check-in streak on this device`}
          >
            <span aria-hidden className="text-sm leading-none">
              🔥
            </span>
            <AnimatedNumber
              value={streak}
              format={(v) => `${Math.round(v)}`}
              className="tnum text-sm font-bold leading-none"
            />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-300/80">
              day{streak === 1 ? "" : "s"}
            </span>
          </motion.span>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {viewer === null ? (
          <motion.div
            key="picker"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="relative mt-2.5"
          >
            <p className="font-display text-base font-semibold text-white">
              Who&apos;s checking in?
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {investors.map((inv) => (
                <motion.button
                  key={inv.slug}
                  type="button"
                  onClick={() => pickViewer(inv.slug)}
                  whileTap={{ scale: 0.94 }}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-1.5 pr-3.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/50 hover:text-white"
                >
                  <span
                    aria-hidden
                    className={`grid h-8 w-8 place-items-center rounded-full bg-linear-to-br ${avatarGradient(
                      inv.name,
                    )} text-[11px] font-bold text-white ring-1 ring-white/20`}
                  >
                    {initials(inv.name)}
                  </span>
                  {inv.name.trim().split(/\s+/)[0]}
                </motion.button>
              ))}
              <button
                type="button"
                onClick={() => pickViewer(GUEST)}
                className="min-h-11 cursor-pointer rounded-full px-3 py-1.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
              >
                Just browsing
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="greeting"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="relative mt-2"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-base font-semibold leading-snug text-white">
                {greeting}
              </p>
              {/* Escape hatch for mis-taps, shared devices, and roster
                  changes — clears the greeting back to the picker without
                  wiping the stored choice until a new one is made. */}
              <button
                type="button"
                onClick={() => {
                  play("tap");
                  setViewerState(null);
                  onViewerChange?.(null);
                }}
                className="-my-2 min-h-11 shrink-0 cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-slate-500 transition hover:text-slate-300"
              >
                Switch
              </button>
            </div>
            {brief && (
              <p className="mt-1 text-xs leading-5 text-slate-300">
                <RichText text={brief} />
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
