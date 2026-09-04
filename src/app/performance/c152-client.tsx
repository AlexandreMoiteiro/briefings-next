"use client";

import { useMemo, useState } from "react";
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
import { calculateC152FuelPlanning } from "@/lib/performance/c152-fuel-planning";
import {
  buildC152PerformanceSheetPdf,
  downloadC152PerformanceSheetPdf,
} from "@/lib/pdf/c152-performance-sheet-pdf";

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

function roleLabel(role: string) {
  return role === "Alternate" ? "Alternate" : role;
}

function whole(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return String(Math.round(value));
}

function fixed(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function litersFromGal(value: number) {
  return c152GallonsToLiters(value);
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

function PerformanceBadge({
  label,
  requiredM,
  availableM,
  ok,
}: {
  label: string;
  requiredM: number | null;
  availableM: number;
  ok: boolean | null;
}) {
  const unavailable = requiredM === null || ok === null;
  return (
    <div
      className={[
        "rounded-xl border p-3 text-xs",
        unavailable
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800",
      ].join(" ")}
    >
      <p className="font-semibold">
        {label}: {unavailable ? "NO DATA" : ok ? "COMPLIANT" : "NOT COMPLIANT"}
      </p>
      <p className="mt-1">
        Required {whole(requiredM)} m · available {whole(availableM)} m
      </p>
    </div>
  );
}

export function C152Client() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [legs, setLegs] = useState<PerformanceLegInput[]>(INITIAL_LEGS);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");

  const [loading, setLoading] = useState({
    pilotKg: 0,
    passengerKg: 0,
    fuelL: Math.round(C152_CS_AVC.standardFuelUsableL * 10) / 10,
    baggageArea1Kg: 0,
    baggageArea2Kg: 0,
    startTaxiRunupL:
      Math.round(c152GallonsToLiters(C152_CS_AVC.defaultStartTaxiRunupGal) * 10) / 10,
  });

  const [fuelDraft, setFuelDraft] = useState({
    startupTaxiMin: 10,
    climbMin: 0,
    climbFuelGal: 0,
    enrouteMin: 0,
    enrouteFuelGal: 0,
    descentMin: 0,
    descentFuelGal: 0,
    alternateMin: 0,
    alternateFuelGal: 0,
    reserveFuelGal: 3.8,
  });

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

  const evaluatedLegs = useMemo(
    () => legs.map((leg) => evaluatePerformanceLeg(leg)),
    [legs]
  );

  const performanceRows = useMemo(
    () => evaluatedLegs.map((result) => calculateC152Performance(result)),
    [evaluatedLegs]
  );

  const fuelPlan = useMemo(
    () =>
      calculateC152FuelPlanning({
        ...fuelDraft,
        startupTaxiGal: c152LitersToGallons(loading.startTaxiRunupL),
        loadedRampFuelGal: c152LitersToGallons(loading.fuelL),
      }),
    [fuelDraft, loading.fuelL, loading.startTaxiRunupL]
  );

  function updateLeg(index: number, patch: Partial<PerformanceLegInput>) {
    setLegs((current) =>
      current.map((leg, legIndex) => (legIndex === index ? { ...leg, ...patch } : leg))
    );
  }

  async function updateWeather() {
    setWeatherBusy(true);
    setWeatherStatus("");
    try {
      const fetched = await Promise.all(
        legs.map(async (leg) => ({
          weather: await fetchOpenMeteoForLeg(leg, date),
        }))
      );
      let updated = 0;
      setLegs((current) =>
        current.map((leg, index) => {
          const weather = fetched[index]?.weather;
          if (!weather) return leg;
          updated += 1;
          return {
            ...leg,
            tempC: weather.tempC,
            qnhHpa: weather.qnhHpa,
            windFrom: weather.windFrom,
            windKt: weather.windKt,
          };
        })
      );
      setWeatherStatus(`${updated}/${legs.length} aeródromos atualizados por Open-Meteo.`);
    } catch (error) {
      setWeatherStatus(
        error instanceof Error ? error.message : "Falha ao obter meteorologia."
      );
    } finally {
      setWeatherBusy(false);
    }
  }

  async function exportOfficialSheet() {
    setPdfBusy(true);
    setPdfStatus("");
    try {
      const bytes = await buildC152PerformanceSheetPdf({
        registration: C152_CS_AVC.registration,
        date,
        weightBalance: wb,
        performanceResults: evaluatedLegs,
        performanceRows,
        fuelPlan,
      });
      downloadC152PerformanceSheetPdf(bytes, C152_CS_AVC.registration, date);
      setPdfStatus("RVP.CFI.066.02 preenchido e preparado para download.");
    } catch (error) {
      setPdfStatus(error instanceof Error ? error.message : "Falha ao gerar PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Cessna 152
            </p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-950">
              CS-AVC · S/N {C152_CS_AVC.serialNumber}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-700">
              M&B, aerodrome performance, fuel planning e export direto da folha oficial
              RVP.CFI.066.02 em duas páginas.
            </p>
          </div>
          <div className="grid min-w-64 grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">BEW</p>
              <p className="mt-1 font-semibold text-zinc-950">
                {C152_CS_AVC.basicEmptyWeightLb} lb @ {C152_CS_AVC.basicEmptyCgDisplayIn.toFixed(2)} in
              </p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">MTOW / MLW</p>
              <p className="mt-1 font-semibold text-zinc-950">
                {C152_CS_AVC.maxTakeoffWeightLb} lb
              </p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">Usable fuel</p>
              <p className="mt-1 font-semibold text-zinc-950">
                24.5 US gal · {C152_CS_AVC.standardFuelUsableL.toFixed(1)} L
              </p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">X-wind demonstrated</p>
              <p className="mt-1 font-semibold text-zinc-950">
                {C152_CS_AVC.maxDemonstratedCrosswindKt} kt
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-950">1. Mass & Balance</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Inputs em kg/L; cálculo e PDF em lb, in e lb·in, como a folha C152.
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
            onChange={(pilotKg) => setLoading((value) => ({ ...value, pilotKg }))}
          />
          <NumberField
            label="Passenger (kg)"
            value={loading.passengerKg}
            min={0}
            step={0.5}
            onChange={(passengerKg) => setLoading((value) => ({ ...value, passengerKg }))}
          />
          <NumberField
            label="Usable fuel (L)"
            value={loading.fuelL}
            min={0}
            max={Math.round(C152_CS_AVC.standardFuelUsableL * 10) / 10}
            step={0.5}
            onChange={(fuelL) => setLoading((value) => ({ ...value, fuelL }))}
          />
          <NumberField
            label="Baggage Area 1 (kg)"
            value={loading.baggageArea1Kg}
            min={0}
            step={0.5}
            onChange={(baggageArea1Kg) =>
              setLoading((value) => ({ ...value, baggageArea1Kg }))
            }
          />
          <NumberField
            label="Baggage Area 2 (kg)"
            value={loading.baggageArea2Kg}
            min={0}
            step={0.5}
            onChange={(baggageArea2Kg) =>
              setLoading((value) => ({ ...value, baggageArea2Kg }))
            }
          />
          <NumberField
            label="Start / taxi / run-up (L)"
            value={loading.startTaxiRunupL}
            min={0}
            max={loading.fuelL}
            step={0.1}
            onChange={(startTaxiRunupL) =>
              setLoading((value) => ({ ...value, startTaxiRunupL }))
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
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {wb.rows.map((row) => (
                <tr key={row.label}>
                  <td className="px-3 py-2 font-medium">{row.label}</td>
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
            <p className="mt-2 text-xl font-bold text-zinc-950">
              {fixed(wb.ramp.weightLb, 1)} lb · CG {fixed(wb.ramp.cgIn, 2)} in
            </p>
            <p className="mt-1 text-xs text-zinc-600">
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
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Takeoff after start/taxi/run-up
            </p>
            <p className="mt-2 text-xl font-bold text-zinc-950">
              {fixed(wb.takeoff.weightLb, 1)} lb · CG {fixed(wb.takeoff.cgIn, 2)} in
            </p>
            <p className="mt-1 text-xs text-zinc-700">
              CG envelope {fixed(wb.takeoff.forwardLimitIn, 2)}–{fixed(wb.takeoff.aftLimitIn, 2)} in · remaining fuel {fixed(c152GallonsToLiters(wb.takeoffFuelGal), 1)} L
            </p>
          </div>
        </div>

        {wb.warnings.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">M&B checks</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {wb.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-950">2. Aerodromes & weather</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Departure, Arrival e Alternate alimentam diretamente a página 2 da folha.
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
              onClick={updateWeather}
              disabled={weatherBusy}
              className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
            >
              {weatherBusy ? "Updating…" : "Update weather"}
            </button>
          </div>
        </div>

        {weatherStatus ? <p className="mt-3 text-xs text-zinc-600">{weatherStatus}</p> : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {legs.map((leg, index) => (
            <div key={leg.role} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="font-semibold text-zinc-950">{roleLabel(leg.role)}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <label className="space-y-1 sm:col-span-2 lg:col-span-1 xl:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Aerodrome
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
                  label="OAT °C"
                  value={leg.tempC}
                  onChange={(tempC) => updateLeg(index, { tempC })}
                />
                <NumberField
                  label="QNH hPa"
                  value={leg.qnhHpa}
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
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-zinc-950">3. Aerodrome performance</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Raw POH values are kept separate from the Briefings 125% planning check.
          </p>
        </div>

        <div className="mt-5 space-y-5">
          {performanceRows.map((row, index) => {
            const leg = legs[index];
            if (!row) {
              return (
                <div
                  key={leg.role}
                  className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                >
                  {roleLabel(leg.role)}: performance unavailable for the selected condition.
                </div>
              );
            }
            return (
              <div key={row.role} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-bold text-zinc-950">
                      {roleLabel(row.role)} · {row.icao} {row.label}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-600">
                      RWY {row.runway} · TODA {whole(row.todaM)} m · LDA {whole(row.ldaM)} m
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-zinc-800">
                    ROC {whole(row.rocFpm)} ft/min
                  </p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-zinc-50 p-3 text-xs">
                    <p className="font-semibold text-zinc-950">Takeoff ground roll</p>
                    <p className="mt-1 text-lg font-bold">{whole(row.takeoffGroundRollM)} m</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-3 text-xs">
                    <p className="font-semibold text-zinc-950">TODR over 50 ft</p>
                    <p className="mt-1 text-lg font-bold">{whole(row.takeoff50FtM)} m</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-3 text-xs">
                    <p className="font-semibold text-zinc-950">Landing ground roll</p>
                    <p className="mt-1 text-lg font-bold">{whole(row.landingGroundRollM)} m</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-3 text-xs">
                    <p className="font-semibold text-zinc-950">LDR over 50 ft</p>
                    <p className="mt-1 text-lg font-bold">{whole(row.landing50FtM)} m</p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <PerformanceBadge
                    label="POH takeoff"
                    requiredM={row.takeoff50FtM}
                    availableM={row.todaM}
                    ok={row.takeoffPohOk}
                  />
                  <PerformanceBadge
                    label="App 125% takeoff"
                    requiredM={row.takeoff125M}
                    availableM={row.todaM}
                    ok={row.takeoff125Ok}
                  />
                  <PerformanceBadge
                    label="POH landing"
                    requiredM={row.landing50FtM}
                    availableM={row.ldaM}
                    ok={row.landingPohOk}
                  />
                  <PerformanceBadge
                    label="App 125% landing"
                    requiredM={row.landing125M}
                    availableM={row.ldaM}
                    ok={row.landing125Ok}
                  />
                </div>

                {row.warnings.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                    <ul className="list-disc space-y-1 pl-4">
                      {row.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-950">4. Fuel planning</h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-600">
              Os tempos e consumos são editáveis e entram diretamente nas linhas (1)–(11) da página 2.
              Trip Fuel, Contingency 5%, Required Ramp Fuel e Extra são calculados automaticamente.
            </p>
          </div>
          <StatusBadge ok={fuelPlan.fuelOk} label="Ramp fuel" />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <NumberField
            label="Start / taxi time min"
            value={fuelDraft.startupTaxiMin}
            min={0}
            onChange={(startupTaxiMin) =>
              setFuelDraft((value) => ({ ...value, startupTaxiMin }))
            }
          />
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <p className="font-semibold text-zinc-950">Start / taxi fuel</p>
            <p className="mt-1 text-lg font-bold">{fixed(fuelPlan.startupTaxiGal, 1)} US gal</p>
            <p className="mt-1 text-zinc-500">{fixed(litersFromGal(fuelPlan.startupTaxiGal), 1)} L · synced with M&B</p>
          </div>
          <NumberField
            label="Climb time min"
            value={fuelDraft.climbMin}
            min={0}
            onChange={(climbMin) => setFuelDraft((value) => ({ ...value, climbMin }))}
          />
          <NumberField
            label="Climb fuel US gal"
            value={fuelDraft.climbFuelGal}
            min={0}
            step={0.1}
            onChange={(climbFuelGal) =>
              setFuelDraft((value) => ({ ...value, climbFuelGal }))
            }
          />
          <NumberField
            label="Enroute time min"
            value={fuelDraft.enrouteMin}
            min={0}
            onChange={(enrouteMin) => setFuelDraft((value) => ({ ...value, enrouteMin }))}
          />
          <NumberField
            label="Enroute fuel US gal"
            value={fuelDraft.enrouteFuelGal}
            min={0}
            step={0.1}
            onChange={(enrouteFuelGal) =>
              setFuelDraft((value) => ({ ...value, enrouteFuelGal }))
            }
          />
          <NumberField
            label="Descent time min"
            value={fuelDraft.descentMin}
            min={0}
            onChange={(descentMin) => setFuelDraft((value) => ({ ...value, descentMin }))}
          />
          <NumberField
            label="Descent fuel US gal"
            value={fuelDraft.descentFuelGal}
            min={0}
            step={0.1}
            onChange={(descentFuelGal) =>
              setFuelDraft((value) => ({ ...value, descentFuelGal }))
            }
          />
          <NumberField
            label="Alternate time min"
            value={fuelDraft.alternateMin}
            min={0}
            onChange={(alternateMin) =>
              setFuelDraft((value) => ({ ...value, alternateMin }))
            }
          />
          <NumberField
            label="Alternate fuel US gal"
            value={fuelDraft.alternateFuelGal}
            min={0}
            step={0.1}
            onChange={(alternateFuelGal) =>
              setFuelDraft((value) => ({ ...value, alternateFuelGal }))
            }
          />
          <NumberField
            label="Reserve 45 min fuel US gal"
            value={fuelDraft.reserveFuelGal}
            min={0}
            step={0.1}
            onChange={(reserveFuelGal) =>
              setFuelDraft((value) => ({ ...value, reserveFuelGal }))
            }
          />
        </div>

        <p className="mt-3 text-xs leading-5 text-zinc-500">
          POH Figure 5-6 specifies 0.8 US gal for engine start, taxi and takeoff allowance. The initial
          reserve value of 3.8 US gal corresponds approximately to 45 min at 5.1 GPH, the Figure 5-7
          standard-temperature value at 4000 ft / 2300 RPM; edit it for the planned cruise setting.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <p className="font-semibold text-zinc-950">Trip</p>
            <p className="mt-1 text-lg font-bold">{whole(fuelPlan.tripMin)} min · {fixed(fuelPlan.tripFuelGal, 1)} gal</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <p className="font-semibold text-zinc-950">Contingency 5%</p>
            <p className="mt-1 text-lg font-bold">{fixed(fuelPlan.contingencyFuelGal, 1)} gal</p>
          </div>
          <div
            className={[
              "rounded-xl border p-3 text-xs",
              fuelPlan.fuelOk
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50",
            ].join(" ")}
          >
            <p className="font-semibold text-zinc-950">Required ramp</p>
            <p className="mt-1 text-lg font-bold">{fixed(fuelPlan.requiredRampFuelGal, 1)} gal</p>
            <p className="mt-1 text-zinc-500">{fixed(litersFromGal(fuelPlan.requiredRampFuelGal), 1)} L</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <p className="font-semibold text-zinc-950">Loaded usable</p>
            <p className="mt-1 text-lg font-bold">{fixed(fuelPlan.loadedRampFuelGal, 1)} gal</p>
            <p className="mt-1 text-zinc-500">{fixed(loading.fuelL, 1)} L</p>
          </div>
          <div
            className={[
              "rounded-xl border p-3 text-xs",
              fuelPlan.extraFuelGal >= 0
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50",
            ].join(" ")}
          >
            <p className="font-semibold text-zinc-950">
              {fuelPlan.extraFuelGal >= 0 ? "Extra" : "Shortfall"}
            </p>
            <p className="mt-1 text-lg font-bold">{fixed(Math.abs(fuelPlan.extraFuelGal), 1)} gal</p>
          </div>
        </div>

        {fuelPlan.warnings.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <ul className="list-disc space-y-1 pl-5">
              {fuelPlan.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
              RVP.CFI.066.02
            </p>
            <h2 className="mt-1 text-lg font-bold text-zinc-950">5. Export official C152 sheet</h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-700">
              Gera as duas páginas sobre a folha Sevenair Academy: loading table + CG graph, depois
              airfield/performance data e fuel planning.
            </p>
          </div>
          <button
            type="button"
            onClick={exportOfficialSheet}
            disabled={pdfBusy}
            className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:bg-zinc-300"
          >
            {pdfBusy ? "Generating PDF…" : "Export RVP.CFI.066.02 PDF"}
          </button>
        </div>
        {pdfStatus ? <p className="mt-3 text-sm text-zinc-700">{pdfStatus}</p> : null}
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-950">6. Source / operational notes</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700">
          <li>
            Takeoff table: 1670 lb, flaps 10°, full throttle before brake release, paved level dry
            runway, zero-wind baseline; wind correction follows the POH note.
          </li>
          <li>
            Landing table: 1670 lb, flaps 30°, power off, maximum braking, paved level dry runway,
            zero-wind baseline; wind correction follows the POH note.
          </li>
          <li>
            Tailwind correction is only calculated through 10 kt. Above that the result is withheld,
            rather than extrapolated.
          </li>
          <li>
            Dry-grass corrections are not applied automatically because the current runway database
            does not establish that a non-paved runway is dry grass.
          </li>
          <li>
            The 125% boxes are a Briefings planning margin and remain separate from the raw POH
            values written into RVP.CFI.066.02.
          </li>
          <li>
            CS-AVC Sensenich 72CKS6 supplement: maximum RPM except takeoff and climb is {C152_CS_AVC.cruiseMaxRpmExceptTakeoffClimb} RPM.
          </li>
          <li>
            This module supports planning. POH/AFM, supplements, current aircraft mass & balance
            record and operator procedures remain controlling.
          </li>
        </ul>
      </section>
    </div>
  );
}
