"use client";

import { useEffect, useRef } from "react";
import { formatOperationalMinutes } from "@/lib/operational-duration";
import { P2006TMissionClientV4 } from "./p2006t-mission-client-v4";

type FuelRow = {
  key: string;
  label: string;
  timeKind: "fixed" | "input" | "computed";
  timeInputLabels?: string[];
  metricLabel?: string;
  tone?: "normal" | "summary" | "total";
};

const ROWS: FuelRow[] = [
  { key: "taxi", label: "Start-up and Taxi", timeKind: "fixed", metricLabel: "Taxi" },
  {
    key: "climb",
    label: "Climb",
    timeKind: "input",
    timeInputLabels: ["Climb time", "Climb min"],
    metricLabel: "Climb",
  },
  {
    key: "enroute",
    label: "Enroute",
    timeKind: "input",
    timeInputLabels: ["Enroute time", "Enroute min"],
    metricLabel: "Enroute",
  },
  {
    key: "descent",
    label: "Descent",
    timeKind: "input",
    timeInputLabels: ["Descent time", "Descent min"],
    metricLabel: "Descent",
  },
  { key: "trip", label: "Trip Fuel", timeKind: "computed", metricLabel: "Trip", tone: "summary" },
  {
    key: "contingency",
    label: "Contingency 5%",
    timeKind: "computed",
    metricLabel: "Contingency",
  },
  {
    key: "alternate1",
    label: "Alternate 1",
    timeKind: "input",
    timeInputLabels: ["Alternate 1 time", "Alternate 1 min"],
    metricLabel: "Alternate 1",
  },
  {
    key: "alternate2",
    label: "Alternate 2",
    timeKind: "input",
    timeInputLabels: ["Alternate 2 time", "Alternate 2 min"],
    metricLabel: "Alternate 2",
  },
  {
    key: "reserve",
    label: "Reserve",
    timeKind: "input",
    timeInputLabels: ["Reserve time", "Reserve min"],
    metricLabel: "Reserve",
  },
  {
    key: "required",
    label: "Required Usable",
    timeKind: "computed",
    metricLabel: "Required usable",
    tone: "summary",
  },
  {
    key: "extra",
    label: "Extra Usable",
    timeKind: "computed",
    metricLabel: "Extra usable",
  },
  {
    key: "loaded",
    label: "Loaded Usable",
    timeKind: "computed",
    metricLabel: "Loaded usable",
    tone: "total",
  },
];

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseMinutes(value: string) {
  const text = normalize(value);
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text)));
  const clock = text.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const parts = text.match(/^(?:(\d+)\s*h)?(?:\s*(\d+)\s*min)?$/);
  if (parts && (parts[1] || parts[2])) {
    return Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0);
  }
  return null;
}

function setControlledNumberInput(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, String(Math.max(0, Math.round(value))));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function sectionByTitle(root: HTMLElement, title: string) {
  const heading = Array.from(root.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === title
  );
  return heading?.closest("section") as HTMLElement | null;
}

function labelInput(section: HTMLElement, labels: string[]) {
  const normalizedLabels = labels.map(normalize);
  const label = Array.from(section.querySelectorAll("label")).find((element) => {
    const caption = element.querySelector("span")?.textContent;
    return normalizedLabels.includes(normalize(caption));
  });
  return label?.querySelector('input[type="number"]') as HTMLInputElement | null;
}

function metricValue(section: HTMLElement, label: string) {
  const caption = Array.from(section.querySelectorAll("p")).find(
    (element) => normalize(element.textContent) === normalize(label)
  );
  const value = caption?.nextElementSibling?.textContent?.trim();
  return value || "—";
}

function litersFromMetric(value: string) {
  const match = value.match(/-?\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : 0;
}

function planningRates(section: HTMLElement) {
  const caption = Array.from(section.querySelectorAll("p")).find(
    (element) => normalize(element.textContent) === "afm planning rates"
  );
  const text = caption?.nextElementSibling?.textContent ?? "";
  const values = text.match(/\d+(?:[.,]\d+)?/g)?.map((value) => Number(value.replace(",", "."))) ?? [];
  return { climb: values[0] || 0, cruise: values[1] || values[0] || 0 };
}

function sourceMinutes(section: HTMLElement, labels: string[]) {
  return Number(labelInput(section, labels)?.value || 0);
}

function computedMinutes(section: HTMLElement, key: string) {
  const climb = sourceMinutes(section, ["Climb time", "Climb min"]);
  const enroute = sourceMinutes(section, ["Enroute time", "Enroute min"]);
  const descent = sourceMinutes(section, ["Descent time", "Descent min"]);
  const alternate1 = sourceMinutes(section, ["Alternate 1 time", "Alternate 1 min"]);
  const alternate2 = sourceMinutes(section, ["Alternate 2 time", "Alternate 2 min"]);
  const reserve = sourceMinutes(section, ["Reserve time", "Reserve min"]);
  const trip = climb + enroute + descent;
  const rates = planningRates(section);
  const contingency = rates.cruise > 0
    ? Math.round((litersFromMetric(metricValue(section, "Contingency")) / rates.cruise) * 60)
    : 0;
  const required = 10 + trip + contingency + Math.max(alternate1, alternate2) + reserve;
  const extra = rates.cruise > 0
    ? Math.round((litersFromMetric(metricValue(section, "Extra usable")) / rates.cruise) * 60)
    : 0;

  if (key === "trip") return trip;
  if (key === "contingency") return contingency;
  if (key === "required") return required;
  if (key === "extra") return extra;
  if (key === "loaded") return required + extra;
  return 0;
}

function makeDurationInput(section: HTMLElement, labels: string[]) {
  const source = labelInput(section, labels);
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "text";
  input.className =
    "w-full min-w-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium outline-none focus:border-zinc-500";
  input.value = formatOperationalMinutes(Number(source?.value || 0));

  const commit = () => {
    if (!source) return;
    const minutes = parseMinutes(input.value);
    if (minutes === null) {
      input.value = formatOperationalMinutes(Number(source.value || 0));
      return;
    }
    setControlledNumberInput(source, minutes);
    input.value = formatOperationalMinutes(minutes);
  };
  input.addEventListener("blur", commit);
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      input.blur();
    }
  });
  input.dataset.sourceLabels = labels.join("|");
  return input;
}

