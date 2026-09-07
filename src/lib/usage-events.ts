import { supabase } from "@/lib/supabase/client";

export type UsageEventInput = {
  eventType:
    | "navlog_export"
    | "performance_export"
    | "briefing_export"
    | "area_map_save"
    | "area_map_update";
  module: "navlog" | "performance" | "briefing" | "area-map";
  title?: string;
  aircraftType?: string;
  registration?: string;
  summary?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

const CLIENT_ID_STORAGE_KEY = "briefings_anonymous_client_id";
const PILOT_NAME_STORAGE_KEY = "briefings_performance_pilot_name";

function cleanText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  if (!text) return null;

  return text.slice(0, maxLength);
}

function getAnonymousClientId() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);

  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);

  return id;
}

function getPilotName() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PILOT_NAME_STORAGE_KEY)?.trim() ?? "";
}

function enrichExportEvent(event: UsageEventInput): UsageEventInput {
  if (
    event.eventType !== "navlog_export" &&
    event.eventType !== "performance_export"
  ) {
    return event;
  }

  const pilotName = getPilotName();
  if (!pilotName) return event;

  const title = event.title?.includes(pilotName)
    ? event.title
    : [event.title, pilotName].filter(Boolean).join(" · ");

  return {
    ...event,
    title,
    summary: {
      ...(event.summary ?? {}),
      pilotName,
    },
    payload: {
      ...(event.payload ?? {}),
      pilotName,
    },
  };
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

    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {
      invalid: true,
    };
  }
}

export async function logUsageEvent(event: UsageEventInput) {
  if (typeof window === "undefined") return;
  if (!supabase) return;

  const enrichedEvent = enrichExportEvent(event);

  try {
    const { error } = await supabase.from("app_usage_events").insert({
      client_id: getAnonymousClientId(),
      event_type: enrichedEvent.eventType,
      module: enrichedEvent.module,
      title: cleanText(enrichedEvent.title, 240),
      aircraft_type: cleanText(enrichedEvent.aircraftType, 120),
      registration: cleanText(enrichedEvent.registration, 80),
      summary: safeJson(enrichedEvent.summary, 20_000),
      payload: safeJson(enrichedEvent.payload, 100_000),
      user_agent: cleanText(navigator.userAgent, 500),
      url: cleanText(window.location.href, 1_000),
    });

    if (error) {
      console.warn("Usage event could not be logged:", error.message);
    }
  } catch (error) {
    console.warn("Usage event could not be logged:", error);
  }
}
