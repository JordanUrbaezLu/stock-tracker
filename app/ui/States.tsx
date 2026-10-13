import type { ReactNode } from "react";
import { Button } from "./Button";
import { IconInfo, IconRefresh } from "./icons";
import { cx } from "./cx";
import "./primitives.css";

export type EmptyStateProps = {
  /** An icon or an emoji; sits in a tilted coin. */
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** Usually a Button / LinkButton — an empty screen is an invitation. */
  action?: ReactNode;
  className?: string;
};

/** Centered empty message; its parts rise in one after another. */
export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        "stagger-children flex flex-col items-center px-6 py-10 text-center md:py-14",
        className,
      )}
    >
      {icon != null && (
        <div
          aria-hidden
          className="mb-5 grid size-16 -rotate-6 place-items-center rounded-full border border-line-strong bg-surface-2 text-[30px] leading-none text-ink-2 shadow-lip [&_svg]:size-7"
        >
          {icon}
        </div>
      )}
      <p className="type-title text-[21px] leading-tight text-balance text-ink">{title}</p>
      {body != null && (
        <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-balance text-muted">
          {body}
        </p>
      )}
      {action != null && <div className="mt-6">{action}</div>}
    </div>
  );
}

export type ErrorStateProps = {
  title?: ReactNode;
  /** What went wrong and what to do — never an apology. */
  message?: ReactNode;
  /** Shows the retry button when given. */
  onRetry?: () => void;
  /** Default "Try again". */
  retryLabel?: string;
  className?: string;
};

/** Loss-tinted error card (with its lip) and an optional retry key.
 *  Announced via role="alert". */
export function ErrorState({
  title = "Couldn't load this",
  message = "Check your connection, then try again.",
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-tone="loss"
      className={cx(
        "ui-card flex flex-col items-start gap-4 rounded-3xl border border-loss/25 bg-loss-soft p-4 sm:flex-row sm:items-center md:p-5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {/* on-ink is the contrast color for any strong fill: white in light,
            dark wherever loss turns light (dark theme, board, jersey). */}
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-loss text-on-ink shadow-[0_3px_0_color-mix(in_oklab,var(--loss)_55%,var(--lip))] [&_svg]:size-[22px]"
        >
          <IconInfo strokeWidth={2.25} />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="type-title text-[18px] leading-tight text-ink">{title}</p>
          <p className="mt-1 text-[15px] leading-snug text-ink-2">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          icon={<IconRefresh />}
          onClick={onRetry}
          className="max-sm:ml-14"
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
