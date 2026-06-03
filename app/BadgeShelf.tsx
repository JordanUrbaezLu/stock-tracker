"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useSound } from "./SoundContext";
import { celebrate } from "./confetti";
import {
  getBadges,
  badgeToneClasses,
  type BadgeStatus,
  type BadgeInvestor,
} from "./badges";

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* ignore quota / disabled storage */
  }
}

/**
 * Achievement shelf for an investor. Badges are derived from the live portfolio
 * data. Newly-earned badges get a one-time confetti + chime and wear a "NEW"
 * tag that persists across visits until the viewer taps the badge to read what
 * it means — tapping opens a description popup and acknowledges (clears) the
 * NEW tag for that badge.
 */
export function Badges({
  investor,
  allInvestors,
}: {
  investor: BadgeInvestor;
  allInvestors: BadgeInvestor[];
}) {
  // The full catalog with earned status — earned ones are shown in color, the
  // rest are shown locked/dimmed so the viewer sees what's left to chase.
  const badges = getBadges(investor, allInvestors);
  const earnedIds = badges.filter((b) => b.earned).map((b) => b.id);
  const { play } = useSound();
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<BadgeStatus | null>(null);
  // Portal the popup to <body> only after mount (avoids SSR document access).
  const [mounted, setMounted] = useState(false);
  const handled = useRef(false);

  useEffect(() => setMounted(true), []);

  const ackedKey = `badges_acked_${investor.slug}`;
  const celebratedKey = `badges_celebrated_${investor.slug}`;

  useEffect(() => {
    if (typeof window === "undefined" || handled.current) return;
    handled.current = true;
    // Only EARNED badges can be "new" / celebrated.
    const ids = earnedIds;
    // NEW tag persists until acknowledged (tapped), tracked separately from the
    // one-time confetti so the celebration never re-fires on later visits.
    const acked = readIds(ackedKey);
    setNewIds(new Set(ids.filter((id) => !acked.includes(id))));

    const celebrated = readIds(celebratedKey);
    if (ids.some((id) => !celebrated.includes(id))) {
      celebrate(() => play("success")); // sound fires with the confetti burst
      writeIds(celebratedKey, ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investor.slug]);

  const openBadge = useCallback(
    (badge: BadgeStatus) => {
      play("open");
      setSelected(badge);
      // Acknowledge: clear this badge's NEW tag and remember it across visits.
      setNewIds((prev) => {
        if (!prev.has(badge.id)) return prev;
        const next = new Set(prev);
        next.delete(badge.id);
        return next;
      });
      const acked = readIds(ackedKey);
      if (!acked.includes(badge.id)) writeIds(ackedKey, [...acked, badge.id]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [play],
  );

  const close = useCallback(() => {
    play("close");
    setSelected(null);
  }, [play]);

  // While the popup is open: dismiss on Escape and lock body scroll so the page
  // behind it doesn't move.
  useEffect(() => {
    if (!selected || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selected, close]);

  if (badges.length === 0) return null;

  return (
    // Outer wrapper carries the NEW badge so it can sit on the border, while the
    // card keeps overflow-hidden (which is what actually clips the background +
    // blur to the rounded corners — the badge would otherwise be clipped).
    <div className="relative">
      <span className="absolute -top-2 right-5 z-20 inline-flex items-center rounded-full bg-linear-to-r from-rose-500 to-orange-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-md shadow-rose-500/40 ring-1 ring-white/20">
        New
      </span>
      <section className="glass relative overflow-hidden rounded-3xl p-5 shadow-2xl shadow-black/30 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <span aria-hidden>🎖️</span> Achievements
        </h2>
        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
          {earnedIds.length} / {badges.length} earned
        </span>
      </div>
      <div className="relative flex flex-wrap gap-2">
        {badges.map((b, i) => (
          <motion.button
            key={b.id}
            type="button"
            onClick={() => openBadge(b)}
            initial={{ opacity: 0, scale: 0.8, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: i * 0.04, type: "spring", stiffness: 320, damping: 22 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.94 }}
            aria-label={`${b.label}${b.earned ? "" : " (locked)"} — ${b.description}`}
            className={`relative flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 transition ${
              b.earned
                ? `bg-linear-to-br ${badgeToneClasses(b.tone)} hover:brightness-110`
                : "bg-white/4 text-slate-500 ring-white/10 hover:bg-white/7"
            }`}
          >
            <span
              className="text-base leading-none"
              aria-hidden
              style={b.earned ? undefined : { filter: "grayscale(1)", opacity: 0.55 }}
            >
              {b.emoji}
            </span>
            <span className="text-xs font-semibold">{b.label}</span>
            {b.earned && newIds.has(b.id) && (
              <span className="absolute -right-1.5 -top-1.5 animate-pulse rounded-full bg-rose-500 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-white shadow-sm shadow-black/40">
                New
              </span>
            )}
          </motion.button>
        ))}
      </div>
      </section>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {selected && (
              <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center p-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={close}
              >
            <div
              aria-hidden
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={selected.label}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.85, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              // Solid (opaque) card — only the overlay behind it is transparent.
              style={{ background: "linear-gradient(160deg, #141a30, #0a0e1d)" }}
              className="relative z-10 w-full max-w-xs rounded-3xl border border-white/10 p-6 text-center shadow-2xl shadow-black/50"
            >
              <div
                className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl text-3xl ring-1 ${
                  selected.earned
                    ? `bg-linear-to-br ${badgeToneClasses(selected.tone)}`
                    : "bg-white/5 ring-white/10"
                }`}
              >
                <span
                  aria-hidden
                  style={
                    selected.earned
                      ? undefined
                      : { filter: "grayscale(1)", opacity: 0.55 }
                  }
                >
                  {selected.emoji}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">
                {selected.label}
              </h3>
              <span
                className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
                  selected.earned
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                    : "bg-white/5 text-slate-400 ring-white/10"
                }`}
              >
                {selected.earned ? "✓ Earned" : "🔒 Locked"}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {selected.earned
                  ? selected.description
                  : `How to earn: ${selected.description}`}
              </p>
              <button
                type="button"
                onClick={close}
                className="mt-5 w-full cursor-pointer rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15"
              >
                Got it
              </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
