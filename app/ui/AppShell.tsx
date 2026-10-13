"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useAdmin } from "../AdminContext";
import { BackButton } from "../BackButton";
import { useSound } from "../SoundContext";
import { SoundToggle } from "../SoundToggle";
import { TickerTape, TickerTapeSkeleton, type Tick } from "../TickerTape";
import {
  IconHome,
  IconLock,
  IconPodium,
  IconSearch,
  IconUnlock,
} from "./icons";
import { EASE_BOARD, SPRING } from "./motion";
import { Weather, type WeatherKind } from "./Weather";
import "./shell.css";

export type NavKey = "home" | "stocks" | "lookup";
export type ShellStatus = "loading" | "live" | "error";
export type ShellMood = "up" | "down";
export type { Tick as ShellTick };
// Re-exported for convenience; server components should import these from
// "./Weather" (a plain module) — this file is a client module.
export { weatherFor, weatherWords, type WeatherKind } from "./Weather";

export type AppShellProps = {
  /** Highlighted nav item/tab. Investor pages pass "home"; admin passes null. */
  active?: NavKey | null;
  /** Page hero, rendered on the dark board inside the content container. */
  hero?: ReactNode;
  /**
   * Ticker strip at the top of the board. Quotes → the tape; "loading" →
   * a same-height placeholder (no layout jump when quotes arrive);
   * null/undefined/[] → no strip.
   */
  ticker?: Tick[] | "loading" | null;
  /** Soft gain/loss glow in the board's top-left. Superseded (not drawn)
   *  when `weather` or `tint` is set — they carry the mood now. */
  mood?: ShellMood | null;
  /**
   * The board's weather, from the day's move (`weatherFor(dayPct)`): warm
   * rays, drifting haze or fine rain behind the hero. Needs a hero. Say it
   * in words too (`weatherWords`).
   */
  weather?: WeatherKind | null;
  /**
   * A jersey color (`jerseyColor(name)`) washed into the board — a soft glow
   * from the top-left and a 3px stripe along the bottom edge. Investor pages.
   */
  tint?: string;
  /** Data status under the wordmark: LIVE / UPDATING / OFFLINE. */
  status?: ShellStatus | null;
  /** Back button at the left of the brand bar (replaces the brand on phones). */
  back?: boolean;
  /** Extra brand-bar controls, right side, before sound/admin. */
  actions?: ReactNode;
  /** Hall (and hero) max width: 1200px, or 520px for narrow pages. */
  width?: "default" | "narrow";
  children: ReactNode;
};

const NAV = [
  { key: "home", href: "/", label: "Home", Icon: IconHome },
  { key: "stocks", href: "/stocks", label: "Stocks", Icon: IconPodium },
  { key: "lookup", href: "/lookup", label: "Lookup", Icon: IconSearch },
] as const satisfies readonly {
  key: NavKey;
  href: string;
  label: string;
  Icon: typeof IconHome;
}[];

const STATUS: Record<ShellStatus, { label: string; dot: string }> = {
  loading: { label: "Updating", dot: "live-dot live-dot--loading" },
  live: { label: "Live", dot: "live-dot" },
  error: { label: "Offline", dot: "live-dot live-dot--error" },
};

// Lets pages offset sticky rails / anchors below the bar, safe area included.
const SHELL_VARS = {
  "--shell-top": "calc(var(--brandbar-h) + env(safe-area-inset-top))",
} as CSSProperties;

// The active-tab pill: a touch of overshoot so it lands like a key snapping
// into place (DESIGN: springs are bouncy).
const PILL_SPRING = { type: "spring", stiffness: 400, damping: 24 } as const;

// Desktop nav item width (the links are w-[88px]); the pill moves in these.
const NAV_W = 88;

const MotionLink = motion.create(Link);

/*
 * Every page mounts its own AppShell, so no element survives a route change
 * for a layoutId to animate from. The last active tab is remembered at module
 * scope instead, and a fresh shell slides its indicators in from there.
 */
let lastActive: NavKey | null = null;

function useNav(active: NavKey | null) {
  const pathname = usePathname();
  const { play } = useSound();
  const [from] = useState(() => lastActive);
  // Optimistic: the indicator moves on tap, before the next route renders.
  const [pending, setPending] = useState<NavKey | null>(null);
  const current = pending ?? active;

  useEffect(() => {
    lastActive = current;
  }, [current]);

  const navigate = (
    e: MouseEvent<HTMLAnchorElement>,
    href: string,
    key: NavKey | null,
  ) => {
    // New-tab/window clicks belong to the browser.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    if (href === pathname) {
      // Already here: scroll to top, the tab-bar convention.
      e.preventDefault();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      return;
    }
    play("nav");
    if (key) setPending(key);
  };

  return { current, from, navigate };
}

