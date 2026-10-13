"use client";

import { useState } from "react";
import { IconButton } from "./ui/Button";
import { Card } from "./ui/Card";
import { IconClose, IconShare } from "./ui/icons";

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
    <Card as="section" aria-label="Install the app" padding="sm" className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid size-11 shrink-0 -rotate-6 place-items-center rounded-2xl bg-amber-soft text-amber"
      >
        <IconShare size={22} />
      </span>
      <p className="min-w-0 flex-1 text-[15px] leading-snug text-ink-2 text-pretty">
        <strong className="font-bold text-ink">Put the club on your home screen</strong>
        {" — "}tap <strong className="font-bold text-ink">Share</strong>, then{" "}
        <strong className="font-bold text-ink">Add to Home Screen</strong>.
      </p>
      <IconButton
        label="Dismiss install tip"
        variant="secondary"
        size="sm"
        className="shrink-0"
        onClick={() => {
          setShow(false);
          try {
            window.localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // Dismiss for this session only.
          }
        }}
      >
        <IconClose />
      </IconButton>
    </Card>
  );
}
