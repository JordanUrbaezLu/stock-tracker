"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
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
}: CarouselProps) {
  const [emblaRef, embla] = useEmblaCarousel(
    { align: "center", containScroll: "trimSnaps", duration: 20 },
    [WheelGesturesPlugin()],
  );
  const [selected, setSelected] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const { play } = useSound();

  const sync = useCallback(() => {
    if (!embla) return;
    setSelected(embla.selectedScrollSnap());
    setCanPrev(embla.canScrollPrev());
    setCanNext(embla.canScrollNext());
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    sync(); // initial state only — no sound on mount
    const onSelect = () => {
      sync();
      play("swipe"); // user-driven slide change (drag, wheel, or dot)
    };
    embla.on("select", onSelect);
    embla.on("reInit", sync);
    return () => {
      embla.off("select", onSelect);
      embla.off("reInit", sync);
    };
  }, [embla, sync, play]);

  const count = slides.length;
  const multi = count > 1;
  const activeLabel = labels?.[selected] ?? "";
  const hintText = typeof hint === "function" ? hint(activeLabel) : hint;

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className={`overflow-hidden ${viewportClassName}`} ref={emblaRef}>
        <div className="flex" style={{ touchAction: "pan-y" }}>
          {slides.map((slide, i) => (
            <div
              key={i}
              className={`min-w-0 shrink-0 grow-0 basis-full ${slidePadding}`}
            >
              {slide}
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
