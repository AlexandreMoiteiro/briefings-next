import { NextResponse } from "next/server";
import { readAdminCode } from "@/lib/admin-session";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
import { createNavlogAdminClient } from "@/lib/navlog-pin-auth";

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

export async function DELETE(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!(await readAdminCode())) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403, headers });
  }
  try {
    const body = await request.json() as { user_id?: unknown; confirm_email?: unknown };
    if (typeof body.user_id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.user_id) ||
        typeof body.confirm_email !== "string" || body.confirm_email.length > 254) {
      return NextResponse.json({ error: "Invalid account or confirmation" }, { status: 400, headers });
    }
    const admin = createNavlogAdminClient();
    // This console only manages NavLog profiles, never unrelated Auth users.
    const { data: profile, error: profileError } = await admin.from("navlog_user_profiles")
      .select("user_id").eq("user_id", body.user_id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: "NavLog account not found" }, { status: 404, headers });
    const { data, error } = await admin.auth.admin.getUserById(body.user_id);
    if (error || !data.user) return NextResponse.json({ error: "Account not found" }, { status: 404, headers });
    if (body.confirm_email !== data.user.email) {
      return NextResponse.json({ error: "The confirmation email does not match this account" }, { status: 400, headers });
    }
    const deleted = await admin.auth.admin.deleteUser(body.user_id);
    if (deleted.error) throw deleted.error;
    return NextResponse.json({ success: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to delete this account" }, { status: 500, headers });
  }
}
