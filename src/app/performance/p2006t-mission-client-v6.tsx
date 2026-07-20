"use client";

import { useEffect, useRef } from "react";
import { formatOperationalMinutes } from "@/lib/operational-duration";
import { P2006TMissionClientV4 } from "./p2006t-mission-client-v4";

type SourceMap = Record<string, HTMLInputElement | null>;

const LABELS = {
  taxiFuel: ["Taxi fuel L"],
  climb: ["Climb time", "Climb min"],
  enroute: ["Enroute time", "Enroute min"],
  descent: ["Descent time", "Descent min"],
  alternate1: ["Alternate 1 time", "Alternate 1 min"],
  alternate2: ["Alternate 2 time", "Alternate 2 min"],
  reserve: ["Reserve time", "Reserve min"],
} as const;

function normal(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sectionByTitle(root: HTMLElement, title: string) {
  const heading = Array.from(root.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === title
  );
  return heading?.closest("section") as HTMLElement | null;
}

function sourceInput(section: HTMLElement, captions: readonly string[]) {
  const targets = captions.map(normal);
  const label = Array.from(section.querySelectorAll("label")).find((element) =>
    targets.includes(normal(element.querySelector("span")?.textContent))
  );
  return label?.querySelector('input[type="number"]') as HTMLInputElement | null;
}

function sources(section: HTMLElement): SourceMap {
  return Object.fromEntries(
    Object.entries(LABELS).map(([key, captions]) => [
      key,
      sourceInput(section, captions),
    ])
  );
}

function setControlledNumber(input: HTMLInputElement | null, value: number) {
  if (!input) return;
  const rounded = Math.max(0, Math.round(value));
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, String(rounded));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function parseMinutes(value: string) {
  const text = normal(value);
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text)));
  const clock = text.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const duration = text.match(/^(?:(\d+)\s*h)?(?:\s*(\d+)\s*min)?$/);
  if (duration && (duration[1] || duration[2])) {
    return Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0);
  }
  return null;
}

function metric(section: HTMLElement, label: string) {
  const caption = Array.from(section.querySelectorAll("p")).find(
    (element) => normal(element.textContent) === normal(label)
  );
  return caption?.nextElementSibling?.textContent?.trim() || "—";
}

