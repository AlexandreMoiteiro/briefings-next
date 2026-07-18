"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  buildP2006TPerformancePdfV3,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type P2006TPdfOptions,
} from "@/lib/pdf/p2006t-performance-pdf-v3";

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
    <label className="space-y-1.5">
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
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-500"
      />
    </label>
  );
}

function Card({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-3",
        tone === "good"
          ? "border-emerald-200 bg-emerald-50"
          : tone === "warn"
            ? "border-amber-200 bg-amber-50"
            : "border-zinc-200 bg-zinc-50",
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-zinc-950">{value}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
    </div>
  );
}

function Toggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <span>
        <span className="block text-sm font-semibold text-zinc-950">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
          {description}
        </span>
      </span>
    </label>
  );
}

function Compliance({
  label,
  available,
  calculated,
}: {
  label: string;
  available: number;
  calculated: number;
}) {
  const required = whole(calculated * 1.25);
  const used = whole((required / Math.max(1, available)) * 100);
  const ok = available >= required;
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
        {required} m with 25% margin · {whole(available)} m available · about{" "}
        {used}% of the runway
      </p>
    </div>
  );
}

export function P2006TMissionClientV2() {
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
  const [pdfOptions, setPdfOptions] = useState<P2006TPdfOptions>({
    ...DEFAULT_P2006T_PDF_OPTIONS,
  });
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
        return calculateP2006TPerformance({
          registration,
          result: evaluated,
          takeoffWeightKg: weightKg,
          landingWeightKg: weightKg,
          conditions: {
            surface: "paved",
            uphillSlopePct: Math.max(
              0,
              evaluated.bestRunway?.slope_pc ?? 0
            ),
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
          ? `Updated ${legWeather.filter((item) => item.values).length}/4 aerodromes. About ${whole(
              altitudeWeather.tempC
            )} C at ${whole(settings.cruiseAltitudeFt)} ft.`
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
      const bytes = await buildP2006TPerformancePdfV3({
        registration,
        date,
        loading,
        fuelTimes,
        mission,
        rows: validRows,
        cruiseTemperatureC,
        options: pdfOptions,
      });
      downloadP2006TPerformancePdfV3(bytes, registration, date);
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
      <Card
        title="Weather"
        subtitle="Load the aerodrome forecast and the approximate temperature at the planned cruise level before checking performance."
        action={
          <button
            type="button"
            onClick={updateWeather}
            disabled={weatherBusy}
            className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
          >
            {weatherBusy ? "Updating..." : "Update weather"}
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Flight date
            </span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
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
          <label className="space-y-1.5">
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
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
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

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {legs.map((leg) => (
            <div
              key={leg.role}
              className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
            >
              <p className="font-semibold text-zinc-950">
                {roleLabel(leg.role)}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Aerodrome
                  </span>
                  <select
                    value={leg.icao}
                    onChange={(event) =>
                      patchLeg(leg.role, { icao: event.target.value })
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
                  >
                    {PERFORMANCE_ICAOS.map((icao) => (
                      <option key={icao} value={icao}>
                        {icao} ·{" "}
                        {
                          PERFORMANCE_AERODROMES[
                            icao as keyof typeof PERFORMANCE_AERODROMES
                          ]?.name
                        }
                      </option>
                    ))}
                  </select>
                </label>
                <NumberField
                  label="UTC hour"
                  value={leg.forecastHourUtc ?? 9}
                  min={0}
                  max={23}
                  onChange={(value) =>
                    patchLeg(leg.role, { forecastHourUtc: value })
                  }
                />
                <NumberField
                  label="OAT C"
                  value={leg.tempC}
                  onChange={(value) => patchLeg(leg.role, { tempC: value })}
                />
                <NumberField
                  label="QNH"
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
        {weatherStatus ? (
          <p className="mt-3 text-sm text-zinc-600">{weatherStatus}</p>
        ) : null}
      </Card>

      <Card
        title="Aircraft & loading"
        subtitle="Aircraft data, crew and payload are grouped separately. The mission masses below are the values used in each aerodrome calculation."
      >
        <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 p-4">
              <p className="text-sm font-semibold text-zinc-950">Aircraft</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Registration
                  </span>
                  <select
                    value={registration}
                    onChange={(event) =>
                      selectRegistration(
                        event.target.value as P2006TRegistration
                      )
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
                  >
                    {P2006T_REGISTRATIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <Metric label="Maximum mass" value={`${aircraft.maxMassKg} kg`} />
                <NumberField
                  label="Empty mass kg"
                  value={loading.emptyMassKg}
                  min={0}
                  onChange={(value) =>
                    setLoading((current) => ({
                      ...current,
                      emptyMassKg: value,
                    }))
                  }
                />
                <NumberField
                  label="Empty moment kgm"
                  value={loading.emptyMomentKgm}
                  min={0}
                  onChange={(value) =>
                    setLoading((current) => ({
                      ...current,
                      emptyMomentKgm: value,
                    }))
                  }
                />
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                {aircraft.emptyDataSource
                  ? `Empty data: ${aircraft.emptyDataSource}.`
                  : "Empty mass and moment remain editable until the weighing record is supplied."}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 p-4">
              <p className="text-sm font-semibold text-zinc-950">
                Crew & payload
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <NumberField
                  label="Student kg"
                  value={loading.studentKg}
                  min={0}
                  onChange={(value) =>
                    setLoading((current) => ({
                      ...current,
                      studentKg: value,
                    }))
                  }
                />
                <NumberField
                  label="Instructor kg"
                  value={loading.instructorKg}
                  min={0}
                  onChange={(value) =>
                    setLoading((current) => ({
                      ...current,
                      instructorKg: value,
                    }))
                  }
                />
                <NumberField
                  label="Rear seats kg"
                  value={loading.rearSeatsKg}
                  min={0}
                  onChange={(value) =>
                    setLoading((current) => ({
                      ...current,
                      rearSeatsKg: value,
                    }))
                  }
                />
                <NumberField
                  label="Baggage kg"
                  value={loading.baggageKg}
                  min={0}
                  onChange={(value) =>
                    setLoading((current) => ({
                      ...current,
                      baggageKg: value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 p-4">
              <p className="text-sm font-semibold text-zinc-950">Fuel loaded</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <NumberField
                  label="Total in tanks L"
                  value={loading.totalFuelInTanksL}
                  min={0}
                  max={P2006T_FUEL.totalCapacityL}
                  onChange={(value) =>
                    setLoading((current) => ({
                      ...current,
                      totalFuelInTanksL: value,
                    }))
                  }
                />
                <Metric
                  label="Usable"
                  value={`${whole(mission.fuel.usableLoadedL)} L`}
                />
                <Metric
                  label="Unusable"
                  value={`${whole(P2006T_FUEL.unusableFuelL)} L`}
                  detail="Included in empty mass"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              {mission.points.map((point) => (
                <Metric
                  key={point.label}
                  label={point.label}
                  value={`${whole(point.massKg)} kg`}
                  detail={`${whole(point.momentKgm)} kgm · ${point.cgPercentMac.toFixed(
                    1
                  )}% MAC · ${whole(point.usableFuelL)} L usable`}
                  tone={
                    point.withinMassLimit && point.withinCgLimit
                      ? "good"
                      : "warn"
                  }
                />
              ))}
            </div>
            {mission.warnings.length ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {mission.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card
        title="Fuel planning"
        subtitle="Taxi is an editable fixed allowance. All displayed quantities are operational whole-litre approximations."
      >
        <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
          <div className="rounded-2xl border border-zinc-200 p-4">
            <p className="text-sm font-semibold text-zinc-950">Planning inputs</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <NumberField
                label="Taxi fuel L"
                value={fuelTimes.taxiFuelL}
                min={0}
                onChange={(value) =>
                  setFuelTimes((current) => ({
                    ...current,
                    taxiFuelL: value,
                  }))
                }
              />
              <NumberField
                label="Climb min"
                value={fuelTimes.climbMin}
                min={0}
                onChange={(value) =>
                  setFuelTimes((current) => ({
                    ...current,
                    climbMin: value,
                  }))
                }
              />
              <NumberField
                label="Enroute min"
                value={fuelTimes.enrouteMin}
                min={0}
                onChange={(value) =>
                  setFuelTimes((current) => ({
                    ...current,
                    enrouteMin: value,
                  }))
                }
              />
              <NumberField
                label="Descent min"
                value={fuelTimes.descentMin}
                min={0}
                onChange={(value) =>
                  setFuelTimes((current) => ({
                    ...current,
                    descentMin: value,
                  }))
                }
              />
              <NumberField
                label="Alternate 1 min"
                value={fuelTimes.alternate1Min}
                min={0}
                onChange={(value) =>
                  setFuelTimes((current) => ({
                    ...current,
                    alternate1Min: value,
                  }))
                }
              />
              <NumberField
                label="Alternate 2 min"
                value={fuelTimes.alternate2Min}
                min={0}
                onChange={(value) =>
                  setFuelTimes((current) => ({
                    ...current,
                    alternate2Min: value,
                  }))
                }
              />
              <NumberField
                label="Reserve min"
                value={fuelTimes.reserveMin}
                min={0}
                onChange={(value) =>
                  setFuelTimes((current) => ({
                    ...current,
                    reserveMin: value,
                  }))
                }
              />
              <Metric
                label="AFM planning rates"
                value={`${whole(mission.fuel.climbLh)} / ${whole(
                  mission.fuel.cruiseLh
                )} L/h`}
                detail="Climb / cruise, both engines"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              ["Loaded usable", mission.fuel.usableLoadedL],
            ].map(([label, value]) => (
              <Metric
                key={String(label)}
                label={String(label)}
                value={`${whole(Number(value))} L`}
                tone={
                  label === "Loaded usable"
                    ? mission.fuel.fuelSufficient
                      ? "good"
                      : "warn"
                    : "neutral"
                }
              />
            ))}
          </div>
        </div>
      </Card>

      <Card
        title="Aerodrome performance"
        subtitle="The displayed runway percentage includes the 25% OM/POH planning margin."
      >
        {calculating ? (
          <p className="text-sm text-zinc-500">Calculating...</p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((result) =>
            result.ok ? (
              <div
                key={result.role}
                className="rounded-2xl border border-zinc-200 p-4"
              >
                <p className="font-semibold text-zinc-950">
                  {roleLabel(result.role)} · {result.icao} · RWY{" "}
                  {result.runway}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {whole(result.takeoffWeightKg)} kg · PA{" "}
                  {whole(result.paFt)} ft · OAT {whole(result.oatC)} C · wind{" "}
                  {whole(result.windFrom)}/{whole(result.windKt)} kt
                </p>
                <div className="mt-3 grid gap-2">
                  <Compliance
                    label="Takeoff"
                    available={result.todaM}
                    calculated={result.takeoff50M}
                  />
                  <Compliance
                    label="Landing"
                    available={result.ldaM}
                    calculated={result.landing50M}
                  />
                </div>
              </div>
            ) : (
              <div
                key={result.role}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              >
                <p className="font-semibold">
                  {roleLabel(result.role)} · {result.icao}
                </p>
                <p className="mt-1">{result.reason}</p>
              </div>
            )
          )}
        </div>
      </Card>

      <Card
        title="PDF contents"
        subtitle="The two official form sheets are always placed side by side. Choose whether to add the filled AFM tables and the separate kneeboard sheet."
        action={
          <button
            type="button"
            onClick={exportPdf}
            disabled={
              pdfBusy || validRows.length !== 4 || loading.emptyMassKg <= 0
            }
            className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-zinc-300"
          >
            {pdfBusy ? "Generating..." : "Export PDF"}
          </button>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setPdfOptions({
                includePerformanceTables: false,
                includeEnroutePage: false,
                includeCruisePage: false,
                includeKneeboard: false,
              })
            }
            className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold"
          >
            Form only
          </button>
          <button
            type="button"
            onClick={() =>
              setPdfOptions({
                includePerformanceTables: false,
                includeEnroutePage: false,
                includeCruisePage: false,
                includeKneeboard: true,
              })
            }
            className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold"
          >
            Form + kneeboard
          </button>
          <button
            type="button"
            onClick={() =>
              setPdfOptions({ ...DEFAULT_P2006T_PDF_OPTIONS })
            }
            className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold"
          >
            Full pack
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            checked={pdfOptions.includePerformanceTables}
            label="Aerodrome performance tables"
            description="One page per aerodrome with takeoff and landing source tables."
            onChange={(checked) =>
              setPdfOptions((current) => ({
                ...current,
                includePerformanceTables: checked,
              }))
            }
          />
          <Toggle
            checked={pdfOptions.includeEnroutePage}
            label="Enroute Vy / Vx page"
            description="One enroute page for the flight, not one page per aerodrome."
            onChange={(checked) =>
              setPdfOptions((current) => ({
                ...current,
                includeEnroutePage: checked,
              }))
            }
          />
          <Toggle
            checked={pdfOptions.includeCruisePage}
            label="Cruise table page"
            description="The surrounding cruise tables and the planned result."
            onChange={(checked) =>
              setPdfOptions((current) => ({
                ...current,
                includeCruisePage: checked,
              }))
            }
          />
          <Toggle
            checked={pdfOptions.includeKneeboard}
            label="Kneeboard sheet"
            description="A compact page with weights, fuel, Vy/Vx, ROC and runway usage."
            onChange={(checked) =>
              setPdfOptions((current) => ({
                ...current,
                includeKneeboard: checked,
              }))
            }
          />
        </div>
        {status ? <p className="mt-3 text-sm text-zinc-600">{status}</p> : null}
      </Card>
    </div>
  );
}
