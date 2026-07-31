import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type BriefInvestor = {
  name?: string;
  dayChangePercent?: number | null;
};

type BriefRequest = {
  /** Client's local date (YYYY-MM-DD) — the cache key, so everyone in a
   *  timezone shares one brief per day. */
  date?: string;
  groupDayChangePercent?: number;
  groupGainPct?: number;
  investorCount?: number;
  investors?: BriefInvestor[];
  topHolding?: { symbol: string; changePercent: number | null } | null;
};

const MODEL = "claude-opus-5";

// One brief per market day for the whole club — cached by date + the coarse
// shape of the day (up/down/flat), so a mid-day flip from green to red earns a
// fresh line but price ticks don't. Per-instance only (resets on redeploy);
// the client also caches per-date in localStorage, so real API calls stay at
// roughly one per deploy per day.
const responseCache = new Map<string, { message: string; expires: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 32;

// Hard ceiling on paid model calls: this endpoint is unauthenticated (the
// whole app is), so without a budget a curl loop with novel dates could burn
// API spend freely. Beyond the budget, callers get the templated line.
const AI_CALL_WINDOW_MS = 60 * 60 * 1000;
const AI_CALLS_PER_WINDOW = 8;
let aiCallTimes: number[] = [];

function underAiBudget(): boolean {
  const now = Date.now();
  aiCallTimes = aiCallTimes.filter((t) => now - t < AI_CALL_WINDOW_MS);
  if (aiCallTimes.length >= AI_CALLS_PER_WINDOW) return false;
  aiCallTimes.push(now);
  return true;
}

/** A real YYYY-MM-DD within ±1 day of server time (client timezones straddle
 *  the server's date). Anything else can't become a cache key or a prompt. */
function validDate(date: unknown): string | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`).getTime();
  if (Number.isNaN(parsed)) return null;
  if (Math.abs(parsed - Date.now()) > 2 * 86_400_000) return null;
  return date;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Names reach the model's prompt, so they must be the club's real names —
 *  not attacker-supplied instructions. Roster read from Mongo, cached 1h;
 *  when Mongo is unreachable we simply drop the name lines from the prompt. */
let rosterCache: { names: Set<string>; expires: number } | null = null;

async function loadRoster(): Promise<Set<string> | null> {
  if (rosterCache && rosterCache.expires > Date.now()) return rosterCache.names;
  try {
    const { default: clientPromise } = await import("@/lib/mongodb");
    const dbName = process.env.MONGODB_DB;
    const collectionName = process.env.MONGODB_COLLECTION;
    if (!dbName || !collectionName) return null;
    const client = await clientPromise;
    const doc = await client
      .db(dbName)
      .collection(collectionName)
      .findOne<{ investors?: { name?: string }[] }>({ "investors.0": { $exists: true } });
    const names = new Set(
      (doc?.investors ?? [])
        .map((i) => (typeof i.name === "string" ? i.name.trim() : ""))
        .filter(Boolean),
    );
    rosterCache = { names, expires: Date.now() + 60 * 60 * 1000 };
    return names;
  } catch {
    return null;
  }
}

function daySign(pct: number | null): string {
  if (pct == null || Math.abs(pct) < 0.05) return "flat";
  return pct > 0 ? "up" : "down";
}

const SYSTEM_PROMPT = `You write "Today at the Club" — a single dated line for the home screen of a private investing club app shared by a small group of friends and family. It is the one thing that changes every day, the reason to open the app each morning.

Rules:
- One or two short sentences, max ~30 words total. No surrounding quotes, no leading emoji.
- Use markdown **double-asterisk bold** for names and stock tickers only. No other markdown.
- Ground it in the numbers you're given: the club's day move, who's having the best or roughest day, or the standout holding.
- On down days, lead with warmth or gentle humor about riding it out together — showing up on red days is the club ethos. Never alarming, never shame.
- On up days, celebrate briefly and specifically.
- Never give financial advice, predictions, or buy/sell/hold suggestions.
- Sound like a friend who checked the market first, not a news anchor.`;

function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

type CleanBrief = {
  date: string;
  groupDayChangePercent: number | null;
  groupGainPct: number | null;
  investorCount: number;
  movers: { name: string; dayChangePercent: number }[];
  topHolding: { symbol: string; changePercent: number | null } | null;
};

/** Deterministic line so the card always has something dated to say. */
function fallbackMessage(clean: CleanBrief): string {
  const pct = clean.groupDayChangePercent ?? 0;
  const top = clean.topHolding;
  if (pct > 0.05) {
    return `The club is up ${fmtPct(pct)} today${
      top ? ` — **${top.symbol}** is still the one to beat` : ""
    }. Nice day to check in.`;
  }
  if (pct < -0.05) {
    return `Red day — the club is ${fmtPct(pct)}. Everyone rides these together; showing up today still counts.`;
  }
  return `Quiet tape today — the club is holding steady${
    top ? ` with **${top.symbol}** out front` : ""
  }. Streaks don't take days off.`;
}

