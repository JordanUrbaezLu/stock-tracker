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
      className={`relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border text-base transition hover:-translate-y-0.5 ${
        enabled
          ? "border-cyan-300/30 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300/60"
          : "border-white/10 bg-white/5 text-slate-400 hover:border-white/25 hover:text-slate-200"
      } ${className}`}
    >
      <span aria-hidden>{enabled ? "🔊" : "🔇"}</span>
      <span className="pointer-events-none absolute -right-1.5 -top-1.5 rounded-full bg-linear-to-r from-rose-500 to-orange-500 px-1 py-px text-[7px] font-bold uppercase tracking-wide text-white shadow-sm shadow-rose-500/40">
        New
      </span>
    </button>
  );
}
