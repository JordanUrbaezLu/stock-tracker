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
  const name =
    typeof body?.name === "string" ? body.name.trim() : undefined;
  // "Total contributed" — the real external cash put in. Setting it explicitly
  // overrides the auto-sum; passing null/"" clears it back to the auto-sum.
  const hasOriginal =
    body != null && Object.prototype.hasOwnProperty.call(body, "originalAmountInvested");
  const rawOriginal = body?.originalAmountInvested;
  console.log("[admin/investor] PATCH", { slug, name, original: rawOriginal });

  if (name === undefined && !hasOriginal) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  if (name !== undefined && !name) {
    return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
  }

  let original: number | null | undefined;
  if (hasOriginal) {
    if (rawOriginal === null || rawOriginal === "") {
      original = null; // clear → revert to the auto-summed total
    } else {
      const n = Number(rawOriginal);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: "Total contributed must be a positive number." },
          { status: 400 },
        );
      }
      original = n;
    }
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

    if (name) {
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
    }

    if (hasOriginal) {
      if (original === null) {
        delete investors[targetIndex].originalAmountInvested;
      } else {
        investors[targetIndex].originalAmountInvested = original;
      }
    }

    await collection.updateOne(
      { _id: doc._id },
      { $set: { investors } },
    );

    return NextResponse.json({
      ok: true,
      slug: name ? slugify(name) : slug,
    });
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
