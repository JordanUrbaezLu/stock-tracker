"use client";

import {
  createContext,
  useContext,
  useId,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";
import { IconInfo } from "./icons";
import { cx } from "./cx";

type FieldContextValue = { id: string; describedBy?: string; invalid: boolean };

// Lets a nested <Input> pick up its id, aria-describedby and invalid state
// without the page wiring ids by hand.
const FieldContext = createContext<FieldContextValue | null>(null);

// `cond && "msg"` style props arrive as false/"" — treat those as absent.
const given = (node: ReactNode) => node != null && node !== false && node !== "";

export type FieldProps = {
  label: ReactNode;
  /** Helper copy under the control. */
  hint?: ReactNode;
  /** Validation message; also marks a nested Input invalid. */
  error?: ReactNode;
  /** Id of the control. Omit to let Field generate one for its Input. */
  htmlFor?: string;
  children: ReactNode;
  className?: string;
};

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, hint, error, htmlFor, children, className }: FieldProps) {
  const autoId = useId();
  const id = htmlFor ?? `${autoId}-control`;
  const hintId = given(hint) ? `${autoId}-hint` : undefined;
  const errorId = given(error) ? `${autoId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext value={{ id, describedBy, invalid: errorId != null }}>
      <div className={cx("flex flex-col gap-2", className)}>
        <label htmlFor={id} className="text-[15px] font-bold leading-tight text-ink">
          {label}
        </label>
        {children}
        {hintId && (
          <p id={hintId} className="text-[14px] leading-snug text-muted">
            {hint}
          </p>
        )}
        {errorId && (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-1.5 text-[14px] font-semibold leading-snug text-loss"
          >
            <IconInfo size={16} className="mt-px shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </FieldContext>
  );
}

export type InputProps = ComponentPropsWithRef<"input"> & {
  /** Loss border. Inside a Field with an error this is automatic. */
  invalid?: boolean;
};

// The input draws its own focus (amber border + amber halo; the border is the
// text-safe --amber, since amber-bright alone is 1.8:1 on a white field —
// in dark, on the board and on jerseys the token is already bright), so it blanks
// the global :focus-visible outline color for itself — that rule is
// unlayered and would beat an outline-none utility. Transparent (not none)
// keeps a real outline in forced-colors mode. 16px text is load-bearing:
// smaller makes iOS zoom the page on focus. The 2px border is the well's
// rim: an inset groove on top reads as a slot you type into. Placeholders use
// --muted (--faint is 2.4:1 — and a placeholder is often the only label).
const INPUT =
  "h-12 w-full min-w-0 rounded-2xl border-2 bg-surface-2 px-4 text-base font-medium text-ink tabular-nums shadow-[inset_0_2px_0_color-mix(in_oklab,var(--ink)_5%,transparent)] [--focus:transparent] placeholder:font-normal placeholder:text-muted transition-[border-color,background-color,box-shadow] duration-150 ease-board focus:bg-surface focus:shadow-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 [&::-webkit-date-and-time-value]:text-left";

/** 48px text input. React 19: pass `ref` as a normal prop. */
export function Input({
  invalid,
  className,
  id,
  "aria-describedby": ariaDescribedBy,
  ...rest
}: InputProps) {
  const field = useContext(FieldContext);
  const isInvalid = invalid ?? field?.invalid ?? false;
  const describedBy =
    [ariaDescribedBy, field?.describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <input
      {...rest}
      id={id ?? field?.id}
      aria-describedby={describedBy}
      aria-invalid={isInvalid || undefined}
      className={cx(
        INPUT,
        isInvalid
          ? "border-loss focus:border-loss focus:ring-loss/20"
          : "border-line-strong hover:border-faint focus:border-amber focus:ring-amber-bright/35",
        className,
      )}
    />
  );
}
