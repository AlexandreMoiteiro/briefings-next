import { NextResponse } from "next/server";
import { readAdminCode } from "@/lib/admin-session";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const code = await readAdminCode();
  if (!code) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const db = createPublicServerSupabase();
    const { data, error } = await db.rpc("get_app_usage_events_admin", { p_admin_code: code, p_limit: 500 });
    if (error) return NextResponse.json({ error: "Unable to load Export access" }, { status: 403, headers });
    return NextResponse.json({ rows: data ?? [] }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load Export access" }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const code = await readAdminCode();
  if (!code) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const body = await request.json() as { kind?: string; id?: string; banned?: unknown; reason?: string };
    if ((body.kind !== "client" && body.kind !== "network") || typeof body.id !== "string" ||
      body.id.length === 0 || body.id.length > 200 || typeof body.banned !== "boolean")
      return NextResponse.json({ error: "Invalid action" }, { status: 400, headers });
    if (body.kind === "network" && !/^[0-9a-f]{64}$/i.test(body.id))
      return NextResponse.json({ error: "Invalid network identifier" }, { status: 400, headers });
    const db = createPublicServerSupabase();
    const reason = body.banned ? (body.reason?.slice(0, 200) || "Admin export access ban") : null;
    const { error } = body.kind === "client"
      ? await db.rpc("set_app_client_ban_admin", { p_admin_code: code, p_client_id: body.id, p_banned: body.banned, p_reason: reason })
      : await db.rpc("set_app_ip_ban_admin", { p_admin_code: code, p_ip_hash: body.id, p_banned: body.banned, p_reason: reason });
    if (error) return NextResponse.json({ error: "Unable to update Export access" }, { status: 403, headers });
    return new NextResponse(null, { status: 204, headers });
  } catch {
    return NextResponse.json({ error: "Unable to update Export access" }, { status: 400, headers });
  }
}
