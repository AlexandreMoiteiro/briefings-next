"use client";

import { useState } from "react";
import {
  C152_CS_AVC,
  C152_CS_AYR,
} from "@/lib/performance/c152-performance";
import { C152ClientV3 } from "./c152-client-v3";
import { PerformanceUsageTracker } from "./performance-usage-tracker";

type Registration = "CS-AVC" | "CS-AYR";
type TankConfiguration = "" | "standard" | "long-range";

export function C152RegistrationClient() {
  const [registration, setRegistration] = useState<Registration>("CS-AVC");
  const [emptyWeightText, setEmptyWeightText] = useState("");
  const [emptyMomentText, setEmptyMomentText] = useState("");
  const [tankConfiguration, setTankConfiguration] = useState<TankConfiguration>("");
  const [recordsConfirmed, setRecordsConfirmed] = useState(false);

  const emptyWeightLb = Number(emptyWeightText);
  const emptyMomentLbIn = Number(emptyMomentText);
  const emptyCgIn = emptyMomentLbIn / emptyWeightLb;
  const emptyDataValid =
    emptyWeightText.trim() !== "" &&
    emptyMomentText.trim() !== "" &&
    Number.isFinite(emptyWeightLb) &&
    Number.isFinite(emptyMomentLbIn) &&
    emptyWeightLb >= 800 &&
    emptyWeightLb <= C152_CS_AVC.maxTakeoffWeightLb &&
    Number.isFinite(emptyCgIn) &&
    emptyCgIn >= 29 &&
    emptyCgIn <= 40;
  const usableFuelCapacityGal =
    tankConfiguration === "standard"
      ? C152_CS_AYR.standardFuelUsableGal
      : tankConfiguration === "long-range"
        ? C152_CS_AYR.longRangeFuelUsableGal
        : null;
  const ayrReady = emptyDataValid && usableFuelCapacityGal !== null && recordsConfirmed;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">Aircraft registration</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Select the Cessna 152 whose loading data will be used.
            </p>
          </div>
          <label className="block">
            <span className="sr-only">Registration</span>
            <select
              value={registration}
              onChange={(event) => setRegistration(event.target.value as Registration)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              <option value="CS-AVC">CS-AVC</option>
              <option value="CS-AYR">CS-AYR</option>
            </select>
          </label>
        </div>
      </section>

      {registration === "CS-AVC" ? (
        <PerformanceUsageTracker aircraft="Cessna 152" registration="CS-AVC">
          <C152ClientV3 key="CS-AVC" />
        </PerformanceUsageTracker>
      ) : (
        <>
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              CS-AYR · Cessna 152 · S/N {C152_CS_AYR.serialNumber}
            </p>
            <h2 className="mt-2 text-lg font-bold text-zinc-950">
              Aircraft-specific weight and balance data required
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-950">
              The supplied POH does not contain CS-AYR&apos;s current basic empty weight
              or moment, and does not establish which tanks are installed. Use
              the aircraft&apos;s latest weighing / weight-and-balance record and
              verify the actual tank installation. CS-AVC&apos;s figures must not be reused.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="block text-xs font-semibold text-zinc-700">Basic empty weight (lb)</span>
                <input
                  type="number"
                  min={800}
                  max={1670}
                  step="any"
                  value={emptyWeightText}
                  onChange={(event) => {
                    setEmptyWeightText(event.target.value);
                    setRecordsConfirmed(false);
                  }}
                  placeholder="From weighing sheet"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
                />
              </label>
              <label className="space-y-1.5">
                <span className="block text-xs font-semibold text-zinc-700">Basic empty moment (lb·in)</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={emptyMomentText}
                  onChange={(event) => {
                    setEmptyMomentText(event.target.value);
                    setRecordsConfirmed(false);
                  }}
                  placeholder="Full moment, not /1000"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
                />
              </label>
              <label className="space-y-1.5">
                <span className="block text-xs font-semibold text-zinc-700">Installed fuel tanks</span>
                <select
                  value={tankConfiguration}
                  onChange={(event) => {
                    setTankConfiguration(event.target.value as TankConfiguration);
                    setRecordsConfirmed(false);
                  }}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Select verified tanks</option>
                  <option value="standard">Standard · 24.5 US gal usable</option>
                  <option value="long-range">Long-range · 37.5 US gal usable</option>
                </select>
              </label>
            </div>
            {emptyWeightText || emptyMomentText ? (
              <p className={`mt-3 text-xs ${emptyDataValid ? "text-zinc-600" : "text-amber-800"}`}>
                {emptyDataValid
                  ? `Calculated basic empty CG: ${emptyCgIn.toFixed(2)} in.`
                  : "Enter the full weight and moment from the current aircraft record; check the units and calculated CG."}
              </p>
            ) : null}
            <label className="mt-4 flex items-start gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={recordsConfirmed}
                onChange={(event) => setRecordsConfirmed(event.target.checked)}
                className="mt-1 accent-sky-700"
              />
              <span>I have checked these values and the tank installation against CS-AYR&apos;s current records.</span>
            </label>
            <p className="mt-3 text-xs leading-5 text-amber-900">
              Shared C152 performance tables are provided for planning; always verify
              the applicable aircraft POH, supplements and limitations before flight.
            </p>
          </section>

          {ayrReady ? (
            <PerformanceUsageTracker aircraft="Cessna 152" registration="CS-AYR">
              <C152ClientV3
                key={`CS-AYR-${tankConfiguration}`}
                registration="CS-AYR"
                basicEmptyWeightLb={emptyWeightLb}
                basicEmptyMomentLbIn={emptyMomentLbIn}
                usableFuelCapacityGal={usableFuelCapacityGal}
              />
            </PerformanceUsageTracker>
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
              CS-AYR calculations and PDF export will be available once the
              aircraft-specific data and installed fuel capacity are confirmed.
            </div>
          )}
        </>
      )}
    </div>
  );
}
