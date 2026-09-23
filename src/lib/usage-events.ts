import { getAnonymousClientId } from "@/lib/export-access";

export type UsageEventInput = {
  eventType:
    | "navlog_export"
    | "performance_export"
    | "briefing_export"
    | "area_map_save"
    | "area_map_update"
    | "area_map_pdf_export";
  module: "navlog" | "performance" | "briefing" | "area-map";
  title?: string;
  aircraftType?: string;
  registration?: string;
  routeName?: string;
  summary?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

const PILOT_NAME_STORAGE_KEY = "briefings_performance_pilot_name";
const USAGE_EVENT_ENDPOINT = "/api/usage-events";

function cleanText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
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
    return { invalid: true };
  }
}

function createEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function logUsageEvent(event: UsageEventInput) {
  if (typeof window === "undefined") return;

  const enrichedEvent = enrichExportEvent(event);
  const body = JSON.stringify({
    eventId: createEventId(),
    clientId: getAnonymousClientId(),
    eventType: enrichedEvent.eventType,
    module: enrichedEvent.module,
    title: cleanText(enrichedEvent.title, 240),
    aircraftType: cleanText(enrichedEvent.aircraftType, 120),
    registration: cleanText(enrichedEvent.registration, 80),
    routeName: cleanText(enrichedEvent.routeName, 160),
    summary: safeJson(enrichedEvent.summary, 12_000),
    payload: safeJson(enrichedEvent.payload, 38_000),
    url: cleanText(window.location.href, 1_000),
  });

  // sendBeacon is deliberately the first choice. On iOS/iPadOS, opening or
  // saving a PDF can background the page immediately; beacon is designed to
  // survive that transition. The body is kept below the browser keepalive
  // budget, and the server uses eventId to make retries idempotent.
  try {
    if (typeof navigator.sendBeacon === "function") {
      const queued = navigator.sendBeacon(
        USAGE_EVENT_ENDPOINT,
        new Blob([body], { type: "application/json" })
      );
      if (queued) return;
    }
  } catch {
    // Fall through to keepalive fetch.
  }

  try {
    const response = await fetch(USAGE_EVENT_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body,
      credentials: "same-origin",
      keepalive: true,
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`Usage event could not be logged (${response.status}).`);
    }
  } catch (error) {
    console.warn("Usage event could not be logged:", error);
  }
}
