import { NextResponse } from "next/server";
import { readAdminCode } from "@/lib/admin-session";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Waypoint = { code?: string; lat?: number; lon?: number } & Record<string, unknown>;

export async function GET() {
  if (!(await readAdminCode())) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const db = createPublicServerSupabase();
    const [routes, curated] = await Promise.all([
      db.from("navlog_perfect_routes")
        .select("id,name,description,waypoints,tags,source,route_text")
        .eq("is_public", true).order("name", { ascending: true }).limit(1000),
      db.from("navlog_route_curation").select("route_id,is_default,category"),
    ]);
    if (routes.error || curated.error) throw new Error("Failed to retrieve routes");
    const metadata = new Map((curated.data ?? []).map((entry) => [entry.route_id, entry]));
    return NextResponse.json({ routes: (routes.data ?? []).map((route) => ({
      ...route,
      is_default: metadata.get(route.id)?.is_default ?? false,
      category: metadata.get(route.id)?.category ?? null,
    })) }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load NavLog routes." }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const code = await readAdminCode();
  if (!code) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const body = await request.json() as {
      id?: unknown; name?: unknown; description?: unknown; waypoints?: unknown;
      category?: unknown; is_default?: unknown;
    };
    if (
      typeof body.id !== "string" || !uuidPattern.test(body.id) ||
      typeof body.name !== "string" || !body.name.trim() || body.name.length > 100 ||
      typeof body.description !== "string" || body.description.length > 1000 ||
      (body.waypoints !== null && (
        !Array.isArray(body.waypoints) || body.waypoints.length < 2 || body.waypoints.length > 120 ||
        !body.waypoints.every((point: Waypoint) =>
          point && typeof point === "object" &&
          typeof point.code === "string" && /^[A-Za-z0-9]{1,16}$/.test(point.code) &&
          typeof point.lat === "number" && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 &&
          typeof point.lon === "number" && Number.isFinite(point.lon) && Math.abs(point.lon) <= 180
        )
      )) ||
      ![null, "VFR", "IFR"].includes(body.category as string | null) ||
      typeof body.is_default !== "boolean" || JSON.stringify(body.waypoints).length > 65_536
    ) {
      return NextResponse.json({ error: "Invalid route data. Check the coordinates and waypoints." }, { status: 400, headers });
    }
    const db = createPublicServerSupabase();
    const parameters = {
      p_admin_code: code,
      p_route_id: body.id,
      p_name: body.name,
      p_description: body.description,
      p_category: body.category,
      p_is_default: body.is_default,
    };
    const { error } = body.waypoints === null
      ? await db.rpc("admin_update_navlog_route_metadata", parameters)
      : await db.rpc("admin_update_navlog_route", { ...parameters, p_waypoints: body.waypoints });
    if (error) return NextResponse.json({ error: "Unable to save the route." }, { status: 400, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to update the route." }, { status: 400, headers });
  }
}
