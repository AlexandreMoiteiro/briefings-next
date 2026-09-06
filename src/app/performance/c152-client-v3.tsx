"use client";

import { useMemo, useState } from "react";

import { C152_NAVLOG_PRESET, C152_PERFORMANCE_PRESET } from "@/lib/c152-operational-presets";
import {
  PERFORMANCE_AERODROMES,
  PERFORMANCE_ICAOS,
} from "@/lib/performance/aerodromes";
import {
  evaluatePerformanceLeg,
  type PerformanceLegInput,
} from "@/lib/performance/aerodrome-performance";
import { fetchOpenMeteoForLeg } from "@/lib/performance/open-meteo";
import {
  C152_CS_AVC,
  calculateC152Performance,
  calculateC152WeightBalance,
  c152GallonsToLiters,
  c152KgToLb,
  c152LitersToGallons,
} from "@/lib/performance/c152-performance";
import {
  formatFuelLiters,
  formatFuelTime,
  recalculateFuelPlan,
  type FuelPlanningInput,
} from "@/lib/performance/fuel-planning";
import {
  buildC152OfficialPerformanceSheetPdf,
  downloadC152OfficialPerformanceSheetPdf,
} from "@/lib/pdf/c152-official-performance-sheet-pdf";

const INITIAL_LEGS: PerformanceLegInput[] = [
  {
    role: "Departure",
    icao: "LPSO",
    tempC: 15,
    qnhHpa: 1013,
    windFrom: 240,
    windKt: 8,
    forecastHourUtc: 9,
  },
  {
    role: "Arrival",
    icao: "LPSO",
    tempC: 15,
    qnhHpa: 1013,
    windFrom: 240,
    windKt: 8,
    forecastHourUtc: 10,
  },
  {
    role: "Alternate",
    icao: "LPEV",
    tempC: 15,
    qnhHpa: 1013,
    windFrom: 240,
    windKt: 8,
    forecastHourUtc: 11,
  },
];

const AERODROMES = PERFORMANCE_AERODROMES as Record<
  string,
  { name: string; elev_ft: number }
>;

const FULL_USABLE_FUEL_L = Math.round(C152_CS_AVC.standardFuelUsableL * 10) / 10;
const START_TAXI_RUNUP_L =
  Math.round(
    c152GallonsToLiters(C152_PERFORMANCE_PRESET.startTaxiTakeoffAllowanceGal) * 10
  ) / 10;

function whole(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return String(Math.round(value));
}

function fixed(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function roleLabel(role: string) {
  return role === "Alternate" ? "Alternate" : role;
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
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-zinc-500"
      />
    </label>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800",
      ].join(" ")}
    >
      {label}: {ok ? "OK" : "CHECK"}
    </span>
  );
}

function ComplianceBadge({
  label,
  requiredM,
  availableM,
}: {
  label: string;
  requiredM: number | null;
  availableM: number;
}) {
  if (requiredM === null) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-semibold">{label}: NO DATA</p>
      </div>
    );
  }

  const marginRequired = requiredM * 1.25;
  const compliant = availableM >= marginRequired;

  return (
    <div
      className={[
        "rounded-xl border p-3 text-xs",
        compliant
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800",
      ].join(" ")}
    >
      <p className="font-semibold">
        {label}: {compliant ? "COMPLIANT" : "NOT COMPLIANT"}
      </p>
      <p className="mt-1">
        POH {whole(requiredM)} m · 125% {whole(marginRequired)} m · available {whole(availableM)} m
      </p>
    </div>
  );
}

