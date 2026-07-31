"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { RichText } from "../RichText";
import { useSound } from "../SoundContext";

type ChatHolding = {
  symbol: string;
  changePercent?: number | null;
  currentValue?: number | null;
  status?: "open" | "closed";
};

type ChatInvestor = {
  name: string;
  currentValue: number;
  originalAmountInvested: number;
  alphaSpy?: number | null;
  dayChangePercent?: number | null;
  holdings: ChatHolding[];
};

const SUGGESTIONS = ["How am I doing overall?", "How do I compare to the others?"];

export function PortfolioChat({
  askerName,
  investors,
}: {
  askerName: string;
  investors: ChatInvestor[];
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  // Typewriter reveal for the most recent answer: which item, and how many
  // characters are currently shown.
  const [typing, setTyping] = useState<{ index: number; shown: number } | null>(
    null,
  );
  const threadRef = useRef<HTMLDivElement>(null);
  const { play, startSearching, stopSearching } = useSound();

  // Reveal the answer a few characters at a time for a live "typing" feel
  // (25ms/step), with a soft key tick every ~12 chars.
  useEffect(() => {
    if (!typing) return;
    const full = qa[typing.index]?.a ?? "";
    if (typing.shown >= full.length) return; // fully revealed — stop
    const id = window.setTimeout(() => {
      const prev = typing.shown;
      const next = Math.min(full.length, prev + 3);
      if (Math.floor(next / 12) !== Math.floor(prev / 12)) play("type");
      setTyping((t) => (t ? { ...t, shown: next } : t));
      threadRef.current?.scrollTo({ top: 1e9 });
    }, 25);
    return () => window.clearTimeout(id);
  }, [typing, qa, play]);

  // Keep the latest message in view: scroll to the bottom whenever a message is
  // added/updated or the answer types out.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [qa, typing]);

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (!question || loading) return;
    setQ("");
    setLoading(true);
    play("send");
    startSearching(); // looped "thinking" sound while the assistant works
    let pendingIndex = 0;
    setQa((prev) => {
      pendingIndex = prev.length;
      return [...prev, { q: question, a: "" }];
    });
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          askerName,
          question,
          investors: investors.map((inv) => {
            const gain = inv.currentValue - inv.originalAmountInvested;
            return {
              name: inv.name,
              currentValue: inv.currentValue,
              originalInvested: inv.originalAmountInvested,
              gainPct: inv.originalAmountInvested
                ? (gain / inv.originalAmountInvested) * 100
                : 0,
              alphaSpy: inv.alphaSpy ?? null,
              dayChangePercent: inv.dayChangePercent ?? null,
              holdings: (inv.holdings || []).map((h) => ({
                symbol: h.symbol,
                changePercent: h.changePercent ?? null,
                currentValue: h.currentValue ?? null,
                status: h.status,
              })),
            };
          }),
        }),
      });
      const json = (await res.json()) as { answer?: string; error?: string };
      const a = json.answer || json.error || "No answer.";
      stopSearching(); // stop the thinking loop before the answer types in
      play("receive");
      setQa((prev) =>
        prev.map((item, i) => (i === prev.length - 1 ? { ...item, a } : item)),
      );
      setTyping({ index: pendingIndex, shown: 0 }); // begin typewriter reveal
    } catch {
      setQa((prev) =>
        prev.map((item, i) =>
          i === prev.length - 1
            ? { ...item, a: "Something went wrong — try again." }
            : item,
        ),
      );
    } finally {
      stopSearching();
      setLoading(false);
      requestAnimationFrame(() => {
        threadRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
      });
    }
  };

  return (
    <section className="glass relative rounded-3xl border-fuchsia-400/15 p-5 shadow-2xl shadow-fuchsia-500/10 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        <div className="absolute -left-16 -top-16 h-44 w-44 rounded-full bg-fuchsia-500/15 blur-3xl" />
      </div>
      <div className="relative flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-cyan-400 via-fuchsia-500 to-indigo-500 text-lg shadow-lg shadow-black/30">
          🤖
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h2 className="text-lg font-semibold leading-tight text-white">
              Portfolio Assistant
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fuchsia-200 ring-1 ring-fuchsia-400/30">
              ✨ AI-powered
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            Ask the AI anything about your stock portfolio and everyone
            else&apos;s
          </p>
        </div>
      </div>

      {qa.length > 0 && (
        <div
          ref={threadRef}
          className="relative mt-4 max-h-80 space-y-3 overflow-y-auto overscroll-contain px-0.5 pb-0.5 pt-1.5"
        >
          {qa.map((item, i) => {
            const isTyping = !!typing && typing.index === i;
            const shown =
              isTyping && typing ? item.a.slice(0, typing.shown) : item.a;
            const stillTyping =
              isTyping && typing ? typing.shown < item.a.length : false;
            return (
              <div key={i} className="space-y-1.5">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-cyan-500/15 px-3 py-1.5 text-sm text-cyan-50 ring-1 ring-cyan-400/20">
                  {item.q}
                </p>
                {item.a ? (
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-fit max-w-[92%] rounded-2xl rounded-bl-sm bg-white/5 px-3 py-2 text-sm leading-5 text-slate-100 ring-1 ring-white/10"
                  >
                    <RichText text={shown} />
                    {stillTyping && (
                      <span className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse bg-fuchsia-300/90 align-middle" />
                    )}
                  </motion.p>
                ) : (
                  <div className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white/5 px-3.5 py-3 ring-1 ring-white/10">
                    <span className="sr-only">Thinking…</span>
                    {[0, 1, 2].map((n) => (
                      <motion.span
                        key={n}
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full bg-fuchsia-300/90"
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {qa.length === 0 && (
        <div className="relative mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="relative mt-4 flex items-center gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask the AI about your holdings, returns, or the group…"
          maxLength={300}
          className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
        />
        <motion.button
          type="submit"
          disabled={loading || !q.trim()}
          whileTap={{ scale: 0.95 }}
          className="h-11 shrink-0 cursor-pointer rounded-full bg-linear-to-r from-cyan-500 to-fuchsia-500 px-4 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ask
        </motion.button>
      </form>
    </section>
  );
}
