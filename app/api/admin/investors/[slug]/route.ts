import { NextRequest, NextResponse } from "next/server";
import {
  findInvestorIndex,
  getInvestmentsDoc,
  requireAdmin,
  slugify,
} from "../../utils";

type Params = { slug: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params | Promise<Params> },
) {
  const auth = requireAdmin(request);
  if (auth) return auth;

  const { slug } = await Promise.resolve(params);
  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  console.log("[admin/investor] PATCH", { slug, name });

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  try {
    const { collection, doc } = await getInvestmentsDoc();
    const investors = doc.investors ?? [];

    const targetIndex = findInvestorIndex(
      investors as unknown as Parameters<typeof findInvestorIndex>[0],
      slug,
    );
    if (targetIndex === -1) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    const lower = name.toLowerCase();
    if (
      investors.some(
        (inv, idx) => idx !== targetIndex && inv.name?.toLowerCase() === lower,
      )
    ) {
      return NextResponse.json(
        { error: "Another investor already has this name." },
        { status: 409 },
      );
    }

    investors[targetIndex].name = name;

    await collection.updateOne(
      { _id: doc._id },
      { $set: { investors } },
    );

    return NextResponse.json({ ok: true, slug: slugify(name) });
  } catch (error) {
    console.error("Update investor failed", error);
    return NextResponse.json(
      { error: "Unable to update investor." },
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
  console.log("[admin/investor] DELETE", { slug });

  try {
    const { collection, doc } = await getInvestmentsDoc();
    const investors = doc.investors ?? [];

    const targetIndex = findInvestorIndex(
      investors as unknown as Parameters<typeof findInvestorIndex>[0],
      slug,
    );

    if (targetIndex === -1) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    const nextInvestors = investors.filter((_, idx) => idx !== targetIndex);

    if (nextInvestors.length === investors.length) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    await collection.updateOne(
      { _id: doc._id },
      { $set: { investors: nextInvestors } },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete investor failed", error);
    return NextResponse.json(
      { error: "Unable to delete investor." },
      { status: 500 },
    );
  }
}
