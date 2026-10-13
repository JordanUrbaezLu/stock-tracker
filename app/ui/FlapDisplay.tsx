"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { useSound } from "../SoundContext";
import "./flap.css";

export type FlapSize = "hero" | "lg" | "md" | "sm";
export type FlapTone = "ink" | "amber" | "gain" | "loss";

export type FlapDisplayProps = {
  /** What the board shows, e.g. "$1,234.56", "+12.34%", "LOCKED", "12". */
  value: string;
  /** hero clamp(44px,13.4vw,84px) · lg clamp(30px,7.5vw,52px) · md 28px · sm 18px */
  size?: FlapSize;
  tone?: FlapTone;
  /** Screen-reader text; defaults to `value`. */
  label?: string;
  /** false renders the final characters immediately (also on the server). */
  animate?: boolean;
  /** ms before the first tile starts — applies to the initial reveal only. */
  delay?: number;
  /** Soft "type" tick as tiles settle. */
  sound?: boolean;
  className?: string;
};

type Kind = "regular" | "narrow" | "gap";

const NARROW = new Set([".", ",", ":", ";", "'", "!", "|"]);
// Tile widths in em — must match flap.css.
const EM: Record<Kind, number> = { regular: 0.62, narrow: 0.34, gap: 0.3 };
const GAP_EM = 0.06;

// A tile only ever passes characters of its target's class, in drum order,
// the way a real module's drum would.
const DRUMS = [
  "0123456789",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
];

const STEP_FIRST_MS = 55;
const STEP_LAST_MS = 70; // the drum slows into its final character
const STAGGER_MS = 35;
const BOUNCE_MS = 120; // the leaf knocks against its stop once, then rests
const BOUNCE_DEG = 14;
const BUDGET_MS = 1100; // the whole value settles inside this
const TICK_GAP_MS = 60;

// Layout effect on the client so restored glyphs land before paint; plain
// effect on the server, where neither runs.
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function kindOf(ch: string): Kind {
  if (ch === " " || ch === " ") return "gap";
  return NARROW.has(ch) ? "narrow" : "regular";
}

/** What a tile shows after `from`, ending on `to`; symbols flip once. */
function flipSequence(from: string, to: string, steps: number): string[] {
  const drum = DRUMS.find((d) => d.includes(to));
  if (!drum || steps <= 1) return [to];
  const t = drum.indexOf(to);
  const seq: string[] = [];
  for (let k = steps - 1; k >= 0; k--) {
    seq.push(drum[(t - k + drum.length * 2) % drum.length]);
  }
  if (seq[0] === from) seq.shift();
  return seq;
}

/** ±1 step so neighbouring tiles don't move in lockstep (deterministic). */
function jitter(index: number, ch: string): number {
  return ((index * 31 + ch.charCodeAt(0) * 17) % 3) - 1;
}

type Plan = {
  tile: HTMLElement;
  index: number;
  /** seq[0] is what the tile shows when its turn starts. */
  seq: string[];
  /** ms after the loop starts. */
  start: number;
  /** End of each flip, ms after `start`. */
  ends: number[];
  /** Flip currently drawn (-1 before the first). */
  k: number;
  done: boolean;
};

function buildPlans(
  tiles: HTMLElement[],
  shown: string[],
  targets: string[],
  delay: number,
): Plan[] {
  const changed = targets
    .map((_, i) => i)
    .filter((i) => kindOf(targets[i]) !== "gap" && (shown[i] ?? "") !== targets[i]);
  const n = changed.length;

  const drafts = changed.map((index, rank) => {
    const from = shown[index] ?? "";
    const to = targets[index];
    // Later tiles travel further, so the value settles left → right.
    const base = n > 1 ? 3 + Math.round((7 * rank) / (n - 1)) : 6;
    const steps = Math.min(10, Math.max(3, base + jitter(index, to)));
    const seq = [from, ...flipSequence(from, to, steps)];
    const flips = seq.length - 1;
    const ends: number[] = [];
    let at = 0;
    for (let k = 0; k < flips; k++) {
      const f = flips > 1 ? k / (flips - 1) : 1;
      at += STEP_FIRST_MS + (STEP_LAST_MS - STEP_FIRST_MS) * f * f;
      ends.push(at);
    }
    return { index, seq, ends };
  });

  const longest = Math.max(
    0,
    ...drafts.map((d) => d.ends[d.ends.length - 1] + BOUNCE_MS),
  );
  const stagger =
    n > 1 ? Math.max(0, Math.min(STAGGER_MS, (BUDGET_MS - longest) / (n - 1))) : 0;

  return drafts.map((d, rank) => ({
    tile: tiles[d.index],
    index: d.index,
    seq: d.seq,
    ends: d.ends,
    start: delay + rank * stagger,
    k: -1,
    done: false,
  }));
}

