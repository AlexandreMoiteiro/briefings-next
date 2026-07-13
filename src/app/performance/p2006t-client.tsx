"use client";

import Link from "next/link";
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
  type P2006TCsEaqPerformanceResult,
} from "@/lib/performance/p2006t-cs-eaq-performance";
import { getP2006TDistanceReadiness } from "@/lib/performance/p2006t-distance";
import {
  getP2006TFleetAircraft,
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";

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
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
      {children}
    </span>
  );
}

function FitBadge({
  ok,
  margin,
  percentage,
}: {
  ok: boolean;
  margin: number;
  percentage: number;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700",
      ].join(" ")}
    >
      {ok ? "OK" : "NOK"} · {margin >= 0 ? "+" : "−"}
      {Math.abs(margin).toFixed(0)} m · {percentage.toFixed(0)}%
    </span>
  );
}

function PerformanceResult({
  result,
}: {
  result: P2006TCsEaqPerformanceResult | null;
}) {
  if (!result) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        This aircraft is waiting for its own guided-table validation. Values from
        another P2006T are not reused.
      </div>
    );
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
          <FitBadge
            ok={result.takeoffOk}
            margin={result.takeoffMarginM}
            percentage={result.takeoffPct}
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
          <FitBadge
            ok={result.landingOk}
            margin={result.landingMarginM}
            percentage={result.landingPct}
          />
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        {result.sourcePages.join(" · ")}
      </p>
    </div>
  );
}

export function P2006TClient() {
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [legs, setLegs] = useState<LegState[]>(INITIAL_LEGS);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState("");

  const aircraft = getP2006TFleetAircraft(registration);
  const readiness = useMemo(() => getP2006TDistanceReadiness(), []);
  const canCalculate = registration === "CS-EAQ" && readiness.ready;

  const rows = useMemo(
    () =>
      legs.map((leg) => {
        const evaluated = evaluatePerformanceLeg(leg.input);
        const runway = evaluated.bestRunway;
        const databaseSlope = Math.max(0, runway?.slope_pc ?? 0);
        const uphillSlopePct = leg.uphillSlopeOverridePct ?? databaseSlope;
        const performance = canCalculate
          ? calculateP2006TCsEaqPerformance(evaluated, {
              surface: "paved",
              uphillSlopePct,
            })
          : null;

        return {
          leg,
          evaluated,
          databaseSlope,
          uphillSlopePct,
          performance,
        };
      }),
    [canCalculate, legs]
  );

  function patchInput(
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
    <main className="mx-auto max-w-[1500px] space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Tecnam P2006T
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
              {registration} · guided validation mode
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              S/N {aircraft.serialNumber} · {aircraft.afmDocument}. Paved runway is
              fixed for all P2006T calculations. Each registration keeps its own
              AFM tables and approval state.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <FieldLabel>Aircraft registration</FieldLabel>
              <select
                value={registration}
                onChange={(event) =>
                  setRegistration(event.target.value as P2006TRegistration)
                }
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
              >
                {P2006T_REGISTRATIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <FieldLabel>Flight date</FieldLabel>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
              />
            </label>

            <Link
              href="/admin/p2006-performance"
              className="self-end rounded-xl bg-zinc-950 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Open guided builder
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Status</p>
            <p className="mt-1 font-semibold text-zinc-950">
              {registration === "CS-EAQ" ? readiness.status : aircraft.validationStatus}
            </p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Surface</p>
            <p className="mt-1 font-semibold text-zinc-950">Paved · fixed</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Source</p>
            <p className="mt-1 font-semibold text-zinc-950">Aircraft-specific AFM</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Export</p>
            <p className="mt-1 font-semibold text-zinc-950">After builder approval</p>
          </div>
        </div>
      </section>

      {!canCalculate ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <p className="font-semibold">Performance output is intentionally blocked.</p>
          <p className="mt-1">
            The selected aircraft must be validated table-by-table in Admin first.
            The builder will preserve the original page, editable values and the
            complete interpolation trace before this page is allowed to export an
            operational sheet.
          </p>
        </section>
      ) : null}

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Airfield, MET and paved-runway conditions
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              The best runway is selected by wind. Surface is always paved; only
              the uphill slope can use database data or a visible override.
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
            {weatherStatus ? (
              <p className="mt-1 text-xs text-zinc-500">{weatherStatus}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {rows.map(
            ({
              leg,
              evaluated,
              databaseSlope,
              uphillSlopePct,
              performance,
            }) => {
              const role = leg.input.role;
              const runway = evaluated.bestRunway;

              return (
                <article
                  key={role}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <h3 className="font-semibold text-zinc-950">{role}</h3>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <FieldLabel>Aerodrome</FieldLabel>
                      <select
                        value={leg.input.icao}
                        onChange={(event) =>
                          patchInput(role, { icao: event.target.value })
                        }
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
                          patchInput(role, {
                            forecastHourUtc: Number(event.target.value),
                          })
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

                    <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                      <FieldLabel>Runway surface</FieldLabel>
                      <p className="mt-1 font-semibold text-zinc-950">Paved</p>
                    </div>

                    <label className="space-y-1">
                      <FieldLabel>Uphill slope %</FieldLabel>
                      <input
                        type="number"
                        value={uphillSlopePct}
                        min={0}
                        max={5}
                        step={0.1}
                        onChange={(event) =>
                          patchSlope(role, Number(event.target.value))
                        }
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      />
                      {leg.uphillSlopeOverridePct !== null ? (
                        <button
                          type="button"
                          onClick={() => patchSlope(role, null)}
                          className="text-xs font-medium text-sky-700"
                        >
                          Use runway data ({databaseSlope.toFixed(1)}%)
                        </button>
                      ) : null}
                    </label>
                  </div>

                  <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                    <p className="font-semibold text-zinc-950">
                      {runway
                        ? `RWY ${runway.id} · QFU ${runway.qfu.toFixed(0)}°`
                        : "Runway unavailable"}
                    </p>
                    <p className="mt-1 text-zinc-500">
                      PA {evaluated.pressureAltitudeFt.toFixed(0)} ft · DA{" "}
                      {evaluated.densityAltitudeFt.toFixed(0)} ft ·{" "}
                      {evaluated.headwindKt >= 0 ? "HW" : "TW"}{" "}
                      {Math.abs(evaluated.headwindKt).toFixed(1)} kt · XW{" "}
                      {evaluated.crosswindKt.toFixed(1)} kt{" "}
                      {evaluated.crosswindSide}
                    </p>
                  </div>

                  <PerformanceResult result={performance} />
                </article>
              );
            }
          )}
        </div>
      </section>
    </main>
  );
}
