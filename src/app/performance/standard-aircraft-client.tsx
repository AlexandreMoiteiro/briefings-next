"use client";

import { useMemo, useState } from "react";
import { piperRegistrations, tecnamRegistrations } from "@/lib/navlog";
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
import { getFleetDefaults } from "@/lib/performance/fleet";
import {
  calculatePa28Mb,
  calculateTecnamMb,
  PA28,
  TECNAM,
  type PerformanceAircraft,
} from "@/lib/performance/mb";
import {
  defaultFuelPlanForAircraft,
  formatFuelLiters,
  recalculateFuelPlan,
  type FuelPlanningInput,
} from "@/lib/performance/fuel-planning";
import {
  calculatePa28Performance,
  type Pa28PerformanceRow,
} from "@/lib/performance/pa28-performance";
import {
  calculateTecnamPerformance,
  type TecnamPerformanceRow,
} from "@/lib/performance/tecnam-performance";
import { buildPerformancePdf } from "@/lib/pdf/performance-template-pdf";
import {
  buildP2008PerformancePdfV2,
  downloadP2008PerformancePdfV2,
} from "@/lib/pdf/p2008-performance-pdf-v2";

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
  {
    role: "Alternate 2",
    icao: "LPCB",
    tempC: 15,
    qnhHpa: 1013,
    windFrom: 240,
    windKt: 8,
    forecastHourUtc: 12,
  },
];

function whole(value: number) {
  return Math.round(Number(value || 0));
}

function roleLabel(role: PerformanceLegRole) {
  return role === "Alternate" ? "Alternate 1" : role;
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
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}

function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ComplianceBadge({
  label,
  requiredM,
  availableM,
}: {
  label: string;
  requiredM: number;
  availableM: number;
}) {
  const omRequiredM = whole(requiredM * 1.25);
  const ok = availableM >= omRequiredM;
  return (
    <div
      className={[
        "rounded-xl border p-3 text-xs",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800",
      ].join(" ")}
    >
      <p className="font-semibold">
        {label}: {ok ? "COMPLIANT" : "NOT COMPLIANT"}
      </p>
      <p className="mt-1">
        POH {whole(requiredM)} m · OM/POH 125% {omRequiredM} m · available{" "}
        {whole(availableM)} m
      </p>
    </div>
  );
}

