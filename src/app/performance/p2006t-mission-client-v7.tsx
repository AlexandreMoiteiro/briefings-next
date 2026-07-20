"use client";

import { useEffect, useRef } from "react";
import { formatOperationalMinutes } from "@/lib/operational-duration";
import { P2006TMissionClientV4 } from "./p2006t-mission-client-v4";

type SourceMap = Record<string, HTMLInputElement | null>;

const SOURCE_LABELS = {
  taxi: ["Taxi fuel L"],
  climb: ["Climb time", "Climb min"],
  enroute: ["Enroute time", "Enroute min"],
  descent: ["Descent time", "Descent min"],
  alternate1: ["Alternate 1 time", "Alternate 1 min"],
  alternate2: ["Alternate 2 time", "Alternate 2 min"],
  reserve: ["Reserve time", "Reserve min"],
} as const;

const ROWS = [
  ["taxi", "Start-up and Taxi", "Taxi", "input"],
  ["climb", "Climb", "Climb", "input"],
  ["enroute", "Enroute", "Enroute", "input"],
  ["descent", "Descent", "Descent", "input"],
  ["trip", "Trip Fuel", "Trip", "computed"],
  ["contingency", "Contingency 5%", "Contingency", "computed"],
  ["alternate1", "Alternate 1", "Alternate 1", "input"],
  ["alternate2", "Alternate 2", "Alternate 2", "input"],
  ["reserve", "Reserve", "Reserve", "input"],
  ["required", "Required Usable", "Required usable", "computed"],
  ["extra", "Extra Usable", "Extra usable", "computed"],
  ["loaded", "Loaded Usable", "Loaded usable", "computed"],
] as const;

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sectionByTitle(root: HTMLElement, title: string) {
  const heading = Array.from(root.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === title
  );
  return heading?.closest("section") as HTMLElement | null;
}

function findNumberInput(section: HTMLElement, captions: readonly string[]) {
  const targets = captions.map(normalize);
  const label = Array.from(section.querySelectorAll("label")).find((element) =>
    targets.includes(normalize(element.querySelector("span")?.textContent))
  );
  return label?.querySelector('input[type="number"]') as HTMLInputElement | null;
}

function sourceMap(section: HTMLElement): SourceMap {
  return Object.fromEntries(
    Object.entries(SOURCE_LABELS).map(([key, captions]) => [
      key,
      findNumberInput(section, captions),
    ])
  );
}

function setControlledNumber(input: HTMLInputElement | null, value: number) {
  if (!input) return;
  const next = Math.max(0, Math.round(value));
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, String(next));
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

function numberValue(input: HTMLInputElement | null) {
  return Math.max(0, Number(input?.value || 0));
}

function metricText(section: HTMLElement, label: string) {
  const caption = Array.from(section.querySelectorAll("p")).find(
    (element) => normalize(element.textContent) === normalize(label)
  );
  return caption?.nextElementSibling?.textContent?.trim() || "—";
}

