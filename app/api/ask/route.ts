import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type AskHolding = {
  symbol: string;
  changePercent?: number | null;
  currentValue?: number | null;
  status?: string | null;
};

type AskInvestor = {
  name: string;
  currentValue?: number;
  originalInvested?: number;
  gainPct?: number | null;
  alphaSpy?: number | null;
  dayChangePercent?: number | null;
  holdings?: AskHolding[];
};

type AskRequest = {
  askerName?: string;
  question?: string;
  investors?: AskInvestor[];
};

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a warm, sharp portfolio companion inside a multi-investor stock-tracking app where a small group competes in a friendly portfolio challenge. You are given data for EVERY investor in the group, and you are told which investor is currently asking.

Rules:
- Address the asker in the second person ("you", "your") and refer to other investors by name.
- Answer using only the data provided — including head-to-head comparisons between investors (e.g. "how am I doing vs Brandon?").
- Be concise (1–4 sentences), friendly, and specific — reference the real tickers, names, and numbers.
- Use markdown **double-asterisk bold** for names, tickers, and key numbers. No other markdown.
- NEVER give financial advice: do not tell anyone to buy, sell, hold, or predict prices. If asked, gently decline and pivot to what the data shows.
- If the data doesn't contain the answer, say so briefly rather than inventing it.`;

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function investorLine(inv: AskInvestor, isAsker: boolean): string {
  const holdings = (inv.holdings ?? [])
    .map(
      (h) =>
        `${h.symbol}${h.status === "closed" ? "(sold)" : ""} ${fmtPct(
          h.changePercent,
        )}`,
    )
    .join(", ");
  return `- ${inv.name}${isAsker ? " (the asker)" : ""}: value $${Math.round(
    inv.currentValue ?? 0,
  )}, total return ${fmtPct(inv.gainPct)}, vs S&P ${fmtPct(
    inv.alphaSpy,
  )}, today ${fmtPct(inv.dayChangePercent)}; holdings: ${holdings || "none"}`;
}

function buildPrompt(body: AskRequest): string {
  const asker = body.askerName ?? "the investor";
  const lines = (body.investors ?? [])
    .map((inv) => investorLine(inv, inv.name === asker))
    .join("\n");
  return `The investor asking is: ${asker}

All investors in the group:
${lines}

Question from ${asker}: ${body.question}`;
}

export async function POST(request: NextRequest) {
  let body: AskRequest;
  try {
    body = (await request.json()) as AskRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const question = (body.question ?? "").trim().slice(0, 300);
  if (!question) {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      answer:
        "AI chat needs an **ANTHROPIC_API_KEY** in `.env.local`. Add one and you can ask anything about the portfolios.",
    });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 260,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: buildPrompt({ ...body, question }) }],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    return NextResponse.json({
      answer: text || "Hmm, I couldn't find that in the data.",
    });
  } catch (error) {
    console.error("[ask] generation failed", error);
    return NextResponse.json({
      answer: "I couldn't reach the AI just now — try again in a moment.",
    });
  }
}
