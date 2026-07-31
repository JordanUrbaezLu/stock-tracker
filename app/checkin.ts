/**
 * Device-local check-in ledger + viewer identity — the habit spine of the app.
 * Everything lives in localStorage (this is a trusted friend group, not an auth
 * system): a list of YYYY-MM-DD stamps for days the app was opened, and the
 * slug of whichever investor this device belongs to. Nothing syncs; each
 * device keeps its own streak, which is exactly the point — the streak rewards
 * *you* showing up.
 */

const DAYS_KEY = "pulse:days";
const VIEWER_KEY = "pulse:viewer";
/** Sentinel for "not an investor, just watching" — still greeted, still streaks. */
export const GUEST = "guest";

/** Streak milestones that earn a confetti moment. */
export const MILESTONES = [3, 7, 14, 30, 50, 100];

export type CheckinResult = {
  /** True the first time the app is opened on a given local day. */
  isNewDay: boolean;
  streak: number;
  /** Set when this check-in just crossed a milestone (fire the confetti). */
  milestone: number | null;
};

/** Local-time day key — streaks follow the device's own calendar. */
function todayKey(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d + delta);
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function readDays(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DAYS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Streak = number of stamped days walking back from today, forgiving gaps of
 * up to TWO consecutive missed days. Markets close on weekends and life
 * happens — a Friday→Monday return keeps the fire lit; three straight missed
 * days puts it out. Counts stamped days only (a forgiven weekend adds 0).
 */
export function computeStreak(days: string[]): number {
  const set = new Set(days);
  const today = todayKey();
  if (!set.has(today)) return 0;
  let streak = 1;
  let cursor = shiftDay(today, -1);
  let gap = 0;
  for (let guard = 0; guard < 4000; guard++) {
    if (set.has(cursor)) {
      streak += 1;
      gap = 0;
    } else {
      gap += 1;
      if (gap > 2) break;
    }
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** Stamp today's visit (idempotent) and report streak + any milestone crossed. */
export function recordCheckin(): CheckinResult {
  if (typeof window === "undefined") return { isNewDay: false, streak: 0, milestone: null };
  const days = readDays();
  const today = todayKey();
  const isNewDay = !days.includes(today);
  if (isNewDay) {
    days.push(today);
    // The streak only ever needs ~ the last year of stamps.
    const trimmed = days.slice(-400);
    try {
      window.localStorage.setItem(DAYS_KEY, JSON.stringify(trimmed));
    } catch {
      // Storage full/blocked — the visit still counts for this session.
    }
  }
  const streak = computeStreak(readDays());
  const milestone = isNewDay && MILESTONES.includes(streak) ? streak : null;
  return { isNewDay, streak, milestone };
}

export function getViewer(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(VIEWER_KEY);
  } catch {
    return null;
  }
}

export function setViewer(slug: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEWER_KEY, slug);
  } catch {
    // Non-fatal — the picker will just reappear next visit.
  }
}
