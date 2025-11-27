import { NextRequest, NextResponse } from "next/server";
import { getInvestmentsDoc, requireAdmin, slugify } from "../utils";
import type { DbInvestor } from "../utils";

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth) return auth;

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  console.log("[admin/investors] POST", { name });

  if (!name) {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 },
    );
  }

  try {
    const { collection, doc } = await getInvestmentsDoc();
    const investors = doc.investors ?? [];

    const lower = name.toLowerCase();
    if (investors.some((inv) => inv.name?.toLowerCase() === lower)) {
      return NextResponse.json(
        { error: "Investor with this name already exists." },
        { status: 409 },
      );
    }

    const newInvestor: DbInvestor = { name, allocations: [] };

    await collection.updateOne(
      { _id: doc._id },
      { $set: { investors: [...investors, newInvestor] } },
    );

    return NextResponse.json({
      ok: true,
      slug: slugify(name),
    });
  } catch (error) {
    console.error("Create investor failed", error);
    return NextResponse.json(
      { error: "Unable to create investor." },
      { status: 500 },
    );
  }
}