export function C152ClientV3() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [legs, setLegs] = useState<PerformanceLegInput[]>(INITIAL_LEGS);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");

  const [loading, setLoading] = useState({
    pilotKg: C152_PERFORMANCE_PRESET.pilotKg,
    passengerKg: C152_PERFORMANCE_PRESET.passengerKg,
    fuelL: FULL_USABLE_FUEL_L,
    baggageArea1Kg: C152_PERFORMANCE_PRESET.baggageArea1Kg,
    baggageArea2Kg: C152_PERFORMANCE_PRESET.baggageArea2Kg,
    startTaxiRunupL: START_TAXI_RUNUP_L,
  });

  const [fuelPlan, setFuelPlan] = useState<FuelPlanningInput>(() =>
    recalculateFuelPlan({
      rateLh: C152_NAVLOG_PRESET.fuelFlowLh,
      fuelLoadedL: FULL_USABLE_FUEL_L,
      taxiMin: C152_NAVLOG_PRESET.taxiMin,
      climbMin: C152_PERFORMANCE_PRESET.climbTo3000Min,
      enrouteMin: 100,
      descentMin: 10,
      alternateMin: 45,
      reserveMin: 45,
    })
  );

  const wb = useMemo(
    () =>
      calculateC152WeightBalance({
        pilotLb: c152KgToLb(loading.pilotKg),
        passengerLb: c152KgToLb(loading.passengerKg),
        fuelGal: c152LitersToGallons(loading.fuelL),
        baggageArea1Lb: c152KgToLb(loading.baggageArea1Kg),
        baggageArea2Lb: c152KgToLb(loading.baggageArea2Kg),
        startTaxiRunupGal: c152LitersToGallons(loading.startTaxiRunupL),
      }),
    [loading]
  );

  const performanceResults = useMemo(
    () => legs.map((leg) => evaluatePerformanceLeg(leg)),
    [legs]
  );

  const performanceRows = useMemo(
    () => performanceResults.map((result) => calculateC152Performance(result)),
    [performanceResults]
  );

  function updateLeg(index: number, patch: Partial<PerformanceLegInput>) {
    setLegs((current) =>
      current.map((leg, legIndex) =>
        legIndex === index ? { ...leg, ...patch } : leg
      )
    );
  }

  function updateFuelPlan<K extends keyof FuelPlanningInput>(
    key: K,
    value: FuelPlanningInput[K]
  ) {
    setFuelPlan((current) =>
      recalculateFuelPlan({ ...current, [key]: Number(value) })
    );
  }

  function updateLoadedFuel(fuelL: number) {
    const normalized = Math.max(0, Math.min(FULL_USABLE_FUEL_L, fuelL));
    setLoading((current) => ({ ...current, fuelL: normalized }));
    setFuelPlan((current) =>
      recalculateFuelPlan({ ...current, fuelLoadedL: normalized })
    );
  }

  async function updateWeather() {
    setWeatherBusy(true);
    setWeatherStatus("");
    try {
      const fetched = await Promise.all(
        legs.map(async (leg) => ({
          role: leg.role,
          weather: await fetchOpenMeteoForLeg(leg, date),
        }))
      );

      const updatedCount = fetched.filter((item) => item.weather).length;
      setLegs((current) =>
        current.map((leg) => {
          const weather = fetched.find((item) => item.role === leg.role)?.weather;
          return weather
            ? {
                ...leg,
                tempC: weather.tempC,
                qnhHpa: weather.qnhHpa,
                windFrom: weather.windFrom,
                windKt: weather.windKt,
              }
            : leg;
        })
      );
      setWeatherStatus(`${updatedCount}/${legs.length} aeródromos atualizados.`);
    } catch (error) {
      setWeatherStatus(
        error instanceof Error ? error.message : "Falha ao obter meteorologia."
      );
    } finally {
      setWeatherBusy(false);
    }
  }

  async function exportOfficialPdf() {
    setPdfBusy(true);
    setPdfStatus("");
    try {
      const bytes = await buildC152OfficialPerformanceSheetPdf({
        registration: C152_CS_AVC.registration,
        date,
        weightBalance: wb,
        performanceResults,
        performanceRows,
        fuelPlan,
      });
      downloadC152OfficialPerformanceSheetPdf(
        bytes,
        C152_CS_AVC.registration,
        date
      );
      setPdfStatus("PDF oficial RVP.CFI.066.02 preenchido.");
    } catch (error) {
      setPdfStatus(
        error instanceof Error ? error.message : "Falha ao gerar o PDF oficial."
      );
    } finally {
      setPdfBusy(false);
    }
  }

  const allWarnings = [
    ...wb.warnings,
    ...performanceRows.flatMap((row) => row?.warnings ?? []),
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Cessna 152 · CS-AVC
            </p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-950">
              M&amp;B + Performance
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700">
              Presets próprios do CS-AVC, fuel planning igual ao dos restantes aircraft e export
              por stamping sobre o RVP.CFI.066.02 original.
            </p>
          </div>
          <div className="grid min-w-64 grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">BEW</p>
              <p className="mt-1 font-semibold">
                {C152_CS_AVC.basicEmptyWeightLb} lb @ {C152_CS_AVC.basicEmptyCgDisplayIn.toFixed(2)} in
              </p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">MTOW / MLW</p>
              <p className="mt-1 font-semibold">{C152_CS_AVC.maxTakeoffWeightLb} lb</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">Usable fuel</p>
              <p className="mt-1 font-semibold">24.5 US gal · {FULL_USABLE_FUEL_L} L</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">NavLog taxi preset</p>
              <p className="mt-1 font-semibold">{C152_NAVLOG_PRESET.taxiMin} min</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-950">1. Mass &amp; Balance</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Inputs em kg/L; a folha oficial recebe lb, in e moment/1000.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge ok={wb.weightOk} label="Weight" />
            <StatusBadge ok={wb.cgOk} label="CG" />
            <StatusBadge ok={wb.fuelOk} label="Fuel" />
            <StatusBadge ok={wb.baggageOk} label="Baggage" />
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="Pilot (kg)"
            value={loading.pilotKg}
            min={0}
            step={0.5}
            onChange={(pilotKg) => setLoading((current) => ({ ...current, pilotKg }))}
          />
          <NumberField
            label="Passenger (kg)"
            value={loading.passengerKg}
            min={0}
            step={0.5}
            onChange={(passengerKg) =>
              setLoading((current) => ({ ...current, passengerKg }))
            }
          />
          <NumberField
            label="Usable fuel (L)"
            value={loading.fuelL}
            min={0}
            max={FULL_USABLE_FUEL_L}
            step={0.5}
            onChange={updateLoadedFuel}
          />
          <NumberField
            label="Baggage Area 1 (kg)"
            value={loading.baggageArea1Kg}
            min={0}
            step={0.5}
            onChange={(baggageArea1Kg) =>
              setLoading((current) => ({ ...current, baggageArea1Kg }))
            }
          />
          <NumberField
            label="Baggage Area 2 (kg)"
            value={loading.baggageArea2Kg}
            min={0}
            step={0.5}
            onChange={(baggageArea2Kg) =>
              setLoading((current) => ({ ...current, baggageArea2Kg }))
            }
          />
          <NumberField
            label="Start / taxi / run-up allowance (L)"
            value={loading.startTaxiRunupL}
            min={0}
            max={loading.fuelL}
            step={0.1}
            onChange={(startTaxiRunupL) =>
              setLoading((current) => ({ ...current, startTaxiRunupL }))
            }
          />
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Loading data</th>
                <th className="px-3 py-2 font-semibold">Weight lb</th>
                <th className="px-3 py-2 font-semibold">Arm in</th>
                <th className="px-3 py-2 font-semibold">Moment /1000</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {wb.rows.map((row) => (
                <tr key={row.label}>
                  <td className="px-3 py-2 font-medium text-zinc-800">{row.label}</td>
                  <td className="px-3 py-2">{fixed(row.weightLb, 1)}</td>
                  <td className="px-3 py-2">{fixed(row.armIn, 2)}</td>
                  <td className="px-3 py-2">{fixed(row.momentLbIn / 1000, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ramp</p>
            <p className="mt-2 text-lg font-bold">
              {fixed(wb.ramp.weightLb, 1)} lb · CG {fixed(wb.ramp.cgIn, 2)} in
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Moment {fixed(wb.ramp.momentLbIn / 1000, 2)} ×1000 lb·in
            </p>
          </div>
          <div
            className={[
              "rounded-2xl border p-4",
              wb.overallOk
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50",
            ].join(" ")}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Takeoff</p>
            <p className="mt-2 text-lg font-bold">
              {fixed(wb.takeoff.weightLb, 1)} lb · CG {fixed(wb.takeoff.cgIn, 2)} in
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Limits {fixed(wb.takeoff.forwardLimitIn, 2)}–{fixed(wb.takeoff.aftLimitIn, 2)} in
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-950">2. Aerodromes &amp; weather</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Departure, Arrival e Alternate alimentam diretamente a página 2 do formulário.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Flight date
              </span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="block rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void updateWeather()}
              disabled={weatherBusy || !date}
              className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
            >
              {weatherBusy ? "Updating…" : "Update weather"}
            </button>
          </div>
        </div>

        {weatherStatus ? <p className="mt-3 text-xs text-zinc-600">{weatherStatus}</p> : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {legs.map((leg, index) => {
            const result = performanceResults[index];
            return (
              <div key={leg.role} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="font-semibold text-zinc-950">{roleLabel(leg.role)}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Airfield
                    </span>
                    <select
                      value={leg.icao}
                      onChange={(event) => updateLeg(index, { icao: event.target.value })}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      {PERFORMANCE_ICAOS.map((icao) => (
                        <option key={icao} value={icao}>
                          {icao} · {AERODROMES[icao]?.name ?? ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <NumberField
                    label="UTC hour"
                    value={leg.forecastHourUtc ?? 9}
                    min={0}
                    max={23}
                    onChange={(forecastHourUtc) => updateLeg(index, { forecastHourUtc })}
                  />
                  <NumberField
                    label="Temperature °C"
                    value={leg.tempC}
                    onChange={(tempC) => updateLeg(index, { tempC })}
                  />
                  <NumberField
                    label="QNH hPa"
                    value={leg.qnhHpa}
                    min={900}
                    max={1050}
                    onChange={(qnhHpa) => updateLeg(index, { qnhHpa })}
                  />
                  <NumberField
                    label="Wind from °"
                    value={leg.windFrom}
                    min={0}
                    max={360}
                    onChange={(windFrom) => updateLeg(index, { windFrom })}
                  />
                  <NumberField
                    label="Wind kt"
                    value={leg.windKt}
                    min={0}
                    onChange={(windKt) => updateLeg(index, { windKt })}
                  />
                </div>
                {result?.aerodrome ? (
                  <p className="mt-3 text-xs leading-5 text-zinc-600">
                    RWY {result.bestRunway?.id ?? "—"} · PA {whole(result.pressureAltitudeFt)} ft ·
                    DA {whole(result.densityAltitudeFt)} ft · XW {fixed(result.crosswindKt, 1)} kt
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-950">3. Aerodrome performance</h2>
        <p className="mt-1 text-sm text-zinc-600">
          POH raw values remain separate from the existing Briefings 125% planning check.
        </p>

        <div className="mt-5 space-y-4">
          {performanceRows.map((row, index) => {
            const result = performanceResults[index];
            if (!row || !result.aerodrome) {
              return (
                <div
                  key={legs[index].role}
                  className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                >
                  {roleLabel(legs[index].role)}: performance unavailable for the selected conditions.
                </div>
              );
            }

            return (
              <div key={row.role} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-bold text-zinc-950">
                      {roleLabel(row.role)} · {row.icao} · RWY {row.runway}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-600">
                      TODA {whole(row.todaM)} m · LDA {whole(row.ldaM)} m · ROC {whole(row.rocFpm)} ft/min
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-zinc-700">
                    HW {fixed(row.headwindKt, 1)} kt · XW {fixed(row.crosswindKt, 1)} kt
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ComplianceBadge
                    label="Takeoff"
                    requiredM={row.takeoff50FtM}
                    availableM={row.todaM}
                  />
                  <ComplianceBadge
                    label="Landing"
                    requiredM={row.landing50FtM}
                    availableM={row.ldaM}
                  />
                </div>
                {row.warnings.length ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    {row.warnings.join(" · ")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-950">4. Fuel planning</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Mesmo formato e lógica dos restantes aircraft. O C152 usa 10 min de taxi por defeito;
          os restantes presets de NavLog continuam inalterados.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label="Consumption L/h"
            value={fuelPlan.rateLh}
            min={0}
            step={0.5}
            onChange={(value) => updateFuelPlan("rateLh", value)}
          />
          <NumberField
            label="Taxi min"
            value={fuelPlan.taxiMin}
            min={0}
            onChange={(value) => updateFuelPlan("taxiMin", value)}
          />
          <NumberField
            label="Climb min"
            value={fuelPlan.climbMin}
            min={0}
            onChange={(value) => updateFuelPlan("climbMin", value)}
          />
          <NumberField
            label="Enroute min"
            value={fuelPlan.enrouteMin}
            min={0}
            step={5}
            onChange={(value) => updateFuelPlan("enrouteMin", value)}
          />
          <NumberField
            label="Descent min"
            value={fuelPlan.descentMin}
            min={0}
            onChange={(value) => updateFuelPlan("descentMin", value)}
          />
          <NumberField
            label="Alternate min"
            value={fuelPlan.alternateMin}
            min={0}
            step={5}
            onChange={(value) => updateFuelPlan("alternateMin", value)}
          />
          <NumberField
            label="Reserve min"
            value={fuelPlan.reserveMin}
            min={0}
            step={5}
            onChange={(value) => updateFuelPlan("reserveMin", value)}
          />
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Fuel loaded
            </p>
            <p className="mt-2 font-bold">{formatFuelLiters(fuelPlan.fuelLoadedL)} L</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Taxi", fuelPlan.taxiMin, fuelPlan.taxiFuelL],
            ["Trip", fuelPlan.tripMin, fuelPlan.tripFuelL],
            ["Contingency", fuelPlan.contingencyMin, fuelPlan.contingencyFuelL],
            ["Alternate", fuelPlan.alternateMin, fuelPlan.alternateFuelL],
            ["Reserve", fuelPlan.reserveMin, fuelPlan.reserveFuelL],
            ["Required", fuelPlan.requiredRampMin, fuelPlan.requiredRampFuelL],
            ["Extra", fuelPlan.extraMin, fuelPlan.extraFuelL],
            ["Total", fuelPlan.totalRampMin, fuelPlan.totalRampFuelL],
          ].map(([label, minutes, liters]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
            >
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-1 font-semibold text-zinc-950">
                {formatFuelTime(Number(minutes)) || "0"} · {formatFuelLiters(Number(liters)) || "0"} L
              </p>
            </div>
          ))}
        </div>

        <p
          className={[
            "mt-4 rounded-xl border p-3 text-sm font-semibold",
            fuelPlan.fuelSufficient
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800",
          ].join(" ")}
        >
          {fuelPlan.fuelSufficient
            ? "Loaded fuel covers Required Ramp Fuel."
            : `Loaded fuel is ${fixed(fuelPlan.requiredRampFuelL - fuelPlan.fuelLoadedL, 1)} L below Required Ramp Fuel.`}
        </p>
      </section>

      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
              RVP.CFI.066.02 · original
            </p>
            <h2 className="mt-1 text-lg font-bold text-zinc-950">
              5. Export official C152 PDF
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-700">
              Abre o PDF Sevenair original e escreve apenas nos campos mapeados. Ramp e Takeoff são
              plotados sobre a grelha original usando a calibração v4.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void exportOfficialPdf()}
            disabled={pdfBusy}
            className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:bg-zinc-300"
          >
            {pdfBusy ? "Generating PDF…" : "Export official RVP.CFI.066.02"}
          </button>
        </div>
        {pdfStatus ? <p className="mt-3 text-sm text-zinc-700">{pdfStatus}</p> : null}
      </section>

      {allWarnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
          {Array.from(new Set(allWarnings)).join(" · ")}
        </div>
      ) : null}
    </div>
  );
}
