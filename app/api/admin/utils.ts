import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const ADMIN_COOKIE_PREFIX = "admin_auth_";

export function isAdminRequest(request: NextRequest): boolean {
  const todayKey = `${ADMIN_COOKIE_PREFIX}${new Date().toISOString().split("T")[0]}`;
  return request.cookies.has(todayKey);
}

export function requireAdmin(request: NextRequest): NextResponse | null {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export type DbAllocation = {
  symbol: string;
  invested?: number;
  amount?: number;
  shares?: number;
  dateInvested?: string | Date;
  id?: string;
};

export type DbInvestor = {
  name: string;
  allocations: DbAllocation[];
};

type InvestmentsDoc = {
  _id?: unknown;
  investors?: DbInvestor[];
};

export async function getInvestmentsDoc() {
  const dbName = process.env.MONGODB_DB;
  const collectionName = process.env.MONGODB_COLLECTION;

  if (!dbName || !collectionName) {
    throw new Error("MONGODB_DB and MONGODB_COLLECTION are required for admin actions.");
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection<InvestmentsDoc>(collectionName);
  // Prefer a document that already has investors; fall back to any document; otherwise create one.
  let doc =
    (await collection.findOne(
      { "investors.0": { $exists: true } },
      { projection: { investors: 1, _id: 1 } },
    )) ||
    (await collection.findOne({}, { projection: { investors: 1, _id: 1 } }));

  if (!doc) {
    const insert = await collection.insertOne({ investors: [] });
    doc = { _id: insert.insertedId, investors: [] };
  }

  return { collection, doc };
}

export function slugify(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export function findInvestorIndex(
  investors: DbInvestor[] = [],
  slug: string | undefined | null,
): number {
  if (!slug) return -1;
  const target = slug.toLowerCase();
  return investors.findIndex((inv) => {
    const invName = inv.name?.trim().toLowerCase() ?? "";
    if (!invName) return false;
    return slugify(invName) === target || invName === target;
  });
}
