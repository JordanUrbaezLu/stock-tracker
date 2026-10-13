"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { RichText } from "@/app/RichText";
import { useSound } from "@/app/SoundContext";
import { ThinkingDots, TypingCaret } from "@/app/ui/Ai";
import { Avatar } from "@/app/ui/Avatar";
import { Button } from "@/app/ui/Button";
import { Card } from "@/app/ui/Card";
import { Chip } from "@/app/ui/Chip";
import { Input } from "@/app/ui/Field";
import { SectionHeader } from "@/app/ui/SectionHeader";
import { IconSparkle } from "@/app/ui/icons";

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

/** The AI's side of the thread wears the same amber sparkle coin as AiNote. */
function AiCoin() {
  return (
    <span
      aria-hidden
      className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-soft text-amber"
    >
      <IconSparkle size={16} strokeWidth={2} />
    </span>
  );
}

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
  const headingId = useId();

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
    <Card as="section" aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        emoji="💬"
        title="Ask the AI"
        sub="Ask anything about your portfolio and everyone else's"
        meta={
          <Chip size="xs" tone="amber" icon={<IconSparkle />}>
            AI
          </Chip>
        }
      />

      {qa.length > 0 && (
        <div
          ref={threadRef}
          role="log"
          aria-label="Conversation with the AI"
          tabIndex={0}
          className="-mx-1 flex max-h-80 flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl px-1 py-1"
        >
          {qa.map((item, i) => {
            const isTyping = !!typing && typing.index === i;
            const shown =
              isTyping && typing ? item.a.slice(0, typing.shown) : item.a;
            const stillTyping =
              isTyping && typing ? typing.shown < item.a.length : false;
            return (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex items-end justify-end gap-2">
                  <p className="max-w-[82%] rounded-[20px] rounded-br-md bg-ink px-3.5 py-2.5 text-base leading-snug font-medium wrap-anywhere text-on-ink">
                    {item.q}
                  </p>
                  <Avatar name={askerName} size={28} className="shrink-0" />
                </div>
                <div className="flex items-end gap-2">
                  <AiCoin />
                  {item.a ? (
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="max-w-[86%] rounded-[20px] rounded-bl-md bg-surface-2 px-3.5 py-2.5 text-base leading-6 wrap-anywhere text-ink"
                    >
                      <RichText text={shown} />
                      {stillTyping && <TypingCaret className="text-amber" />}
                    </motion.p>
                  ) : (
                    <div className="flex h-11 items-center rounded-[20px] rounded-bl-md bg-surface-2 px-4 text-amber">
                      <ThinkingDots />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {qa.length === 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-3 pb-1">
          {SUGGESTIONS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="secondary"
              className="max-w-full px-3.5!"
              onClick={() => ask(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="mt-4 flex items-center gap-2 pb-1"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about holdings, returns, or the group…"
          aria-label="Ask the AI a question"
          maxLength={300}
          autoComplete="off"
          enterKeyHint="send"
          className="flex-1 text-ellipsis"
        />
        <Button type="submit" disabled={loading || !q.trim()}>
          Ask
        </Button>
      </form>
    </Card>
  );
}