function buildUserPrompt(clean: CleanBrief): string {
  const best = clean.movers[0];
  const worst = clean.movers[clean.movers.length - 1];
  const lines = [
    `Date: ${clean.date}`,
    `Club day change: ${fmtPct(clean.groupDayChangePercent)}`,
    `Club all-time return: ${fmtPct(clean.groupGainPct)}`,
    clean.investorCount ? `Members: ${clean.investorCount}` : null,
    best ? `Best day so far: ${best.name} (${fmtPct(best.dayChangePercent)})` : null,
    worst && worst !== best
      ? `Roughest day so far: ${worst.name} (${fmtPct(worst.dayChangePercent)})`
      : null,
    clean.topHolding
      ? `Standout holding: ${clean.topHolding.symbol} (${fmtPct(clean.topHolding.changePercent)} all-time)`
      : null,
  ].filter(Boolean);
  return `Write today's line for the club:\n${lines.join("\n")}`;
}

/** Validate every field down to known-good shapes; unknown data is dropped,
 *  never interpolated into the prompt or the cache key. */
async function sanitize(body: BriefRequest): Promise<CleanBrief | null> {
  const date = validDate(body.date);
  if (!date) return null;

  const roster = await loadRoster();
  const movers = (Array.isArray(body.investors) ? body.investors : [])
    .slice(0, 16)
    .map((i) => ({
      name: typeof i?.name === "string" ? i.name.trim() : "",
      dayChangePercent: num(i?.dayChangePercent),
    }))
    .filter(
      (i): i is { name: string; dayChangePercent: number } =>
        i.dayChangePercent != null &&
        i.name.length > 0 &&
        i.name.length <= 40 &&
        // With a roster, only real members' names reach the prompt; without
        // one (Mongo down), no names do.
        (roster ? roster.has(i.name) : false),
    )
    .sort((a, b) => b.dayChangePercent - a.dayChangePercent);

  const rawSymbol = body.topHolding?.symbol;
  const symbol =
    typeof rawSymbol === "string" && /^[A-Za-z.\-]{1,8}$/.test(rawSymbol)
      ? rawSymbol.toUpperCase()
      : null;

  return {
    date,
    groupDayChangePercent: num(body.groupDayChangePercent),
    groupGainPct: num(body.groupGainPct),
    investorCount: Math.min(Math.max(Math.trunc(num(body.investorCount) ?? 0), 0), 50),
    movers,
    topHolding: symbol ? { symbol, changePercent: num(body.topHolding?.changePercent) } : null,
  };
}

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (entry.expires <= now) responseCache.delete(key);
  }
  while (responseCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest == null) break;
    responseCache.delete(oldest);
  }
}

export async function POST(request: NextRequest) {
  let body: BriefRequest;
  try {
    body = (await request.json()) as BriefRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const clean = await sanitize(body);
  if (!clean) {
    return NextResponse.json({ error: "Invalid or missing date." }, { status: 400 });
  }

  const cacheKey = `${clean.date}|${daySign(clean.groupDayChangePercent)}|${clean.investorCount}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ message: cached.message, source: "cache" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !underAiBudget()) {
    return NextResponse.json({ message: fallbackMessage(clean), source: "fallback" });
  }

  try {
    const client = new Anthropic({ apiKey });
    // Thinking is on by default on this model and shares the max_tokens
    // budget with the visible text, so leave generous headroom for a
    // ~30-word line.
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(clean) }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      return NextResponse.json({ message: fallbackMessage(clean), source: "fallback" });
    }

    pruneCache();
    responseCache.set(cacheKey, { message: text, expires: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ message: text, source: "ai" });
  } catch (error) {
    console.error("[daily-brief] generation failed", error);
    return NextResponse.json({ message: fallbackMessage(clean), source: "fallback" });
  }
}
