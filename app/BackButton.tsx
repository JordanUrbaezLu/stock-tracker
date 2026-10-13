"use client";

import { useRouter } from "next/navigation";
import { useSound } from "./SoundContext";
import { IconChevronLeft } from "./ui/icons";
import "./ui/primitives.css";

/**
 * Goes to the previous page (real browser history) instead of always jumping
 * home. Falls back to "/" when there's no in-app history to go back to (e.g. a
 * shared deep link opened in a fresh tab). A chunky pill key built from
 * tokens, so it reads on the board and in the hall alike.
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
    <button
      type="button"
      onClick={onClick}
      data-variant="secondary"
      data-live=""
      className={
        className ??
        "ui-key group relative inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-full pr-4 pl-2.5 text-[15px] font-bold [--key-lip-size:3px]"
      }
    >
      <IconChevronLeft
        size={20}
        strokeWidth={2.5}
        className="transition-transform duration-200 ease-board motion-safe:group-hover:-translate-x-0.5"
      />
      Back
    </button>
  );
}
