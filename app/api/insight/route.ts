import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type InsightHolding = {
  symbol: string;
  changePercent?: number | null;
};

type InsightRequest = {
  name?: string;
  currentValue?: number;
  originalInvested?: number;
  totalGain?: number;
  gainPct?: number;
  holdingsCount?: number;
  topHolding?: { symbol: string; changePercent: number | null } | null;
  holdings?: InsightHolding[];
};

const MODEL = "claude-opus-4-8";

// In-memory response cache. Prompt caching can't help here — the shared prefix
// (system prompt) is far below Haiku's 4096-token minimum — so caching the
// *result* is the real cost lever: identical portfolios within the TTL reuse a
// message instead of re-calling the API (it offsets per-card "fresh every load"
// fetching). Note: per-instance only; resets on restart and isn't shared across
// serverless instances.
const CACHE_TTL_MS = 15 * 60 * 1000;
const responseCache = new Map<string, { message: string; expires: number }>();

/**
 * Stable across small live-price ticks — keyed on holdings + 2% gain buckets,
 * not exact dollar values — so repeated loads hit the cache while the message
 * text stays roughly accurate.
 */
function cacheKey(body: InsightRequest): string {
  const bucketPct =
    body.gainPct == null ? "" : Math.round(body.gainPct / 2) * 2;
  const symbols = (body.holdings ?? [])
    .map((h) => h.symbol)
    .sort()
    .join(",");
  return [
    body.name ?? "",
    body.holdingsCount ?? "",
    body.topHolding?.symbol ?? "",
    bucketPct,
    symbols,
  ].join("|");
}

const SYSTEM_PROMPT = `You write a single short, warm, personalized line of encouragement for an investor about their own stock portfolio, shown on a dashboard card.

Rules:
- One sentence, max ~18 words. No surrounding quotes, no leading emoji.
- Use markdown **double-asterisk bold** for the investor's first name and any stock tickers (e.g. "**Alexa**", "**NVDA**"). Do not use any other markdown.
- Sound genuine and specific: weave in a real number or ticker when it's notable.
- Always be positive and encouraging, even when the portfolio is down — focus on the long game, consistency, or a bright spot. Never alarming.
- Never give financial advice and never tell them to buy, sell, or hold anything. No predictions.
- Address the investor warmly; you may use their first name.`;

function fmtMoney(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/** Deterministic, no-API encouragement so the card always has something warm to say. */
function fallbackMessage(body: InsightRequest): string {
  const name = (body.name ?? "there").trim().split(/\s+/)[0] || "there";
  const first = `**${name}**`;
  const gainPct = body.gainPct ?? 0;
  const top = body.topHolding;
  if (top && (top.changePercent ?? 0) > 0) {
    return `Nice momentum, ${first} — **${top.symbol}** is up ${fmtPct(
      top.changePercent ?? 0,
    )} and leading the way.`;
  }
  if (gainPct > 0) {
    return `Great work, ${first}! Your portfolio is up ${fmtPct(
      gainPct,
    )} — steady progress pays off.`;
  }
  if (gainPct < 0) {
    return `Hang in there, ${first} — markets ebb and flow, and staying invested is what counts.`;
  }
  return `You're in the game, ${first} — every steady step builds long-term wealth.`;
}

function buildUserPrompt(body: InsightRequest): string {
  const lines = [
    `Investor: ${body.name ?? "Investor"}`,
    body.currentValue != null
      ? `Current portfolio value: ${fmtMoney(body.currentValue)}`
      : null,
    body.totalGain != null && body.gainPct != null
      ? `Total gain since investing: ${fmtMoney(body.totalGain)} (${fmtPct(
          body.gainPct,
        )})`
      : null,
    body.holdingsCount != null
      ? `Number of holdings: ${body.holdingsCount}`
      : null,
    body.topHolding
      ? `Top performer: ${body.topHolding.symbol} (${fmtPct(
          body.topHolding.changePercent ?? 0,
        )})`
      : null,
    body.holdings?.length
      ? `Holdings: ${body.holdings
          .map((h) => `${h.symbol} ${fmtPct(h.changePercent ?? 0)}`)
          .join(", ")}`
      : null,
  ].filter(Boolean);
  return `Write the encouragement line for this portfolio:\n${lines.join("\n")}`;
}

export async function POST(request: NextRequest) {
  let body: InsightRequest;
  try {
    body = (await request.json()) as InsightRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // No key configured → graceful, free templated message. The app works with
  // no AI setup; drop ANTHROPIC_API_KEY into .env.local to upgrade to real AI.
  if (!apiKey) {
    return NextResponse.json({
      message: fallbackMessage(body),
      source: "fallback",
    });
  }

  // Reuse a recent message for the same portfolio instead of paying for a new
  // generation on every reload.
  const key = cacheKey(body);
  const cached = responseCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ message: cached.message, source: "cache" });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 64,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // The instructions are identical on every request, so they're the
          // natural cache prefix. (This prompt is below Haiku's minimum
          // cacheable size today, so it's a no-op until the prompt grows.)
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildUserPrompt(body) }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      return NextResponse.json({
        message: fallbackMessage(body),
        source: "fallback",
      });
    }

    responseCache.set(key, { message: text, expires: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ message: text, source: "ai" });
  } catch (error) {
    // Any failure (rate limit, network, bad key) still encourages the user.
    console.error("[insight] generation failed", error);
    return NextResponse.json({
      message: fallbackMessage(body),
      source: "fallback",
    });
  }
}
