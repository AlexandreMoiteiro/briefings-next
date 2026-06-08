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

  try {
    const { error } = await supabase.from("app_usage_events").insert({
      client_id: getAnonymousClientId(),
      event_type: event.eventType,
      module: event.module,
      title: cleanText(event.title, 240),
      aircraft_type: cleanText(event.aircraftType, 120),
      registration: cleanText(event.registration, 80),
      summary: safeJson(event.summary, 20_000),
      payload: safeJson(event.payload, 100_000),
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
