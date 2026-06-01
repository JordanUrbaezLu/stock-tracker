"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useSound } from "./SoundContext";

/**
 * Goes to the previous page (real browser history) instead of always jumping
 * home. Falls back to "/" when there's no in-app history to go back to (e.g. a
 * shared deep link opened in a fresh tab).
 */
export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  const { play } = useSound();

  const onClick = () => {
    play("nav");
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={
        className ??
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-semibold text-cyan-100 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:text-white sm:px-4"
      }
    >
      ← Back
    </motion.button>
  );
}
