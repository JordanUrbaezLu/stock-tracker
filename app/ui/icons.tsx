import type { ReactNode, SVGProps } from "react";

/**
 * One consistent 24px line-icon set (1.75 stroke, round caps, currentColor).
 * Decorative by default (aria-hidden); pass `title` to make one meaningful.
 * Filled glyphs (triangles) ignore stroke.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
  title?: string;
};

function Svg({
  size = 20,
  title,
  strokeWidth = 1.75,
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 10.2 12 3.5l8.5 6.7V19.5a1 1 0 0 1-1 1h-4.75v-6h-5.5v6H4.5a1 1 0 0 1-1-1v-9.3Z" />
  </Svg>
);

/** Podium — the Stocks leaderboard tab. */
export const IconPodium = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 20.5V8.5h6v12M3.5 20.5v-7.5H9M15 13.5h5.5v7M2.5 20.5h19" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
  </Svg>
);

export const IconUnlock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 6.8-1.2" />
  </Svg>
);

export const IconSoundOn = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
    <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.4 7.4 0 0 1 0 10.4" />
  </Svg>
);

export const IconSoundOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconArrowUpRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17 17 7M8.5 7H17v8.5" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

/** AI marker. */
export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 2.5c.5 4.3 2.7 6.5 7 7-4.3.5-6.5 2.7-7 7-.5-4.3-2.7-6.5-7-7 4.3-.5 6.5-2.7 7-7Z" />
    <path d="M18.5 14.5c.25 1.8 1.2 2.75 3 3-1.8.25-2.75 1.2-3 3-.25-1.8-1.2-2.75-3-3 1.8-.25 2.75-1.2 3-3Z" />
  </Svg>
);

/** Streak flame. Pass fill="currentColor" (or a token class) for a solid one. */
export const IconFlame = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.4-5.3 3.7-8.4.5 2 1.5 3.1 2.6 3.6.3-2.9 1.7-5.1 3.6-6.6-.2 3.9 3.1 5.7 3.1 10.1 0 3.9-2.6 7.4-6.5 7.4Z" />
  </Svg>
);

/** Filled delta triangles (no stroke). */
export const IconTriangleUp = ({ size = 10, ...p }: IconProps) => (
  <Svg size={size} stroke="none" fill="currentColor" {...p}>
    <path d="M12 4.5 21.5 19.5h-19L12 4.5Z" />
  </Svg>
);

export const IconTriangleDown = ({ size = 10, ...p }: IconProps) => (
  <Svg size={size} stroke="none" fill="currentColor" {...p}>
    <path d="M12 19.5 2.5 4.5h19L12 19.5Z" />
  </Svg>
);

export const IconSort = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4v16M4.5 7.5 8 4l3.5 3.5M16 20V4M12.5 16.5 16 20l3.5-3.5" />
  </Svg>
);

export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16l-6 7.5V18l-4 2v-7.5L4 5Z" />
  </Svg>
);

export const IconEdit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5.5M14 11v5.5" />
  </Svg>
);

/** Sell — a price tag. */
export const IconTag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 12V3.5H12l8.5 8.5-8.5 8.5-8.5-8.5Z" />
    <circle cx="8" cy="8" r="1.5" />
  </Svg>
);

/** Reopen — undo arrow. */
export const IconUndo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5A8 8 0 1 0 17.7 17" />
    <path d="M20.5 4.5v6.5H14" />
  </Svg>
);

export const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 5.5h15v10.5H10l-5.5 4.5V5.5Z" />
  </Svg>
);

export const IconMic = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Svg>
);

/** Hype — party popper. */
export const IconParty = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20 9 7.5l7.5 7.5L4 20Z" />
    <path d="M14 3.5l.4 2.1M20.5 10l-2.1-.4M18.6 4.6 16.8 6.4M11.5 5.5c1-1 1-2 .2-2.8M18.5 12.5c1-1 2-1 2.8-.2" />
  </Svg>
);

export const IconTrophy = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0V4Z" />
    <path d="M7.5 6H4.5v.5A3.5 3.5 0 0 0 8 10M16.5 6h3v.5A3.5 3.5 0 0 1 16 10M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 7.75v.01" />
  </Svg>
);

/** iOS-style share glyph (used in the Add-to-Home-Screen nudge). */
export const IconShare = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5v11M8 7.5l4-4 4 4M7 10.5H5.5v10h13v-10H17" />
  </Svg>
);

export const IconPlusSquare = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8.5v7M8.5 12h7" />
  </Svg>
);

export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3.5 16.5 5-5 4 3 8-8M15 6.5h5.5V12" />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M8.5 3v4M15.5 3v4" />
  </Svg>
);
