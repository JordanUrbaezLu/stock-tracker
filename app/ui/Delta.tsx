import type { ReactNode } from "react";
import {
  formatCurrency,
  formatPercent,
  formatPercentAbs,
  toneOf,
  toneSoft,
  toneText,
} from "./format";
import { IconArrowRight, IconArrowUpRight, IconTriangleDown, IconTriangleUp } from "./icons";
import { cx } from "./cx";

export type DeltaSize = "sm" | "md" | "lg" | "xl";
export type DeltaVariant = "inline" | "pill" | "phrase";

const SIZE: Record<DeltaSize, { text: string; marker: number; pill: string }> = {
  sm: { text: "text-[13px]", marker: 8, pill: "px-2 py-1" },
  md: { text: "text-[15px]", marker: 9, pill: "px-2.5 py-1" },
  lg: { text: "text-[18px]", marker: 11, pill: "px-3 py-1.5" },
  xl: { text: "text-[20px]", marker: 12, pill: "px-3.5 py-1.5" },
};

const SPOKEN = { gain: "up", loss: "down", flat: "unchanged" } as const;
const WORD = { gain: "Up", loss: "Down", flat: "Flat" } as const;

// The phrase's arrow sits in a coin of its own tone. A translucent tone fill
// (not the *-soft token) so the coin still shows on a same-tone tinted card;
// tone colors are re-pointed by every context, so it reads on the hall, the
// board and a jersey alike.
const COIN = {
  gain: "bg-gain/15 text-gain",
  loss: "bg-loss/15 text-loss",
  flat: "bg-ink/8 text-muted",
} as const;

const present = (n: number | null | undefined): n is number =>
  n != null && !Number.isNaN(n);

export type DeltaProps = {
  /** Currency change; shown as a magnitude (the marker carries the sign). */
  value?: number | null;
  /** Percent change, e.g. 5.67 for +5.67%. */
  percent?: number | null;
  /** Default: "both" when both are given, else whichever is present. */
  show?: "both" | "currency" | "percent";
  /** inline = colored text (default) · pill = soft tinted capsule ·
   *  phrase = plain words with an arrow coin ("Up $12.34 · +5.6%"). */
  variant?: DeltaVariant;
  /** sm 13px · md 15px (default) · lg 18px · xl 20px (board summaries). */
  size?: DeltaSize;
  /** Muted lead-in, e.g. "Today" (inline/pill) or "Today:" (phrase — the
   *  word after it goes lowercase: "Today: down $1.23"). */
  prefix?: ReactNode;
  /** Muted tail, e.g. "all time" / "since starting". */
  suffix?: ReactNode;
  /** Percent decimals (default 2). */
  decimals?: number;
  className?: string;
};

/**
 * Signed change: "▲ $12.34 · +5.67% all time", "Today ▼ $1.23 · −0.45%", or
 * in words: "↗ Up $12.34 · +5.6% since starting". Tone comes from
 * `value ?? percent`. A percent shown alone is a magnitude ("▲ 5.67%",
 * "Up 5.67%") — the marker or the word already says which way.
 */
export function Delta({
  value,
  percent,
  show,
  variant = "inline",
  size = "md",
  prefix,
  suffix,
  decimals = 2,
  className,
}: DeltaProps) {
  const raw = present(value) ? value : percent;
  // A move that prints as zero is flat — "Up $0.00" in green reads as a bug.
  const printsAsZero = present(value)
    ? Math.abs(value) < 0.005
    : present(percent) && Math.abs(percent) < 0.5 / 10 ** decimals;
  const basis = printsAsZero ? 0 : raw;
  const tone = toneOf(basis);
  const s = SIZE[size];

  const mode =
    show ?? (present(value) && present(percent) ? "both" : present(value) ? "currency" : "percent");
  const currency =
    mode !== "percent" && present(value) ? formatCurrency(Math.abs(value)) : null;
  const pct =
    mode !== "currency" && present(percent)
      ? currency
        ? formatPercent(percent, decimals)
        : formatPercentAbs(percent, decimals)
      : null;

  if (currency == null && pct == null) {
    return (
      <span className={cx("tabular-nums text-muted", s.text, className)}>
        <span aria-hidden>—</span>
        <span className="sr-only">No change data</span>
      </span>
    );
  }

  const amounts = (
    <>
      {currency}
      {currency && pct && (
        <span aria-hidden className="mx-1 opacity-50">
          ·
        </span>
      )}
      {pct}
    </>
  );

  if (variant === "phrase") {
    const word = prefix != null ? WORD[tone].toLowerCase() : WORD[tone];
    const Arrow = tone === "flat" ? IconArrowRight : IconArrowUpRight;
    return (
      <span
        className={cx(
          "inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 leading-tight font-semibold tabular-nums",
          s.text,
          className,
        )}
      >
        {prefix != null && <span className="whitespace-nowrap text-ink-2">{prefix}</span>}
        <span className={cx("inline-flex items-center whitespace-nowrap font-bold", toneText(basis))}>
          <span
            aria-hidden
            className={cx(
              "mr-1.5 grid size-[1.35em] shrink-0 place-items-center rounded-full",
              COIN[tone],
            )}
          >
            <Arrow
              strokeWidth={3}
              className={cx("size-[0.85em]", tone === "loss" && "rotate-90")}
            />
          </span>
          {/* Flat reads as just the word; amounts would only repeat "0". */}
          {tone === "flat" ? (
            word
          ) : (
            <>
              {word}&nbsp;{amounts}
            </>
          )}
        </span>
        {suffix != null && <span className="whitespace-nowrap text-muted">{suffix}</span>}
      </span>
    );
  }

  const pill = variant === "pill";
  const aside = pill ? "font-medium opacity-75" : "font-medium text-muted";

  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center leading-none font-bold tabular-nums",
        s.text,
        pill
          ? cx("whitespace-nowrap rounded-full", s.pill, toneSoft(basis))
          : cx("flex-wrap gap-y-1", toneText(basis)),
        className,
      )}
    >
      {prefix != null && <span className={cx("mr-1.5 whitespace-nowrap", aside)}>{prefix}</span>}
      <span className="inline-flex items-center whitespace-nowrap">
        {tone === "gain" ? (
          <IconTriangleUp size={s.marker} className="mr-1 shrink-0 -translate-y-px" />
        ) : tone === "loss" ? (
          <IconTriangleDown size={s.marker} className="mr-1 shrink-0" />
        ) : (
          <span aria-hidden className="mr-1.5 size-[0.3em] shrink-0 rounded-full bg-current" />
        )}
        <span className="sr-only">{SPOKEN[tone]} </span>
        {amounts}
      </span>
      {suffix != null && <span className={cx("ml-1.5 whitespace-nowrap", aside)}>{suffix}</span>}
    </span>
  );
}
