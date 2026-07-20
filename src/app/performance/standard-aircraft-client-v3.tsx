"use client";

import { useEffect, useRef } from "react";
import { formatOperationalMinutes } from "@/lib/operational-duration";
import type { PerformanceAircraft } from "@/lib/performance/mb";
import { StandardAircraftClientV2 } from "./standard-aircraft-client-v2";

const TIME_LABELS = {
  taxi: ["Taxi min"],
  climb: ["Climb min"],
  enroute: ["Enroute min"],
  descent: ["Descent min"],
  alternate: ["Alternate min"],
  reserve: ["Reserve min"],
} as const;

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sectionByTitle(root: HTMLElement, title: string) {
  const heading = Array.from(root.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === title
  );
  return heading?.closest("section") as HTMLElement | null;
}

function numberInputByLabel(root: HTMLElement, labels: readonly string[]) {
  const targets = labels.map(normalize);
  const label = Array.from(root.querySelectorAll("label")).find((element) =>
    targets.includes(normalize(element.querySelector("span")?.textContent))
  );
  return label?.querySelector('input[type="number"]') as HTMLInputElement | null;
}

function numberValue(input: HTMLInputElement | null) {
  return Math.max(0, Number(input?.value || 0));
}

function setControlledNumber(input: HTMLInputElement | null, value: number) {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, String(Math.max(0, Math.round(value))));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function parseMinutes(value: string) {
  const text = normalize(value);
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text)));
  const clock = text.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const duration = text.match(/^(?:(\d+)\s*h)?(?:\s*(\d+)\s*min)?$/);
  if (duration && (duration[1] || duration[2])) {
    return Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0);
  }
  return null;
}

