"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { useSound } from "./SoundContext";

type CarouselProps = {
  slides: ReactNode[];
  /** Per-slide labels, used for dot accessibility + the optional hint. */
  labels?: string[];
  /** Show side arrows on tablet/desktop (hidden on mobile). */
  arrows?: boolean;
  /** Static hint string, or a function of the active slide's label. */
  hint?: string | ((label: string) => string);
  /** Only show the hint on mobile (where swiping is the only affordance). */
  hintMobileOnly?: boolean;
  className?: string;
  /** Tailwind padding applied to each slide (defaults to a hair of gutter). */
  slidePadding?: string;
  /** Extra classes for the clipping viewport. Round it (e.g. rounded-[1.75rem])
   *  when slides are rounded cards with shadows, so the overflow clip follows
   *  the card corners instead of cutting a square corner around the shadow. */
  viewportClassName?: string;
  /** Only mount a small window around the active slide (one behind, two ahead);
   *  render the rest as empty same-width placeholders. Massively cuts work on
   *  mobile — off-screen cards no longer run sparkline pulses, spin logo rings,
   *  fetch insights, or mount animations. Slide widths are unaffected
   *  (basis-full), so Embla's snapping is unchanged; placeholders stretch to the
   *  row height (which is locked grow-only so it never shifts). */
  virtualize?: boolean;
};

/**
 * Embla-powered carousel: native-feeling drag physics (a short flick advances),
 * trackpad two-finger swipe via the wheel-gestures plugin, and GPU transforms.
 * Vertical page scrolling is preserved (touch-action: pan-y + axis-aware wheel).
 */
