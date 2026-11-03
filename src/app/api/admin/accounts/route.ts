import { NextResponse } from "next/server";
import { readAdminCode } from "@/lib/admin-session";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const adminCode = await readAdminCode();
  if (!adminCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });

  try {
    const db = createPublicServerSupabase();
    const { data, error } = await db.rpc("get_navlog_accounts_admin", { p_admin_code: adminCode, p_limit: 500 });
    if (error) throw error;
    return NextResponse.json({ accounts: data ?? [] }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load accounts" }, { status: 500, headers });
  }
}

export async function PATCH(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const adminCode = await readAdminCode();
  if (!adminCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  let payload: { user_id?: string; username?: string };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  }
  if (!payload.user_id?.match(/^[0-9a-f-]{36}$/i) || !payload.username?.match(/^[A-Za-z0-9._-]{3,24}$/)) {
    return NextResponse.json({ error: "Invalid user or username" }, { status: 400, headers });
  }
  try {
    const db = createPublicServerSupabase();
    const { data, error } = await db.rpc("update_navlog_username_admin", {
      p_admin_code: adminCode,
      p_user_id: payload.user_id,
      p_username: payload.username,
    });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Username already taken" }, { status: 409, headers });
      throw error;
    }
    if (!data) return NextResponse.json({ error: "User not found" }, { status: 404, headers });
    return NextResponse.json({ success: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to update this account" }, { status: 500, headers });
  }
}
