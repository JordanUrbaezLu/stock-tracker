import { NextResponse } from "next/server";

const ADMIN_COOKIE_PREFIX = "admin_auth_";

export async function POST() {
  const todayKey = `${ADMIN_COOKIE_PREFIX}${new Date().toISOString().split("T")[0]}`;

  console.log("[admin/logout] POST", { todayKey });

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: todayKey,
    value: "",
    path: "/",
    expires: new Date(0),
  });

  return response;
}
