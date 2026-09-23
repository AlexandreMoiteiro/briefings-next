"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { ExportBlockedDialog } from "@/components/export-blocked-dialog";
import { PilotDownloadCard } from "@/components/pilot-download-card";
import { PERFORMANCE_AERODROMES } from "@/lib/performance/aerodromes";
import { checkExportAccess } from "@/lib/export-access";
import { logUsageEvent } from "@/lib/usage-events";

const PILOT_STORAGE_KEY = "briefings_performance_pilot_name";

type PerformanceUsageTrackerProps = {
  aircraft:
    | "Tecnam P2006T"
    | "Tecnam P2008"
    | "Piper PA-28"
    | "Cessna 152";
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

const FUEL_ROW_LABELS: Record<string, string[]> = {
  required: ["required ramp fuel", "required usable"],
  total: ["total ramp fuel", "loaded usable"],
  loaded: ["loaded usable", "total ramp fuel"],
  extra: ["extra", "extra usable"],
};

function fuelValueFromRow(root: HTMLElement, key: string) {
  let row = root.querySelector(
    `[data-standard-fuel-row="${key}"], [data-row-key="${key}"]`
  );

  if (!row) {
    const labels = FUEL_ROW_LABELS[key] ?? [];
    row =
      Array.from(root.querySelectorAll("tr")).find((candidate) => {
        const firstCell = candidate.querySelector("td");
        return labels.includes(normalize(firstCell?.textContent));
      }) ?? null;
  }

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

  return (
    heading?.textContent?.trim() ||
    ["Departure", "Arrival", "Alternate", "Alternate 2"][index] ||
    `Aerodrome ${index + 1}`
  );
}

function readPerformanceResults(root: HTMLElement) {
  const aerodromes = PERFORMANCE_AERODROMES as Record<string, JsonRecord>;
  const icaoLabels = Array.from(root.querySelectorAll("label")).filter((label) => {
    const caption = normalize(label.querySelector("span")?.textContent);
    return caption === "icao" || caption === "airfield";
  });

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
          tempC: numberFieldValue(card, [
            "Temperature C",
            "Temperature °C",
            "OAT C",
          ]),
          qnhHpa: numberFieldValue(card, ["QNH hPa", "QNH"]),
          windFrom: numberFieldValue(card, ["Wind from", "Wind from °"]),
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
  const registration =
    fieldValue(root, ["Registration"]) ||
    (aircraft === "Cessna 152" ? "CS-AVC" : "");
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
    title: [`Performance ${registration || aircraft}`, cleanPilotName || null]
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

function isPerformanceDownloadButton(text: string) {
  return (
    text === "export pdf" ||
    text.startsWith("export rvp.cfi.066.02") ||
    text.startsWith("download do formulário") ||
    text.startsWith("download do kneeboard") ||
    text.startsWith("download das tabelas")
  );
}

export function PerformanceUsageTracker({
  aircraft,
  children,
}: PerformanceUsageTrackerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pilotName, setPilotName] = useState("");
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);

  useEffect(() => {
    setPilotName(window.localStorage.getItem(PILOT_STORAGE_KEY) ?? "");
  }, []);

  function updatePilotName(value: string) {
    setPilotName(value);
    window.localStorage.setItem(PILOT_STORAGE_KEY, value);
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest("button");
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    const text = normalize(button.textContent);
    if (!isPerformanceDownloadButton(text)) return;

    if (button.dataset.briefingsAccessAllowed === "1") {
      delete button.dataset.briefingsAccessAllowed;

      const root = rootRef.current;
      if (root) {
        // Queue the event before the PDF generator/download takes over. This is
        // important on iOS/iPadOS, where opening or saving the PDF may
        // background the page before a post-download callback can run.
        void logUsageEvent(buildUsageEvent(root, aircraft, pilotName));
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!pilotName.trim()) {
      window.alert("Enter your real name before downloading a Performance PDF.");
      return;
    }

    if (button.dataset.briefingsAccessChecking === "1") return;
    button.dataset.briefingsAccessChecking = "1";

    void checkExportAccess().then(({ allowed }) => {
      delete button.dataset.briefingsAccessChecking;

      if (!allowed) {
        setBlockedDialogOpen(true);
        return;
      }

      button.dataset.briefingsAccessAllowed = "1";
      button.click();
    });
  }

  return (
    <div ref={rootRef} onClickCapture={handleClickCapture} className="space-y-6">
      <PilotDownloadCard
        value={pilotName}
        onChange={updatePilotName}
        documentLabel="Performance"
      />

      {children}

      <ExportBlockedDialog
        open={blockedDialogOpen}
        pilotName={pilotName}
        onPilotNameChange={updatePilotName}
        onClose={() => setBlockedDialogOpen(false)}
      />
    </div>
  );
}
