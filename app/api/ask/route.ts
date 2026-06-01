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

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `You are a warm, sharp portfolio companion inside a multi-investor stock-tracking app where a small group competes in a friendly portfolio challenge. You are given data for EVERY investor plus PRE-COMPUTED standings, and you are told which investor is asking.

Rules:
- Use ONLY the data and standings provided. Never invent or estimate numbers, holdings, or positions.
- The standings are authoritative and already sorted. Each investor occupies EXACTLY ONE position in each ranking — never place the same person in two spots, and never skip or duplicate a rank.
- "Value" rank = portfolio size; "return" rank = percent gain. They can differ — be clear which one you mean.
- Address the asker in the second person ("you", "your") and refer to others by name.
- Be concise (1–4 sentences), friendly, and specific — cite the real tickers, names, and numbers.
- Use markdown **double-asterisk bold** for names, tickers, and key numbers. No other markdown.
- Don't give financial advice (no buy/sell/hold or price predictions); gently decline and pivot to the data.
- If the data doesn't answer the question, say so briefly rather than guessing.`;

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtMoney(n: number | null | undefined) {
  return `$${Math.round(n ?? 0).toLocaleString("en-US")}`;
}

function ordinal(i: number) {
  return ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"][i] ?? `${i + 1}th`;
}

function detailLine(inv: AskInvestor, isAsker: boolean): string {
  const holdings = (inv.holdings ?? [])
    .map(
      (h) =>
        `${h.symbol}${h.status === "closed" ? "(sold)" : ""} ${fmtPct(
          h.changePercent,
        )}`,
    )
    .join(", ");
  return `- ${inv.name}${isAsker ? " (the asker)" : ""}: value ${fmtMoney(
    inv.currentValue,
  )}, total return ${fmtPct(inv.gainPct)}, vs S&P ${fmtPct(
    inv.alphaSpy,
  )}, today ${fmtPct(inv.dayChangePercent)}; holdings: ${holdings || "none"}`;
}

function buildPrompt(body: AskRequest): string {
  const asker = body.askerName ?? "the investor";
  const investors = body.investors ?? [];

  // Pre-rank server-side so the model never has to sort (it gets this wrong and
  // duplicates positions). One entry per investor per ranking.
  const byValue = [...investors].sort(
    (a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0),
  );
  const byReturn = [...investors].sort(
    (a, b) => (b.gainPct ?? -Infinity) - (a.gainPct ?? -Infinity),
  );

  const valueStandings = byValue
    .map(
      (inv, i) =>
        `${ordinal(i)}: ${inv.name} — ${fmtMoney(inv.currentValue)} (return ${fmtPct(
          inv.gainPct,
        )})`,
    )
    .join("\n");
  const returnStandings = byReturn
    .map(
      (inv, i) =>
        `${ordinal(i)}: ${inv.name} — ${fmtPct(inv.gainPct)} (value ${fmtMoney(
          inv.currentValue,
        )})`,
    )
    .join("\n");

  const details = investors
    .map((inv) => detailLine(inv, inv.name === asker))
    .join("\n");

  return `The investor asking is: ${asker}

STANDINGS BY PORTFOLIO VALUE (highest first — authoritative, one slot each):
${valueStandings}

STANDINGS BY TOTAL RETURN (best % first — authoritative, one slot each):
${returnStandings}

PER-INVESTOR DETAIL:
${details}

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
