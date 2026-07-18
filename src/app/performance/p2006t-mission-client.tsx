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
import { fetchOpenMeteoTemperatureAtAltitude } from "@/lib/performance/open-meteo-altitude";
import {
  getP2006TFleetAircraft,
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  calculateP2006TPerformance,
  type P2006TPerformanceResult,
  type P2006TPerformanceRow,
} from "@/lib/performance/p2006t-performance";
import {
  DEFAULT_P2006T_PERFORMANCE_SETTINGS,
  setP2006TPerformanceSettings,
  type P2006TPerformanceSettings,
} from "@/lib/performance/p2006t-performance-settings";
import {
  p2006tClimbPerformance,
  p2006tCruisePerformance,
} from "@/lib/performance/p2006t-climb-cruise";
import {
  calculateP2006TMission,
  DEFAULT_P2006T_FUEL_TIMES,
  DEFAULT_P2006T_LOADING,
  massForRole,
  P2006T_FUEL,
  usableFuelFromTotal,
  type P2006TFuelTimesInput,
  type P2006TLoadingInput,
} from "@/lib/performance/p2006t-mission";
import {
  buildP2006TPerformancePdfV2,
  downloadP2006TPerformancePdfV2,
} from "@/lib/pdf/p2006t-performance-pdf-v2";

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
    icao: "LPBJ",
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

function ComplianceBadge({
  label,
  availableM,
  calculatedM,
}: {
  label: string;
  availableM: number;
  calculatedM: number;
}) {
  const requiredM = whole(calculatedM * 1.25);
  const ok = availableM >= requiredM;
  return (
    <div
      className={[
        "rounded-xl border px-3 py-2 text-xs",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800",
      ].join(" ")}
    >
      <p className="font-semibold">
        {label}: {ok ? "COMPLIANT" : "NOT COMPLIANT"}
      </p>
      <p className="mt-1">
        AFM {whole(calculatedM)} m · OM/POH 125% {requiredM} m · available{" "}
        {whole(availableM)} m
      </p>
    </div>
  );
}

function initialLoading(registration: P2006TRegistration): P2006TLoadingInput {
  const aircraft = getP2006TFleetAircraft(registration);
  return {
    emptyMassKg: aircraft.emptyMassKg ?? 0,
    emptyMomentKgm: aircraft.emptyMomentKgm ?? 0,
    studentKg: DEFAULT_P2006T_LOADING.studentKg,
    instructorKg: DEFAULT_P2006T_LOADING.instructorKg,
    rearSeatsKg: DEFAULT_P2006T_LOADING.rearSeatsKg,
    baggageKg: DEFAULT_P2006T_LOADING.baggageKg,
    totalFuelInTanksL: DEFAULT_P2006T_LOADING.totalFuelInTanksL,
  };
}

