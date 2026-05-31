"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { RichText } from "../RichText";

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
  const threadRef = useRef<HTMLDivElement>(null);

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (!question || loading) return;
    setQ("");
    setLoading(true);
    setQa((prev) => [...prev, { q: question, a: "" }]);
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
      setQa((prev) =>
        prev.map((item, i) => (i === prev.length - 1 ? { ...item, a } : item)),
      );
    } catch {
      setQa((prev) =>
        prev.map((item, i) =>
          i === prev.length - 1
            ? { ...item, a: "Something went wrong — try again." }
            : item,
        ),
      );
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        threadRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
      });
    }
  };

  return (
    <section className="glass relative overflow-hidden rounded-3xl p-5 shadow-2xl shadow-fuchsia-500/10 ring-1 ring-fuchsia-400/10 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-fuchsia-500/15 blur-3xl"
      />
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
          className="relative mt-4 max-h-80 space-y-3 overflow-y-auto pr-1"
        >
          {qa.map((item, i) => (
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
                  <RichText text={item.a} />
                </motion.p>
              ) : (
                <p className="w-fit rounded-2xl rounded-bl-sm bg-white/5 px-3 py-2 text-sm text-slate-400 ring-1 ring-white/10">
                  Thinking…
                </p>
              )}
            </div>
          ))}
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
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
        />
        <motion.button
          type="submit"
          disabled={loading || !q.trim()}
          whileTap={{ scale: 0.95 }}
          className="shrink-0 cursor-pointer rounded-full bg-linear-to-r from-cyan-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ask
        </motion.button>
      </form>
    </section>
  );
}
