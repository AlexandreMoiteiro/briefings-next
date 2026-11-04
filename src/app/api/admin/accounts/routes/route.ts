import { NextResponse } from "next/server";
import { readAdminCode } from "@/lib/admin-session";
import { createNavlogAdminClient } from "@/lib/navlog-pin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function GET(request: Request) {
  if (!(await readAdminCode())) return reply({ error: "Unauthorized" }, 401);
  const userId = new URL(request.url).searchParams.get("user_id");
  if (!userId || !uuid.test(userId)) return reply({ error: "Invalid pilot" }, 400);

  try {
    const admin = createNavlogAdminClient();
    const { data: profile, error: profileError } = await admin.from("navlog_user_profiles")
      .select("user_id").eq("user_id", userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return reply({ error: "Pilot not found" }, 404);

    // Only route metadata leaves the server; private waypoints stay private.
    const { data, error } = await admin.from("navlog_user_routes")
      .select("id,name,created_at,updated_at")
      .eq("user_id", userId).order("updated_at", { ascending: false }).limit(200);
    if (error) throw error;
    return reply({ routes: data ?? [] });
  } catch {
    return reply({ error: "Unable to load this pilot's routes" }, 500);
  }
}

export async function DELETE(request: Request) {
  if (!(await readAdminCode())) return reply({ error: "Unauthorized" }, 401);
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Invalid request origin" }, 403);

  try {
    const body = await request.json() as { user_id?: unknown; route_id?: unknown; confirm_name?: unknown };
    if (typeof body.user_id !== "string" || !uuid.test(body.user_id) ||
      typeof body.route_id !== "string" || !uuid.test(body.route_id) ||
      typeof body.confirm_name !== "string" || body.confirm_name.length > 100) return reply({ error: "Invalid route or confirmation" }, 400);

    const admin = createNavlogAdminClient();
    const { data: route, error: findError } = await admin.from("navlog_user_routes")
      .select("id,name").eq("id", body.route_id).eq("user_id", body.user_id).maybeSingle();
    if (findError) throw findError;
    if (!route) return reply({ error: "Route not found for this pilot" }, 404);
    if (route.name !== body.confirm_name) return reply({ error: "Route name does not match" }, 400);

    const { data: deleted, error: deleteError } = await admin.from("navlog_user_routes")
      .delete().eq("id", body.route_id).eq("user_id", body.user_id).select("id").maybeSingle();
    if (deleteError) throw deleteError;
    if (!deleted) return reply({ error: "Route no longer exists" }, 404);
    return reply({ success: true });
  } catch {
    return reply({ error: "Unable to delete the private route" }, 500);
  }
}
