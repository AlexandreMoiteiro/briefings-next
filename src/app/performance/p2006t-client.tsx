"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PERFORMANCE_AERODROMES,
  PERFORMANCE_ICAOS,
} from "@/lib/performance/aerodromes";
import {
  evaluatePerformanceLeg,
  type PerformanceLegInput,
  type PerformanceLegRole,
} from "@/lib/performance/aerodrome-performance";
import { fetchOpenMeteoForLeg } from "@/lib/performance/open-meteo";
import {
  calculateP2006TPerformance,
  type P2006TPerformanceResult,
  type P2006TPerformanceRow,
} from "@/lib/performance/p2006t-performance";
import {
  P2006T_REGISTRATIONS,
  getP2006TFleetAircraft,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  formatFuelLiters,
  formatFuelTime,
  recalculateFuelPlan,
  type FuelPlanningInput,
} from "@/lib/performance/fuel-planning";
import {
  buildP2006TPerformancePdf,
  downloadP2006TPerformancePdf,
  type P2006TLoadingInput,
} from "@/lib/pdf/p2006t-performance-pdf";

type LegState = {
  input: PerformanceLegInput;
  uphillSlopeOverridePct: number | null;
};

const AERODROME_DB = PERFORMANCE_AERODROMES as Record<
  string,
  { name: string }
>;

const INITIAL_LEGS: LegState[] = [
  {
    input: {
      role: "Departure",
      icao: "LPSO",
      tempC: 15,
      qnhHpa: 1013,
      windFrom: 240,
      windKt: 8,
      forecastHourUtc: 9,
    },
    uphillSlopeOverridePct: null,
  },
  {
    input: {
      role: "Arrival",
      icao: "LPSO",
      tempC: 15,
      qnhHpa: 1013,
      windFrom: 240,
      windKt: 8,
      forecastHourUtc: 10,
    },
    uphillSlopeOverridePct: null,
  },
  {
    input: {
      role: "Alternate",
      icao: "LPEV",
      tempC: 15,
      qnhHpa: 1013,
      windFrom: 240,
      windKt: 8,
      forecastHourUtc: 11,
    },
    uphillSlopeOverridePct: null,
  },
  {
    input: {
      role: "Alternate 2",
      icao: "LPBJ",
      tempC: 15,
      qnhHpa: 1013,
      windFrom: 240,
      windKt: 8,
      forecastHourUtc: 12,
    },
    uphillSlopeOverridePct: null,
  },
];

const INITIAL_LOADING: P2006TLoadingInput = {
  emptyMassKg: 0,
  emptyMomentKgm: 0,
  pilotFrontKg: 0,
  rearSeatsKg: 0,
  fuelLoadedL: 180,
  baggageKg: 0,
};

const INITIAL_FUEL_PLAN = recalculateFuelPlan({
  rateLh: 36,
  fuelLoadedL: 180,
  taxiMin: 20,
  climbMin: 10,
  enrouteMin: 100,
  descentMin: 10,
  alternateMin: 45,
  reserveMin: 45,
});

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
      {children}
    </span>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}

function StatusBadge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700",
      ].join(" ")}
    >
      {text}
    </span>
  );
}

function roleLabel(role: PerformanceLegRole) {
  return role === "Alternate" ? "Alternate 1" : role;
}

function ResultPanel({ result }: { result: P2006TPerformanceResult | null }) {
  if (!result) {
    return <p className="mt-4 text-sm text-zinc-500">Calculating AFM tables...</p>;
  }

  if (!result.ok) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        {result.reason}
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Takeoff
          </p>
          <p className="mt-1 text-sm text-zinc-700">
            GR <strong>{result.takeoffGroundRollM} m</strong> · 50 ft{" "}
            <strong>{result.takeoff50M} m</strong> · TODA{" "}
            {result.todaM.toFixed(0)} m
          </p>
          <div className="mt-2">
            <StatusBadge
              ok={result.takeoffOk}
              text={`${result.takeoffOk ? "OK" : "NOK"} · ${
                result.takeoffMarginM >= 0 ? "+" : ""
              }${result.takeoffMarginM} m`}
            />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Landing
          </p>
          <p className="mt-1 text-sm text-zinc-700">
            GR <strong>{result.landingGroundRollM} m</strong> · 50 ft{" "}
            <strong>{result.landing50M} m</strong> · LDA{" "}
            {result.ldaM.toFixed(0)} m
          </p>
          <div className="mt-2">
            <StatusBadge
              ok={result.landingOk}
              text={`${result.landingOk ? "OK" : "NOK"} · ${
                result.landingMarginM >= 0 ? "+" : ""
              }${result.landingMarginM} m`}
            />
          </div>
        </div>
      </div>
      <p className="text-xs leading-5 text-zinc-500">
        Interpolation: weight {result.takeoffTrace.lowerWeightKg}-
        {result.takeoffTrace.upperWeightKg} kg · PA{" "}
        {result.takeoffTrace.lowerAltitudeFt}-
        {result.takeoffTrace.upperAltitudeFt} ft · OAT{" "}
        {result.takeoffTrace.lowerTemperatureC}-
        {result.takeoffTrace.upperTemperatureC} °C. The generated PDF includes the
        original AFM pages and highlights the cells used.
      </p>
    </div>
  );
}

