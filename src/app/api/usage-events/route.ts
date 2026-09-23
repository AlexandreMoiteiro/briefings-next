import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";

const EVENT_MODULES = {
  navlog_export: "navlog",
  performance_export: "performance",
  briefing_export: "briefing",
  area_map_save: "area-map",
  area_map_update: "area-map",
  area_map_pdf_export: "area-map",
} as const;

type UsageEventType = keyof typeof EVENT_MODULES;

type UsageEventBody = {
  eventId?: unknown;
  clientId?: unknown;
  eventType?: unknown;
  module?: unknown;
  title?: unknown;
  aircraftType?: unknown;
  registration?: unknown;
  routeName?: unknown;
  summary?: unknown;
  payload?: unknown;
  url?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeJson(value: unknown, maxChars: number) {
  try {
    const json = JSON.stringify(value ?? {});
    if (json.length > maxChars) {
      return {
        truncated: true,
        originalLength: json.length,
      };
    }
    return JSON.parse(json) as unknown;
  } catch {
    return { invalid: true };
  }
}

function getClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    ""
  );
}

function hashIp(ip: string) {
  return createHash("sha256").update(`briefings-ip-v1|${ip}`).digest("hex");
}

function isUsageEventType(value: string): value is UsageEventType {
  return Object.prototype.hasOwnProperty.call(EVENT_MODULES, value);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 64_000) {
    return NextResponse.json({ error: "Usage event is too large." }, { status: 413 });
  }

  try {
    const body = (await request.json()) as UsageEventBody;
    const eventId = cleanText(body.eventId, 64) ?? "";
    const clientId = cleanText(body.clientId, 200) ?? "";
    const eventType = cleanText(body.eventType, 80) ?? "";
    const module = cleanText(body.module, 80) ?? "";

    if (!UUID_PATTERN.test(eventId)) {
      return NextResponse.json({ error: "Invalid event identifier." }, { status: 400 });
    }
    if (!clientId) {
      return NextResponse.json({ error: "Missing client identifier." }, { status: 400 });
    }
    if (!isUsageEventType(eventType) || EVENT_MODULES[eventType] !== module) {
      return NextResponse.json({ error: "Invalid usage event." }, { status: 400 });
    }

    const ip = getClientIp(request);
    const supabase = createPublicServerSupabase();
    const { error } = await supabase.from("app_usage_events").insert({
      id: eventId,
      client_id: clientId,
      ip_hash: ip ? hashIp(ip) : null,
      event_type: eventType,
      module,
      title: cleanText(body.title, 240),
      aircraft_type: cleanText(body.aircraftType, 120),
      registration: cleanText(body.registration, 80),
      route_name: cleanText(body.routeName, 160),
      summary: safeJson(body.summary, 12_000),
      payload: safeJson(body.payload, 38_000),
      user_agent: cleanText(request.headers.get("user-agent"), 500),
      url: cleanText(body.url, 1_000),
    });

    if (error && error.code !== "23505") {
      console.warn("Usage event could not be logged:", error.message);
      return NextResponse.json({ error: "Could not log usage event." }, { status: 503 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.warn("Usage event endpoint failed:", error);
    return NextResponse.json({ error: "Could not log usage event." }, { status: 400 });
  }
}
