"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RichText } from "@/app/RichText";
import { useSound } from "@/app/SoundContext";
import { celebrate } from "@/app/confetti";
import { ThinkingDots, TypingCaret } from "@/app/ui/Ai";
import { Button } from "@/app/ui/Button";
import { Card } from "@/app/ui/Card";
import { Chip } from "@/app/ui/Chip";
import { SectionHeader } from "@/app/ui/SectionHeader";
import { cx } from "@/app/ui/cx";
import { IconRefresh, IconSparkle } from "@/app/ui/icons";

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

// The speech bubble takes the color of the key that was pressed, and its
// tail points back up at that key (roast = left, hype = right).
const BUBBLE: Record<Mode, { fill: string; accent: string; tail: string; label: string }> = {
  roast: {
    fill: "bg-amber-soft",
    accent: "text-amber",
    tail: "left-1/4",
    label: "🔥 The roast",
  },
  hype: {
    fill: "bg-gain-soft",
    accent: "text-gain",
    tail: "left-3/4",
    label: "🎉 The hype",
  },
};

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
  const headingId = useId();

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
      celebrate(() => play("coin")); // sound fires with the confetti burst
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
  // green and roast reads amber — consistent with the result bubble's tint.
  const bubble = BUBBLE[mode ?? "roast"];
  // The keys sit side by side, so the name only rides along when the card is
  // wide enough for it (a longer name needs a wider card).
  const nameClass =
    firstName.length > 7
      ? "@max-[27rem]:hidden"
      : firstName.length > 6
        ? "@max-[20.25rem]:hidden"
        : "@max-[19.5rem]:hidden";

  return (
    <Card as="section" aria-labelledby={headingId}>
      <div className="@container">
        <SectionHeader
          id={headingId}
          emoji="🎤"
          title="Roast or hype"
          sub={<>Let the AI roast or hype {firstName}&apos;s portfolio — then share it</>}
          meta={
            <Chip size="xs" tone="amber" icon={<IconSparkle />}>
              AI
            </Chip>
          }
        />

        {/* The two-sided switch: one key per side, an "or" coin on the seam.
            The name drops off the keys when the card is too narrow for it. */}
        <div className="relative grid grid-cols-2 gap-3 pb-1">
          <Button
            variant="danger"
            size="lg"
            fullWidth
            className="gap-1.5! px-2! @max-[22rem]:text-[15px]"
            loading={loading && mode === "roast"}
            disabled={loading && mode !== "roast"}
            aria-label={`Roast ${firstName}`}
            onClick={() => run("roast")}
          >
            <span aria-hidden>🔥</span>
            <span>
              Roast<span className={nameClass}> {firstName}</span>
            </span>
          </Button>
          <Button
            variant="gain"
            size="lg"
            fullWidth
            className="gap-1.5! px-2! @max-[22rem]:text-[15px]"
            loading={loading && mode === "hype"}
            disabled={loading && mode !== "hype"}
            aria-label={`Hype ${firstName}`}
            onClick={() => run("hype")}
          >
            <span aria-hidden>🎉</span>
            <span>
              Hype<span className={nameClass}> {firstName}</span>
            </span>
          </Button>
          <span
            aria-hidden
            className="type-label pointer-events-none absolute top-7 left-1/2 z-10 grid size-7 -translate-1/2 place-items-center rounded-full border-2 border-line-strong bg-surface text-[12px] leading-none font-bold text-ink shadow-lip"
          >
            or
          </span>
        </div>

        <AnimatePresence>
          {(loading || text) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cx("relative mt-5 rounded-[20px] px-4 py-3.5", bubble.fill)}
            >
              <span
                aria-hidden
                className={cx(
                  "absolute bottom-full h-2.5 w-5 -translate-x-1/2 [clip-path:polygon(50%_0,100%_100%,0_100%)]",
                  bubble.fill,
                  bubble.tail,
                )}
              />
              {loading && !text ? (
                <div className="flex h-7 items-center">
                  <ThinkingDots className={bubble.accent} />
                </div>
              ) : (
                <>
                  <p className={cx("type-label mb-1", bubble.accent)}>{bubble.label}</p>
                  <p className="text-base leading-7 wrap-anywhere text-ink">
                    <RichText text={text.slice(0, shown)} />
                    {!typingDone && <TypingCaret className={bubble.accent} />}
                  </p>
                  {typingDone && (
                    <div className="mt-3 flex items-center gap-2 pb-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<IconRefresh />}
                        onClick={() => run(mode ?? "roast")}
                      >
                        Again
                      </Button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
