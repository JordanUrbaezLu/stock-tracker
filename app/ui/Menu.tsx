"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { IconCheck, IconChevronDown } from "./icons";
import { cx } from "./cx";
import { POP } from "./motion";
import "./primitives.css";

export type MenuItem = { value: string; label: ReactNode };

export type MenuProps = {
  /** Trigger text, e.g. "Sort: Return" or the active filter. */
  label: ReactNode;
  items: MenuItem[];
  /** The checked item. */
  value?: string;
  onSelect: (value: string) => void;
  /** Which trigger edge the popover lines up with (default "start"). Use
   *  "end" for triggers near the right edge. */
  align?: "start" | "end";
  /** Leading icon in the trigger. */
  icon?: ReactNode;
  /** Fires on every open/close (e.g. for sound cues). */
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

type Fit = { up: boolean; maxHeight: number };

/** Room for the popover: from the trigger down to the fixed tab bar (phones)
 *  or the viewport edge — unclamped it opens underneath the bar and its last
 *  items can't be tapped. Flips above the trigger when fewer than three rows
 *  fit below and there is more room up there (under the sticky brand bar). */
function measureFit(trigger: HTMLElement): Fit {
  const r = trigger.getBoundingClientRect();
  const gap = 18; // the popover's 10px offset + breathing room
  const bar = document.querySelector(".qb-tabbar")?.getBoundingClientRect();
  const floor = bar && bar.height > 0 ? bar.top : window.innerHeight;
  const head = document.querySelector(".qb-brandbar")?.getBoundingClientRect();
  const below = floor - r.bottom - gap;
  const above = r.top - Math.max(0, head?.bottom ?? 0) - gap;
  const up = below < 3 * 44 + 14 && above > below;
  return { up, maxHeight: Math.max(up ? above : below, 44 + 14) };
}

/** Pill key + popover list of single-choice items (sort / filter). */
export function Menu({
  label,
  items,
  value,
  onSelect,
  align = "start",
  icon,
  onOpenChange,
  className,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [fit, setFit] = useState<Fit | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Which item takes focus once the popover has rendered.
  const focusOnOpen = useRef<"selected" | "last">("selected");
  const reduce = useReducedMotion();
  const triggerId = useId();
  const menuId = useId();

  const setOpenState = (next: boolean, restoreFocus = false) => {
    setOpen(next);
    onOpenChange?.(next);
    if (!next && restoreFocus) triggerRef.current?.focus();
  };

  const openWith = (target: "selected" | "last") => {
    focusOnOpen.current = target;
    if (triggerRef.current) setFit(measureFit(triggerRef.current));
    setOpenState(true);
  };

  const focusItem = (index: number) => {
    const count = items.length;
    if (count === 0) return;
    itemRefs.current[(index + count) % count]?.focus();
  };

  // Focus moves into the list on open (menu-button pattern). Pointer opens
  // don't light up :focus-visible, so only keyboard users see the ring.
  const focusInitialItem = useEffectEvent(() => {
    const selected = items.findIndex((item) => item.value === value);
    focusItem(focusOnOpen.current === "last" ? items.length - 1 : Math.max(0, selected));
  });

  useEffect(() => {
    if (open) focusInitialItem();
  }, [open]);

  const closeFromOutside = useEffectEvent((e: PointerEvent) => {
    if (!rootRef.current?.contains(e.target as Node)) setOpenState(false);
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => closeFromOutside(e);
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (open) focusItem(e.key === "ArrowDown" ? 0 : items.length - 1);
      else openWith(e.key === "ArrowDown" ? "selected" : "last");
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(current < 0 ? items.length - 1 : current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(items.length - 1);
    } else if (e.key === "Tab") {
      // Let focus move on naturally; just don't leave the list hanging open.
      setOpenState(false);
    }
  };

  return (
    <div
      ref={rootRef}
      // While the popover plays its exit it is still mounted at opacity 0 —
      // without this it swallows taps on whatever sits beneath it.
      className={cx(
        // inline-flex + min-w-0: in a tight row the trigger shrinks and its
        // label truncates instead of pushing the page wider.
        "relative inline-flex min-w-0 max-w-full [&:has(>button[aria-expanded=false])>[role=menu]]:pointer-events-none",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        // preventDefault tells an enclosing Modal this ESC was handled.
        e.preventDefault();
        e.stopPropagation();
        setOpenState(false, true);
      }}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpenState(false) : openWith("selected"))}
        onKeyDown={onTriggerKeyDown}
        data-variant="secondary"
        data-live=""
        className="ui-key relative inline-flex h-11 min-w-0 max-w-full cursor-pointer select-none items-center gap-2 rounded-full pr-3 pl-4 text-[15px] font-bold [--key-lip-size:3px] [&_svg]:shrink-0"
      >
        {icon != null && <span className="-ml-1 text-ink-2 [&_svg]:size-[18px]">{icon}</span>}
        <span className="truncate">{label}</span>
        <IconChevronDown
          size={18}
          strokeWidth={2.25}
          className={cx(
            "text-muted transition-transform duration-200 ease-board motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            onKeyDown={onListKeyDown}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: fit?.up ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: fit?.up ? 4 : -4 }}
            transition={
              reduce
                ? { duration: 0.12 }
                : { ...POP, opacity: { duration: 0.12, ease: "easeOut" } }
            }
            style={{
              transformOrigin: `${fit?.up ? "bottom" : "top"} ${align === "end" ? "right" : "left"}`,
              // Inline so it also caps a page's own max-height override.
              maxHeight: fit ? `min(26rem, 60dvh, ${Math.floor(fit.maxHeight)}px)` : undefined,
            }}
            className={cx(
              "absolute z-30 max-h-[min(26rem,60dvh)] min-w-48 max-w-[calc(100vw-2rem)] overflow-auto overscroll-contain rounded-[20px] border border-line bg-surface p-1.5 shadow-pop",
              fit?.up ? "bottom-full mb-2.5" : "top-full mt-2.5",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {items.map((item, index) => {
              const selected = item.value === value;
              return (
                <button
                  key={item.value}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  tabIndex={-1}
                  onClick={() => {
                    onSelect(item.value);
                    setOpenState(false, true);
                  }}
                  className={cx(
                    "flex h-11 w-full cursor-pointer select-none items-center gap-3 rounded-[14px] px-3 text-left text-[15px] whitespace-nowrap transition-colors duration-100 hover:bg-surface-2 focus:bg-surface-2",
                    selected ? "font-bold text-ink" : "font-medium text-ink-2",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {/* The checked item wears the amber "active" coin; reserved
                      even when unchecked so the list never reflows. */}
                  <span
                    aria-hidden
                    className={cx(
                      "grid size-6 shrink-0 place-items-center rounded-full",
                      selected ? "on-amber bg-amber-bright shadow-[0_2px_0_var(--amber-lip)]" : "invisible",
                    )}
                  >
                    <IconCheck size={14} strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