function metricNumber(section: HTMLElement, label: string) {
  const match = metricText(section, label).match(/-?\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : 0;
}

function cruiseRate(section: HTMLElement) {
  const text = metricText(section, "AFM planning rates");
  const values = text.match(/\d+(?:[.,]\d+)?/g)?.map((item) =>
    Number(item.replace(",", "."))
  );
  return values?.[1] || values?.[0] || 0;
}

function calculatedTimes(section: HTMLElement, sources: SourceMap) {
  const taxi = numberValue(sources.taxi);
  const climb = numberValue(sources.climb);
  const enroute = numberValue(sources.enroute);
  const descent = numberValue(sources.descent);
  const alternate1 = numberValue(sources.alternate1);
  const alternate2 = numberValue(sources.alternate2);
  const reserve = numberValue(sources.reserve);
  const trip = climb + enroute + descent;
  const rate = cruiseRate(section);
  const contingency = rate > 0
    ? Math.round((metricNumber(section, "Contingency") / rate) * 60)
    : 0;
  const required = taxi + trip + contingency + Math.max(alternate1, alternate2) + reserve;
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

function makeTimeInput(key: string, source: HTMLInputElement | null) {
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "text";
  input.dataset.timeSource = key;
  input.className =
    "w-full min-w-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium outline-none focus:border-zinc-500";
  input.value = formatOperationalMinutes(numberValue(source));

  const commit = () => {
    const minutes = parseMinutes(input.value);
    if (minutes === null) {
      input.value = formatOperationalMinutes(numberValue(source));
      return;
    }
    setControlledNumber(source, minutes);
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
  return input;
}

function buildFuelTable(section: HTMLElement, sources: SourceMap) {
  const existing = section.querySelector('[data-p2006-fuel-table="true"]') as HTMLElement | null;
  if (existing) return existing;

  const original = section.querySelector(":scope > div.mt-5") as HTMLElement | null;
  if (!original) return null;
  original.hidden = true;

  const wrapper = document.createElement("div");
  wrapper.dataset.p2006FuelTable = "true";
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
  ROWS.forEach(([key, label, metricLabel, kind], index) => {
    const row = document.createElement("tr");
    row.dataset.rowKey = key;
    row.className = key === "loaded"
      ? "bg-emerald-50"
      : key === "trip" || key === "required"
        ? "bg-zinc-50"
        : "bg-white";
    const border = index === ROWS.length - 1 ? "" : " border-b";

    const item = document.createElement("td");
    item.className = `border-r border-zinc-200 px-4 py-3${border}`;
    item.textContent = label;
    if (["trip", "required", "loaded"].includes(key)) item.classList.add("font-semibold");

    const time = document.createElement("td");
    time.className = `border-r border-zinc-200 px-3 py-2 text-center${border}`;
    if (kind === "input") {
      time.appendChild(makeTimeInput(key, sources[key]));
    } else {
      const span = document.createElement("span");
      span.dataset.calculatedTime = key;
      span.className = "font-medium";
      time.appendChild(span);
    }

    const fuel = document.createElement("td");
    fuel.className = `px-4 py-3 text-center font-semibold${border}`;
    fuel.dataset.metricLabel = metricLabel;

    row.append(item, time, fuel);
    body.appendChild(row);
  });

  wrapper.appendChild(table);
  const note = document.createElement("div");
  note.className = "border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500";
  note.textContent = "Times accept minutes, HH:MM or values such as 1 h 40 min. Fuel remains a whole-litre operational approximation.";
  wrapper.appendChild(note);
  original.insertAdjacentElement("afterend", wrapper);
  return wrapper;
}

function setText(element: HTMLElement, value: string) {
  if (element.textContent !== value) element.textContent = value;
}

function refreshFuelTable(section: HTMLElement, table: HTMLElement, sources: SourceMap) {
  const calculated = calculatedTimes(section, sources);

  table.querySelectorAll<HTMLInputElement>("input[data-time-source]").forEach((input) => {
    if (document.activeElement === input) return;
    const source = sources[input.dataset.timeSource ?? ""];
    const next = formatOperationalMinutes(numberValue(source));
    if (input.value !== next) input.value = next;
  });

  table.querySelectorAll<HTMLElement>("[data-calculated-time]").forEach((element) => {
    const key = element.dataset.calculatedTime as keyof typeof calculated;
    setText(element, formatOperationalMinutes(calculated[key] || 0));
  });

  table.querySelectorAll<HTMLElement>("td[data-metric-label]").forEach((cell) => {
    setText(cell, metricText(section, cell.dataset.metricLabel ?? ""));
  });
}

function enhancePdfContents(root: HTMLElement) {
  const section = sectionByTitle(root, "PDF contents");
  if (!section) return;

  const subtitle = section.querySelector("h2")?.parentElement?.querySelector("p");
  if (subtitle) {
    subtitle.textContent =
      "The official two-page form is always included. Select each extra section independently.";
  }

  const content = section.querySelector(":scope > div.mt-5") as HTMLElement | null;
  if (!content) return;

  let fixed = content.querySelector('[data-official-form="true"]') as HTMLElement | null;
  if (!fixed) {
    fixed = document.createElement("div");
    fixed.dataset.officialForm = "true";
    fixed.className =
      "mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4";
    fixed.innerHTML = `
      <span class="mt-0.5 flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-xs font-bold text-white">✓</span>
      <span>
        <span class="block text-sm font-semibold text-zinc-950">Official M&B and Performance form</span>
        <span class="mt-0.5 block text-xs leading-5 text-zinc-600">Always included as the first spread.</span>
      </span>`;
    content.prepend(fixed);
  }

  const presetButtons = Array.from(content.querySelectorAll("button"));
  const buttonLabels = ["Official form only", "Form + kneeboard", "Select all extras"];
  presetButtons.slice(0, 3).forEach((button, index) => {
    button.textContent = buttonLabels[index] ?? button.textContent;
    button.className =
      "rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-800 hover:border-zinc-500";
  });

  const optionCards = Array.from(content.querySelectorAll('label:has(input[type="checkbox"])')) as HTMLLabelElement[];
  optionCards.forEach((card) => {
    card.dataset.pdfOptionCard = "true";
    card.classList.add("transition");
  });

  let summary = content.querySelector('[data-pdf-selection-summary="true"]') as HTMLElement | null;
  if (!summary) {
    summary = document.createElement("div");
    summary.dataset.pdfSelectionSummary = "true";
    summary.className = "mt-4 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700";
    content.appendChild(summary);
  }

  const checked = optionCards.filter((card) =>
    (card.querySelector('input[type="checkbox"]') as HTMLInputElement | null)?.checked
  );
  optionCards.forEach((card) => {
    const input = card.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    card.classList.toggle("border-zinc-950", Boolean(input?.checked));
    card.classList.toggle("bg-zinc-50", Boolean(input?.checked));
    card.classList.toggle("border-zinc-200", !input?.checked);
  });
  summary.textContent = checked.length
    ? `${checked.length} optional section${checked.length === 1 ? "" : "s"} selected.`
    : "No optional sections selected: the PDF will contain only the official form.";
}

export function P2006TMissionClientV7() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => {
      const fuelSection = sectionByTitle(root, "Fuel planning");
      if (fuelSection) {
        const sources = sourceMap(fuelSection);
        const table = buildFuelTable(fuelSection, sources);
        if (table) refreshFuelTable(fuelSection, table, sources);
      }
      enhancePdfContents(root);
    };

    sync();
    const interval = window.setInterval(sync, 350);
    root.addEventListener("input", sync);
    root.addEventListener("change", sync);
    root.addEventListener("click", sync);
    return () => {
      window.clearInterval(interval);
      root.removeEventListener("input", sync);
      root.removeEventListener("change", sync);
      root.removeEventListener("click", sync);
    };
  }, []);

  return (
    <div ref={rootRef} className="space-y-4">
      <P2006TMissionClientV4 />
    </div>
  );
}
