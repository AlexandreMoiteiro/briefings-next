"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { PERFORMANCE_AERODROMES } from "@/lib/performance/aerodromes";
import { logUsageEvent } from "@/lib/usage-events";

const PILOT_STORAGE_KEY = "briefings_performance_pilot_name";
const SUCCESS_PATTERN = /performance pdf (?:generated|exported)/i;

type PerformanceUsageTrackerProps = {
  aircraft: "Tecnam P2006T" | "Tecnam P2008" | "Piper PA-28";
  children: ReactNode;
};

type JsonRecord = Record<string, unknown>;

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function fieldValue(root: ParentNode, captions: string[]) {
  const targets = captions.map(normalize);
  const label = Array.from(root.querySelectorAll("label")).find((element) =>
    targets.includes(normalize(element.querySelector("span")?.textContent))
  );
  const control = label?.querySelector("input, select") as
    | HTMLInputElement
    | HTMLSelectElement
    | null;

  return control?.value?.trim() ?? "";
}

function numberFieldValue(root: ParentNode, captions: string[]) {
  const value = Number(fieldValue(root, captions));
  return Number.isFinite(value) ? value : null;
}

function parseFirstNumber(value: string | null | undefined) {
  const match = String(value ?? "").match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function fuelValueFromRow(root: HTMLElement, key: string) {
  const row = root.querySelector(
    `[data-standard-fuel-row="${key}"], [data-row-key="${key}"]`
  );
  const cells = row?.querySelectorAll("td");
  const value = cells?.length ? cells[cells.length - 1]?.textContent : "";
  return parseFirstNumber(value);
}

function roleFromCard(card: HTMLElement, index: number) {
  const knownRoles = [
    "Departure",
    "Arrival",
    "Alternate",
    "Alternate 1",
    "Alternate 2",
  ];
  const heading = Array.from(card.querySelectorAll("p, h3, h4")).find((element) =>
    knownRoles.includes(element.textContent?.trim() ?? "")
  );

  return heading?.textContent?.trim() ||
    ["Departure", "Arrival", "Alternate", "Alternate 2"][index] ||
    `Aerodrome ${index + 1}`;
}

function readPerformanceResults(root: HTMLElement) {
  const aerodromes = PERFORMANCE_AERODROMES as Record<string, JsonRecord>;
  const icaoLabels = Array.from(root.querySelectorAll("label")).filter(
    (label) => normalize(label.querySelector("span")?.textContent) === "icao"
  );

  return icaoLabels
    .map((label, index) => {
      const select = label.querySelector("select") as HTMLSelectElement | null;
      const icao = select?.value?.trim() ?? "";
      const aerodrome = aerodromes[icao];
      const card = label.closest("div.rounded-2xl") as HTMLElement | null;

      if (!icao || !aerodrome || !card) return null;

      const text = card.textContent ?? "";
      const runway = text.match(/RWY\s+([0-9A-Z]+)/i)?.[1] ?? "";
      const pressureAltitudeFt = parseFirstNumber(
        text.match(/\bPA\s+-?\d+(?:[.,]\d+)?/i)?.[0]
      );
      const densityAltitudeFt = parseFirstNumber(
        text.match(/\bDA\s+-?\d+(?:[.,]\d+)?/i)?.[0]
      );
      const rocFpm = parseFirstNumber(
        text.match(/\bROC\s+-?\d+(?:[.,]\d+)?/i)?.[0]
      );
      const role = roleFromCard(card, index);

      return {
        leg: {
          role,
          icao,
          tempC: numberFieldValue(card, ["Temperature C", "OAT C"]),
          qnhHpa: numberFieldValue(card, ["QNH hPa", "QNH"]),
          windFrom: numberFieldValue(card, ["Wind from"]),
          windKt: numberFieldValue(card, ["Wind kt"]),
        },
        aerodrome,
        bestRunway: runway ? { id: runway } : null,
        pressureAltitudeFt,
        densityAltitudeFt,
        rocFpm,
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
}

function buildUsageEvent(
  root: HTMLElement,
  aircraft: PerformanceUsageTrackerProps["aircraft"],
  pilotName: string
) {
  const registration = fieldValue(root, ["Registration"]);
  const date = fieldValue(root, ["Flight date"]);
  const performanceResults = readPerformanceResults(root);
  const requiredRampFuelL = fuelValueFromRow(root, "required");
  const totalRampFuelL =
    fuelValueFromRow(root, "total") ?? fuelValueFromRow(root, "loaded");
  const extraFuelL = fuelValueFromRow(root, "extra");
  const cleanPilotName = pilotName.trim();
  const fuelSufficient =
    requiredRampFuelL !== null && totalRampFuelL !== null
      ? totalRampFuelL >= requiredRampFuelL
      : undefined;

  return {
    eventType: "performance_export" as const,
    module: "performance" as const,
    title: [
      `Performance ${registration || aircraft}`,
      cleanPilotName || null,
    ]
      .filter(Boolean)
      .join(" · "),
    aircraftType: aircraft,
    registration,
    summary: {
      aircraft,
      registration,
      date,
      pilotName: cleanPilotName || undefined,
      aerodromes: performanceResults.length,
      fuelSufficient,
      requiredRampFuelL,
      totalRampFuelL,
      extraFuelL,
    },
    payload: {
      aircraft,
      registration,
      date,
      pilotName: cleanPilotName || undefined,
      performanceResults,
    },
  };
}

export function PerformanceUsageTracker({
  aircraft,
  children,
}: PerformanceUsageTrackerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const [pilotName, setPilotName] = useState("");

  useEffect(() => {
    setPilotName(window.localStorage.getItem(PILOT_STORAGE_KEY) ?? "");

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  function updatePilotName(value: string) {
    setPilotName(value);
    window.localStorage.setItem(PILOT_STORAGE_KEY, value);
  }

  function startSuccessWatch() {
    const root = rootRef.current;
    if (!root) return;

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
    }

    const attempt = Date.now();
    attemptRef.current = attempt;
    const startedAt = Date.now();
    let sawClearedStatus = !SUCCESS_PATTERN.test(root.textContent ?? "");

    timerRef.current = window.setInterval(() => {
      if (attemptRef.current !== attempt) return;

      const text = root.textContent ?? "";
      const successful = SUCCESS_PATTERN.test(text);

      if (!successful) sawClearedStatus = true;

      if (successful && sawClearedStatus) {
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        attemptRef.current = 0;
        void logUsageEvent(buildUsageEvent(root, aircraft, pilotName));
        return;
      }

      if (Date.now() - startedAt > 30_000) {
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        attemptRef.current = 0;
      }
    }, 250);
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest("button");
    if (!button || button.disabled) return;

    const text = normalize(button.textContent);
    if (text !== "export pdf") return;

    window.setTimeout(startSuccessWatch, 50);
  }

  return (
    <div ref={rootRef} onClickCapture={handleClickCapture} className="space-y-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
          Pilot
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-500">
          Optional. When filled, the pilot name is saved with the successful
          Performance PDF export event.
        </p>
        <label className="mt-4 block max-w-md space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Pilot name
          </span>
          <input
            value={pilotName}
            onChange={(event) => updatePilotName(event.target.value)}
            autoComplete="name"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-500"
            placeholder="Optional"
          />
        </label>
      </section>

      {children}
    </div>
  );
}
