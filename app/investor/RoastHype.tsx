"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RichText } from "../RichText";
import { useSound } from "../SoundContext";
import { celebrate } from "../confetti";

type RoastHolding = {
  symbol: string;
  changePercent?: number | null;
  status?: "open" | "closed";
};

type RoastInvestor = {
  name: string;
  currentValue: number;
  originalAmountInvested: number;
  alphaSpy?: number | null;
  holdings: RoastHolding[];
};

type Mode = "roast" | "hype";

/**
 * One-tap Claude that roasts or hypes a real portfolio in three punchy lines,
 * revealed with a live typewriter + key-tick sound (hype ends in confetti). The
 * result is copy-to-share — the friend-group-chat virality hook.
 */
export function RoastHype({ investor }: { investor: RoastInvestor }) {
  const { play, startSearching, stopSearching } = useSound();
  const [mode, setMode] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [shown, setShown] = useState(0);
  const finished = useRef(false);
  // Increments per tap so "Again" always gets a fresh generation, not the cache.
  const runCount = useRef(0);

  // Typewriter reveal (matches the Portfolio Assistant's feel: 25ms/step, a
  // soft key tick every ~12 chars).
  useEffect(() => {
    if (!text || shown >= text.length) return;
    const id = window.setTimeout(() => {
      const next = Math.min(text.length, shown + 3);
      if (Math.floor(next / 12) !== Math.floor(shown / 12)) play("type");
      setShown(next);
    }, 25);
    return () => window.clearTimeout(id);
  }, [text, shown, play]);

  // Fire the payoff once the line finishes typing.
  useEffect(() => {
    if (!text || shown < text.length || finished.current) return;
    finished.current = true;
    if (mode === "hype") {
      celebrate();
      play("coin");
    }
  }, [text, shown, mode, play]);

  const run = async (next: Mode) => {
    if (loading) return;
    setMode(next);
    setLoading(true);
    setText("");
    setShown(0);
    finished.current = false;
    play("open");
    startSearching(); // looped "thinking" sound while Claude writes
    try {
      const gain = investor.currentValue - investor.originalAmountInvested;
      runCount.current += 1;
      const res = await fetch("/api/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: next,
          nonce: runCount.current,
          name: investor.name,
          currentValue: investor.currentValue,
          totalGain: gain,
          gainPct: investor.originalAmountInvested
            ? (gain / investor.originalAmountInvested) * 100
            : 0,
          alphaSpy: investor.alphaSpy ?? null,
          holdings: (investor.holdings || []).map((h) => ({
            symbol: h.symbol,
            changePercent: h.changePercent ?? null,
            status: h.status,
          })),
        }),
      });
      const json = (await res.json()) as { text?: string; error?: string };
      stopSearching();
      play("receive");
      setText(json.text || json.error || "Couldn't think of anything — rare.");
      setShown(0);
    } catch {
      stopSearching();
      setText("Something went wrong — try again.");
    } finally {
      stopSearching();
      setLoading(false);
    }
  };

  const firstName = investor.name.trim().split(/\s+/)[0] || investor.name;
  const typingDone = !!text && shown >= text.length;
  // Accent everything (thinking dots, caret) to the active mode so hype reads
  // emerald and roast reads orange — consistent with the result bubble's tint.
  const accent = mode === "hype" ? "bg-emerald-300/90" : "bg-orange-300/90";

  return (
    <section className="glass relative rounded-3xl p-5 shadow-2xl shadow-orange-500/10 ring-1 ring-orange-400/10 sm:p-6">
      {/* NEW badge sitting on the card's top border. */}
      <span className="absolute -top-2 right-5 z-20 inline-flex items-center rounded-full bg-linear-to-r from-rose-500 to-orange-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-md shadow-rose-500/40 ring-1 ring-white/20">
        New
      </span>
      {/* Clip the decorative blur to the rounded card without clipping the badge. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-orange-500/15 blur-3xl" />
      </div>
      <div className="relative flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-orange-400 via-rose-500 to-fuchsia-500 text-lg shadow-lg shadow-black/30">
          🎤
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h2 className="text-lg font-semibold leading-tight text-white">
              Roast or Hype
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-200 ring-1 ring-orange-400/30">
              ✨ AI-powered
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            Let the AI roast or hype {firstName}&apos;s portfolio — then share it
          </p>
        </div>
      </div>

      <div className="relative mt-3.5 flex gap-2">
        <motion.button
          type="button"
          onClick={() => run("roast")}
          disabled={loading}
          whileTap={{ scale: 0.96 }}
          className="flex-1 cursor-pointer rounded-lg bg-linear-to-r from-orange-500 to-rose-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-rose-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          🔥 Roast {firstName}
        </motion.button>
        <motion.button
          type="button"
          onClick={() => run("hype")}
          disabled={loading}
          whileTap={{ scale: 0.96 }}
          className="flex-1 cursor-pointer rounded-lg bg-linear-to-r from-emerald-500 to-cyan-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-cyan-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          🎉 Hype {firstName}
        </motion.button>
      </div>

      <AnimatePresence>
        {(loading || text) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`relative mt-4 rounded-2xl px-4 py-3 ring-1 ${
              mode === "hype"
                ? "bg-emerald-500/8 ring-emerald-400/20"
                : "bg-orange-500/8 ring-orange-400/20"
            }`}
          >
            {loading && !text ? (
              <div className="flex items-center gap-1.5">
                <span className="sr-only">Thinking…</span>
                {[0, 1, 2].map((n) => (
                  <motion.span
                    key={n}
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${accent}`}
                    animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{
                      duration: 0.9,
                      repeat: Infinity,
                      delay: n * 0.15,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            ) : (
              <>
                <p className="text-sm leading-6 text-slate-100">
                  <RichText text={text.slice(0, shown)} />
                  {!typingDone && (
                    <span
                      className={`ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse align-middle ${accent}`}
                    />
                  )}
                </p>
                {typingDone && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => run(mode ?? "roast")}
                      className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-white/25 hover:text-white"
                    >
                      Again
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
