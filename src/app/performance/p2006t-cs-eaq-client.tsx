"use client";

import { useMemo, useState } from "react";
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
  calculateP2006TCsEaqPerformance,
  P2006T_CS_EAQ,
  type P2006TRunwaySurface,
} from "@/lib/performance/p2006t-cs-eaq-performance";
import { getP2006TDistanceReadiness } from "@/lib/performance/p2006t-distance";

type SurfaceChoice = "auto" | P2006TRunwaySurface;
type LegState = {
  input: PerformanceLegInput;
  surfaceChoice: SurfaceChoice;
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
    surfaceChoice: "auto",
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
    surfaceChoice: "auto",
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
    surfaceChoice: "auto",
    uphillSlopeOverridePct: null,
  },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
      {children}
    </span>
  );
}

function Status({ ok, margin, percentage }: { ok: boolean; margin: number; percentage: number }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {ok ? "OK" : "NOK"} · {margin >= 0 ? "+" : "−"}
      {Math.abs(margin).toFixed(0)} m · {percentage.toFixed(0)}%
    </span>
  );
}

export function P2006TCsEaqClient() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [legs, setLegs] = useState<LegState[]>(INITIAL_LEGS);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState("");
  const readiness = useMemo(() => getP2006TDistanceReadiness(), []);

  const rows = useMemo(
    () =>
      legs.map((leg) => {
        const evaluated = evaluatePerformanceLeg(leg.input);
        const runway = evaluated.bestRunway;
        const databaseSurface: P2006TRunwaySurface = runway?.paved
          ? "paved"
          : "grass";
        const surface =
          leg.surfaceChoice === "auto" ? databaseSurface : leg.surfaceChoice;
        const databaseSlope = Math.max(0, runway?.slope_pc ?? 0);
        const uphillSlopePct = leg.uphillSlopeOverridePct ?? databaseSlope;

        return {
          leg,
          evaluated,
          surface,
          databaseSlope,
          uphillSlopePct,
          performance: calculateP2006TCsEaqPerformance(evaluated, {
            surface,
            uphillSlopePct,
          }),
        };
      }),
    [legs]
  );

  function patchInput(role: PerformanceLegRole, patch: Partial<PerformanceLegInput>) {
    setLegs((current) =>
      current.map((leg) =>
        leg.input.role === role
          ? { ...leg, input: { ...leg.input, ...patch } }
          : leg
      )
    );
  }

  function patchConditions(
    role: PerformanceLegRole,
    patch: Partial<Pick<LegState, "surfaceChoice" | "uphillSlopeOverridePct">>
  ) {
    setLegs((current) =>
      current.map((leg) =>
        leg.input.role === role ? { ...leg, ...patch } : leg
      )
    );
  }

  async function updateWeather() {
    setWeatherBusy(true);
    setWeatherStatus("");

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

      setWeatherStatus(
        `Weather updated: ${weather.filter((item) => item.values).length}/${legs.length}`
      );
    } catch (error) {
      console.error(error);
      setWeatherStatus("Weather update failed.");
    } finally {
      setWeatherBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Aircraft-specific performance
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-950">
              Tecnam P2006T · CS-EAQ
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              S/N {P2006T_CS_EAQ.serialNumber} · {P2006T_CS_EAQ.source}. Basic
              1180 kg configuration only; increased-MTOW supplements are excluded.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <FieldLabel>Flight date</FieldLabel>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => window.print()}
              className="self-end rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white"
            >
              Print / Save PDF
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Dataset", readiness.ready ? "Verified and active" : readiness.status],
            ["MTOW", `${P2006T_CS_EAQ.mtowKg} kg`],
            ["Takeoff table", "1180 kg · AFM 5-7"],
            ["Landing table", "930 kg · AFM 5-21"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-sky-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="mt-1 font-semibold text-zinc-950">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Conditions and results</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Automatic runway selection, MET, surface, uphill slope, wind corrections and TODA/LDA margins.
            </p>
          </div>
          <div className="text-right">
            <button
              type="button"
              onClick={updateWeather}
              disabled={weatherBusy}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold disabled:text-zinc-400"
            >
              {weatherBusy ? "Updating..." : "Update weather"}
            </button>
            {weatherStatus ? <p className="mt-1 text-xs text-zinc-500">{weatherStatus}</p> : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {rows.map(({ leg, evaluated, surface, databaseSlope, uphillSlopePct, performance }) => {
            const role = leg.input.role;
            const runway = evaluated.bestRunway;

            return (
              <article key={role} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="font-semibold text-zinc-950">{role}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <FieldLabel>Aerodrome</FieldLabel>
                    <select
                      value={leg.input.icao}
                      onChange={(event) => patchInput(role, { icao: event.target.value })}
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
                        patchInput(role, { forecastHourUtc: Number(event.target.value) })
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
                  {[
                    ["OAT °C", "tempC", leg.input.tempC, -25, 50],
                    ["QNH hPa", "qnhHpa", leg.input.qnhHpa, 900, 1050],
                    ["Wind from °", "windFrom", leg.input.windFrom, 0, 360],
                    ["Wind kt", "windKt", leg.input.windKt, 0, 50],
                  ].map(([label, key, value, min, max]) => (
                    <label key={String(key)} className="space-y-1">
                      <FieldLabel>{String(label)}</FieldLabel>
                      <input
                        type="number"
                        value={Number(value)}
                        min={Number(min)}
                        max={Number(max)}
                        onChange={(event) =>
                          patchInput(role, {
                            [String(key)]: Number(event.target.value),
                          } as Partial<PerformanceLegInput>)
                        }
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  ))}
                  <label className="space-y-1">
                    <FieldLabel>Runway surface</FieldLabel>
                    <select
                      value={leg.surfaceChoice}
                      onChange={(event) =>
                        patchConditions(role, {
                          surfaceChoice: event.target.value as SurfaceChoice,
                        })
                      }
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="auto">Auto ({surface})</option>
                      <option value="grass">Grass</option>
                      <option value="paved">Paved</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <FieldLabel>Uphill slope %</FieldLabel>
                    <input
                      type="number"
                      value={uphillSlopePct}
                      min={0}
                      max={5}
                      step={0.1}
                      onChange={(event) =>
                        patchConditions(role, {
                          uphillSlopeOverridePct: Number(event.target.value),
                        })
                      }
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                    {leg.uphillSlopeOverridePct !== null ? (
                      <button
                        type="button"
                        onClick={() =>
                          patchConditions(role, { uphillSlopeOverridePct: null })
                        }
                        className="text-xs font-medium text-sky-700"
                      >
                        Use runway data ({databaseSlope.toFixed(1)}%)
                      </button>
                    ) : null}
                  </label>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                  <p className="font-semibold text-zinc-950">
                    {runway ? `RWY ${runway.id} · QFU ${runway.qfu.toFixed(0)}°` : "Runway unavailable"}
                  </p>
                  <p className="mt-1 text-zinc-500">
                    PA {evaluated.pressureAltitudeFt.toFixed(0)} ft · DA {evaluated.densityAltitudeFt.toFixed(0)} ft · {evaluated.headwindKt >= 0 ? "HW" : "TW"} {Math.abs(evaluated.headwindKt).toFixed(1)} kt · XW {evaluated.crosswindKt.toFixed(1)} kt {evaluated.crosswindSide}
                  </p>
                </div>

                {performance.ok ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase text-zinc-500">Takeoff</p>
                      <p className="mt-1 text-sm">
                        GR <strong>{performance.takeoffGroundRollM} m</strong> · 50 ft <strong>{performance.takeoff50M} m</strong> · TODA {performance.todaM.toFixed(0)} m
                      </p>
                      <div className="mt-2">
                        <Status ok={performance.takeoffOk} margin={performance.takeoffMarginM} percentage={performance.takeoffPct} />
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase text-zinc-500">Landing</p>
                      <p className="mt-1 text-sm">
                        GR <strong>{performance.landingGroundRollM} m</strong> · 50 ft <strong>{performance.landing50M} m</strong> · LDA {performance.ldaM.toFixed(0)} m
                      </p>
                      <div className="mt-2">
                        <Status ok={performance.landingOk} margin={performance.landingMarginM} percentage={performance.landingPct} />
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500">{performance.sourcePages.join(" · ")}</p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {performance.reason}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <p className="font-semibold">AFM boundaries</p>
        <p className="mt-1">
          No extrapolation outside −25 to 50 °C or 0 to 10 000 ft pressure altitude. No downhill credit. Wind corrections apply to ground roll and 50 ft distance; paved-surface and uphill-slope corrections apply only to ground roll. The calculator uses the published 1180 kg takeoff and 930 kg landing reference tables without inventing a distance-versus-weight correction.
        </p>
      </section>
    </main>
  );
}
