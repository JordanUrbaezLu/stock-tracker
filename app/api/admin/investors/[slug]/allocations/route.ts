import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  findInvestorIndex,
  getInvestmentsDoc,
  requireAdmin,
} from "../../../utils";
import { alpacaConfigured, fetchAsset } from "@/lib/alpaca";

type Params = { slug: string };

function normalizeNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** How a new purchase was paid for ("Paid with" in the admin form). */
type FundedBy = "new" | "proceeds";

/** undefined = not specified (legacy callers); null = invalid value. */
function parseFundedBy(value: unknown): FundedBy | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "new" || normalized === "proceeds" ? normalized : null;
}

/**
 * The investor's `originalAmountInvested` override, read the way the
 * portfolio route reads it (any finite number counts), or null when they're
 * on the auto-sum.
 */
function readOverride(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return normalizeNumber(value);
}

/** The portfolio route's auto-sum of contributed cash: every allocation's
 *  invested amount (legacy `amount` accepted), symbol-less rows skipped. */
function autoSumInvested(
  allocations: Array<{ symbol?: unknown; invested?: unknown; amount?: unknown }>,
): number {
  return allocations.reduce((sum, allocation) => {
    if (!String(allocation?.symbol ?? "").trim()) return sum;
    const raw = allocation.invested ?? allocation.amount;
    const value = raw === undefined || raw === null ? null : normalizeNumber(raw);
    return sum + (value ?? 0);
  }, 0);
}

/**
 * Validate via Alpaca's asset registry (tradable + active) — covers ETFs like
 * TQQQ/VOO/QQQ that Finnhub's quote endpoint returned c=0 for, which used to
 * block admins from adding them.
 */
async function validateSymbol(symbol: string): Promise<boolean> {
  if (!alpacaConfigured()) return false;
  const asset = await fetchAsset(symbol);
  return Boolean(asset?.tradable);
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
  // "Paid with": new money from outside the club, or proceeds from a sale.
  // Omitted = legacy behavior (contributed total untouched).
  const fundedBy = parseFundedBy(body?.fundedBy);
  console.log("[admin/allocations] POST", {
    slug,
    symbol,
    invested,
    shares,
    dateInvested,
    fundedBy,
  });

  if (!symbol || invested == null || invested <= 0 || shares == null || shares <= 0) {
    return NextResponse.json(
      { error: "Symbol, invested amount, and shares are required and must be positive." },
      { status: 400 },
    );
  }

  if (fundedBy === null) {
    return NextResponse.json(
      { error: 'Paid with must be "new" (new money) or "proceeds" (money from a sale).' },
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

    const investor = investors[investorIndex];
    const allocations = investor.allocations ?? [];

    // Keep "total contributed" (the real external cash) right in the same
    // write, so new money never leaves a stale override behind:
    // - new money: bump an existing override by the amount (the auto-sum
    //   already picks the new allocation up on its own);
    // - money from a sale: freeze the auto-sum as it stands BEFORE this buy,
    //   so reinvested proceeds aren't counted as contributed a second time
    //   (an existing override already excludes them).
    const override = readOverride(investor.originalAmountInvested);
    if (fundedBy === "new" && override !== null) {
      investor.originalAmountInvested = roundCents(override + invested);
    } else if (fundedBy === "proceeds" && override === null) {
      investor.originalAmountInvested = roundCents(autoSumInvested(allocations));
    }

    const allocation = {
      id: randomUUID(),
      symbol,
      invested,
      shares,
      dateInvested,
    };
    allocations.push(allocation);
    investor.allocations = allocations;

    await collection.updateOne(
      { _id: doc._id },
      { $set: { investors } },
    );

    return NextResponse.json({
      ok: true,
      allocation,
      // The investor's contributed override after this add (null = auto-sum).
      originalAmountInvested: readOverride(investor.originalAmountInvested),
    });
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
  const soldAmount = body?.soldAmount;
  const soldDate = body?.soldDate;
  const clearSold = body?.clearSold === true; // re-open a closed position
  console.log("[admin/allocations] PATCH", {
    slug,
    id,
    allocationIndex,
    symbol,
    invested,
    shares,
    dateInvested,
    soldAmount,
    soldDate,
    clearSold,
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
    // Sell / re-open the position.
    if (clearSold) {
      delete target.soldAmount;
      delete target.soldDate;
      delete target.soldShares;
    } else {
      if (soldAmount !== undefined && soldAmount !== null) {
        const soldNum = normalizeNumber(soldAmount);
        if (soldNum != null && soldNum >= 0) target.soldAmount = soldNum;
      }
      if (typeof soldDate === "string" && soldDate.trim()) {
        target.soldDate = soldDate;
      }
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
