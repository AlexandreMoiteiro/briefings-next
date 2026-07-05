import type {
  NavlogPoint,
  NavlogRouteWaypoint,
  NavlogSetupForm,
} from "@/lib/navlog";
import { supabase } from "@/lib/supabase/client";

export type PerfectRouteWaypointRaw = {
  code?: string;
  name?: string;
  lat: number;
  lon: number;
  alt?: number;
  src?: string;
  routes?: string;
  remarks?: string;
  stop_min?: number;
  wind_from?: number | null;
  wind_kt?: number | null;
  vor_pref?: string;
  vor_ident?: string;
  suppress_auto_vertical?: boolean;
  alternate_marker?: boolean;
};

export type PerfectRoute = {
  id: string;
  name: string;
  waypoints: PerfectRouteWaypointRaw[];
  source: "supabase";
};

type SupabasePerfectRouteRow = {
  id: string;
  name: string;
  waypoints: PerfectRouteWaypointRaw[];
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured in .env.local.");
  }

  return supabase;
}

function cleanCode(value: string) {
  return value.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return text === "nan" ? "" : text;
}

function normalizePointSource(src: unknown): NavlogPoint["src"] {
  const value = cleanText(src).toUpperCase();

  if (value === "AD") return "AD";
  if (value === "VOR") return "VOR";
  if (value === "IFR") return "IFR";
  if (value === "PROC") return "PROC";

  return "VFR";
}

function normalizeVorPref(value: unknown): "AUTO" | "FIXED" {
  return cleanText(value).toUpperCase() === "FIXED" ? "FIXED" : "AUTO";
}

function rowToPerfectRoute(route: SupabasePerfectRouteRow): PerfectRoute {
  return {
    id: route.id,
    name: route.name,
    waypoints: Array.isArray(route.waypoints) ? route.waypoints : [],
    source: "supabase",
  };
}

export async function loadSupabasePerfectRoutes(): Promise<PerfectRoute[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from("navlog_perfect_routes")
    .select("id,name,waypoints")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as SupabasePerfectRouteRow[])
    .map(rowToPerfectRoute)
    .filter((route) => route.waypoints.length > 0);
}

export function routeWaypointsToPerfectRouteRaw(
  waypoints: NavlogRouteWaypoint[]
): PerfectRouteWaypointRaw[] {
  return waypoints.map((waypoint) => ({
    code: cleanCode(waypoint.point.code || waypoint.point.name || "WP"),
    name: cleanText(waypoint.point.name || waypoint.point.code || "Waypoint"),
    lat: waypoint.point.lat,
    lon: waypoint.point.lon,
    alt: waypoint.altitudeFt,
    src: waypoint.point.src,
    routes: cleanText(waypoint.point.routes),
    remarks: cleanText(waypoint.note || waypoint.point.remarks),
    stop_min: waypoint.stopMin,
    wind_from: waypoint.useGlobalWind ? null : waypoint.windFrom,
    wind_kt: waypoint.useGlobalWind ? null : waypoint.windKt,
    vor_pref: waypoint.vorPref,
    vor_ident: waypoint.vorIdent,
    suppress_auto_vertical: waypoint.suppressAutoVertical === true,
    alternate_marker: waypoint.alternateMarker === true,
  }));
}

export async function createSupabasePerfectRoute(
  name: string,
  waypoints: NavlogRouteWaypoint[]
): Promise<PerfectRoute> {
  const client = requireSupabase();

  const payload = {
    name: name.trim(),
    waypoints: routeWaypointsToPerfectRouteRaw(waypoints),
    is_public: true,
  };

  const { data, error } = await client
    .from("navlog_perfect_routes")
    .insert(payload)
    .select("id,name,waypoints")
    .single();

  if (error) {
    throw error;
  }

  return rowToPerfectRoute(data as SupabasePerfectRouteRow);
}

export async function updateSupabasePerfectRoute(
  id: string,
  name: string,
  waypoints: NavlogRouteWaypoint[]
): Promise<PerfectRoute> {
  const client = requireSupabase();

  const payload = {
    name: name.trim(),
    waypoints: routeWaypointsToPerfectRouteRaw(waypoints),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("navlog_perfect_routes")
    .update(payload)
    .eq("id", id)
    .select("id,name,waypoints")
    .single();

  if (error) {
    throw error;
  }

  return rowToPerfectRoute(data as SupabasePerfectRouteRow);
}

export async function deleteSupabasePerfectRoute(id: string) {
  const client = requireSupabase();

  const { error } = await client
    .from("navlog_perfect_routes")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export function perfectRouteToWaypoints(
  route: PerfectRoute,
  setup: NavlogSetupForm
): NavlogRouteWaypoint[] {
  return route.waypoints
    .filter(
      (item) =>
        Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))
    )
    .map((item, index) => {
      const code = cleanCode(item.code || item.name || `WP${index + 1}`);
      const name = cleanText(item.name || item.code || code);
      const alt = Number(item.alt ?? setup.defaultAltitude);
      const windFrom = Number(item.wind_from ?? setup.windFrom);
      const windKt = Number(item.wind_kt ?? setup.windKt);

      const point: NavlogPoint = {
        code,
        name,
        lat: Number(item.lat),
        lon: Number(item.lon),
        alt,
        src: normalizePointSource(item.src),
        routes: cleanText(item.routes),
        remarks: cleanText(item.remarks),
      };

      return {
        id: crypto.randomUUID(),
        point,
        altitudeFt: alt,
        useGlobalWind: item.wind_from === null || item.wind_from === undefined,
        windFrom,
        windKt,
        stopMin: Number(item.stop_min ?? 0),
        note: cleanText(item.remarks),
        vorPref: normalizeVorPref(item.vor_pref),
        vorIdent: cleanText(item.vor_ident).toUpperCase(),
        suppressAutoVertical: Boolean(item.suppress_auto_vertical),
        alternateMarker: Boolean(item.alternate_marker),
      };
    });
}

export function routeToText(route: PerfectRoute) {
  return route.waypoints
    .map((item) => cleanCode(item.code || item.name || ""))
    .filter(Boolean)
    .join(" ");
}
