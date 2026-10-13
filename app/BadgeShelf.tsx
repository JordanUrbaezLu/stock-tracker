"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSound } from "./SoundContext";
import { celebrate } from "./confetti";
import { getBadges, type BadgeStatus, type BadgeInvestor } from "./badges";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Chip } from "./ui/Chip";
import { Modal } from "./ui/Modal";
import { ProgressBar } from "./ui/ProgressBar";
import { SectionHeader } from "./ui/SectionHeader";
import { Sticker } from "./ui/Sticker";
import { cx } from "./ui/cx";
import { IconCheck, IconLock } from "./ui/icons";

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
 * The sticker book: an investor's achievements. Stickers are derived from
 * the live portfolio data. Newly-earned ones get a one-time confetti + chime
 * and wear a "NEW" burst that persists across visits until the viewer taps
 * the sticker to read what it means — tapping opens a detail popup and
 * acknowledges (clears) the NEW burst for that sticker.
 */
export function Badges({
  investor,
  allInvestors,
}: {
  investor: BadgeInvestor;
  allInvestors: BadgeInvestor[];
}) {
  // The full catalog with earned status — earned ones are stuck in the book,
  // the rest are empty "?" slots so the viewer sees what's left to chase.
  const badges = getBadges(investor, allInvestors);
  const earnedIds = badges.filter((b) => b.earned).map((b) => b.id);
  const { play } = useSound();
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  // `selected` outlives `open` so the popup keeps its content while it
  // animates out.
  const [selected, setSelected] = useState<BadgeStatus | null>(null);
  const [open, setOpen] = useState(false);
  const handled = useRef(false);
  const headingId = useId();

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
      setOpen(true);
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

  // Modal owns Escape, the scrim tap and the body scroll lock.
  const close = useCallback(() => {
    play("close");
    setOpen(false);
  }, [play]);

  if (badges.length === 0) return null;

  const total = badges.length;
  const earned = earnedIds.length;
  const left = total - earned;

  return (
    <section aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        emoji="🏅"
        title="Sticker book"
        sub={`${earned} of ${total} collected`}
      />
      <Card>
        <div className="@container">
          <div className="flex items-center gap-3">
            <ProgressBar
              value={total ? earned / total : 0}
              tone="gain"
              size="lg"
              label={`${earned} of ${total} stickers collected`}
              className="min-w-0 flex-1"
            />
            <p className="shrink-0 text-[14px] leading-none font-semibold text-muted">
              {left === 0 ? "All collected!" : `${left} to go`}
            </p>
          </div>

          <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-5 @[16rem]:grid-cols-3 @[30rem]:grid-cols-5">
            {badges.map((b, i) => (
              <li
                key={b.id}
                className={cx(
                  "flex min-w-0 flex-col items-center gap-2 text-center",
                  // A lone last sticker sits in the middle of its row, not
                  // stranded on the left (3-col: 10 → 3·3·3·1; 2-col: odd).
                  i === total - 1 && total % 3 === 1 && "@[16rem]:@max-[30rem]:col-start-2",
                  i === total - 1 && total % 2 === 1 && "@max-[16rem]:col-span-2",
                )}
              >
                <Sticker
                  emoji={b.emoji}
                  tone={b.tone}
                  earned={b.earned}
                  isNew={b.earned && newIds.has(b.id)}
                  seed={b.id}
                  size={56}
                  label={`${b.label}${b.earned ? "" : " (locked)"} — ${b.description}`}
                  onClick={() => openBadge(b)}
                />
                <span
                  className={cx(
                    "max-w-full text-[14px] leading-tight font-semibold text-balance",
                    b.earned ? "text-ink" : "text-muted",
                  )}
                >
                  {b.label}
                </span>
              </li>
            ))}
          </ul>

          <p className="type-label mt-5 text-center">Tap a sticker to see how it&apos;s earned.</p>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={close}
        size="sm"
        title={selected?.label ?? ""}
        footer={
          <Button fullWidth onClick={close}>
            Got it
          </Button>
        }
      >
        {selected && (
          <div className="flex flex-col items-center gap-4 pt-3 pb-1 text-center">
            <Sticker
              key={selected.id}
              emoji={selected.emoji}
              tone={selected.tone}
              earned={selected.earned}
              seed={selected.id}
              size={96}
            />
            {selected.earned ? (
              <Chip tone="gain" icon={<IconCheck />}>
                Earned
              </Chip>
            ) : (
              <Chip icon={<IconLock />}>Locked</Chip>
            )}
            <p className="text-base leading-relaxed text-pretty text-ink-2">
              {selected.earned ? selected.description : `How to earn: ${selected.description}`}
            </p>
          </div>
        )}
      </Modal>
    </section>
  );
}