function metricNumber(section: HTMLElement, label: string) {
  const match = metric(section, label).match(/-?\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : 0;
}

function cruiseRate(section: HTMLElement) {
  const caption = Array.from(section.querySelectorAll("p")).find(
    (element) => normal(element.textContent) === "afm planning rates"
  );
  const values = caption?.nextElementSibling?.textContent
    ?.match(/\d+(?:[.,]\d+)?/g)
    ?.map((value) => Number(value.replace(",", ".")));
  return values?.[1] || values?.[0] || 0;
}

function minutes(input: HTMLInputElement | null) {
  return Number(input?.value || 0);
}

function calculations(section: HTMLElement, map: SourceMap) {
  const climb = minutes(map.climb);
  const enroute = minutes(map.enroute);
  const descent = minutes(map.descent);
  const alternate1 = minutes(map.alternate1);
  const alternate2 = minutes(map.alternate2);
  const reserve = minutes(map.reserve);
  const trip = climb + enroute + descent;
  const rate = cruiseRate(section);
  const contingency = rate > 0
    ? Math.round((metricNumber(section, "Contingency") / rate) * 60)
    : 0;
  const required = 10 + trip + contingency + Math.max(alternate1, alternate2) + reserve;
  const extra = rate > 0
    ? Math.round((metricNumber(section, "Extra usable") / rate) * 60)
    : 0;
  return {
    trip,
    contingency,
    required,
    extra,
    loaded: required + extra,
  };
}

function durationInput(source: HTMLInputElement | null) {
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "text";
  input.className =
    "w-full min-w-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium outline-none focus:border-zinc-500";
  input.dataset.sourceKey = source?.dataset.fuelSourceKey ?? "";
  input.value = formatOperationalMinutes(minutes(source));
  const commit = () => {
    const parsed = parseMinutes(input.value);
    if (parsed === null) {
      input.value = formatOperationalMinutes(minutes(source));
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

function taxiFuelInput(source: HTMLInputElement | null) {
  const wrapper = document.createElement("div");
  wrapper.className = "flex items-center justify-center gap-2";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.dataset.taxiFuel = "true";
  input.className =
    "w-20 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium outline-none focus:border-zinc-500";
  input.value = source?.value || "0";
  input.addEventListener("change", () => setControlledNumber(source, Number(input.value || 0)));
  const unit = document.createElement("span");
  unit.className = "text-sm text-zinc-500";
  unit.textContent = "L";
  wrapper.append(input, unit);
  return wrapper;
}

const ROWS = [
  ["taxi", "Start-up and Taxi", "fixed", "Taxi"],
  ["climb", "Climb", "input", "Climb"],
  ["enroute", "Enroute", "input", "Enroute"],
  ["descent", "Descent", "input", "Descent"],
  ["trip", "Trip Fuel", "computed", "Trip"],
  ["contingency", "Contingency 5%", "computed", "Contingency"],
  ["alternate1", "Alternate 1", "input", "Alternate 1"],
  ["alternate2", "Alternate 2", "input", "Alternate 2"],
  ["reserve", "Reserve", "input", "Reserve"],
  ["required", "Required Usable", "computed", "Required usable"],
  ["extra", "Extra Usable", "computed", "Extra usable"],
  ["loaded", "Loaded Usable", "computed", "Loaded usable"],
] as const;

function buildTable(section: HTMLElement, map: SourceMap) {
  const existing = section.querySelector('[data-fuel-table="true"]') as HTMLElement | null;
  if (existing) return existing;
  const original = section.querySelector(":scope > div.mt-5") as HTMLElement | null;
  if (!original) return null;
  original.hidden = true;

  Object.entries(map).forEach(([key, input]) => {
    if (input) input.dataset.fuelSourceKey = key;
  });

  const wrapper = document.createElement("div");
  wrapper.dataset.fuelTable = "true";
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
    </thead><tbody></tbody>`;
  const body = table.querySelector("tbody")!;

  ROWS.forEach(([key, label, kind, metricLabel], index) => {
    const row = document.createElement("tr");
    row.dataset.rowKey = key;
    row.className = key === "loaded"
      ? "bg-emerald-50"
      : key === "trip" || key === "required"
        ? "bg-zinc-50"
        : "bg-white";
    const bottom = index === ROWS.length - 1 ? "" : " border-b";

    const item = document.createElement("td");
    item.className = `border-r border-zinc-200 px-4 py-3${bottom}`;
    item.textContent = label;
    if (["trip", "required", "loaded"].includes(key)) item.classList.add("font-semibold");

    const time = document.createElement("td");
    time.className = `border-r border-zinc-200 px-3 py-2 text-center${bottom}`;
    if (kind === "fixed") {
      time.textContent = "10 min";
      time.classList.add("font-medium");
    } else if (kind === "input") {
      time.appendChild(durationInput(map[key]));
    } else {
      const span = document.createElement("span");
      span.dataset.computedTime = key;
      span.className = "font-medium";
      time.appendChild(span);
    }

    const fuel = document.createElement("td");
    fuel.className = `px-4 py-3 text-center font-semibold${bottom}`;
    if (key === "taxi") fuel.appendChild(taxiFuelInput(map.taxiFuel));
    else fuel.dataset.metric = metricLabel;

    row.append(item, time, fuel);
    body.appendChild(row);
  });

  wrapper.appendChild(table);
  original.insertAdjacentElement("afterend", wrapper);
  return wrapper;
}

function setText(element: HTMLElement, value: string) {
  if (element.textContent !== value) element.textContent = value;
}

function refresh(section: HTMLElement, table: HTMLElement, map: SourceMap) {
  const calculated = calculations(section, map);
  table.querySelectorAll<HTMLInputElement>('input[data-source-key]').forEach((input) => {
    if (document.activeElement === input) return;
    const source = map[input.dataset.sourceKey ?? ""];
    const next = formatOperationalMinutes(minutes(source));
    if (input.value !== next) input.value = next;
  });
  const taxi = table.querySelector<HTMLInputElement>('input[data-taxi-fuel="true"]');
  if (taxi && document.activeElement !== taxi) {
    const next = map.taxiFuel?.value || "0";
    if (taxi.value !== next) taxi.value = next;
  }
  table.querySelectorAll<HTMLElement>("[data-computed-time]").forEach((element) => {
    const key = element.dataset.computedTime as keyof typeof calculated;
    setText(element, formatOperationalMinutes(calculated[key] || 0));
  });
  table.querySelectorAll<HTMLElement>("td[data-metric]").forEach((cell) => {
    setText(cell, metric(section, cell.dataset.metric ?? ""));
  });
}

export function P2006TMissionClientV6() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sync = () => {
      const section = sectionByTitle(root, "Fuel planning");
      if (!section) return;
      const map = sources(section);
      const table = buildTable(section, map);
      if (table) refresh(section, table, map);
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
  }, []);

  return (
    <div ref={rootRef} className="space-y-4">
      <P2006TMissionClientV4 />
    </div>
  );
}
