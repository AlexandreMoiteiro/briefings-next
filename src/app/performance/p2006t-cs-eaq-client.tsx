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

type P2006TLegState = {
  input: PerformanceLegInput;
  surfaceChoice: SurfaceChoice;
  uphillSlopeOverridePct: number | null;
};

const initialLegs: P2006TLegState[] = [
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
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FitBadge({
  ok,
  marginM,
  percentage,
}: {
  ok: boolean;
  marginM: number;
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
      {ok ? "OK" : "NOK"} {marginM >= 0 ? "+" : "−"}
      {Math.abs(marginM).toFixed(0)} m · {percentage.toFixed(0)}%
    </span>
  );
}

export function P2006TCsEaqClient() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [legs, setLegs] = useState<P2006TLegState[]>(initialLegs);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState("");

  const readiness = useMemo(() => getP2006TDistanceReadiness(), []);

  const evaluatedLegs = useMemo(
    () =>
      legs.map((leg) => {
        const evaluated = evaluatePerformanceLeg(leg.input);
        const runway = evaluated.bestRunway;
        const databaseSurface: P2006TRunwaySurface = runway?.paved
          ? "paved"
          : "grass";
        const surface =
          leg.surfaceChoice === "auto" ? databaseSurface : leg.surfaceChoice;
        const databaseUphillSlope = Math.max(0, runway?.slope_pc ?? 0);
        const uphillSlopePct =
          leg.uphillSlopeOverridePct ?? databaseUphillSlope;

        return {
          leg,
          evaluated,
          surface,
          uphillSlopePct,
          performance: calculateP2006TCsEaqPerformance(evaluated, {
            surface,
            uphillSlopePct,
          }),
        };
      }),
    [legs]
  );

  function updateLeg(
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

  function updateSurface(role: PerformanceLegRole, value: SurfaceChoice) {
    setLegs((current) =>
      current.map((leg) =>
        leg.input.role === role ? { ...leg, surfaceChoice: value } : leg
      )
    );
  }

  function updateSlope(role: PerformanceLegRole, value: number | null) {
    setLegs((current) =>
      current.map((leg) =>
        leg.input.role === role
          ? { ...leg, uphillSlopeOverridePct: value }
          : leg
      )
    );
  }

  async function fetchWeather() {
    setWeatherBusy(true);
    setWeatherStatus("");

    try {
      const fetched = await Promise.all(
        legs.map(async (leg) => ({
          role: leg.input.role,
          met: await fetchOpenMeteoForLeg(leg.input, date),
        }))
      );

      setLegs((current) =>
        current.map((leg) => {
          const item = fetched.find(
            (candidate) => candidate.role === leg.input.role
          );

          if (!item?.met) return leg;

          return {
            ...leg,
            input: {
              ...leg.input,
              tempC: item.met.tempC,
              qnhHpa: item.met.qnhHpa,
              windFrom: item.met.windFrom,
              windKt: item.met.windKt,
            },
          };
        })
      );

      const updated = fetched.filter((item) => item.met).length;
      setWeatherStatus(`Weather updated: ${updated}/${legs.length}`);
    } catch (error) {
      console.error(error);
      setWeatherStatus("Could not update the weather.");
    } finally {
      setWeatherBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Aircraft-specific performance
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
              Tecnam P2006T · CS-EAQ
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              S/N {P2006T_CS_EAQ.serialNumber} · {P2006T_CS_EAQ.source}. The
              calculator uses only the aircraft&apos;s basic 1180 kg AFM data and
              does not mix increased-MTOW supplements.
            </p>
          </div>

          <div className="grid min-w-[290px] gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Flight date
              </span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Print / Save PDF
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Dataset</p>
            <p className="mt-1 font-semibold text-emerald-700">
              {readiness.ready ? "Verified and active" : readiness.status}
            </p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">MTOW</p>
            <p className="mt-1 font-semibold text-zinc-950">
              {P2006T_CS_EAQ.mtowKg} kg
            </p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Takeoff reference
            </p>
            <p className="mt-1 font-semibold text-zinc-950">1180 kg · page 5-7</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Landing reference
            </p>
            <p className="mt-1 font-semibold text-zinc-950">930 kg · page 5-21</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              MET, runway and AFM conditions
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Best runway is selected from the wind. Surface and uphill slope can
              use runway data or be overridden for the calculation.
            </p>
          </div>
          <div className="text-right">
            <button
              type="button"
              onClick={fetchWeather}
              disabled={weatherBusy}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400"
            >
              {weatherBusy ? "Updating weather..." : "Update weather"}
            </button>
            {weatherStatus ? (
              <p className="mt-1 text-xs text-zinc-500">{weatherStatus}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {evaluatedLegs.map(({ leg, evaluated, surface, uphillSlopePct }) => {
            const role = leg.input.role;
            const runway = evaluated.bestRunway;
            const databaseSlope = Math.max(0, runway?.slope_pc ?? 0);

            return (
              <article
                key={role}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
              >
                <h3 className="font-semibold text-zinc-950">{role}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Aerodrome"
                    value={leg.input.icao}
                    options={PERFORMANCE_ICAOS.map((icao) => ({
                      value: icao,
                      label: `${icao} · ${PERFORMANCE_AERODROMES[icao].name}`,
                    }))}
                    onChange={(value) => updateLeg(role, { icao: value })}
                  />
                  <SelectField
                    label="Forecast UTC"
                    value={String(leg.input.forecastHourUtc ?? 9)}
                    options={Array.from({ length: 24 }, (_, hour) => ({
                      value: String(hour),
                      label: `${String(hour).padStart(2, "0")}:00`,
                    }))}
                    onChange={(value) =>
                      updateLeg(role, { forecastHourUtc: Number(value) })
                    }
                  />
                  <NumberField
                    label="OAT °C"
                    value={leg.input.tempC}
                    min={-25}
                    max={50}
                    onChange={(value) => updateLeg(role, { tempC: value })}
                  />
                  <NumberField
                    label="QNH hPa"
                    value={leg.input.qnhHpa}
                    min={900}
                    max={1050}
                    onChange={(value) => updateLeg(role, { qnhHpa: value })}
                  />
                  <NumberField
                    label="Wind from °"
                    value={leg.input.windFrom}
                    min={0}
                    max={360}
                    step={10}
                    onChange={(value) => updateLeg(role, { windFrom: value })}
                  />
                  <NumberField
                    label="Wind kt"
                    value={leg.input.windKt}
                    min={0}
                    max={50}
                    onChange={(value) => updateLeg(role, { windKt: value })}
                  />
                  <SelectField
                    label="Runway surface"
                    value={leg.surfaceChoice}
                    options={[
                      { value: "auto", label: `Auto (${surface})` },
                      { value: "grass", label: "Grass" },
                      { value: "paved", label: "Paved" },
                    ]}
                    onChange={(value) =>
                      updateSurface(role, value as SurfaceChoice)
                    }
                  />
                  <div className="space-y-1.5">
                    <NumberField
                      label="Uphill slope %"
                      value={uphillSlopePct}
                      min={0}
                      max={5}
                      step={0.1}
                      onChange={(value) => updateSlope(role, value)}
                    />
                    {leg.uphillSlopeOverridePct !== null ? (
                      <button
                        type="button"
                        onClick={() => updateSlope(role, null)}
                        className="text-xs font-medium text-sky-700 hover:underline"
                      >
                        Use runway data ({databaseSlope.toFixed(1)}%)
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-600">
                  <p className="font-semibold text-zinc-950">
                    {runway
                      ? `RWY ${runway.id} · QFU ${runway.qfu.toFixed(0)}°`
                      : "Runway unavailable"}
                  </p>
                  <p className="mt-1">
                    PA {evaluated.pressureAltitudeFt.toFixed(0)} ft · DA{" "}
                    {evaluated.densityAltitudeFt.toFixed(0)} ft
                  </p>
                  <p className="mt-1">
                    {evaluated.headwindKt >= 0 ? "HW" : "TW"}{" "}
                    {Math.abs(evaluated.headwindKt).toFixed(1)} kt · XW{" "}
                    {evaluated.crosswindKt.toFixed(1)} kt{" "}
                    {evaluated.crosswindSide}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            CS-EAQ runway performance
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Wind is applied to ground roll and 50 ft distance. Paved-surface and
            uphill-slope corrections apply only to ground roll, exactly as stated
            in the AFM correction text.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-200">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-3">Leg</th>
                <th className="px-3 py-3">Conditions</th>
                <th className="px-3 py-3">TO ground roll</th>
                <th className="px-3 py-3">TO 50 ft</th>
                <th className="px-3 py-3">TODA</th>
                <th className="px-3 py-3">Takeoff fit</th>
                <th className="px-3 py-3">LDG ground roll</th>
                <th className="px-3 py-3">LDG 50 ft</th>
                <th className="px-3 py-3">LDA</th>
                <th className="px-3 py-3">Landing fit</th>
                <th className="px-3 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {evaluatedLegs.map(({ performance }) =>
                performance.ok ? (
                  <tr key={performance.role}>
                    <td className="px-3 py-3 font-semibold text-zinc-950">
                      {performance.role}
                      <span className="block text-xs font-normal text-zinc-500">
                        {performance.icao} RWY {performance.runway}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {performance.surface} · +{performance.uphillSlopePct.toFixed(1)}%
                      <span className="block text-xs text-zinc-500">
                        PA {performance.paFt.toFixed(0)} ft · OAT {performance.oatC.toFixed(0)}°C
                      </span>
                    </td>
                    <td className="px-3 py-3">{performance.takeoffGroundRollM} m</td>
                    <td className="px-3 py-3 font-semibold">{performance.takeoff50M} m</td>
                    <td className="px-3 py-3">{performance.todaM.toFixed(0)} m</td>
                    <td className="px-3 py-3">
                      <FitBadge
                        ok={performance.takeoffOk}
                        marginM={performance.takeoffMarginM}
                        percentage={performance.takeoffPct}
                      />
                    </td>
                    <td className="px-3 py-3">{performance.landingGroundRollM} m</td>
                    <td className="px-3 py-3 font-semibold">{performance.landing50M} m</td>
                    <td className="px-3 py-3">{performance.ldaM.toFixed(0)} m</td>
                    <td className="px-3 py-3">
                      <FitBadge
                        ok={performance.landingOk}
                        marginM={performance.landingMarginM}
                        percentage={performance.landingPct}
                      />
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-500">
                      {performance.sourcePages.join(" · ")}
                    </td>
                  </tr>
                ) : (
                  <tr key={performance.role}>
                    <td className="px-3 py-4 font-semibold text-zinc-950">
                      {performance.role} · {performance.icao}
                    </td>
                    <td colSpan={10} className="px-3 py-4 text-red-700">
                      {performance.reason}
                      {performance.issues?.length ? (
                        <span className="mt-1 block text-xs">
                          {performance.issues.join(" ")}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <p className="font-semibold">Calculation boundaries</p>
        <p className="mt-1">
          No extrapolation is made outside −25 to 50 °C or 0 to 10 000 ft
          pressure altitude. No downhill-slope credit is applied. The 1180 kg
          takeoff and 930 kg landing reference weights are the weights of the
          aircraft-specific published distance tables; the calculator does not
          invent a distance-versus-weight correction.
        </p>
      </section>
    </div>
  );
}