function faces(tile: HTMLElement) {
  return tile.children as HTMLCollectionOf<HTMLElement>;
}

function setGlyph(face: HTMLElement | undefined, ch: string) {
  if (face && face.getAttribute("data-ch") !== ch) face.setAttribute("data-ch", ch);
}

function showLeaf(leaf: HTMLElement | undefined, deg: number, shade: number) {
  if (!leaf) return;
  leaf.style.visibility = "visible";
  leaf.style.transform = `rotateX(${deg.toFixed(2)}deg)`;
  leaf.style.setProperty("--shade", shade.toFixed(3));
}

function hideLeaf(leaf: HTMLElement | undefined) {
  if (!leaf) return;
  leaf.style.visibility = "";
  leaf.style.transform = "";
  leaf.style.removeProperty("--shade");
}

/** Put a tile at rest showing `ch`. */
function paint(tile: HTMLElement, ch: string) {
  const [top, bottom, leafTop, leafBottom] = faces(tile);
  setGlyph(top, ch);
  setGlyph(bottom, ch);
  setGlyph(leafTop, ch);
  setGlyph(leafBottom, ch);
  hideLeaf(leafTop);
  hideLeaf(leafBottom);
}

/**
 * The split-flap signature: one physical tile per character that flips
 * through its drum into place, left → right, like a Solari quotation board.
 *
 * The first render is deterministic (blank tiles, or the final characters
 * when `animate` is false) so there's no hydration mismatch; the flips run in
 * a single rAF loop that writes glyph attributes and leaf transforms
 * directly, so a flip never waits on a React render. On updates only the
 * changed tiles flip. Reduced motion renders the final value with no flips.
 */
