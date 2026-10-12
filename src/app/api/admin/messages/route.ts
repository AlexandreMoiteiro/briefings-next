import { NextResponse } from "next/server";
import { readAdminCode } from "@/lib/admin-session";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const code = await readAdminCode();
  if (!code) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const db = createPublicServerSupabase();
    const [feedback, unblock] = await Promise.all([
      db.rpc("get_app_feedback_messages_admin", { p_admin_code: code, p_limit: 300 }),
      db.rpc("get_app_unblock_requests_admin", { p_admin_code: code, p_limit: 300 }),
    ]);
    if (feedback.error || unblock.error) return NextResponse.json({ error: "Unable to load Messages" }, { status: 403, headers });
    return NextResponse.json({ feedback: feedback.data ?? [], unblock: unblock.data ?? [] }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load Messages" }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const code = await readAdminCode();
  if (!code) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const body = await request.json() as { action?: string; id?: string; status?: string; clientId?: string; ipHash?: string };
    const db = createPublicServerSupabase();
    let error: unknown = "Invalid action";
    if (body.action === "feedback-status" && UUID.test(body.id ?? "") && ["open", "read", "resolved"].includes(body.status ?? "")) {
      const result = await db.rpc("set_app_feedback_message_status_admin", { p_admin_code: code, p_message_id: body.id, p_status: body.status });
      error = result.error;
    } else if (body.action === "unblock-status" && UUID.test(body.id ?? "") && ["open", "reviewed", "resolved"].includes(body.status ?? "")) {
      const result = await db.rpc("set_app_unblock_request_status_admin", { p_admin_code: code, p_request_id: body.id, p_status: body.status });
      error = result.error;
    } else if (body.action === "unblock-device" && typeof body.clientId === "string" && body.clientId.length > 0 && body.clientId.length <= 200) {
      const result = await db.rpc("set_app_client_ban_admin", { p_admin_code: code, p_client_id: body.clientId, p_banned: false, p_reason: null });
      error = result.error;
      if (!error && UUID.test(body.id ?? "")) {
        await db.rpc("set_app_unblock_request_status_admin", { p_admin_code: code, p_request_id: body.id, p_status: "resolved" });
      }
    } else if (body.action === "unblock-network" && /^[0-9a-f]{64}$/i.test(body.ipHash ?? "")) {
      const result = await db.rpc("set_app_ip_ban_admin", { p_admin_code: code, p_ip_hash: body.ipHash, p_banned: false, p_reason: null });
      error = result.error;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400, headers });
    }
    if (error) return NextResponse.json({ error: "Action failed" }, { status: 403, headers });
    return new NextResponse(null, { status: 204, headers });
  } catch {
    return NextResponse.json({ error: "Unable to update Messages" }, { status: 400, headers });
  }
}
