import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type StockTakeRequest = {
  symbol?: string;
  name?: string | null;
  price?: number;
  todayPct?: number | null;
  // The timespan the reader chose to analyze (label + that window's stats).
  spanLabel?: string | null;
  spanReturn?: number | null;
  spanLow?: number | null;
  spanHigh?: number | null;
  // The standard windows, always sent as cross-timeframe context.
  ret1m?: number | null;
  ret6m?: number | null;
  ret1y?: number | null;
};

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a sharp, candid market analyst inside a stock-lookup tool. Given a stock's performance data over a reader-chosen timespan, write a brief read FOR THAT TIMESPAN.

Rules:
- 2–4 sentences. Be specific with the real numbers and the ticker.
- Use markdown **double-asterisk bold** for the ticker and key numbers. No other markdown.
- Center the read on the requested timespan's trend and momentum, and give a candid characterization of the profile (e.g. strong momentum, steady compounder, choppy/volatile, weak/declining, speculative/leveraged). You may reference the other timeframes for context.
- You MAY give an opinionated read on whether it currently looks strong, mixed, or risky — but do NOT give direct buy/sell/hold instructions or price predictions, and don't tell the reader what to do with their money.`;

// Cache by symbol + a coarse 6-month-return bucket; resets per instance.
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { text: string; expires: number }>();

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function buildPrompt(b: StockTakeRequest) {
  const span = b.spanLabel || "6 months";
  return `Stock: ${b.symbol}${b.name ? ` (${b.name})` : ""}
Timespan to analyze: ${span}
- Current price: $${(b.price ?? 0).toFixed(2)}
- Today: ${fmtPct(b.todayPct)}
- Return over ${span}: ${fmtPct(b.spanReturn)}
- ${span} range: ${b.spanLow != null ? `$${b.spanLow.toFixed(2)}` : "n/a"} – ${
    b.spanHigh != null ? `$${b.spanHigh.toFixed(2)}` : "n/a"
  }
- For context — 1-month: ${fmtPct(b.ret1m)}, 6-month: ${fmtPct(
    b.ret6m,
  )}, 1-year: ${fmtPct(b.ret1y)}

Write the ${span} read.`;
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

  const bucket =
    body.spanReturn == null ? "" : Math.round(body.spanReturn / 3) * 3;
  const key = `${symbol}|${body.spanLabel ?? ""}|${bucket}`;
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
