import { NextRequest, NextResponse } from "next/server";

const ADMIN_PASSWORD = "Admin123!";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const password = body?.password;

  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: "admin_auth",
    value: "1",
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return response;
}
