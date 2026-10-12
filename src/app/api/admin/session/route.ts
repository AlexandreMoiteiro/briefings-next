import { NextResponse } from "next/server";
import { clearAdminSession, readAdminCode, setAdminSession } from "@/lib/admin-session";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const code = await readAdminCode();
  if (!code) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const db = createPublicServerSupabase();
    const [events, daily] = await Promise.all([
      db.rpc("get_app_usage_events_admin", { p_admin_code: code, p_limit: 500 }),
      db.rpc("get_page_open_counts_admin", { p_admin_code: code, p_days: 30 }),
    ]);
    if (events.error || daily.error) return NextResponse.json({ error: "Unable to load Admin" }, { status: 401, headers });
    return NextResponse.json({ rows: events.data ?? [], pageOpens: daily.data ?? [] }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load Admin" }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || code.length > 256) return NextResponse.json({ error: "Invalid admin code" }, { status: 401, headers });
    const db = createPublicServerSupabase();
    const { error } = await db.rpc("get_app_usage_events_admin", { p_admin_code: code, p_limit: 1 });
    if (error) return NextResponse.json({ error: "Invalid admin code" }, { status: 401, headers });
    await setAdminSession(code);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to sign in" }, { status: 400, headers });
  }
}

export async function DELETE() {
  await clearAdminSession();
  return new NextResponse(null, { status: 204, headers });
}