export function P2006TMissionClient() {
  const [registration, setRegistration] =
    useState<P2006TRegistration>("D-GSEV");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [legs, setLegs] = useState<PerformanceLegInput[]>(INITIAL_LEGS);
  const [loading, setLoading] = useState<P2006TLoadingInput>(() =>
    initialLoading("D-GSEV")
  );
  const [fuelTimes, setFuelTimes] = useState<P2006TFuelTimesInput>({
    ...DEFAULT_P2006T_FUEL_TIMES,
  });
  const [settings, setSettings] = useState<P2006TPerformanceSettings>(
    DEFAULT_P2006T_PERFORMANCE_SETTINGS
  );
  const [cruiseTemperatureC, setCruiseTemperatureC] = useState<number | null>(
    null
  );
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState("");
  const [results, setResults] = useState<P2006TPerformanceResult[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [status, setStatus] = useState("");

  const aircraft = getP2006TFleetAircraft(registration);
  const departure = legs.find((leg) => leg.role === "Departure") ?? legs[0];
  const isaTemperatureC = 15 - 1.9812 * (settings.cruiseAltitudeFt / 1000);
  const effectiveIsaDeviationC =
    cruiseTemperatureC === null
      ? settings.isaDeviationC
      : cruiseTemperatureC - isaTemperatureC;
  const estimatedTakeoffWeightKg =
    loading.emptyMassKg +
    loading.studentKg +
    loading.instructorKg +
    loading.rearSeatsKg +
    loading.baggageKg +
    usableFuelFromTotal(loading.totalFuelInTanksL) * P2006T_FUEL.densityKgL -
    fuelTimes.taxiFuelL * P2006T_FUEL.densityKgL;

  const cruisePerformance = useMemo(
    () =>
      p2006tCruisePerformance(registration, settings.cruiseAltitudeFt, {
        weightKg: 1150,
        isaDeviationC: effectiveIsaDeviationC,
        cruiseRpm: settings.cruiseRpm,
        cruisePowerPercent: settings.cruisePowerPercent,
      }),
    [effectiveIsaDeviationC, registration, settings]
  );
  const climbPerformance = useMemo(
    () =>
      p2006tClimbPerformance(
        registration,
        Math.max(0, settings.cruiseAltitudeFt / 2),
        {
          weightKg: estimatedTakeoffWeightKg,
          isaDeviationC: effectiveIsaDeviationC,
          cruiseRpm: settings.cruiseRpm,
          cruisePowerPercent: settings.cruisePowerPercent,
        }
      ),
    [
      effectiveIsaDeviationC,
      estimatedTakeoffWeightKg,
      registration,
      settings,
    ]
  );
  const mission = useMemo(
    () =>
      calculateP2006TMission({
        aircraft,
        loading,
        fuelTimes,
        rates: {
          climbLh: climbPerformance?.fuelFlowLh ?? 40,
          cruiseLh: cruisePerformance?.fuelFlowLh ?? 40,
          descentLh: cruisePerformance?.fuelFlowLh ?? 40,
        },
      }),
    [aircraft, climbPerformance, cruisePerformance, fuelTimes, loading]
  );

  useEffect(() => {
    let cancelled = false;
    setCalculating(true);
    Promise.all(
      legs.map(async (leg) => {
        const evaluated = evaluatePerformanceLeg(leg);
        const weightKg = massForRole(mission, leg.role);
        const signedSlope = evaluated.bestRunway?.slope_pc ?? 0;
        return calculateP2006TPerformance({
          registration,
          result: evaluated,
          takeoffWeightKg: weightKg,
          landingWeightKg: weightKg,
          conditions: {
            surface: "paved",
            uphillSlopePct: Math.max(0, signedSlope),
          },
        });
      })
    )
      .then((next) => {
        if (!cancelled) setResults(next);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setStatus("Performance calculation failed.");
      })
      .finally(() => {
        if (!cancelled) setCalculating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [legs, mission, registration]);

  const validRows = useMemo(
    () => results.filter((result): result is P2006TPerformanceRow => result.ok),
    [results]
  );

  function patchLeg(
    role: PerformanceLegRole,
    patch: Partial<PerformanceLegInput>
  ) {
    setLegs((current) =>
      current.map((leg) => (leg.role === role ? { ...leg, ...patch } : leg))
    );
  }

  function selectRegistration(next: P2006TRegistration) {
    setRegistration(next);
    const nextAircraft = getP2006TFleetAircraft(next);
    setLoading((current) => ({
      ...current,
      emptyMassKg: nextAircraft.emptyMassKg ?? 0,
      emptyMomentKgm: nextAircraft.emptyMomentKgm ?? 0,
    }));
  }

  function patchSettings(patch: Partial<P2006TPerformanceSettings>) {
    const next = setP2006TPerformanceSettings({ ...settings, ...patch });
    setSettings(next);
  }

  async function updateWeather() {
    setWeatherBusy(true);
    setWeatherStatus("");
    try {
      const [legWeather, altitudeWeather] = await Promise.all([
        Promise.all(
          legs.map(async (leg) => ({
            role: leg.role,
            values: await fetchOpenMeteoForLeg(leg, date),
          }))
        ),
        fetchOpenMeteoTemperatureAtAltitude({
          icao: departure.icao,
          flightDateIso: date,
          forecastHourUtc: departure.forecastHourUtc ?? 9,
          altitudeFt: settings.cruiseAltitudeFt,
        }),
      ]);
      setLegs((current) =>
        current.map((leg) => {
          const match = legWeather.find((item) => item.role === leg.role)?.values;
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
      setCruiseTemperatureC(altitudeWeather?.tempC ?? null);
      setWeatherStatus(
        altitudeWeather
          ? `Updated ${legWeather.filter((item) => item.values).length}/4 aerodromes. ${whole(
              settings.cruiseAltitudeFt
            )} ft temperature: ${altitudeWeather.tempC} C.`
          : `Updated ${legWeather.filter((item) => item.values).length}/4 aerodromes.`
      );
    } catch (error) {
      console.error(error);
      setWeatherStatus("Weather update failed.");
    } finally {
      setWeatherBusy(false);
    }
  }

  async function exportPdf() {
    if (validRows.length !== 4) return;
    setPdfBusy(true);
    setStatus("");
    try {
      const bytes = await buildP2006TPerformancePdfV2({
        registration,
        date,
        loading,
        fuelTimes,
        mission,
        rows: validRows,
        cruiseTemperatureC,
      });
      downloadP2006TPerformancePdfV2(bytes, registration, date);
      setStatus("Performance PDF generated.");
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
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Weather</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Aerodrome weather and cruise-level temperature are loaded together.
            </p>
          </div>
          <button
            type="button"
            onClick={updateWeather}
            disabled={weatherBusy}
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
          <NumberField
            label="Cruise altitude ft"
            value={settings.cruiseAltitudeFt}
            min={0}
            max={9000}
            step={500}
            onChange={(value) => patchSettings({ cruiseAltitudeFt: value })}
          />
          <NumberField
            label="ISA deviation C"
            value={whole(effectiveIsaDeviationC)}
            min={-30}
            max={30}
            onChange={(value) => {
              setCruiseTemperatureC(null);
              patchSettings({ isaDeviationC: value });
            }}
          />
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Cruise RPM
            </span>
            <select
              value={settings.cruiseRpm}
              onChange={(event) =>
                patchSettings({
                  cruiseRpm: Number(event.target.value) as 1900 | 2100 | 2250,
                })
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
            onChange={(value) => patchSettings({ cruisePowerPercent: value })}
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {legs.map((leg) => (
            <div key={leg.role} className="rounded-2xl border border-sky-200 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-zinc-950">
                {roleLabel(leg.role)}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    ICAO
                  </span>
                  <select
                    value={leg.icao}
                    onChange={(event) => patchLeg(leg.role, { icao: event.target.value })}
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
                  onChange={(value) => patchLeg(leg.role, { forecastHourUtc: value })}
                />
                <NumberField
                  label="Temperature C"
                  value={leg.tempC}
                  onChange={(value) => patchLeg(leg.role, { tempC: value })}
                />
                <NumberField
                  label="QNH hPa"
                  value={leg.qnhHpa}
                  onChange={(value) => patchLeg(leg.role, { qnhHpa: value })}
                />
                <NumberField
                  label="Wind from"
                  value={leg.windFrom}
                  min={0}
                  max={360}
                  onChange={(value) => patchLeg(leg.role, { windFrom: value })}
                />
                <NumberField
                  label="Wind kt"
                  value={leg.windKt}
                  min={0}
                  onChange={(value) => patchLeg(leg.role, { windKt: value })}
                />
              </div>
            </div>
          ))}
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
              onChange={(event) => selectRegistration(event.target.value as P2006TRegistration)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {P2006T_REGISTRATIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <NumberField
            label="Empty mass kg"
            value={loading.emptyMassKg}
            min={0}
            onChange={(value) => setLoading((current) => ({ ...current, emptyMassKg: value }))}
          />
          <NumberField
            label="Empty moment kgm"
            value={loading.emptyMomentKgm}
            min={0}
            onChange={(value) => setLoading((current) => ({ ...current, emptyMomentKgm: value }))}
          />
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <p className="text-xs text-zinc-500">Maximum mass</p>
            <p className="font-semibold">{aircraft.maxMassKg} kg</p>
          </div>
          <NumberField
            label="Student kg"
            value={loading.studentKg}
            min={0}
            onChange={(value) => setLoading((current) => ({ ...current, studentKg: value }))}
          />
          <NumberField
            label="Instructor kg"
            value={loading.instructorKg}
            min={0}
            onChange={(value) => setLoading((current) => ({ ...current, instructorKg: value }))}
          />
          <NumberField
            label="Rear seats kg"
            value={loading.rearSeatsKg}
            min={0}
            onChange={(value) => setLoading((current) => ({ ...current, rearSeatsKg: value }))}
          />
          <NumberField
            label="Baggage kg"
            value={loading.baggageKg}
            min={0}
            onChange={(value) => setLoading((current) => ({ ...current, baggageKg: value }))}
          />
          <NumberField
            label="Total fuel in tanks L"
            value={loading.totalFuelInTanksL}
            min={0}
            max={P2006T_FUEL.totalCapacityL}
            onChange={(value) => setLoading((current) => ({ ...current, totalFuelInTanksL: value }))}
          />
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <p className="text-xs text-zinc-500">Usable fuel</p>
            <p className="font-semibold">{whole(mission.fuel.usableLoadedL)} L</p>
            <p className="text-xs text-zinc-500">5.6 L unusable is included in empty mass.</p>
          </div>
        </div>
        {aircraft.emptyDataSource ? (
          <p className="mt-3 text-xs text-zinc-500">Empty data: {aircraft.emptyDataSource}.</p>
        ) : (
          <p className="mt-3 text-xs text-amber-700">Empty mass and moment are awaiting the aircraft weighing record.</p>
        )}
        <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Condition</th>
                <th className="px-4 py-3">Mass kg</th>
                <th className="px-4 py-3">Moment kgm</th>
                <th className="px-4 py-3">CG % MAC</th>
                <th className="px-4 py-3">Usable fuel L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {mission.points.map((point) => (
                <tr key={point.label}>
                  <td className="px-4 py-3 font-semibold">{point.label}</td>
                  <td className="px-4 py-3">{whole(point.massKg)}</td>
                  <td className="px-4 py-3">{whole(point.momentKgm)}</td>
                  <td className="px-4 py-3">{point.cgPercentMac.toFixed(1)}</td>
                  <td className="px-4 py-3">{whole(point.usableFuelL)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mission.warnings.length ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {mission.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">Fuel planning</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Taxi fuel L" value={fuelTimes.taxiFuelL} min={0} onChange={(value) => setFuelTimes((current) => ({ ...current, taxiFuelL: value }))} />
          <NumberField label="Climb min" value={fuelTimes.climbMin} min={0} onChange={(value) => setFuelTimes((current) => ({ ...current, climbMin: value }))} />
          <NumberField label="Enroute min" value={fuelTimes.enrouteMin} min={0} onChange={(value) => setFuelTimes((current) => ({ ...current, enrouteMin: value }))} />
          <NumberField label="Descent min" value={fuelTimes.descentMin} min={0} onChange={(value) => setFuelTimes((current) => ({ ...current, descentMin: value }))} />
          <NumberField label="Alternate 1 min" value={fuelTimes.alternate1Min} min={0} onChange={(value) => setFuelTimes((current) => ({ ...current, alternate1Min: value }))} />
          <NumberField label="Alternate 2 min" value={fuelTimes.alternate2Min} min={0} onChange={(value) => setFuelTimes((current) => ({ ...current, alternate2Min: value }))} />
          <NumberField label="Reserve min" value={fuelTimes.reserveMin} min={0} onChange={(value) => setFuelTimes((current) => ({ ...current, reserveMin: value }))} />
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <p className="text-xs text-zinc-500">AFM rates</p>
            <p className="font-semibold">Climb {whole(mission.fuel.climbLh)} · Cruise {whole(mission.fuel.cruiseLh)} L/h</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Taxi", mission.fuel.taxiFuelL],
            ["Climb", mission.fuel.climbFuelL],
            ["Enroute", mission.fuel.enrouteFuelL],
            ["Descent", mission.fuel.descentFuelL],
            ["Trip", mission.fuel.tripFuelL],
            ["Contingency", mission.fuel.contingencyFuelL],
            ["Alternate 1", mission.fuel.alternate1FuelL],
            ["Alternate 2", mission.fuel.alternate2FuelL],
            ["Reserve", mission.fuel.reserveFuelL],
            ["Required usable", mission.fuel.requiredUsableFuelL],
            ["Extra usable", mission.fuel.extraUsableFuelL],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-lg font-semibold">{whole(Number(value))} L</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Taxi is a fixed planning allowance, not cruise flow multiplied by taxi time. All displayed fuel values are rounded to whole litres.
        </p>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">Aerodrome performance</h2>
        {calculating ? <p className="mt-3 text-sm text-zinc-500">Calculating...</p> : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {results.map((result) =>
            result.ok ? (
              <div key={result.role} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-950">{roleLabel(result.role)} · {result.icao}</p>
                    <p className="mt-1 text-sm text-zinc-500">RWY {result.runway} · weight {whole(result.takeoffWeightKg)} kg · PA {whole(result.paFt)} ft · slope {result.uphillSlopePct.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  <ComplianceBadge label="Takeoff" availableM={result.todaM} calculatedM={result.takeoff50M} />
                  <ComplianceBadge label="Landing" availableM={result.ldaM} calculatedM={result.landing50M} />
                </div>
              </div>
            ) : (
              <div key={result.role} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">{roleLabel(result.role)} · {result.icao}</p>
                <p className="mt-1">{result.reason}</p>
              </div>
            )
          )}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          The OM/POH check requires available runway distance to be at least 125% of the AFM distance.
        </p>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Performance PDF</h2>
            <p className="mt-1 text-sm text-zinc-500">
              One official form, separate Alternate 1 and 2 columns, one chart page per aerodrome, then enroute and cruise pages.
            </p>
          </div>
          <button
            type="button"
            onClick={exportPdf}
            disabled={pdfBusy || validRows.length !== 4 || loading.emptyMassKg <= 0}
            className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-zinc-300"
          >
            {pdfBusy ? "Generating..." : "Export PDF"}
          </button>
        </div>
        {status ? <p className="mt-3 text-sm text-zinc-600">{status}</p> : null}
      </section>
    </div>
  );
}