function makeTaxiFuelInput(section: HTMLElement) {
  const source = labelInput(section, ["Taxi fuel L"]);
  const wrapper = document.createElement("div");
  wrapper.className = "flex items-center justify-center gap-2";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.className =
    "w-20 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium outline-none focus:border-zinc-500";
  input.value = source?.value || "0";
  input.addEventListener("change", () => {
    if (source) setControlledNumberInput(source, Number(input.value || 0));
  });
  input.dataset.taxiFuel = "true";
  const unit = document.createElement("span");
  unit.className = "text-sm text-zinc-500";
  unit.textContent = "L";
  wrapper.append(input, unit);
  return wrapper;
}

function buildFuelTable(section: HTMLElement) {
  const existing = section.querySelector('[data-fuel-planning-table="true"]');
  if (existing) return existing as HTMLElement;

  const content = section.querySelector(":scope > div.mt-5") as HTMLElement | null;
  if (!content) return null;
  content.hidden = true;

  const wrapper = document.createElement("div");
  wrapper.dataset.fuelPlanningTable = "true";
  wrapper.className = "mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white";
  const table = document.createElement("table");
  table.className = "w-full border-collapse text-sm";
  table.innerHTML = `
    <thead class="bg-zinc-100 text-zinc-700">
      <tr>
        <th class="border-b border-r border-zinc-200 px-4 py-3 text-left font-semibold">Fuel planning</th>
        <th class="w-48 border-b border-r border-zinc-200 px-4 py-3 text-center font-semibold">Time</th>
        <th class="w-40 border-b border-zinc-200 px-4 py-3 text-center font-semibold">Fuel</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const body = table.querySelector("tbody")!;

  ROWS.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.dataset.fuelRow = row.key;
    tr.className = row.tone === "total"
      ? "bg-emerald-50"
      : row.tone === "summary"
        ? "bg-zinc-50"
        : "bg-white";

    const labelCell = document.createElement("td");
    labelCell.className = `border-r border-zinc-200 px-4 py-3 ${index < ROWS.length - 1 ? "border-b" : ""}`;
    labelCell.textContent = row.label;
    if (row.tone) labelCell.classList.add("font-semibold");

    const timeCell = document.createElement("td");
    timeCell.className = `border-r border-zinc-200 px-3 py-2 text-center ${index < ROWS.length - 1 ? "border-b" : ""}`;
    if (row.timeKind === "fixed") {
      timeCell.textContent = "10 min";
      timeCell.classList.add("font-medium");
    } else if (row.timeKind === "input" && row.timeInputLabels) {
      timeCell.appendChild(makeDurationInput(section, row.timeInputLabels));
    } else {
      const value = document.createElement("span");
      value.dataset.computedTime = row.key;
      value.className = "font-medium";
      timeCell.appendChild(value);
    }

    const fuelCell = document.createElement("td");
    fuelCell.className = `px-4 py-3 text-center font-semibold ${index < ROWS.length - 1 ? "border-b" : ""}`;
    if (row.key === "taxi") {
      fuelCell.appendChild(makeTaxiFuelInput(section));
    } else {
      fuelCell.dataset.metricLabel = row.metricLabel ?? "";
    }

    tr.append(labelCell, timeCell, fuelCell);
    body.appendChild(tr);
  });

  wrapper.appendChild(table);
  content.insertAdjacentElement("afterend", wrapper);
  return wrapper;
}

function refreshFuelTable(section: HTMLElement, table: HTMLElement) {
  table.querySelectorAll<HTMLInputElement>('input[data-source-labels]').forEach((input) => {
    if (document.activeElement === input) return;
    const labels = input.dataset.sourceLabels?.split("|") ?? [];
    const source = labelInput(section, labels);
    input.value = formatOperationalMinutes(Number(source?.value || 0));
  });

  const taxi = table.querySelector<HTMLInputElement>('input[data-taxi-fuel="true"]');
  if (taxi && document.activeElement !== taxi) {
    taxi.value = labelInput(section, ["Taxi fuel L"])?.value || "0";
  }

  table.querySelectorAll<HTMLElement>("[data-computed-time]").forEach((element) => {
    element.textContent = formatOperationalMinutes(
      computedMinutes(section, element.dataset.computedTime ?? "")
    );
  });

  table.querySelectorAll<HTMLElement>("td[data-metric-label]").forEach((cell) => {
    cell.textContent = metricValue(section, cell.dataset.metricLabel ?? "");
  });
}

export function P2006TMissionClientV5() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const apply = () => {
      const section = sectionByTitle(root, "Fuel planning");
      if (!section) return;
      const table = buildFuelTable(section);
      if (table) refreshFuelTable(section, table);
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["value"],
    });
    root.addEventListener("input", apply);
    root.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      root.removeEventListener("input", apply);
      root.removeEventListener("change", apply);
    };
  }, []);

  return (
    <div ref={rootRef} className="space-y-4">
      <P2006TMissionClientV4 />
    </div>
  );
}