export function P2006TClient() {
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EBX");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [takeoffWeightKg, setTakeoffWeightKg] = useState(1150);
  const [landingWeightKg, setLandingWeightKg] = useState(1080);
  const [loading, setLoading] = useState<P2006TLoadingInput>(INITIAL_LOADING);
  const [fuelPlan, setFuelPlan] = useState<FuelPlanningInput>(INITIAL_FUEL_PLAN);
  const [legs, setLegs] = useState<LegState[]>(INITIAL_LEGS);
  const [results, setResults] = useState<P2006TPerformanceResult[]>([]);
  const [calculating, setCalculating] = useState(true);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [status, setStatus] = useState("");

  const aircraft = getP2006TFleetAircraft(registration);
  const maximumMass = registration === "CS-EAQ" ? 1180 : 1230;

  useEffect(() => {
    setTakeoffWeightKg((value) => Math.min(value, maximumMass));
    setLandingWeightKg((value) => Math.min(value, maximumMass));
  }, [maximumMass]);

  useEffect(() => {
    let cancelled = false;
    setCalculating(true);

    Promise.all(
      legs.map(async (leg) => {
        const evaluated = evaluatePerformanceLeg(leg.input);
        const runwaySlope = Math.max(0, evaluated.bestRunway?.slope_pc ?? 0);
        return calculateP2006TPerformance({
          registration,
          result: evaluated,
          takeoffWeightKg,
          landingWeightKg,
          conditions: {
            surface: "paved",
            uphillSlopePct: leg.uphillSlopeOverridePct ?? runwaySlope,
          },
        });
      })
    )
      .then((next) => {
        if (!cancelled) setResults(next);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setResults(
            legs.map((leg) => ({
              ok: false,
              role: leg.input.role,
              icao: leg.input.icao,
              reason: error instanceof Error ? error.message : String(error),
            }))
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCalculating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [landingWeightKg, legs, registration, takeoffWeightKg]);

  const validRows = useMemo(
    () => results.filter((result): result is P2006TPerformanceRow => result.ok),
    [results]
  );
  const canGeneratePdf = !calculating && validRows.length === 4;

  function patchLeg(
    role: PerformanceLegRole,
    patch: Partial<PerformanceLegInput>
  ) {
    setLegs((current) =>
      current.map((leg) =>
        leg.input.role === role
          ? { ...leg, input: { ...leg.input, ...patch } }
          : leg
      )
    );
  }

  function patchSlope(role: PerformanceLegRole, value: number | null) {
    setLegs((current) =>
      current.map((leg) =>
        leg.input.role === role
          ? { ...leg, uphillSlopeOverridePct: value }
          : leg
      )
    );
  }

  function patchFuelPlan(patch: Partial<FuelPlanningInput>) {
    setFuelPlan((current) => recalculateFuelPlan({ ...current, ...patch }));
  }

  function patchLoading(patch: Partial<P2006TLoadingInput>) {
    setLoading((current) => ({ ...current, ...patch }));
  }

  function useCalculatedWeights() {
    if (loading.emptyMassKg <= 0) {
      setStatus("Enter the aircraft empty mass before calculating M&B weights.");
      return;
    }
    const fuelMassKg = loading.fuelLoadedL * 0.72;
    const takeoff =
      loading.emptyMassKg +
      loading.pilotFrontKg +
      loading.rearSeatsKg +
      fuelMassKg +
      loading.baggageKg -
      fuelPlan.taxiFuelL * 0.72;
    const landing = takeoff - fuelPlan.tripFuelL * 0.72;
    setTakeoffWeightKg(Math.max(930, Math.min(maximumMass, Math.round(takeoff))));
    setLandingWeightKg(Math.max(930, Math.min(maximumMass, Math.round(landing))));
    setStatus("Performance weights updated from M&B and fuel planning.");
  }

  async function updateWeather() {
    setWeatherBusy(true);
    setStatus("");
    try {
      const weather = await Promise.all(
        legs.map(async (leg) => ({
          role: leg.input.role,
          values: await fetchOpenMeteoForLeg(leg.input, date),
        }))
      );
      setLegs((current) =>
        current.map((leg) => {
          const match = weather.find((item) => item.role === leg.input.role);
          if (!match?.values) return leg;
          return {
            ...leg,
            input: {
              ...leg.input,
              tempC: match.values.tempC,
              qnhHpa: match.values.qnhHpa,
              windFrom: match.values.windFrom,
              windKt: match.values.windKt,
            },
          };
        })
      );
      setStatus(
        `Weather updated for ${weather.filter((item) => item.values).length}/4 airfields.`
      );
    } catch (error) {
      console.error(error);
      setStatus("Weather update failed.");
    } finally {
      setWeatherBusy(false);
    }
  }

  async function generatePdf() {
    if (!canGeneratePdf) return;
    setPdfBusy(true);
    setStatus("");
    try {
      const bytes = await buildP2006TPerformancePdf({
        registration,
        date,
        loading,
        fuelPlan,
        rows: validRows,
      });
      downloadP2006TPerformancePdf(bytes, registration, date);
      setStatus(
        "Official P2006T PDF generated with Alternate 1, Alternate 2 and annotated AFM tables."
      );
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Tecnam P2006T
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
              M&B and AFM Performance
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              Uses the official two-page Sevenair sheet and aircraft-specific AFM
              tables. The PDF is stamped directly; the web page is never printed.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <FieldLabel>Registration</FieldLabel>
              <select
                value={registration}
                onChange={(event) =>
                  setRegistration(event.target.value as P2006TRegistration)
                }
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
              >
                {P2006T_REGISTRATIONS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <FieldLabel>Date</FieldLabel>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={generatePdf}
              disabled={!canGeneratePdf || pdfBusy}
              className="self-end rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {pdfBusy ? "Generating PDF..." : "Generate official PDF"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-sky-200 bg-white p-3 text-sm">
            <FieldLabel>Aircraft</FieldLabel>
            <p className="mt-1 font-semibold">S/N {aircraft.serialNumber}</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-white p-3 text-sm">
            <FieldLabel>AFM</FieldLabel>
            <p className="mt-1 font-semibold">{aircraft.afmDocument}</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-white p-3 text-sm">
            <FieldLabel>Calculation</FieldLabel>
            <p className="mt-1 font-semibold">
              {calculating ? "Updating tables..." : "AFM interpolation ready"}
            </p>
          </div>
        </div>
        {status ? <p className="mt-4 text-sm font-medium text-zinc-700">{status}</p> : null}
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Mass & Balance inputs</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
              Empty mass and moment are aircraft weighing data and are intentionally
              not invented. When supplied, the PDF draws both takeoff and landing
              traces on the original nomogram.
            </p>
          </div>
          <button
            type="button"
            onClick={useCalculatedWeights}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold"
          >
            Use calculated M&B weights
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label="Empty mass kg"
            value={loading.emptyMassKg}
            onChange={(value) => patchLoading({ emptyMassKg: value })}
            min={0}
            step={0.1}
          />
          <NumberField
            label="Empty moment kg·m"
            value={loading.emptyMomentKgm}
            onChange={(value) => patchLoading({ emptyMomentKgm: value })}
            min={0}
            step={0.1}
          />
          <NumberField
            label="Pilot & front kg"
            value={loading.pilotFrontKg}
            onChange={(value) => patchLoading({ pilotFrontKg: value })}
            min={0}
            max={200}
          />
          <NumberField
            label="Rear seats kg"
            value={loading.rearSeatsKg}
            onChange={(value) => patchLoading({ rearSeatsKg: value })}
            min={0}
            max={200}
          />
          <NumberField
            label="Fuel loaded L"
            value={loading.fuelLoadedL}
            onChange={(value) => {
              patchLoading({ fuelLoadedL: value });
              patchFuelPlan({ fuelLoadedL: value });
            }}
            min={0}
            max={200}
          />
          <NumberField
            label="Baggage kg"
            value={loading.baggageKg}
            onChange={(value) => patchLoading({ baggageKg: value })}
            min={0}
            max={40}
          />
          <NumberField
            label="Takeoff performance kg"
            value={takeoffWeightKg}
            onChange={setTakeoffWeightKg}
            min={930}
            max={maximumMass}
          />
          <NumberField
            label="Landing performance kg"
            value={landingWeightKg}
            onChange={setLandingWeightKg}
            min={930}
            max={maximumMass}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Fuel planning</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <NumberField
            label="Flow L/h"
            value={fuelPlan.rateLh}
            onChange={(value) => patchFuelPlan({ rateLh: value })}
            min={0}
            step={0.1}
          />
          {(
            [
              ["Taxi min", "taxiMin"],
              ["Climb min", "climbMin"],
              ["Enroute min", "enrouteMin"],
              ["Descent min", "descentMin"],
              ["Alternate min", "alternateMin"],
              ["Reserve min", "reserveMin"],
            ] as const
          ).map(([label, key]) => (
            <NumberField
              key={key}
              label={label}
              value={fuelPlan[key]}
              onChange={(value) => patchFuelPlan({ [key]: value })}
              min={0}
            />
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Trip", fuelPlan.tripMin, fuelPlan.tripFuelL],
            ["Contingency", fuelPlan.contingencyMin, fuelPlan.contingencyFuelL],
            ["Required ramp", fuelPlan.requiredRampMin, fuelPlan.requiredRampFuelL],
            ["Total ramp", fuelPlan.totalRampMin, fuelPlan.totalRampFuelL],
          ].map(([label, minutes, fuel]) => (
            <div key={String(label)} className="rounded-xl border border-zinc-200 p-3">
              <FieldLabel>{String(label)}</FieldLabel>
              <p className="mt-1 font-semibold">
                {formatFuelTime(Number(minutes))} · {formatFuelLiters(Number(fuel))} L
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Airfield and MET conditions</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Departure, Arrival, Alternate 1 and Alternate 2 remain independent.
            </p>
          </div>
          <button
            type="button"
            onClick={updateWeather}
            disabled={weatherBusy}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold disabled:text-zinc-400"
          >
            {weatherBusy ? "Updating..." : "Update weather"}
          </button>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {legs.map((leg, index) => {
            const role = leg.input.role;
            const evaluated = evaluatePerformanceLeg(leg.input);
            const runwaySlope = Math.max(0, evaluated.bestRunway?.slope_pc ?? 0);
            const slope = leg.uphillSlopeOverridePct ?? runwaySlope;
            const result = results.find((item) => item.role === role) ?? null;

            return (
              <article key={role} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="font-semibold text-zinc-950">{roleLabel(role)}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1 sm:col-span-2">
                    <FieldLabel>Aerodrome</FieldLabel>
                    <select
                      value={leg.input.icao}
                      onChange={(event) => patchLeg(role, { icao: event.target.value })}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      {PERFORMANCE_ICAOS.map((icao) => (
                        <option key={icao} value={icao}>
                          {icao} · {AERODROME_DB[icao]?.name ?? icao}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <FieldLabel>Forecast UTC</FieldLabel>
                    <select
                      value={leg.input.forecastHourUtc ?? 9}
                      onChange={(event) =>
                        patchLeg(role, { forecastHourUtc: Number(event.target.value) })
                      }
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {String(hour).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </label>
                  <NumberField
                    label="Uphill slope %"
                    value={slope}
                    onChange={(value) => patchSlope(role, value)}
                    min={0}
                    max={5}
                    step={0.1}
                  />
                  <NumberField
                    label="OAT °C"
                    value={leg.input.tempC}
                    onChange={(value) => patchLeg(role, { tempC: value })}
                    min={-25}
                    max={50}
                  />
                  <NumberField
                    label="QNH hPa"
                    value={leg.input.qnhHpa}
                    onChange={(value) => patchLeg(role, { qnhHpa: value })}
                    min={900}
                    max={1050}
                  />
                  <NumberField
                    label="Wind from °"
                    value={leg.input.windFrom}
                    onChange={(value) => patchLeg(role, { windFrom: value })}
                    min={0}
                    max={360}
                  />
                  <NumberField
                    label="Wind kt"
                    value={leg.input.windKt}
                    onChange={(value) => patchLeg(role, { windKt: value })}
                    min={0}
                    max={50}
                  />
                </div>
                {evaluated.bestRunway ? (
                  <p className="mt-4 text-sm text-zinc-600">
                    RWY {evaluated.bestRunway.id} / {Math.round(evaluated.bestRunway.qfu)}° · PA{" "}
                    {Math.round(evaluated.pressureAltitudeFt)} ft · DA{" "}
                    {Math.round(evaluated.densityAltitudeFt)} ft · HW{" "}
                    {evaluated.headwindKt.toFixed(1)} kt · XW{" "}
                    {evaluated.crosswindKt.toFixed(1)} kt {evaluated.crosswindSide}
                  </p>
                ) : null}
                <ResultPanel result={result} />
                {leg.uphillSlopeOverridePct !== null ? (
                  <button
                    type="button"
                    onClick={() => patchSlope(role, null)}
                    className="mt-3 text-xs font-semibold text-sky-700"
                  >
                    Use runway database slope ({runwaySlope.toFixed(1)}%)
                  </button>
                ) : null}
                {index === 0 ? (
                  <p className="mt-3 text-xs text-zinc-400">
                    Paved runway correction is applied automatically.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
