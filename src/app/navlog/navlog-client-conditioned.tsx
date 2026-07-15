"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from "react";
import {
  DEFAULT_P2006T_NAVLOG_CONDITIONS,
  getP2006TNavlogConditions,
  hydrateP2006TNavlogConditions,
  setP2006TNavlogConditions,
  subscribeP2006TNavlogConditions,
  type P2006TCruiseRpm,
} from "@/lib/performance/p2006t-navlog-settings";
import { NavlogClient } from "./navlog-client";

const TABLE_DRIVEN_GENERIC_FIELDS = new Set([
  "Climb TAS",
  "Cruise TAS",
  "Fuel L/h",
  "ROC",
]);

function labelledSelect(root: HTMLElement, label: string) {
  for (const element of root.querySelectorAll("label")) {
    const heading = element.querySelector("span")?.textContent?.trim();
    if (heading === label) {
      return element.querySelector("select") as HTMLSelectElement | null;
    }
  }
  return null;
}

function applyGenericPerformanceVisibility(
  root: HTMLElement,
  tableDriven: boolean
) {
  for (const element of root.querySelectorAll("label")) {
    const heading = element.querySelector("span")?.textContent?.trim() ?? "";
    if (!TABLE_DRIVEN_GENERIC_FIELDS.has(heading)) continue;
    (element as HTMLElement).style.display = tableDriven ? "none" : "";
  }
}

function ConditionNumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
      />
    </label>
  );
}

export function ConditionedNavlogClient() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [aircraft, setAircraft] = useState("");
  const [registration, setRegistration] = useState("");
  const conditions = useSyncExternalStore(
    subscribeP2006TNavlogConditions,
    getP2006TNavlogConditions,
    () => DEFAULT_P2006T_NAVLOG_CONDITIONS
  );

  useEffect(() => {
    hydrateP2006TNavlogConditions();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const syncAircraft = () => {
      const selectedAircraft = labelledSelect(root, "Aircraft")?.value ?? "";
      setAircraft(selectedAircraft);
      setRegistration(labelledSelect(root, "Registration")?.value ?? "");
      applyGenericPerformanceVisibility(
        root,
        selectedAircraft === "Tecnam P2006T"
      );
    };

    syncAircraft();
    const observer = new MutationObserver(syncAircraft);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const maximumWeightKg = registration === "CS-EAQ" ? 1180 : 1230;

  useEffect(() => {
    if (
      aircraft === "Tecnam P2006T" &&
      conditions.weightKg > maximumWeightKg
    ) {
      setP2006TNavlogConditions({ weightKg: maximumWeightKg });
    }
  }, [aircraft, conditions.weightKg, maximumWeightKg]);

  function handleCapturedChange(event: ChangeEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    window.requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      const selectedAircraft = labelledSelect(root, "Aircraft")?.value ?? "";
      setAircraft(selectedAircraft);
      setRegistration(labelledSelect(root, "Registration")?.value ?? "");
      applyGenericPerformanceVisibility(
        root,
        selectedAircraft === "Tecnam P2006T"
      );
    });
  }

  return (
    <div ref={rootRef} onChangeCapture={handleCapturedChange} className="space-y-5">
      {aircraft === "Tecnam P2006T" ? (
        <section className="rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <span className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800">
                Default
              </span>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-950">
                P2006T performance conditions
              </h2>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-zinc-600">
                Each NavLog leg uses its own pressure altitude. Climb performance is interpolated by registration, weight and temperature; cruise performance is interpolated by altitude, ISA deviation, RPM and requested power.
              </p>
            </div>
            <p className="max-w-xl rounded-2xl border border-sky-200 bg-white px-3 py-2 text-xs leading-5 text-zinc-600">
              Cruise tables are published at 1150 kg. The selected weight therefore changes climb performance only; no unsupported cruise-weight correction is invented.
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ConditionNumberInput
              label="Weight kg"
              value={Math.min(conditions.weightKg, maximumWeightKg)}
              min={930}
              max={maximumWeightKg}
              step={10}
              onChange={(weightKg) =>
                setP2006TNavlogConditions({
                  weightKg: Math.min(weightKg, maximumWeightKg),
                })
              }
            />

            <ConditionNumberInput
              label="ISA deviation °C"
              value={conditions.isaDeviationC}
              min={-30}
              max={30}
              step={1}
              onChange={(isaDeviationC) =>
                setP2006TNavlogConditions({ isaDeviationC })
              }
            />

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Cruise RPM
              </span>
              <select
                value={conditions.cruiseRpm}
                onChange={(event) =>
                  setP2006TNavlogConditions({
                    cruiseRpm: Number(event.target.value) as P2006TCruiseRpm,
                  })
                }
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
              >
                <option value={1900}>1900</option>
                <option value={2100}>2100</option>
                <option value={2250}>2250</option>
              </select>
            </label>

            <ConditionNumberInput
              label="Cruise power %"
              value={conditions.cruisePowerPercent}
              min={35}
              max={90}
              step={1}
              onChange={(cruisePowerPercent) =>
                setP2006TNavlogConditions({ cruisePowerPercent })
              }
            />
          </div>

          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Published ranges are respected. Values outside a table are limited to its nearest published boundary rather than extrapolated silently.
          </p>
        </section>
      ) : null}

      <NavlogClient />
    </div>
  );
}