type Nav = ReturnType<typeof useNav>;

function navIndex(key: NavKey | null) {
  return key ? NAV.findIndex((item) => item.key === key) : -1;
}

/** Where an indicator starts on mount: the previous page's tab, if any. */
function slideFrom(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return false as const;
  if (fromIndex < 0) return { x: `${toIndex * 100}%`, opacity: 0 };
  return { x: `${fromIndex * 100}%`, opacity: 1 };
}

/** True once the board has scrolled fully under the sticky brand bar. */
function useStuck(sentinel: HTMLElement | null) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel]);
  return stuck;
}

/**
 * The page frame: sticky BrandBar, the dark board header (optional ticker,
 * weather, jersey tint + page hero), the hall for page content, and the phone
 * TabBar. Transform animations inside honor prefers-reduced-motion
 * (MotionConfig "user").
 */
export function AppShell({
  active = null,
  hero,
  ticker = null,
  mood = null,
  weather = null,
  tint,
  status = null,
  back = false,
  actions,
  width = "default",
  children,
}: AppShellProps) {
  const nav = useNav(active);
  const [sentinel, setSentinel] = useState<HTMLSpanElement | null>(null);
  // Also pauses the board's ambient motion (weather, tape) while it's hidden.
  const stuck = useStuck(sentinel);
  const narrow = width === "narrow";
  const hasTicker =
    ticker === "loading" || (Array.isArray(ticker) && ticker.length > 0);
  const hasHero = hero !== undefined && hero !== null && hero !== false;
  const hasBoard = hasHero || hasTicker;
  // One mood signal at a time: the weather/jersey replace the v1 glow.
  const boardMood = weather || tint ? null : mood;

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-dvh flex-col" style={SHELL_VARS}>
        <a
          href="#main"
          className="fixed left-[max(0.75rem,env(safe-area-inset-left))] top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 -translate-y-[calc(100%+4rem)] rounded-full bg-amber-bright px-4 py-2.5 text-[15px] font-semibold text-board transition-transform duration-150 focus:translate-y-0"
        >
          Skip to content
        </a>
        {hasBoard ? null : (
          <span
            ref={setSentinel}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 h-px w-px"
          />
        )}

        <BrandBar
          nav={nav}
          back={back}
          status={status}
          actions={actions}
          stuck={stuck}
          overBoard={hasBoard}
        />

        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 scroll-mt-(--shell-top) flex-col focus:outline-none"
        >
          {hasBoard ? (
            <div
              data-mood={boardMood ?? undefined}
              data-paused={stuck ? "" : undefined}
              style={tint ? ({ "--board-tint": tint } as CSSProperties) : undefined}
              className="qb-board on-board relative border-b border-board-amber/22 bg-board"
            >
              <div aria-hidden className="qb-board__fx">
                <div className="qb-board__mood qb-board__mood--up" />
                <div className="qb-board__mood qb-board__mood--down" />
                {tint ? <div className="qb-board__tint" /> : null}
                <div className="qb-board__grain" />
              </div>
              {hasTicker ? (
                <div className="relative border-b border-line">
                  {ticker === "loading" ? (
                    <TickerTapeSkeleton />
                  ) : (
                    <TickerTape ticks={ticker ?? []} />
                  )}
                </div>
              ) : null}
              {hasHero ? (
                // Positioned but no z-index: the weather paints under the hero
                // without making the board a stacking context.
                <div className="relative">
                  {weather ? (
                    <Weather key={weather} kind={weather} paused={stuck} />
                  ) : null}
                  <div
                    className={`qb-container ${narrow ? "qb-container--narrow" : ""} relative pb-8 pt-5 md:pb-10 md:pt-6`}
                  >
                    {hero}
                  </div>
                </div>
              ) : null}
              {tint ? <span aria-hidden className="qb-board__stripe" /> : null}
              <span ref={setSentinel} aria-hidden className="qb-board__sentinel" />
            </div>
          ) : null}

          <div
            className={`qb-container ${narrow ? "qb-container--narrow" : ""} flex flex-1 flex-col gap-6 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1.5rem)] pt-6 md:pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.5rem))] lg:gap-8`}
          >
            {children}
          </div>
        </main>

        <TabBar nav={nav} />
      </div>
    </MotionConfig>
  );
}