export function StandardAircraftClient({
  aircraft,
}: {
  aircraft: PerformanceAircraft;
}) {
  const registrationOptions =
    aircraft === "Piper PA-28" ? piperRegistrations : tecnamRegistrations;
  const initialRegistration = registrationOptions[0] ?? "";
  const initialFuelL = aircraft === "Piper PA-28" ? PA28.fuelUsableL : 120;
  const [registration, setRegistration] = useState(initialRegistration);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [legs, setLegs] = useState<PerformanceLegInput[]>(INITIAL_LEGS);
  const [fuelPlan, setFuelPlan] = useState<FuelPlanningInput>(() =>
    defaultFuelPlanForAircraft(aircraft, initialFuelL)
  );
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");
  const [pa28Input, setPa28Input] = useState(() => {
    const defaults = getFleetDefaults("Piper PA-28", initialRegistration);
    return {
      emptyWeightLb:
        defaults && "emptyWeightLb" in defaults ? defaults.emptyWeightLb : 1690.2,
      emptyMomentInLb:
        defaults && "emptyMomentInLb" in defaults
          ? defaults.emptyMomentInLb
          : 151319.5,
      studentKg: 50,
      instructorKg: 80,
      frontKg: 130,
      rearKg: 0,
      baggageKg: 5,
      fuelL: PA28.fuelUsableL,
      tripFuelL: defaultFuelPlanForAircraft(
        "Piper PA-28",
        PA28.fuelUsableL
      ).tripFuelL,
    };
  });
  const [tecnamInput, setTecnamInput] = useState(() => {
    const defaults = getFleetDefaults("Tecnam P2008", initialRegistration);
    return {
      emptyWeightKg:
        defaults && "emptyWeightKg" in defaults ? defaults.emptyWeightKg : 435.75,
      emptyMomentKgM:
        defaults && "emptyMomentKgM" in defaults
          ? defaults.emptyMomentKgM
          : 811.33,
      studentKg: 50,
      instructorKg: 80,
      pilotPassengerKg: 130,
      baggageKg: 5,
      fuelL: 120,
    };
  });

  const pa28InputForCalculation = useMemo(
    () => ({ ...pa28Input, tripFuelL: fuelPlan.tripFuelL }),
    [fuelPlan.tripFuelL, pa28Input]
  );
  const pa28 = useMemo(
    () => calculatePa28Mb(pa28InputForCalculation),
    [pa28InputForCalculation]
  );
  const tecnam = useMemo(
    () => calculateTecnamMb(tecnamInput),
    [tecnamInput]
  );
  const performanceResults = useMemo(
    () => legs.map((leg) => evaluatePerformanceLeg(leg)),
    [legs]
  );
  const pa28Rows = useMemo(() => {
    if (aircraft !== "Piper PA-28") return [];
    return performanceResults
      .map((result) =>
        calculatePa28Performance(
          result,
          pa28.takeoff.weightLb,
          pa28.landing.weightLb
        )
      )
      .filter((row): row is Pa28PerformanceRow => Boolean(row));
  }, [aircraft, pa28.landing.weightLb, pa28.takeoff.weightLb, performanceResults]);
  const tecnamRows = useMemo(() => {
    if (aircraft !== "Tecnam P2008") return [];
    return performanceResults
      .map((result) => calculateTecnamPerformance(result, tecnam.total.weightKg))
      .filter((row): row is TecnamPerformanceRow => Boolean(row));
  }, [aircraft, performanceResults, tecnam.total.weightKg]);

  function updateLeg(
    role: PerformanceLegRole,
    patch: Partial<PerformanceLegInput>
  ) {
    setLegs((current) =>
      current.map((leg) => (leg.role === role ? { ...leg, ...patch } : leg))
    );
  }

  function selectRegistration(nextRegistration: string) {
    setRegistration(nextRegistration);
    const defaults = getFleetDefaults(aircraft, nextRegistration);
    if (!defaults) return;
    if (aircraft === "Piper PA-28" && "emptyWeightLb" in defaults) {
      setPa28Input((current) => ({
        ...current,
        emptyWeightLb: defaults.emptyWeightLb,
        emptyMomentInLb: defaults.emptyMomentInLb,
      }));
    }
    if (aircraft === "Tecnam P2008" && "emptyWeightKg" in defaults) {
      setTecnamInput((current) => ({
        ...current,
        emptyWeightKg: defaults.emptyWeightKg,
        emptyMomentKgM: defaults.emptyMomentKgM,
      }));
    }
  }

  function updateFuelPlan<K extends keyof FuelPlanningInput>(
    key: K,
    value: FuelPlanningInput[K]
  ) {
    setFuelPlan((current) =>
      recalculateFuelPlan({ ...current, [key]: Number(value) })
    );
  }

  async function updateWeather() {
    setWeatherBusy(true);
    setWeatherStatus("");
    try {
      const weather = await Promise.all(
        legs.map(async (leg) => ({
          role: leg.role,
          values: await fetchOpenMeteoForLeg(leg, date),
        }))
      );
      setLegs((current) =>
        current.map((leg) => {
          const match = weather.find((item) => item.role === leg.role)?.values;
          return match
            ? {
                ...leg,
                tempC: match.tempC,
                qnhHpa: match.qnhHpa,
                windFrom: match.windFrom,
                windKt: match.windKt,
              }
            : leg;
        })
      );
      setWeatherStatus(
        `Weather updated for ${weather.filter((item) => item.values).length}/4 aerodromes.`
      );
    } catch (error) {
      console.error(error);
      setWeatherStatus("Weather update failed.");
    } finally {
      setWeatherBusy(false);
    }
  }

  async function exportPdf() {
    setPdfBusy(true);
    setPdfStatus("");
    try {
      if (aircraft === "Tecnam P2008") {
        const bytes = await buildP2008PerformancePdfV2({
          registration,
          date,
          mb: tecnam,
          mbInput: tecnamInput,
          fuelPlan,
          performanceResults,
          rows: tecnamRows,
        });
        downloadP2008PerformancePdfV2(bytes, registration, date);
      } else {
        const bytes = await buildPerformancePdf({
          aircraft,
          registration,
          mission: "",
          date,
          pa28,
          pa28Input: pa28InputForCalculation,
          fuelPlan,
          performanceResults,
          pa28PerformanceRows: pa28Rows,
          tecnamPerformanceRows: [],
        });
        downloadPdf(bytes, `performance_${registration}_${date}.pdf`);
      }
      setPdfStatus("Performance PDF generated.");
    } catch (error) {
      console.error(error);
      setPdfStatus(error instanceof Error ? error.message : "PDF generation failed.");
    } finally {
      setPdfBusy(false);
    }
  }

  const activeWarnings =
    aircraft === "Piper PA-28" ? pa28.warnings : tecnam.warnings;
  const performanceRows = aircraft === "Piper PA-28" ? pa28Rows : tecnamRows;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Weather</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Load the forecast or edit each aerodrome manually.
            </p>
          </div>
          <button
            type="button"
            onClick={updateWeather}
            disabled={weatherBusy || !date}
            className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
          >
            {weatherBusy ? "Updating..." : "Update weather"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Flight date
            </span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {legs.map((leg) => {
            const evaluated = performanceResults.find(
              (result) => result.leg.role === leg.role
            );
            return (
              <div key={leg.role} className="rounded-2xl border border-sky-200 bg-white p-4">
                <p className="font-semibold text-zinc-950">{roleLabel(leg.role)}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      ICAO
                    </span>
                    <select
                      value={leg.icao}
                      onChange={(event) => updateLeg(leg.role, { icao: event.target.value })}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      {PERFORMANCE_ICAOS.map((icao) => (
                        <option key={icao} value={icao}>
                          {icao} · {PERFORMANCE_AERODROMES[icao as keyof typeof PERFORMANCE_AERODROMES]?.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <NumberField
                    label="UTC hour"
                    value={leg.forecastHourUtc ?? 9}
                    min={0}
                    max={23}
                    onChange={(value) => updateLeg(leg.role, { forecastHourUtc: value })}
                  />
                  <NumberField
                    label="Temperature C"
                    value={leg.tempC}
                    onChange={(value) => updateLeg(leg.role, { tempC: value })}
                  />
                  <NumberField
                    label="QNH hPa"
                    value={leg.qnhHpa}
                    min={900}
                    max={1050}
                    onChange={(value) => updateLeg(leg.role, { qnhHpa: value })}
                  />
                  <NumberField
                    label="Wind from"
                    value={leg.windFrom}
                    min={0}
                    max={360}
                    step={10}
                    onChange={(value) => updateLeg(leg.role, { windFrom: value })}
                  />
                  <NumberField
                    label="Wind kt"
                    value={leg.windKt}
                    min={0}
                    onChange={(value) => updateLeg(leg.role, { windKt: value })}
                  />
                </div>
                {evaluated?.bestRunway ? (
                  <p className="mt-3 text-xs text-zinc-500">
                    RWY {evaluated.bestRunway.id} · PA {whole(evaluated.pressureAltitudeFt)} ft · slope {evaluated.bestRunway.slope_pc.toFixed(1)}%
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        {weatherStatus ? <p className="mt-3 text-sm text-zinc-600">{weatherStatus}</p> : null}
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">Aircraft and loading</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Registration
            </span>
            <select
              value={registration}
              onChange={(event) => selectRegistration(event.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {registrationOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          {aircraft === "Piper PA-28" ? (
            <>
              <NumberField label="Empty weight lb" value={pa28Input.emptyWeightLb} min={0} onChange={(value) => setPa28Input((current) => ({ ...current, emptyWeightLb: value }))} />
              <NumberField label="Empty moment in-lb" value={pa28Input.emptyMomentInLb} min={0} onChange={(value) => setPa28Input((current) => ({ ...current, emptyMomentInLb: value }))} />
              <NumberField label="Student kg" value={pa28Input.studentKg} min={0} onChange={(value) => setPa28Input((current) => ({ ...current, studentKg: value, frontKg: value + current.instructorKg }))} />
              <NumberField label="Instructor kg" value={pa28Input.instructorKg} min={0} onChange={(value) => setPa28Input((current) => ({ ...current, instructorKg: value, frontKg: current.studentKg + value }))} />
              <NumberField label="Rear seats kg" value={pa28Input.rearKg} min={0} onChange={(value) => setPa28Input((current) => ({ ...current, rearKg: value }))} />
              <NumberField label="Baggage kg" value={pa28Input.baggageKg} min={0} max={PA28.baggageMaxKg} onChange={(value) => setPa28Input((current) => ({ ...current, baggageKg: value }))} />
              <NumberField label="Fuel L" value={pa28Input.fuelL} min={0} max={PA28.fuelUsableL} onChange={(value) => { setPa28Input((current) => ({ ...current, fuelL: value })); setFuelPlan((current) => recalculateFuelPlan({ ...current, fuelLoadedL: value })); }} />
            </>
          ) : (
            <>
              <NumberField label="Empty mass kg" value={tecnamInput.emptyWeightKg} min={0} onChange={(value) => setTecnamInput((current) => ({ ...current, emptyWeightKg: value }))} />
              <NumberField label="Empty moment kgm" value={tecnamInput.emptyMomentKgM} min={0} onChange={(value) => setTecnamInput((current) => ({ ...current, emptyMomentKgM: value }))} />
              <NumberField label="Student kg" value={tecnamInput.studentKg} min={0} onChange={(value) => setTecnamInput((current) => ({ ...current, studentKg: value, pilotPassengerKg: value + current.instructorKg }))} />
              <NumberField label="Instructor kg" value={tecnamInput.instructorKg} min={0} onChange={(value) => setTecnamInput((current) => ({ ...current, instructorKg: value, pilotPassengerKg: current.studentKg + value }))} />
              <NumberField label="Baggage kg" value={tecnamInput.baggageKg} min={0} max={TECNAM.maxBaggageWeightKg} onChange={(value) => setTecnamInput((current) => ({ ...current, baggageKg: value }))} />
              <NumberField label="Fuel L" value={tecnamInput.fuelL} min={0} max={TECNAM.maxFuelVolumeL} onChange={(value) => { setTecnamInput((current) => ({ ...current, fuelL: value })); setFuelPlan((current) => recalculateFuelPlan({ ...current, fuelLoadedL: value })); }} />
            </>
          )}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {aircraft === "Piper PA-28" ? (
            <>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Ramp</p><p className="text-lg font-semibold">{whole(pa28.ramp.weightLb)} lb</p></div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Takeoff</p><p className="text-lg font-semibold">{whole(pa28.takeoff.weightLb)} lb</p></div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Landing</p><p className="text-lg font-semibold">{whole(pa28.landing.weightLb)} lb</p></div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Landing CG</p><p className="text-lg font-semibold">{pa28.landing.cgIn.toFixed(1)} in</p></div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Total mass</p><p className="text-lg font-semibold">{whole(tecnam.total.weightKg)} kg</p></div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-xs text-zinc-500">CG</p><p className="text-lg font-semibold">{tecnam.total.cgM?.toFixed(3)} m</p></div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Below MTOW</p><p className="text-lg font-semibold">{whole(tecnam.remainingByMtowKg)} kg</p></div>
            </>
          )}
        </div>
        {activeWarnings.length ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {activeWarnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">Fuel planning</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Consumption L/h" value={fuelPlan.rateLh} min={0} step={0.5} onChange={(value) => updateFuelPlan("rateLh", value)} />
          <NumberField label="Taxi min" value={fuelPlan.taxiMin} min={0} onChange={(value) => updateFuelPlan("taxiMin", value)} />
          <NumberField label="Climb min" value={fuelPlan.climbMin} min={0} onChange={(value) => updateFuelPlan("climbMin", value)} />
          <NumberField label="Enroute min" value={fuelPlan.enrouteMin} min={0} step={5} onChange={(value) => updateFuelPlan("enrouteMin", value)} />
          <NumberField label="Descent min" value={fuelPlan.descentMin} min={0} onChange={(value) => updateFuelPlan("descentMin", value)} />
          <NumberField label="Alternate min" value={fuelPlan.alternateMin} min={0} step={5} onChange={(value) => updateFuelPlan("alternateMin", value)} />
          <NumberField label="Reserve min" value={fuelPlan.reserveMin} min={0} step={5} onChange={(value) => updateFuelPlan("reserveMin", value)} />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Taxi", fuelPlan.taxiFuelL],
            ["Trip", fuelPlan.tripFuelL],
            ["Contingency", fuelPlan.contingencyFuelL],
            ["Alternate", fuelPlan.alternateFuelL],
            ["Reserve", fuelPlan.reserveFuelL],
            ["Required", fuelPlan.requiredRampFuelL],
            ["Extra", fuelPlan.extraFuelL],
            ["Total", fuelPlan.totalRampFuelL],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-lg font-semibold">{formatFuelLiters(Number(value))} L</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">Aerodrome performance</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {performanceRows.map((row) => {
            const takeoffRequired = "toM" in row ? row.toM : row.takeoff50M;
            const landingRequired = "ldgM" in row ? row.ldgM : row.landing50M;
            return (
              <div key={`${row.role}-${row.icao}`} className="rounded-2xl border border-zinc-200 p-4">
                <p className="font-semibold text-zinc-950">{roleLabel(row.role as PerformanceLegRole)} · {row.icao}</p>
                <p className="mt-1 text-sm text-zinc-500">RWY {row.runway} · PA {whole(row.paFt)} ft</p>
                <div className="mt-3 grid gap-2">
                  <ComplianceBadge label="Takeoff" requiredM={takeoffRequired} availableM={row.todaM} />
                  <ComplianceBadge label="Landing" requiredM={landingRequired} availableM={row.ldaM} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Performance PDF</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Departure, Arrival, Alternate 1 and Alternate 2 are included.
            </p>
          </div>
          <button
            type="button"
            onClick={exportPdf}
            disabled={pdfBusy || performanceRows.length !== 4}
            className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-zinc-300"
          >
            {pdfBusy ? "Generating..." : "Export PDF"}
          </button>
        </div>
        {pdfStatus ? <p className="mt-3 text-sm text-zinc-600">{pdfStatus}</p> : null}
      </section>
    </div>
  );
}