export function FlapDisplay({
  value,
  size = "md",
  tone = "ink",
  label,
  animate = true,
  delay = 0,
  sound = false,
  className,
}: FlapDisplayProps) {
  const { play } = useSound();
  const rootRef = useRef<HTMLSpanElement>(null);
  const rowRef = useRef<HTMLSpanElement>(null);
  // What each tile last showed, so an update flips from there.
  const shownRef = useRef<string[]>([]);
  const soundRef = useRef({ on: sound, play });
  const lastTickRef = useRef(0);

  useEffect(() => {
    soundRef.current = { on: sound, play };
  }, [sound, play]);

  // Fit guard: cap the size to the parent's width. Sub-2px changes are
  // ignored so a shrink-wrapping parent can't ratchet the size down.
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    const parent = root?.parentElement;
    if (!root || !parent || typeof ResizeObserver === "undefined") return;
    let last = -1;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width <= 0 || Math.abs(width - last) < 2) return;
      last = width;
      root.style.setProperty("--flap-avail", `${width}px`);
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  useIsoLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const targets = Array.from(value);
    const tiles = Array.from(row.children) as HTMLElement[];
    const shown = shownRef.current.slice(0, targets.length);
    shownRef.current = shown;

    // React rendered the final glyphs itself; just rest any leaf a cancelled
    // flip left mid-swing.
    if (!animate) {
      tiles.forEach((tile) => {
        const [, , leafTop, leafBottom] = faces(tile);
        hideLeaf(leafTop);
        hideLeaf(leafBottom);
      });
      shownRef.current = targets;
      return;
    }

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      tiles.forEach((tile, i) => paint(tile, targets[i]));
      shownRef.current = targets;
      return;
    }

    // Restore what each tile last showed (new tiles start blank).
    tiles.forEach((tile, i) => paint(tile, shown[i] ?? ""));
    const initial = shown.every((ch) => !ch);
    const plans = buildPlans(tiles, shown, targets, initial ? Math.max(0, delay) : 0);
    targets.forEach((ch, i) => {
      if (kindOf(ch) === "gap") shown[i] = ch;
    });
    if (plans.length === 0) return;

    const tick = () => {
      const { on, play: playSound } = soundRef.current;
      if (!on) return;
      const now = performance.now();
      if (now - lastTickRef.current < TICK_GAP_MS) return;
      lastTickRef.current = now;
      playSound("type");
    };

    const advance = (p: Plan, t: number) => {
      const local = t - p.start;
      if (local < 0) return;
      const flips = p.ends.length;
      let k = Math.max(p.k, 0);
      while (k < flips && local >= p.ends[k]) k++;
      const [top, bottom, leafTop, leafBottom] = faces(p.tile);

      if (k < flips) {
        if (p.k !== k) {
          p.k = k;
          const from = p.seq[k];
          const to = p.seq[k + 1];
          // Behind the falling leaf the next character's top half is
          // already waiting; the landing leaf carries its bottom half.
          setGlyph(top, to);
          setGlyph(bottom, from);
          setGlyph(leafTop, from);
          setGlyph(leafBottom, to);
          shown[p.index] = to;
        }
        const begin = k ? p.ends[k - 1] : 0;
        const progress = (local - begin) / (p.ends[k] - begin);
        if (progress < 0.5) {
          const q = progress * 2;
          // Accelerates as it falls toward the viewer, darkening as it turns away from the light.
          showLeaf(leafTop, -90 * q * q, 0.45 * q);
          hideLeaf(leafBottom);
        } else {
          const q = (progress - 0.5) * 2;
          const eased = 1 - (1 - q) * (1 - q);
          hideLeaf(leafTop);
          showLeaf(leafBottom, 90 * (1 - eased), 0.1 * (1 - q));
        }
        return;
      }

      if (p.k !== flips) {
        p.k = flips;
        const final = p.seq[flips];
        setGlyph(top, final);
        setGlyph(bottom, final);
        setGlyph(leafTop, final);
        setGlyph(leafBottom, final);
        hideLeaf(leafTop);
        shown[p.index] = final;
        tick();
      }
      const s = (local - p.ends[flips - 1]) / BOUNCE_MS;
      if (s >= 1) {
        hideLeaf(leafBottom);
        p.done = true;
        return;
      }
      const lift = Math.sin(Math.PI * s);
      showLeaf(leafBottom, BOUNCE_DEG * lift, 0.06 * lift);
    };

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = now - t0;
      let busy = false;
      for (const p of plans) {
        if (p.done) continue;
        advance(p, t);
        if (!p.done) busy = true;
      }
      if (busy) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, animate, delay]);

  const chars = Array.from(value);
  const em =
    chars.reduce((sum, ch) => sum + EM[kindOf(ch)], 0) +
    GAP_EM * Math.max(0, chars.length - 1);

  return (
    <span
      ref={rootRef}
      className={className ? `flap ${className}` : "flap"}
      data-size={size}
      data-tone={tone}
      // A hair of slack so subpixel rounding never tips the fit into overflow.
      style={{ "--flap-em": (em + 0.02).toFixed(3) } as CSSProperties}
    >
      <span className="sr-only">{label ?? value}</span>
      <span ref={rowRef} className="flap__row" aria-hidden="true">
        {chars.map((ch, i) => {
          const glyph = animate ? undefined : ch;
          return (
            <span key={i} className="flap__tile" data-kind={kindOf(ch)}>
              <span className="flap__face flap__face--top" data-ch={glyph} />
              <span className="flap__face flap__face--bottom" data-ch={glyph} />
              <span className="flap__face flap__face--top flap__leaf" data-ch={glyph} />
              <span className="flap__face flap__face--bottom flap__leaf" data-ch={glyph} />
            </span>
          );
        })}
      </span>
    </span>
  );
}
