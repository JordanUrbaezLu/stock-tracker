import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  findInvestorIndex,
  getInvestmentsDoc,
  requireAdmin,
} from "../../../utils";

type Params = { slug: string };

function normalizeNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function validateSymbol(symbol: string): Promise<boolean> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return false;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return false;
    const data = await res.json();
    // Finnhub returns c=0/t=0 for invalid tickers
    return typeof data?.c === "number" && data.c > 0;
  } catch {
    return false;
  }
}

function findAllocationIndex(
  allocations: Array<{ id?: string }>,
  id?: string | null,
  index?: number | null,
) {
  if (id) {
    const byId = allocations.findIndex((a) => a.id === id);
    if (byId !== -1) return byId;
  }
  if (typeof index === "number" && index >= 0 && index < allocations.length) {
    return index;
  }
  return -1;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params | Promise<Params> },
) {
  const auth = requireAdmin(request);
  if (auth) return auth;

  const { slug } = await Promise.resolve(params);
  const body = await request.json().catch(() => ({}));

  const symbol =
    typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const invested = normalizeNumber(body?.invested ?? body?.amount);
  const shares = normalizeNumber(body?.shares);
  const dateInvested =
    typeof body?.dateInvested === "string" && body.dateInvested
      ? body.dateInvested
      : new Date().toISOString();
  console.log("[admin/allocations] POST", {
    slug,
    symbol,
    invested,
    shares,
    dateInvested,
  });

  if (!symbol || invested == null || invested <= 0 || shares == null || shares <= 0) {
    return NextResponse.json(
      { error: "Symbol, invested amount, and shares are required and must be positive." },
      { status: 400 },
    );
  }

  const isValidSymbol = await validateSymbol(symbol);
  if (!isValidSymbol) {
    return NextResponse.json(
      { error: "Ticker is not valid. Please enter a real company symbol." },
      { status: 400 },
    );
  }

  try {
    const { collection, doc } = await getInvestmentsDoc();
    const investors = doc.investors ?? [];
    const investorIndex = findInvestorIndex(
      investors as unknown as Parameters<typeof findInvestorIndex>[0],
      slug,
    );
    if (investorIndex === -1) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    const allocations = investors[investorIndex].allocations ?? [];
    const allocation = {
      id: randomUUID(),
      symbol,
      invested,
      shares,
      dateInvested,
    };
    allocations.push(allocation);
    investors[investorIndex].allocations = allocations;

    await collection.updateOne(
      { _id: doc._id },
      { $set: { investors } },
    );

    return NextResponse.json({ ok: true, allocation });
  } catch (error) {
    console.error("Add allocation failed", error);
    return NextResponse.json(
      { error: "Unable to add investment." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params | Promise<Params> },
) {
  const auth = requireAdmin(request);
  if (auth) return auth;

  const { slug } = await Promise.resolve(params);
  const body = await request.json().catch(() => ({}));

  const id = typeof body?.id === "string" ? body.id : undefined;
  const allocationIndex = normalizeNumber(body?.allocationIndex);
  const symbol =
    typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : undefined;
  const invested = body?.invested ?? body?.amount;
  const shares = body?.shares;
  const dateInvested = body?.dateInvested;
  console.log("[admin/allocations] PATCH", {
    slug,
    id,
    allocationIndex,
    symbol,
    invested,
    shares,
    dateInvested,
  });

  try {
    const { collection, doc } = await getInvestmentsDoc();
    const investors = doc.investors ?? [];
    const investorIndex = findInvestorIndex(
      investors as unknown as Parameters<typeof findInvestorIndex>[0],
      slug,
    );
    if (investorIndex === -1) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    const allocations = investors[investorIndex].allocations ?? [];
    const targetIndex = findAllocationIndex(
      allocations,
      id,
      Number.isFinite(allocationIndex) ? Number(allocationIndex) : null,
    );

    if (targetIndex === -1) {
      return NextResponse.json(
        { error: "Allocation not found." },
        { status: 404 },
      );
    }

    const target = allocations[targetIndex];
    if (symbol) target.symbol = symbol;
    if (invested !== undefined && invested !== null) {
      const invNum = normalizeNumber(invested);
      if (invNum != null) target.invested = invNum;
    }
    if (shares !== undefined && shares !== null) {
      const shNum = normalizeNumber(shares);
      if (shNum != null) target.shares = shNum;
    }
    if (typeof dateInvested === "string" && dateInvested.trim()) {
      target.dateInvested = dateInvested;
    }
    if (!target.id) target.id = randomUUID();

    allocations[targetIndex] = target;
    investors[investorIndex].allocations = allocations;

    await collection.updateOne(
      { _id: doc._id },
      { $set: { investors } },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update allocation failed", error);
    return NextResponse.json(
      { error: "Unable to update investment." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params | Promise<Params> },
) {
  const auth = requireAdmin(request);
  if (auth) return auth;

  const { slug } = await Promise.resolve(params);
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : undefined;
  const allocationIndex = normalizeNumber(body?.allocationIndex);
  console.log("[admin/allocations] DELETE", { slug, id, allocationIndex });

  try {
    const { collection, doc } = await getInvestmentsDoc();
    const investors = doc.investors ?? [];
    const investorIndex = findInvestorIndex(
      investors as unknown as Parameters<typeof findInvestorIndex>[0],
      slug,
    );
    if (investorIndex === -1) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    const allocations = investors[investorIndex].allocations ?? [];
    const targetIndex = findAllocationIndex(
      allocations,
      id,
      Number.isFinite(allocationIndex) ? Number(allocationIndex) : null,
    );

    if (targetIndex === -1) {
      return NextResponse.json(
        { error: "Allocation not found." },
        { status: 404 },
      );
    }

    allocations.splice(targetIndex, 1);
    investors[investorIndex].allocations = allocations;

    await collection.updateOne(
      { _id: doc._id },
      { $set: { investors } },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete allocation failed", error);
    return NextResponse.json(
      { error: "Unable to delete investment." },
      { status: 500 },
    );
  }
}
