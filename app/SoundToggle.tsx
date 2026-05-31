"use client";

import { useSound } from "./SoundContext";

/** Compact speaker toggle that matches the header pill styling. */
export function SoundToggle({ className = "" }: { className?: string }) {
  const { enabled, toggle } = useSound();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Mute sounds" : "Unmute sounds"}
      title={enabled ? "Mute sounds" : "Unmute sounds"}
      className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border text-base transition hover:-translate-y-0.5 ${
        enabled
          ? "border-cyan-300/30 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300/60"
          : "border-white/10 bg-white/5 text-slate-400 hover:border-white/25 hover:text-slate-200"
      } ${className}`}
    >
      <span aria-hidden>{enabled ? "🔊" : "🔇"}</span>
    </button>
  );
}
