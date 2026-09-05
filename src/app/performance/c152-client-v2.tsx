"use client";

import { useEffect, useRef, useState } from "react";
import { C152Client } from "./c152-client";
import {
  C152_NAVLOG_PRESET,
  C152_NAVLOG_SYNC_STORAGE_KEY,
  C152_PERFORMANCE_PRESET,
  type C152NavlogSyncPlan,
} from "@/lib/c152-operational-presets";

const L_PER_US_GAL = 3.785411784;

function findNumberInput(root: HTMLElement, labelText: string) {
  const label = Array.from(root.querySelectorAll("label")).find((candidate) =>
    Array.from(candidate.querySelectorAll("span")).some(
      (span) => span.textContent?.trim() === labelText
    )
  );
  return label?.querySelector('input[type="number"]') as HTMLInputElement | null;
}

function setControlledNumber(input: HTMLInputElement | null, value: number) {
  if (!input || !Number.isFinite(value)) return false;
  const next = String(Math.max(0, Math.round(value * 10) / 10));
  if (input.value === next) return true;

  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function setIfZero(root: HTMLElement, label: string, value: number) {
  const input = findNumberInput(root, label);
  if (!input) return false;
  if (Math.abs(Number(input.value || 0)) < 0.0001) setControlledNumber(input, value);
  return true;
}

function sectionByTitle(root: HTMLElement, title: string) {
  const heading = Array.from(root.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === title
  );
  return heading?.closest("section") as HTMLElement | null;
}

function setAerodrome(root: HTMLElement, role: string, icao: string) {
  if (!icao) return true;
  const section = sectionByTitle(root, "2. Aerodromes & weather");
  if (!section) return false;

  const card = Array.from(section.querySelectorAll("div.rounded-2xl")).find((candidate) =>
    Array.from(candidate.querySelectorAll("p")).some(
      (paragraph) => paragraph.textContent?.trim() === role
    )
  );
  const select = card?.querySelector("select") as HTMLSelectElement | null;
  if (!select) return false;
  if (!Array.from(select.options).some((option) => option.value === icao)) return true;
  if (select.value === icao) return true;

  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;
  setter?.call(select, icao);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function parseSyncPlan(raw: string | null): C152NavlogSyncPlan | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<C152NavlogSyncPlan>;
    if (
      value.version !== 1 ||
      value.registration !== "CS-AVC" ||
      !value.setup ||
      !value.route ||
      !value.fuelPlanning
    ) {
      return null;
    }
    return value as C152NavlogSyncPlan;
  } catch {
    return null;
  }
}

