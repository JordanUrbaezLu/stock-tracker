import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type StockTakeRequest = {
  symbol?: string;
  name?: string | null;
  price?: number;
  todayPct?: number | null;
  // The last year is the primary lens; the shorter windows add context.
  ret1m?: number | null;
  ret6m?: number | null;
  ret1y?: number | null;
  yearLow?: number | null;
  yearHigh?: number | null;
};

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `You are a sharp, candid market analyst inside a stock-lookup tool. Write ONE compact, up-to-date take on the company — exactly three short sentences, one per point below, in order. No preamble, no filler, no restating the question.

1. Performance — how the stock has done over the LAST YEAR (cite the real 1-year % and the ticker).
2. Global standing — where the company sits in the world economy right now, given real-world events, trends, and what it actually sells or does (use your own up-to-date knowledge of the company).
3. Verdict — your overall call: buy, hold, or sell, a rough time horizon, and why, in one clause.

Rules:
- Keep each sentence tight (~14–22 words); whole thing under ~75 words.
- Use markdown **double-asterisk bold** for the ticker and key numbers only. No other markdown, no lists, no headings.
- Be decisive on the verdict — a clear call with a reason, not a hedge.`;

// Cache by symbol + a coarse 6-month-return bucket; resets per instance.
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { text: string; expires: number }>();

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function buildPrompt(b: StockTakeRequest) {
  return `Stock: ${b.symbol}${b.name ? ` (${b.name})` : ""}
- Current price: $${(b.price ?? 0).toFixed(2)}
- Today: ${fmtPct(b.todayPct)}
- 1-year return: ${fmtPct(b.ret1y)} (primary lens)
- 1-year range: ${b.yearLow != null ? `$${b.yearLow.toFixed(2)}` : "n/a"} – ${
    b.yearHigh != null ? `$${b.yearHigh.toFixed(2)}` : "n/a"
  }
- Context — 1-month: ${fmtPct(b.ret1m)}, 6-month: ${fmtPct(b.ret6m)}

Write the take.`;
}

export async function POST(request: NextRequest) {
  let body: StockTakeRequest;
  try {
    body = (await request.json()) as StockTakeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const symbol = (body.symbol ?? "").toString().toUpperCase().slice(0, 12);
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      read: null,
      note: "Add an ANTHROPIC_API_KEY to .env.local to enable the AI read.",
    });
  }

  // Cache per symbol, bucketed by a coarse 1-year return so the take refreshes
  // if the stock moves materially.
  const bucket = body.ret1y == null ? "" : Math.round(body.ret1y / 5) * 5;
  const key = `${symbol}|${bucket}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json({ read: hit.text, source: "cache" });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 240,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: buildPrompt({ ...body, symbol }) }],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (text) cache.set(key, { text, expires: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ read: text || null, source: "ai" });
  } catch (error) {
    console.error("[stock-take] generation failed", error);
    return NextResponse.json({ read: null });
  }
}
