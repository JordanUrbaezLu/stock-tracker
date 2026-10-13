"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSound } from "./SoundContext";
import { IconSoundOff, IconSoundOn } from "./ui/icons";
import { cx } from "./ui/cx";
import { POP } from "./ui/motion";
import "./ui/primitives.css";

/**
 * Speaker toggle for the UI sounds (preference persists via SoundContext).
 * The accessible name stays "Mute sounds" and aria-pressed reports the muted
 * state — a toggle whose label flips with its state reads backwards to screen
 * readers. The tooltip names the action for sighted users. A round key:
 * muted, it stays latched half-down (.ui-key[aria-pressed]).
 */
export function SoundToggle({ className = "" }: { className?: string }) {
  const { enabled, toggle } = useSound();
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!enabled}
      aria-label="Mute sounds"
      title={enabled ? "Mute sounds" : "Unmute sounds"}
      data-variant="secondary"
      data-live=""
      className={cx(
        "ui-key relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-full [--key-lip-size:3px]",
        enabled ? "text-ink" : "text-muted",
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={enabled ? "on" : "off"}
          className="grid place-items-center"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: -20 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: 20 }}
          transition={reduce ? { duration: 0.12 } : POP}
        >
          {enabled ? (
            <IconSoundOn size={20} strokeWidth={2} />
          ) : (
            <IconSoundOff size={20} strokeWidth={2} />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
