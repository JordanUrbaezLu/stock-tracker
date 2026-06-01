import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type RoastHolding = {
  symbol: string;
  changePercent?: number | null;
  status?: "open" | "closed";
};

type RoastRequest = {
  mode?: "roast" | "hype";
  name?: string;
  currentValue?: number;
  gainPct?: number;
  totalGain?: number;
  alphaSpy?: number | null;
  holdings?: RoastHolding[];
  // Bumped on each explicit "Again" tap so repeat taps get a fresh take rather
  // than the cached one; a first tap (nonce 1) still reuses cache across loads.
  nonce?: number;
};

const MODEL = "claude-opus-4-8";

const ROAST_SYSTEM = `You are a witty comedian doing a light, funny roast of someone's stock portfolio in a casual group app — written so ANY everyday person laughs out loud, NOT just finance people. Exactly three short, punchy sentences, ~10–18 words each.
Rules:
- Go wildly over-the-top and silly, leaning on vivid ANALOGIES to everyday life, pop culture, and real-world events a general audience knows (blockbuster movies, sports moments, music, viral trends, video games, famous people, current events).
- AVOID finance jargon and market-insider references (no "alpha," "the Mag Seven," "buy the dip," "diamond hands," capex, rate cuts). You may name a ticker and drop one or two percentages, but the jokes must be normal-person funny, not technical.
- Roast the choices, never the person. Keep it clean and PG. End on a backhanded compliment.
- Use markdown **double-asterisk bold** for tickers and key numbers only. No lists, no headings, no preamble, no leading emoji.
- Never give real financial advice.`;

const HYPE_SYSTEM = `You are an over-the-top hype-man pumping up someone's stock portfolio in a casual group app — written so ANY everyday person grins, NOT just finance people. Exactly three short, punchy sentences, ~10–18 words each.
Rules:
- Go wildly over-the-top and fun, leaning on vivid ANALOGIES to everyday life, pop culture, and real-world events a general audience knows (superheroes, sports championships, blockbuster movies, viral moments, glow-ups, famous people, main-character energy).
- AVOID finance jargon and market-insider references (no "alpha," "the Mag Seven," "diamond hands," "soft landing," all-time highs). You may name a ticker and drop one or two percentages, but the energy must be normal-person fun, not technical.
- Keep it clean and PG.
- Use markdown **double-asterisk bold** for tickers and key numbers only. No lists, no headings, no preamble, no leading emoji.
- Never give real financial advice or predictions.`;

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { text: string; expires: number }>();

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtMoney(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function cacheKey(b: RoastRequest): string {
  const bucket = b.gainPct == null ? "" : Math.round(b.gainPct / 3) * 3;
  const symbols = (b.holdings ?? [])
    .map((h) => `${h.symbol}${h.status === "closed" ? "x" : ""}`)
    .sort()
    .join(",");
  return [b.mode ?? "roast", b.name ?? "", bucket, symbols, b.nonce ?? 0].join(
    "|",
  );
}

function buildPrompt(b: RoastRequest): string {
  const open = (b.holdings ?? []).filter((h) => h.status !== "closed");
  const closed = (b.holdings ?? []).filter((h) => h.status === "closed");
  const fmtList = (list: RoastHolding[]) =>
    list.length
      ? list.map((h) => `${h.symbol} ${fmtPct(h.changePercent)}`).join(", ")
      : "none";
  const lines = [
    `Investor: ${b.name ?? "this investor"}`,
    b.currentValue != null ? `Portfolio value: ${fmtMoney(b.currentValue)}` : null,
    b.gainPct != null ? `Total return: ${fmtPct(b.gainPct)}` : null,
    b.alphaSpy != null ? `Vs S&P 500: ${fmtPct(b.alphaSpy)}` : null,
    `Open holdings: ${fmtList(open)}`,
    `Sold holdings: ${fmtList(closed)}`,
  ].filter(Boolean);
  const verb = b.mode === "hype" ? "Hype them up" : "Roast them";
  return `${verb} based on this portfolio:\n${lines.join("\n")}`;
}

/** Templated fallback so the feature works with no API key configured. */
function fallback(b: RoastRequest): string {
  const name = (b.name ?? "this one").trim().split(/\s+/)[0] || "this one";
  if (b.mode === "hype") {
    return `**${name}** is cooking — a ${fmtPct(
      b.gainPct,
    )} portfolio doesn't build itself. The conviction is real and the bags are getting heavier. Keep stacking.`;
  }
  return `**${name}** really looked at the whole market and landed on... this. A ${fmtPct(
    b.gainPct,
  )} masterpiece of "trust me bro." Bold strategy — let's see how it ages.`;
}

export async function POST(request: NextRequest) {
  let body: RoastRequest;
  try {
    body = (await request.json()) as RoastRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const mode: "roast" | "hype" = body.mode === "hype" ? "hype" : "roast";
  body.mode = mode;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ text: fallback(body), source: "fallback", mode });
  }

  const key = cacheKey(body);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json({ text: hit.text, source: "cache", mode });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: [
        {
          type: "text",
          text: mode === "hype" ? HYPE_SYSTEM : ROAST_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildPrompt(body) }],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!text) {
      return NextResponse.json({ text: fallback(body), source: "fallback", mode });
    }
    cache.set(key, { text, expires: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ text, source: "ai", mode });
  } catch (error) {
    console.error("[roast] generation failed", error);
    return NextResponse.json({ text: fallback(body), source: "fallback", mode });
  }
}
