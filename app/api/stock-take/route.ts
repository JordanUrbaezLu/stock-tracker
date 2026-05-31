import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type StockTakeRequest = {
  symbol?: string;
  name?: string | null;
  price?: number;
  todayPct?: number | null;
  ret1m?: number | null;
  ret6m?: number | null;
  ret1y?: number | null;
  low6m?: number | null;
  high6m?: number | null;
};

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a sharp, candid market analyst inside a stock-lookup tool. Given a stock's recent performance data, write a brief "6-month read".

Rules:
- 2–4 sentences. Be specific with the real numbers and the ticker.
- Use markdown **double-asterisk bold** for the ticker and key numbers. No other markdown.
- Cover the 6-month trend and momentum, and give a candid characterization of the profile (e.g. strong momentum, steady compounder, choppy/volatile, weak/declining, speculative/leveraged).
- You MAY give an opinionated read on whether it currently looks strong, mixed, or risky — but do NOT give direct buy/sell/hold instructions or price predictions, and don't tell the reader what to do with their money.`;

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
- 1-month return: ${fmtPct(b.ret1m)}
- 6-month return: ${fmtPct(b.ret6m)}
- 1-year return: ${fmtPct(b.ret1y)}
- 6-month range: ${b.low6m != null ? `$${b.low6m.toFixed(2)}` : "n/a"} – ${
    b.high6m != null ? `$${b.high6m.toFixed(2)}` : "n/a"
  }

Write the 6-month read.`;
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
      note: "Add an ANTHROPIC_API_KEY to .env.local to enable the AI 6-month read.",
    });
  }

  const bucket = body.ret6m == null ? "" : Math.round(body.ret6m / 3) * 3;
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
