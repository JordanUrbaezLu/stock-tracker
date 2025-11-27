import { NextRequest, NextResponse } from "next/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const COOKIE_PREFIX = "admin_auth_";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const password = body?.password;
  console.log("[admin/login] POST", {
    provided: typeof password === "string" ? "***" : "missing",
  });

  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const dateId = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const cookieName = `${COOKIE_PREFIX}${dateId}`;

  const response = NextResponse.json({ ok: true, key: cookieName });
  const expires = new Date();
  // expire at end of current day (local server time)
  expires.setHours(23, 59, 59, 999);

  response.cookies.set({
    name: cookieName,
    value: "1",
    httpOnly: true,
    path: "/",
    expires,
  });
  return response;
}