function makeDurationInput(key: string, source: HTMLInputElement | null) {
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "text";
  input.dataset.standardTimeSource = key;
  input.className =
    "w-full min-w-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium outline-none focus:border-zinc-500";
  input.value = formatOperationalMinutes(numberValue(source));

  const commit = () => {
    const parsed = parseMinutes(input.value);
    if (parsed === null) {
      input.value = formatOperationalMinutes(numberValue(source));
      return;
    }
    setControlledNumber(source, parsed);
    input.value = formatOperationalMinutes(parsed);
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
  return input;
}

function roundFuel(value: number) {
  return Math.max(0, Math.round(value || 0));
}

function calculations(root: HTMLElement, section: HTMLElement) {
  const rate = numberValue(numberInputByLabel(section, ["Consumption L/h"]));
  const loaded = numberValue(numberInputByLabel(root, ["Fuel L"]));
  const times = Object.fromEntries(
    Object.entries(TIME_LABELS).map(([key, labels]) => [
      key,
      numberValue(numberInputByLabel(section, labels)),
    ])
  ) as Record<keyof typeof TIME_LABELS, number>;

  const trip = times.climb + times.enroute + times.descent;
  const contingency = Math.round(trip * 0.05);
  const required = times.taxi + trip + contingency + times.alternate + times.reserve;
  const fuelFor = (minutes: number) => roundFuel((rate * minutes) / 60);
  const requiredFuel = fuelFor(required);
  const extraFuel = Math.max(0, roundFuel(loaded - requiredFuel));
  const extra = rate > 0 ? Math.round((extraFuel / rate) * 60) : 0;

  return {
    rate,
    loaded,
    times: {
      ...times,
      trip,
      contingency,
      required,
      extra,
      total: required + extra,
    },
    fuel: {
      taxi: fuelFor(times.taxi),
      climb: fuelFor(times.climb),
      enroute: fuelFor(times.enroute),
      descent: fuelFor(times.descent),
      trip: fuelFor(trip),
      contingency: fuelFor(contingency),
      alternate: fuelFor(times.alternate),
      reserve: fuelFor(times.reserve),
      required: requiredFuel,
      extra: extraFuel,
      total: roundFuel(loaded),
    },
  };
}

const ROWS = [
  ["taxi", "Start-up and Taxi", "input"],
  ["climb", "Climb", "input"],
  ["enroute", "Enroute", "input"],
  ["descent", "Descent", "input"],
  ["trip", "Trip Fuel", "computed"],
  ["contingency", "Contingency 5%", "computed"],
  ["alternate", "Alternate", "input"],
  ["reserve", "Reserve", "input"],
  ["required", "Required Ramp Fuel", "computed"],
  ["extra", "Extra", "computed"],
  ["total", "Total Ramp Fuel", "computed"],
] as const;

function buildTable(root: HTMLElement, section: HTMLElement) {
  const existing = section.querySelector('[data-standard-fuel-table="true"]') as HTMLElement | null;
  if (existing) return existing;

  const inputsGrid = section.querySelector(":scope > div.mt-4") as HTMLElement | null;
  const metricsGrid = section.querySelector(":scope > div.mt-5") as HTMLElement | null;
  if (!inputsGrid || !metricsGrid) return null;
  inputsGrid.hidden = true;
  metricsGrid.hidden = true;

  const wrapper = document.createElement("div");
  wrapper.dataset.standardFuelTable = "true";
  wrapper.className = "mt-4 space-y-3";

  const rateBar = document.createElement("div");
  rateBar.className =
    "flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between";
  rateBar.innerHTML = `
    <div>
      <p class="text-sm font-semibold text-zinc-950">Planning consumption</p>
      <p class="mt-0.5 text-xs text-zinc-500">Used for every phase in this aircraft form.</p>
    </div>`;
  const rateWrap = document.createElement("label");
  rateWrap.className = "flex items-center gap-2";
  const rateInput = document.createElement("input");
  rateInput.type = "number";
  rateInput.min = "0";
  rateInput.step = "0.5";
  rateInput.dataset.standardRate = "true";
  rateInput.className =
    "w-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium outline-none focus:border-zinc-500";
  const rateSource = numberInputByLabel(section, ["Consumption L/h"]);
  rateInput.value = String(numberValue(rateSource));
  rateInput.addEventListener("change", () => {
    if (!rateSource) return;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(rateSource, String(Math.max(0, Number(rateInput.value || 0))));
    rateSource.dispatchEvent(new Event("input", { bubbles: true }));
    rateSource.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const unit = document.createElement("span");
  unit.className = "text-sm font-medium text-zinc-600";
  unit.textContent = "L/h";
  rateWrap.append(rateInput, unit);
  rateBar.appendChild(rateWrap);
  wrapper.appendChild(rateBar);

  const tableWrap = document.createElement("div");
  tableWrap.className = "overflow-hidden rounded-2xl border border-zinc-200 bg-white";
  const table = document.createElement("table");
  table.className = "w-full border-collapse text-sm";
  table.innerHTML = `
    <thead class="bg-zinc-100 text-zinc-700">
      <tr>
        <th class="border-b border-r border-zinc-200 px-4 py-3 text-left font-semibold">Fuel planning</th>
        <th class="w-48 border-b border-r border-zinc-200 px-4 py-3 text-center font-semibold">Time</th>
        <th class="w-40 border-b border-zinc-200 px-4 py-3 text-center font-semibold">Fuel</th>
      </tr>
    </thead><tbody></tbody>`;
  const body = table.querySelector("tbody")!;

  ROWS.forEach(([key, label, kind], index) => {
    const row = document.createElement("tr");
    row.dataset.standardFuelRow = key;
    row.className = key === "total"
      ? "bg-emerald-50"
      : key === "trip" || key === "required"
        ? "bg-zinc-50"
        : "bg-white";
    const border = index === ROWS.length - 1 ? "" : " border-b";

    const item = document.createElement("td");
    item.className = `border-r border-zinc-200 px-4 py-3${border}`;
    item.textContent = label;
    if (["trip", "required", "total"].includes(key)) item.classList.add("font-semibold");

    const time = document.createElement("td");
    time.className = `border-r border-zinc-200 px-3 py-2 text-center${border}`;
    if (kind === "input") {
      time.appendChild(
        makeDurationInput(
          key,
          numberInputByLabel(section, TIME_LABELS[key as keyof typeof TIME_LABELS])
        )
      );
    } else {
      const span = document.createElement("span");
      span.dataset.standardCalculatedTime = key;
      span.className = "font-medium";
      time.appendChild(span);
    }

    const fuel = document.createElement("td");
    fuel.className = `px-4 py-3 text-center font-semibold${border}`;
    fuel.dataset.standardCalculatedFuel = key;

    row.append(item, time, fuel);
    body.appendChild(row);
  });

  tableWrap.appendChild(table);
  const note = document.createElement("div");
  note.className = "border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500";
  note.textContent = "Times accept minutes, HH:MM or values such as 1 h 40 min. Fuel is shown as an operational whole-litre approximation.";
  tableWrap.appendChild(note);
  wrapper.appendChild(tableWrap);
  metricsGrid.insertAdjacentElement("afterend", wrapper);
  return wrapper;
}

function setText(element: HTMLElement, value: string) {
  if (element.textContent !== value) element.textContent = value;
}

function refresh(root: HTMLElement, section: HTMLElement, wrapper: HTMLElement) {
  const values = calculations(root, section);

  const rateInput = wrapper.querySelector<HTMLInputElement>('input[data-standard-rate="true"]');
  if (rateInput && document.activeElement !== rateInput) {
    const next = String(values.rate);
    if (rateInput.value !== next) rateInput.value = next;
  }

  wrapper.querySelectorAll<HTMLInputElement>('input[data-standard-time-source]').forEach((input) => {
    if (document.activeElement === input) return;
    const key = input.dataset.standardTimeSource as keyof typeof TIME_LABELS;
    const source = numberInputByLabel(section, TIME_LABELS[key]);
    const next = formatOperationalMinutes(numberValue(source));
    if (input.value !== next) input.value = next;
  });

  wrapper.querySelectorAll<HTMLElement>("[data-standard-calculated-time]").forEach((element) => {
    const key = element.dataset.standardCalculatedTime as keyof typeof values.times;
    setText(element, formatOperationalMinutes(values.times[key] || 0));
  });

  wrapper.querySelectorAll<HTMLElement>("[data-standard-calculated-fuel]").forEach((element) => {
    const key = element.dataset.standardCalculatedFuel as keyof typeof values.fuel;
    setText(element, `${values.fuel[key] || 0} L`);
  });
}

export function StandardAircraftClientV3({
  aircraft,
}: {
  aircraft: PerformanceAircraft;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      const section = sectionByTitle(root, "Fuel planning");
      if (!section) return;
      const table = buildTable(root, section);
      if (table) refresh(root, section, table);
    };

    sync();
    const interval = window.setInterval(sync, 350);
    root.addEventListener("input", sync);
    root.addEventListener("change", sync);
    return () => {
      window.clearInterval(interval);
      root.removeEventListener("input", sync);
      root.removeEventListener("change", sync);
    };
  }, [aircraft]);

  return (
    <div ref={rootRef}>
      <StandardAircraftClientV2 aircraft={aircraft} />
    </div>
  );
}
