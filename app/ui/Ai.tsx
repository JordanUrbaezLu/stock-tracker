import type { ReactNode } from "react";
import { cx } from "./cx";
import { IconSparkle } from "./icons";
import "./primitives.css";

/**
 * The one way AI-written text appears in the hall: a soft well with an amber
 * sparkle coin. Daily brief, card insights, analysis bodies — same look
 * everywhere so people learn "sparkle = the AI's take".
 */
export function AiNote({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  /** Optional sentence-case label above the text, e.g. "Today's brief". */
  label?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx("flex items-start gap-3 rounded-[18px] bg-surface-2 px-3.5 py-3", className)}
    >
      <span
        aria-hidden
        className="mt-px grid size-7 shrink-0 place-items-center rounded-full bg-amber-soft text-amber"
      >
        <IconSparkle size={16} strokeWidth={2} />
      </span>
      <div className="min-w-0 pt-0.5 text-[15px] leading-6 text-ink-2">
        {label ? <p className="type-label mb-0.5">{label}</p> : null}
        {children}
      </div>
    </div>
  );
}

/** Three bouncing dots while the AI works (still under reduced motion).
 *  Inherits text color. CSS-driven, so a server-rendered loading state
 *  hydrates cleanly. */
export function ThinkingDots({
  label = "Thinking…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" className={cx("ui-dots inline-flex items-center gap-1.5", className)}>
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((n) => (
        <span key={n} aria-hidden className="ui-dots__dot size-2 rounded-full bg-current" />
      ))}
    </span>
  );
}

/** Blinking caret that trails typewriter text. Inherits text color. */
export function TypingCaret({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "ml-0.5 inline-block h-[1.05em] w-[3px] translate-y-[0.15em] animate-pulse rounded-full bg-current align-baseline motion-reduce:animate-none",
        className,
      )}
    />
  );
}
