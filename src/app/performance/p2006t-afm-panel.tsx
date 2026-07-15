"use client";

import { useMemo, useState } from "react";
import {
  P2006T_REGISTRATIONS,
  getP2006TFleetAircraft,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  p2006tClimbPerformance,
  p2006tCruisePerformance,
} from "@/lib/performance/p2006t-navlog";
import type {
  P2006TCruiseRpm,
  P2006TNavlogConditions,
} from "@/lib/performance/p2006t-navlog-settings";

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400";

export function P2006TAfmPanel() {
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [weightKg, setWeightKg] = useState(1150);
  const [altitudeFt, setAltitudeFt] = useState(3000);
  const [isaDeviationC, setIsaDeviationC] = useState(0);
  const [cruiseRpm, setCruiseRpm] = useState<P2006TCruiseRpm>(2250);
  const [cruisePowerPercent, setCruisePowerPercent] = useState(65);

  const aircraft = getP2006TFleetAircraft(registration);
  const maximumWeightKg = aircraft.maxMassKg;

  const conditions: P2006TNavlogConditions = {
    weightKg: Math.min(weightKg, maximumWeightKg),
    isaDeviationC,
    cruiseRpm,
    cruisePowerPercent,
  };

  const climb = useMemo(
    () => p2006tClimbPerformance(registration, altitudeFt, conditions),
    [registration, altitudeFt, weightKg, isaDeviationC, cruiseRpm, cruisePowerPercent]
  );

  const cruise = useMemo(
    () => p2006tCruisePerformance(registration, altitudeFt, conditions),
    [registration, altitudeFt, weightKg, isaDeviationC, cruiseRpm, cruisePowerPercent]
  );

  function changeRegistration(next: P2006TRegistration) {
    const nextAircraft = getP2006TFleetAircraft(next);
    setRegistration(next);
    setWeightKg((current) => Math.min(current, nextAircraft.maxMassKg));
  }

  return (
    <section className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800">
              Default
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
              Climb and cruise performance
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              Interpolated directly from the aircraft-specific AFM tables. The same calculation engine is used by the NavLog.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 lg:max-w-xl">
            Cruise data is published at 1150 kg. Weight changes the climb calculation only. Values outside a published range are limited to the nearest table boundary.
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Field label="Registration">
            <select
              value={registration}
              onChange={(event) =>
                changeRegistration(event.target.value as P2006TRegistration)
              }
              className={inputClass}
            >
              {P2006T_REGISTRATIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Weight kg">
            <input
              type="number"
              min={930}
              max={maximumWeightKg}
              step={10}
              value={Math.min(weightKg, maximumWeightKg)}
              onChange={(event) =>
                setWeightKg(
                  Math.min(Number(event.target.value) || 930, maximumWeightKg)
                )
              }
              className={inputClass}
            />
          </Field>

          <Field label="Pressure altitude ft">
            <input
              type="number"
              min={0}
              max={14000}
              step={500}
              value={altitudeFt}
              onChange={(event) => setAltitudeFt(Number(event.target.value) || 0)}
              className={inputClass}
            />
          </Field>

          <Field label="ISA deviation °C">
            <input
              type="number"
              min={-30}
              max={30}
              step={1}
              value={isaDeviationC}
              onChange={(event) =>
                setIsaDeviationC(Number(event.target.value) || 0)
              }
              className={inputClass}
            />
          </Field>

          <Field label="Cruise RPM">
            <select
              value={cruiseRpm}
              onChange={(event) =>
                setCruiseRpm(Number(event.target.value) as P2006TCruiseRpm)
              }
              className={inputClass}
            >
              <option value={1900}>1900</option>
              <option value={2100}>2100</option>
              <option value={2250}>2250</option>
            </select>
          </Field>

          <Field label="Cruise power %">
            <input
              type="number"
              min={35}
              max={90}
              step={1}
              value={cruisePowerPercent}
              onChange={(event) =>
                setCruisePowerPercent(Number(event.target.value) || 35)
              }
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Enroute climb at Vy
            </p>
            {climb ? (
              <>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-zinc-500">TAS</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-950">
                      {round(climb.tasKt)} kt
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">ROC</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-950">
                      {round(climb.rateFpm ?? 0)} fpm
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Fuel</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-950">
                      {round(climb.fuelFlowLh, 1)} L/h
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-zinc-500">
                  {climb.source}
                  {climb.limitedToPublishedRange
                    ? " · limited to published range"
                    : " · interpolated inside published range"}
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-amber-800">
                No climb result is available for these conditions.
              </p>
            )}
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Cruise
            </p>
            {cruise ? (
              <>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-zinc-500">TAS</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-950">
                      {round(cruise.tasKt)} kt
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Power</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-950">
                      {round(cruise.powerPercent ?? 0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Fuel</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-950">
                      {round(cruise.fuelFlowLh, 1)} L/h
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-zinc-500">
                  {cruise.source} · both engines
                  {cruise.limitedToPublishedRange
                    ? " · limited to published range"
                    : " · interpolated inside published range"}
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-amber-800">
                No cruise result is available for these conditions.
              </p>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
