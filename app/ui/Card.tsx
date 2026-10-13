import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import "./primitives.css";

export type CardTone = "default" | "gain" | "loss" | "amber";
export type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-3 md:p-4",
  md: "p-4 md:p-5",
  lg: "p-5 md:p-6",
};

// Tinted cards keep the lip, tinted to match (primitives.css).
const TONE: Record<CardTone, { base: string; hover: string }> = {
  default: { base: "border-line bg-surface", hover: "hover:border-line-strong" },
  gain: { base: "border-gain/25 bg-gain-soft", hover: "hover:border-gain/50" },
  loss: { base: "border-loss/25 bg-loss-soft", hover: "hover:border-loss/50" },
  amber: { base: "border-amber-bright/60 bg-amber-soft", hover: "hover:border-amber-bright" },
};

type CardOwnProps = {
  as?: "div" | "section" | "article" | "li";
  /** none · sm 12→16 · md 16→20 (default) · lg 20→24 (phone → ≥768). */
  padding?: CardPadding;
  /** Hover lift + stronger border + press sink. For cards that link somewhere. */
  interactive?: boolean;
  /** Tinted background, border and lip. */
  tone?: CardTone;
  /** Floating card (e.g. pulled over the board's bottom edge): deeper lip
   *  and pop shadow, plus a firmer edge in dark mode, where surface and
   *  board are close. */
  raised?: boolean;
  className?: string;
  children?: ReactNode;
};

export type CardProps = CardOwnProps &
  Omit<HTMLAttributes<HTMLElement>, keyof CardOwnProps>;

/** The arena's physical card: 24px radius, hairline border, solid lip. */
export function Card({
  as = "div",
  padding = "md",
  interactive = false,
  tone = "default",
  raised = false,
  className,
  children,
  ...rest
}: CardProps) {
  const Tag: ElementType = as;
  return (
    <Tag
      {...rest}
      data-tone={tone === "default" ? undefined : tone}
      data-raised={raised ? "" : undefined}
      data-interactive={interactive ? "" : undefined}
      className={cx(
        "ui-card rounded-3xl border",
        TONE[tone].base,
        raised && tone === "default" && "dark:border-line-strong",
        PADDING[padding],
        interactive && TONE[tone].hover,
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export type CardHeaderProps = {
  title: ReactNode;
  /** Small sentence-case label above the title. */
  eyebrow?: ReactNode;
  /** Shown in a small tile at the left. */
  icon?: ReactNode;
  /** Right-aligned slot (a ghost Button, a Chip, a Menu…). */
  action?: ReactNode;
  /** Heading level; cards sit under h2 section headers, so h3 by default. */
  as?: "h2" | "h3" | "h4";
  className?: string;
};

/** Card title row. Spaces itself from the content below (mb-4) — and drops
 *  that margin when it's the card's only child, since a conflicting className
 *  can't reliably override it (no class merging). */
export function CardHeader({
  title,
  eyebrow,
  icon,
  action,
  as: Heading = "h3",
  className,
}: CardHeaderProps) {
  return (
    <div className={cx("flex items-center gap-3 not-last:mb-4", className)}>
      {icon != null && (
        // Translucent ink (not surface-2) so the tile reads on white,
        // tinted, dark, board and jersey cards alike.
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-ink/6 text-ink-2 [&_svg]:size-5"
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow != null && <p className="type-label mb-0.5 truncate">{eyebrow}</p>}
        <Heading className="type-title text-[19px] leading-tight text-balance text-ink">
          {title}
        </Heading>
      </div>
      {action != null && <div className="flex shrink-0 items-center">{action}</div>}
    </div>
  );
}