export function Carousel({
  slides,
  labels,
  arrows = false,
  hint,
  hintMobileOnly = false,
  className,
  slidePadding = "px-0.5",
  viewportClassName = "",
  virtualize = false,
}: CarouselProps) {
  const [emblaRef, embla] = useEmblaCarousel(
    { align: "center", containScroll: "trimSnaps", duration: 20 },
    [WheelGesturesPlugin()],
  );
  const [selected, setSelected] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  // When virtualizing, lock the track to the tallest slide it has rendered so
  // swapping placeholders in/out never changes the carousel's height. Grow-only,
  // and measured live — so it adapts per device automatically (e.g. the graph
  // slide is ~198px on phones but ~231px on tablet/desktop) with no hardcoding.
  const [lockedHeight, setLockedHeight] = useState(0);
  const { swipe } = useSound();
  // Pitch follows a consecutive-swipe COMBO, not the slide index. A forward
  // swipe sits ABOVE center, a back swipe BELOW it, and each additional swipe
  // in the same direction climbs/descends another scale step. Reversing starts
  // a fresh run, so alternating right/left gives a distinct high/low (not the
  // same note), and holding a direction keeps rising/falling.
  const CENTER = 4;
  const lastNearestRef = useRef(0);
  const dirRef = useRef(0);
  const comboRef = useRef(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!virtualize || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      setLockedHeight((prev) => (h > prev ? h : prev)); // grow-only → no shrink/loop
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtualize]);

  useEffect(() => {
    if (!embla) return;
    const syncNav = () => {
      setCanPrev(embla.canScrollPrev());
      setCanNext(embla.canScrollNext());
    };
    // The snap index the carousel is currently closest to (updates continuously
    // as you scroll, unlike `selectedScrollSnap()` which only commits on settle).
    const nearestSnap = () => {
      const list = embla.scrollSnapList();
      const p = embla.scrollProgress();
      let idx = 0;
      let best = Infinity;
      for (let i = 0; i < list.length; i++) {
        const d = Math.abs(list[i] - p);
        if (d < best) {
          best = d;
          idx = i;
        }
      }
      return idx;
    };

    const init = embla.selectedScrollSnap();
    lastNearestRef.current = init;
    setSelected(init);
    syncNav();

    // Drive the dot indicator + swipe sound the INSTANT the carousel crosses
    // into a new slide (the `scroll` event), not on `select`/settle. On a Mac
    // trackpad, inertial scrolling keeps `select` from firing for ~1-2s, which
    // made the dot + sound feel detached from the gesture you'd already done.
    const onScroll = () => {
      const nearest = nearestSnap();
      if (nearest === lastNearestRef.current) return;
      const dir = Math.sign(nearest - lastNearestRef.current);
      lastNearestRef.current = nearest;
      setSelected(nearest);
      syncNav();
      if (dir === dirRef.current) {
        comboRef.current += 1; // consecutive same-direction → extend the run
      } else {
        dirRef.current = dir; // direction changed → fresh run from center
        comboRef.current = 1;
      }
      swipe(Math.max(0, Math.min(9, CENTER + dir * comboRef.current)));
    };
    // Snap the final index exactly on settle (in case scroll-progress rounding
    // left it a hair off). The render window follows `selected`, so it has
    // already expanded ahead during the scroll — nothing waits for settle.
    const onSettle = () => {
      const sel = embla.selectedScrollSnap();
      lastNearestRef.current = sel;
      setSelected(sel);
      syncNav();
    };

    embla.on("scroll", onScroll);
    embla.on("settle", onSettle);
    embla.on("reInit", syncNav);
    return () => {
      embla.off("scroll", onScroll);
      embla.off("settle", onSettle);
      embla.off("reInit", syncNav);
    };
  }, [embla, swipe]);

  const count = slides.length;
  const multi = count > 1;
  const activeLabel = labels?.[selected] ?? "";
  const hintText = typeof hint === "function" ? hint(activeLabel) : hint;

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className={`overflow-hidden ${viewportClassName}`} ref={emblaRef}>
        <div
          ref={trackRef}
          className="flex"
          style={{
            touchAction: "pan-y",
            willChange: "transform",
            minHeight: virtualize && lockedHeight ? lockedHeight : undefined,
          }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className={`min-w-0 shrink-0 grow-0 basis-full ${slidePadding}`}
            >
              {/* Virtualized: render one slide behind and TWO ahead of the
                  CURRENT slide (driven by the live scroll position, so the +2
                  cards are always mounted before you reach them — you never hit
                  an unmounted placeholder). */}
              {!virtualize || (i >= selected - 1 && i <= selected + 2)
                ? slide
                : null}
            </div>
          ))}
        </div>
      </div>

      {multi && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {/* On desktop the arrows sit inline with the dots (◀ • • • ▶) rather
              than floating over the card content; on mobile it's swipe + dots. */}
          <div className="flex items-center gap-3">
            {arrows && (
              <button
                type="button"
                onClick={() => embla?.scrollPrev()}
                disabled={!canPrev}
                aria-label="Previous"
                className="hidden h-8 w-8 cursor-pointer place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-200 transition hover:border-cyan-300/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 md:grid"
              >
                ◀
              </button>
            )}
            <div className="flex items-center gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => embla?.scrollTo(i)}
                  aria-label={`Go to ${labels?.[i] ?? `slide ${i + 1}`}`}
                  title={labels?.[i]}
                  className={`h-2 rounded-full transition-all ${
                    i === selected
                      ? "w-7 bg-linear-to-r from-cyan-400 to-fuchsia-400"
                      : "w-2 bg-slate-600 hover:bg-slate-400"
                  }`}
                />
              ))}
            </div>
            {arrows && (
              <button
                type="button"
                onClick={() => embla?.scrollNext()}
                disabled={!canNext}
                aria-label="Next"
                className="hidden h-8 w-8 cursor-pointer place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-200 transition hover:border-cyan-300/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 md:grid"
              >
                ▶
              </button>
            )}
          </div>
          {hintText && (
            <p
              className={`text-[11px] text-slate-500 ${
                hintMobileOnly ? "md:hidden" : ""
              }`}
            >
              {hintText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