function BrandBar({
  nav,
  back,
  status,
  actions,
  stuck,
  overBoard,
}: {
  nav: Nav;
  back: boolean;
  status: ShellStatus | null;
  actions?: ReactNode;
  stuck: boolean;
  overBoard: boolean;
}) {
  const { isAdmin } = useAdmin();
  const [flip, setFlip] = useState(0);

  return (
    <header
      data-stuck={stuck ? "true" : undefined}
      className="qb-brandbar on-board sticky top-0 z-40 bg-board pt-[env(safe-area-inset-top)]"
    >
      <div className="qb-container flex h-(--brandbar-h) items-center gap-2 md:grid md:grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] md:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-3">
          {back ? (
            <>
              {/* A solid pill key: its edge (not a chevron) sits on the gutter. */}
              <BackButton />
              {status ? (
                <span className="md:hidden">
                  <StatusTag status={status} />
                </span>
              ) : null}
              <span aria-hidden className="hidden h-6 w-px bg-line md:block" />
            </>
          ) : null}
          <Link
            href="/"
            aria-label="Stock Portfolio"
            onClick={(e) => nav.navigate(e, "/", "home")}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") setFlip((n) => n + 1);
            }}
            className={`${back ? "hidden md:flex" : "flex"} min-h-11 min-w-0 items-center gap-2.5 rounded-xl py-1 pr-1.5`}
          >
            <BrandMark flip={flip} />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="type-title truncate text-[17px] leading-5 text-ink">
                Stock Portfolio
              </span>
              {status ? <StatusTag status={status} /> : null}
            </span>
          </Link>
          {status ? (
            <span className="sr-only">Data status: {STATUS[status].label}</span>
          ) : null}
        </div>

        <DesktopNav nav={nav} />

        {/* -mr-2: the ghost lock's icon (not its 44px box) lines up with the
            gutter on phones. Keys get 6–8px between them for their lips. */}
        <div className="-mr-2 flex shrink-0 items-center justify-end gap-1.5 md:mr-0 md:gap-2">
          {actions}
          <SoundToggle />
          <AdminLink
            isAdmin={isAdmin}
            onClick={(e) => nav.navigate(e, "/admin", null)}
          />
        </div>
      </div>

      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-px ${
          overBoard ? "bg-line" : "bg-board-amber/22"
        }`}
      />
      <AnimatePresence>
        {isAdmin ? (
          <motion.span
            key="admin-edge"
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-amber-bright"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE_BOARD }}
          />
        ) : null}
      </AnimatePresence>
    </header>
  );
}

/**
 * Brand-bar nav (≥768px). The active item is an amber key. The pill carries
 * its own dark copy of the labels, counter-shifted to sit exactly over the
 * real ones and clipped by the pill — so mid-slide a label is never dark on
 * the dark bar or light on amber.
 */
function DesktopNav({ nav }: { nav: Nav }) {
  const currentIndex = navIndex(nav.current);
  const fromIndex = navIndex(nav.from);
  const reduce = useReducedMotion();
  const [startIndex] = useState(() => (fromIndex >= 0 ? fromIndex : currentIndex));
  const x = useMotionValue(Math.max(startIndex, 0) * NAV_W);
  const copyX = useTransform(x, (v) => -v);

  useEffect(() => {
    if (currentIndex < 0) return;
    const target = currentIndex * NAV_W;
    if (reduce) {
      x.jump(target);
      return;
    }
    const controls = animate(x, target, PILL_SPRING);
    return () => controls.stop();
  }, [currentIndex, reduce, x]);

  return (
    <nav aria-label="Primary" className="hidden md:block">
      <div className="relative">
        <ul className="flex">
          {NAV.map((item) => {
            const isActive = item.key === nav.current;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(e) => nav.navigate(e, item.href, item.key)}
                  className={`flex h-11 w-[88px] items-center justify-center rounded-full text-[15px] transition-colors duration-150 hover:bg-surface-2 hover:text-ink ${
                    isActive ? "font-bold text-ink" : "font-semibold text-muted"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {currentIndex >= 0 ? (
          <motion.span
            aria-hidden
            className="qb-navpill pointer-events-none absolute left-0 top-1 h-9 w-[88px] overflow-hidden rounded-full bg-amber-bright"
            style={{ x }}
            initial={fromIndex < 0 ? { opacity: 0, scale: 0.8 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={PILL_SPRING}
          >
            <motion.span className="flex h-full" style={{ x: copyX }}>
              {NAV.map((item) => (
                <span
                  key={item.key}
                  className="flex h-full w-[88px] flex-none items-center justify-center text-[15px] font-bold text-board"
                >
                  {item.label}
                </span>
              ))}
            </motion.span>
          </motion.span>
        ) : null}
      </div>
    </nav>
  );
}

/** Live-dot + mono label; label changes slide like a board line updating. */
function StatusTag({ status }: { status: ShellStatus }) {
  const { label, dot } = STATUS[status];
  return (
    <span aria-hidden className="relative flex h-3.5 items-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={status}
          className="flex items-center gap-1.5"
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -6, opacity: 0 }}
          transition={{ duration: 0.25, ease: EASE_BOARD }}
        >
          <span className={dot} />
          <span className="type-eyebrow leading-none text-muted">{label}</span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function AdminLink({
  isAdmin,
  onClick,
}: {
  isAdmin: boolean;
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  if (isAdmin) {
    return (
      <Link
        href="/admin"
        onClick={onClick}
        aria-label="Admin (unlocked)"
        className="group inline-flex h-11 shrink-0 items-center rounded-full pl-1 pr-2 md:pr-1"
      >
        <motion.span
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber/35 bg-amber-soft pl-2.5 pr-3 text-[13px] font-semibold text-amber transition-colors duration-150 group-hover:border-amber/60"
        >
          <IconUnlock size={16} />
          Admin
        </motion.span>
      </Link>
    );
  }
  return (
    <Link
      href="/admin"
      onClick={onClick}
      aria-label="Admin"
      className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink md:pl-3 md:pr-3.5"
    >
      <IconLock size={20} />
      <span className="hidden text-[15px] font-semibold md:inline">Admin</span>
    </Link>
  );
}

/** Phone tab bar: the active tab's icon sits in an amber key that slides. */
function TabBar({ nav }: { nav: Nav }) {
  const currentIndex = navIndex(nav.current);
  const fromIndex = navIndex(nav.from);
  return (
    <nav
      aria-label="Primary"
      className="qb-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="relative flex h-(--tabbar-h)">
        {currentIndex >= 0 ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute left-0 top-2 flex w-1/3 justify-center"
            initial={slideFrom(fromIndex, currentIndex)}
            animate={{ x: `${currentIndex * 100}%`, opacity: 1 }}
            transition={PILL_SPRING}
          >
            <span className="qb-tabpill h-8 w-14 rounded-full bg-amber-bright" />
          </motion.span>
        ) : null}
        {NAV.map((item) => {
          const isActive = item.key === nav.current;
          // Arriving from another tab pops the icon on mount; later
          // activations pop via the keyframes (unchanged keyframes don't
          // re-run on re-render).
          const popOnMount = isActive && nav.from !== null && nav.from !== nav.current;
          return (
            <MotionLink
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              onClick={(e: MouseEvent<HTMLAnchorElement>) =>
                nav.navigate(e, item.href, item.key)
              }
              whileTap="pressed"
              // Positioned so the links paint over the sliding pill.
              className={`relative flex flex-1 flex-col items-center pt-2 text-[12px] leading-none transition-colors duration-150 focus-visible:-outline-offset-4 ${
                isActive ? "font-bold text-ink" : "font-semibold text-muted"
              }`}
            >
              <motion.span
                variants={{ pressed: { scale: 0.92 } }}
                transition={{ duration: 0.12 }}
                className="flex flex-col items-center gap-1.5"
              >
                <motion.span
                  className={`grid h-8 w-14 place-items-center ${isActive ? "text-board" : ""}`}
                  initial={popOnMount ? { scale: 0.7 } : false}
                  animate={isActive ? { scale: [0.7, 1] } : { scale: 1 }}
                  transition={{ type: "spring", stiffness: 520, damping: 15 }}
                >
                  <item.Icon size={22} strokeWidth={isActive ? 2.2 : 1.75} />
                </motion.span>
                <span>{item.label}</span>
              </motion.span>
            </MotionLink>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The brand: one split-flap tile carrying the amber ▲ (matches the home-screen
 * icon). Flaps into place on mount; bump `flip` to replay (the brand link does
 * on mouse hover). Board-colored in every context. Decorative (aria-hidden).
 */
export function BrandMark({
  size = 32,
  flip = 0,
  className = "",
}: {
  size?: number;
  flip?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-replay={flip > 0 ? "" : undefined}
      className={`qb-mark ${className}`}
      style={{ "--qb-mark-size": `${size}px` } as CSSProperties}
    >
      <span className="qb-mark__half qb-mark__half--top">
        <MarkGlyph />
      </span>
      <span className="qb-mark__half qb-mark__half--bottom" />
      <span key={`top-${flip}`} className="qb-mark__flap qb-mark__flap--top" />
      <span key={`bottom-${flip}`} className="qb-mark__flap qb-mark__flap--bottom">
        <MarkGlyph />
      </span>
      <span className="qb-mark__seam" />
    </span>
  );
}

function MarkGlyph() {
  return (
    <svg className="qb-mark__glyph" viewBox="0 0 32 32" aria-hidden focusable="false">
      <path
        d="M16 8.75 23.75 22.25H8.25L16 8.75Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
