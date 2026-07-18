"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_P2006T_PERFORMANCE_SETTINGS,
  setP2006TPerformanceSettings,
  type P2006TPerformanceSettings,
} from "@/lib/performance/p2006t-performance-settings";
import {
  p2006tCruisePerformance,
  type P2006TNavlogPerformance,
} from "@/lib/performance/p2006t-climb-cruise";
import { P2006TClient } from "./p2006t-client";

function NumberField({
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
    <label className="space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}

export function P2006TCompleteClient() {
  const [settings, setSettings] = useState<P2006TPerformanceSettings>(
    DEFAULT_P2006T_PERFORMANCE_SETTINGS
  );

  function patch(patchValue: Partial<P2006TPerformanceSettings>) {
    const next = setP2006TPerformanceSettings({ ...settings, ...patchValue });
    setSettings(next);
  }

  const preview = useMemo<P2006TNavlogPerformance | null>(() => {
    try {
      return p2006tCruisePerformance("CS-EBX", settings.cruiseAltitudeFt, {
        weightKg: 1150,
        isaDeviationC: settings.isaDeviationC,
        cruiseRpm: settings.cruiseRpm,
        cruisePowerPercent: settings.cruisePowerPercent,
      });
    } catch {
      return null;
    }
  }, [settings]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              AFM cruise tables
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Cruise conditions included in the official PDF
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              These settings select the aircraft-specific cruise tables appended to
              the generated PDF. The NavLog remains on the simpler 125 kt standard
              profile and does not use these AFM conditions.
            </p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Current table result preview
            </p>
            <p className="mt-1 font-semibold text-zinc-950">
              {preview
                ? `${preview.tasKt.toFixed(0)} KTAS · ${preview.fuelFlowLh.toFixed(
                    1
                  )} L/h · ${preview.powerPercent?.toFixed(0) ?? "—"}%`
                : "Outside available published rows"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Preview uses the common AFM cruise dataset at 1150 kg; the PDF uses the
              registration selected below.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label="Cruise altitude ft"
            value={settings.cruiseAltitudeFt}
            min={0}
            max={9000}
            step={500}
            onChange={(value) => patch({ cruiseAltitudeFt: value })}
          />
          <NumberField
            label="ISA deviation °C"
            value={settings.isaDeviationC}
            min={-30}
            max={30}
            onChange={(value) => patch({ isaDeviationC: value })}
          />
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Cruise RPM
            </span>
            <select
              value={settings.cruiseRpm}
              onChange={(event) =>
                patch({ cruiseRpm: Number(event.target.value) as 1900 | 2100 | 2250 })
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value={1900}>1900</option>
              <option value={2100}>2100</option>
              <option value={2250}>2250</option>
            </select>
          </label>
          <NumberField
            label="Cruise power %"
            value={settings.cruisePowerPercent}
            min={35}
            max={90}
            onChange={(value) => patch({ cruisePowerPercent: value })}
          />
        </div>
      </section>

      <P2006TClient />
    </div>
  );
}