function formatSavedAt(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function C152ClientV2() {
  const rootRef = useRef<HTMLDivElement>(null);
  const defaultsApplied = useRef(false);
  const autoSyncApplied = useRef(false);
  const [latestPlan, setLatestPlan] = useState<C152NavlogSyncPlan | null>(null);
  const [syncStatus, setSyncStatus] = useState("");

  function readLatestPlan() {
    const plan = parseSyncPlan(window.localStorage.getItem(C152_NAVLOG_SYNC_STORAGE_KEY));
    setLatestPlan(plan);
    return plan;
  }

  function applyDefaults(root: HTMLElement) {
    if (defaultsApplied.current) return true;

    const required = [
      setIfZero(root, "Pilot (kg)", C152_PERFORMANCE_PRESET.pilotKg),
      setIfZero(root, "Passenger (kg)", C152_PERFORMANCE_PRESET.passengerKg),
      setIfZero(root, "Baggage Area 1 (kg)", C152_PERFORMANCE_PRESET.baggageArea1Kg),
      setIfZero(root, "Climb time min", C152_PERFORMANCE_PRESET.climbTo3000Min),
      setIfZero(root, "Climb fuel US gal", C152_PERFORMANCE_PRESET.climbTo3000FuelGal),
    ];

    const reserve = findNumberInput(root, "Reserve 45 min fuel US gal");
    if (reserve && Math.abs(Number(reserve.value || 0) - 3.8) < 0.01) {
      setControlledNumber(reserve, C152_PERFORMANCE_PRESET.reserve45MinFuelGal);
    }

    if (required.every(Boolean) && reserve) {
      defaultsApplied.current = true;
      return true;
    }
    return false;
  }

  function applyPlan(plan: C152NavlogSyncPlan, automatic = false) {
    const root = rootRef.current;
    if (!root) return false;

    const fuel = plan.fuelPlanning;
    const fields: Array<[string, number]> = [
      ["Usable fuel (L)", plan.setup.startEfobL],
      ["Start / taxi / run-up (L)", fuel.startupTaxiFuelL],
      ["Start / taxi time min", fuel.startupTaxiMin],
      ["Climb time min", fuel.climbMin],
      ["Climb fuel US gal", fuel.climbFuelL / L_PER_US_GAL],
      ["Enroute time min", fuel.enrouteMin],
      ["Enroute fuel US gal", fuel.enrouteFuelL / L_PER_US_GAL],
      ["Descent time min", fuel.descentMin],
      ["Descent fuel US gal", fuel.descentFuelL / L_PER_US_GAL],
      ["Alternate time min", fuel.alternateMin],
      ["Alternate fuel US gal", fuel.alternateFuelL / L_PER_US_GAL],
    ];

    const ready = fields.every(([label]) => Boolean(findNumberInput(root, label)));
    if (!ready) return false;

    for (const [label, value] of fields) {
      setControlledNumber(findNumberInput(root, label), value);
    }

    setAerodrome(root, "Departure", plan.route.departureIcao);
    setAerodrome(root, "Arrival", plan.route.arrivalIcao);
    setAerodrome(root, "Alternate", plan.route.alternateIcao);

    setSyncStatus(
      `${automatic ? "Latest NavLog applied" : "NavLog refreshed"} · ${formatSavedAt(plan.savedAt)}`
    );
    return true;
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const plan = readLatestPlan();
    const timer = window.setInterval(() => {
      applyDefaults(root);

      if (!autoSyncApplied.current) {
        if (!plan) {
          autoSyncApplied.current = true;
          setSyncStatus("No saved CS-AVC NavLog yet. Performance presets are loaded.");
        } else if (applyPlan(plan, true)) {
          autoSyncApplied.current = true;
        }
      }

      if (defaultsApplied.current && autoSyncApplied.current) {
        window.clearInterval(timer);
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, []);

  function refreshFromNavlog() {
    const plan = readLatestPlan();
    if (!plan) {
      setSyncStatus("No complete CS-AVC NavLog is saved yet.");
      return;
    }

    if (!applyPlan(plan, false)) {
      setSyncStatus("C152 form is still loading. Try again in a moment.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              CS-AVC planning presets
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950">
              C152 defaults + latest NavLog
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-700">
              M&amp;B starts at 50 kg pilot, 80 kg passenger, 5 kg Area 1 baggage and full usable fuel. The fuel sheet starts with the POH 3000 ft climb reference; when a CS-AVC NavLog exists, its route times and calculated fuel are applied automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshFromNavlog}
            className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"
          >
            Use latest C152 NavLog
          </button>
        </div>

        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <p className="rounded-xl bg-white px-3 py-2 font-medium text-zinc-700">
            Climb: {C152_NAVLOG_PRESET.climbTasKt} KTAS · {C152_NAVLOG_PRESET.rocFpm} fpm
          </p>
          <p className="rounded-xl bg-white px-3 py-2 font-medium text-zinc-700">
            Cruise: {C152_NAVLOG_PRESET.cruiseTasKt} KTAS · {C152_NAVLOG_PRESET.fuelFlowLh} L/h
          </p>
          <p className="rounded-xl bg-white px-3 py-2 font-medium text-zinc-700">
            Taxi: {C152_NAVLOG_PRESET.taxiMin} min · {C152_PERFORMANCE_PRESET.startTaxiTakeoffAllowanceGal} US gal allowance
          </p>
          <p className="rounded-xl bg-white px-3 py-2 font-medium text-zinc-700">
            Reserve 45 min: {C152_PERFORMANCE_PRESET.reserve45MinFuelGal} US gal
          </p>
        </div>

        <p className="mt-3 text-xs leading-5 text-sky-800">
          {syncStatus || (latestPlan ? `Saved NavLog available · ${formatSavedAt(latestPlan.savedAt)}` : "Waiting for C152 form…")}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
          The 90 KTAS descent and 500 fpm ROD are planning presets. Mission-specific NavLog values remain editable.
        </p>
      </section>

      <div ref={rootRef}>
        <C152Client />
      </div>
    </div>
  );
}
