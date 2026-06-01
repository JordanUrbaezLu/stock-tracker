import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type PredictRequest = {
  symbol?: string;
  name?: string | null;
  price?: number;
  ret1m?: number | null;
  ret6m?: number | null;
  ret1y?: number | null;
  yearLow?: number | null;
  yearHigh?: number | null;
};

type Prediction = {
  m1: number;
  m2: number;
  m3: number;
  direction: "up" | "down" | "flat";
  rationale: string;
};

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `You produce a SHORT, speculative 3-month price projection for a stock inside a fun investing app (clearly framed as a guess, not advice). Given the current price and recent performance plus your own knowledge of the company, output a plausible monthly price path for the next three months.

Return ONLY strict, minified JSON — no markdown, no prose — in EXACTLY this shape:
{"m1":<number>,"m2":<number>,"m3":<number>,"direction":"up"|"down"|"flat","rationale":"<one sentence>"}

Rules:
- m1, m2, m3 are absolute projected prices (USD) at +1, +2, and +3 months.
- Be HONEST and unbiased — this is meant to be USEFUL, not flattering. Project DOWNWARD when momentum, valuation, or real-world risks point that way; a flat or negative outlook is often the correct call. Do NOT lean optimistic by default — over many stocks, roughly as many should be projected lower as higher.
- Ground every call in the real trend, momentum, valuation, and known risks. Avoid reflexive moonshots AND reflexive crashes; a typical 3-month move lands within roughly ±25%.
- "direction" reflects the net path vs the current price — use "down" or "flat" whenever that's the honest read.
- "rationale" is ONE plain sentence, <= 18 words, stating the real reason (name the downside risk when the call is down/flat). No advice phrasing, no markdown.`;

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { prediction: Prediction; expires: number }>();

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function buildPrompt(b: PredictRequest) {
  return `Stock: ${b.symbol}${b.name ? ` (${b.name})` : ""}
- Current price: $${(b.price ?? 0).toFixed(2)}
- Returns — 1-month: ${fmtPct(b.ret1m)}, 6-month: ${fmtPct(b.ret6m)}, 1-year: ${fmtPct(b.ret1y)}
- 1-year range: ${b.yearLow != null ? `$${b.yearLow.toFixed(2)}` : "n/a"} – ${
    b.yearHigh != null ? `$${b.yearHigh.toFixed(2)}` : "n/a"
  }

Output the JSON projection.`;
}

/** Clamp a projected price to a sane band around the current price. */
function sane(price: number, v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.max(n, price * 0.4), price * 3);
}

/** Momentum fallback so the forecast works with no API key (or on failure). */
function fallback(b: PredictRequest): Prediction {
  const price = b.price && b.price > 0 ? b.price : 100;
  // Dampened monthly drift from the recent 1-month (or 6-month/6) trend.
  const monthly = (b.ret1m ?? (b.ret6m != null ? b.ret6m / 6 : 0)) / 100;
  const r = Math.max(-0.2, Math.min(0.2, monthly)) * 0.5;
  const m1 = price * (1 + r);
  const m2 = price * (1 + r) ** 2;
  const m3 = price * (1 + r) ** 3;
  const direction = r > 0.01 ? "up" : r < -0.01 ? "down" : "flat";
  return {
    m1,
    m2,
    m3,
    direction,
    rationale: "Projected from recent price momentum.",
  };
}

export async function POST(request: NextRequest) {
  let body: PredictRequest;
  try {
    body = (await request.json()) as PredictRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const symbol = (body.symbol ?? "").toString().toUpperCase().slice(0, 12);
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  const price = body.price && body.price > 0 ? body.price : 0;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || price <= 0) {
    return NextResponse.json({ prediction: fallback(body), source: "fallback" });
  }

  // Cache per symbol, bucketed into ~4% price bands (log scale) so the forecast
  // refreshes once the stock moves materially but reuses across small ticks.
  const bucket = Math.round(Math.log(price) / Math.log(1.04));
  const key = `${symbol}|${bucket}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json({ prediction: hit.prediction, source: "cache" });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
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

    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    const m1 = sane(price, parsed?.m1);
    const m2 = sane(price, parsed?.m2);
    const m3 = sane(price, parsed?.m3);
    if (m1 == null || m2 == null || m3 == null) {
      return NextResponse.json({ prediction: fallback(body), source: "fallback" });
    }
    const dir =
      parsed?.direction === "up" || parsed?.direction === "down"
        ? parsed.direction
        : m3 > price * 1.01
          ? "up"
          : m3 < price * 0.99
            ? "down"
            : "flat";
    const prediction: Prediction = {
      m1,
      m2,
      m3,
      direction: dir,
      rationale:
        typeof parsed?.rationale === "string" && parsed.rationale.trim()
          ? parsed.rationale.trim().slice(0, 160)
          : "Projection based on current trend and fundamentals.",
    };
    cache.set(key, { prediction, expires: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ prediction, source: "ai" });
  } catch (error) {
    console.error("[predict] generation failed", error);
    return NextResponse.json({ prediction: fallback(body), source: "fallback" });
  }
}
