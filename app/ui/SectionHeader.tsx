import type { ReactNode } from "react";
import { cx } from "./cx";

export type SectionHeaderProps = {
  /** Write it in sentence case; it renders UPPERCASE (CSS), so screen
   *  readers still hear words, not letters. */
  title: ReactNode;
  /** Emoji (or a small icon) before the title, tilted like a sticker. */
  emoji?: ReactNode;
  /** One plain sentence under the title (15px, muted). */
  sub?: ReactNode;
  /** Short muted note beside the title, e.g. "7 investors" (wraps below
   *  it when tight). */
  meta?: ReactNode;
  /** Right-aligned slot; wraps under the title on narrow screens. */
  action?: ReactNode;
  as?: "h2" | "h3";
  /** Put on the heading — use with the section's aria-labelledby. */
  id?: string;
  className?: string;
};

/** Broadcast-style section header that sits above cards in the hall: big
 *  condensed caps. Spaces itself from the content below (mb-4, dropped when
 *  it's the last child). The action only drops to its own line once the
 *  title block would get narrower than 12rem. */
export function SectionHeader({
  title,
  emoji,
  sub,
  meta,
  action,
  as: Heading = "h2",
  id,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 not-last:mb-4",
        className,
      )}
    >
      <div className="min-w-0 flex-[1_1_12rem]">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Heading
            id={id}
            className="type-display flex min-w-0 items-center gap-2.5 text-[26px] leading-[1.05] tracking-[0.01em] text-ink uppercase lg:text-[30px]"
          >
            {emoji != null && (
              <span
                aria-hidden
                className="inline-grid shrink-0 -rotate-8 place-items-center text-[0.84em] leading-none [&_svg]:size-[0.9em]"
              >
                {emoji}
              </span>
            )}
            <span className="min-w-0">{title}</span>
          </Heading>
          {meta != null && (
            <div className="text-[15px] leading-snug font-semibold text-muted">{meta}</div>
          )}
        </div>
        {sub != null && (
          <p className="mt-1 text-[15px] leading-snug text-pretty text-muted">{sub}</p>
        )}
      </div>
      {action != null && (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>
      )}
    </div>
  );
}
