"use client";

import { useState } from "react";

const DISMISS_KEY = "pulse:nudge-dismissed";

/** Show only to iPhone/iPad Safari visitors who haven't installed or
 *  dismissed. Safe as a lazy initializer: the parent only mounts this after a
 *  client-side data fetch, so there is no server render to mismatch. */
function shouldShow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(DISMISS_KEY)) return false;
  } catch {
    return false;
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  if (standalone) return false;
  // iPadOS reports itself as MacIntel with touch — catch both shapes.
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
  );
}

/**
 * One-time nudge for iPhone/iPad Safari visitors to install the app on their
 * home screen — the icon on the springboard is itself the strongest daily
 * check-in cue. Hidden in standalone mode, on non-iOS devices, and forever
 * once dismissed.
 */
export function InstallNudge() {
  const [show, setShow] = useState(shouldShow);

  if (!show) return null;

  return (
    <div className="glass flex items-center gap-3 rounded-2xl border-cyan-400/15 px-4 py-3">
      <span aria-hidden className="text-lg">
        📌
      </span>
      <p className="min-w-0 flex-1 text-xs leading-5 text-slate-300">
        <span className="font-semibold text-white">Put the club on your home screen</span>
        {" — "}tap <span className="font-semibold text-cyan-200">Share</span>, then{" "}
        <span className="font-semibold text-cyan-200">Add to Home Screen</span>. One tap to
        check in every day.
      </p>
      <button
        type="button"
        onClick={() => {
          setShow(false);
          try {
            window.localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // Dismiss for this session only.
          }
        }}
        aria-label="Dismiss install tip"
        className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
