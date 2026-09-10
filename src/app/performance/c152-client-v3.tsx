"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatOperationalMinutes } from "@/lib/operational-duration";
import {
  C152_NAVLOG_PRESET,
  C152_PERFORMANCE_PRESET,
} from "@/lib/c152-operational-presets";
import {
  PERFORMANCE_AERODROMES,
  PERFORMANCE_ICAOS,
} from "@/lib/performance/aerodromes";
import {
  evaluatePerformanceLeg,
  type PerformanceLegInput,
} from "@/lib/performance/aerodrome-performance";
import { buildC152FlightCgTrack } from "@/lib/performance/c152-flight-cg";
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

const LITERS_PER_US_GALLON = 3.785411784;
const KG_PER_LB = 0.45359237;
const FT_PER_M = 3.280839895;
const M_PER_FT = 0.3048;

const FULL_USABLE_FUEL_L =
  Math.round(C152_CS_AVC.standardFuelUsableL * 10) / 10;
const START_TAXI_RUNUP_L =
  Math.round(
    c152GallonsToLiters(C152_PERFORMANCE_PRESET.startTaxiTakeoffAllowanceGal) *
      10
  ) / 10;

type LoadingState = {
  pilotKg: number;
  passengerKg: number;
  fuelL: number;
  baggageArea1Kg: number;
  baggageArea2Kg: number;
  startTaxiRunupL: number;
};

function whole(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return String(Math.round(value));
}

function fixed(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(digits);
}

function operationalFuel(valueL: number) {
  const liters = Math.max(0, Math.round(Number(valueL || 0)));
  const gallons = Math.max(0, Math.round(liters / LITERS_PER_US_GALLON));
  return `${liters} L (${gallons} US gal)`;
}

function exactFuel(valueL: number) {
  const liters = Math.max(0, Number(valueL || 0));
  return `${liters.toFixed(1)} L (${(liters / LITERS_PER_US_GALLON).toFixed(
    1
  )} US gal)`;
}

function fuelRate(valueLh: number) {
  const litersPerHour = Math.max(0, Number(valueLh || 0));
  return `${litersPerHour.toFixed(1)} L/h (${(
    litersPerHour / LITERS_PER_US_GALLON
  ).toFixed(1)} US gal/h)`;
}

function weightDual(valueLb: number, digits = 1) {
  const pounds = Math.max(0, Number(valueLb || 0));
  return `${pounds.toFixed(digits)} lb (${(pounds * KG_PER_LB).toFixed(
    digits
  )} kg)`;
}

function distanceDual(valueM: number | null | undefined) {
  if (valueM === null || valueM === undefined || !Number.isFinite(valueM)) {
    return "-";
  }
  const meters = Math.round(valueM);
  return `${meters} m (${Math.round(meters * FT_PER_M)} ft)`;
}

function altitudeDual(valueFt: number | null | undefined) {
  if (valueFt === null || valueFt === undefined || !Number.isFinite(valueFt)) {
    return "-";
  }
  const feet = Math.round(valueFt);
  return `${feet} ft (${Math.round(feet * M_PER_FT)} m)`;
}

function rocDual(valueFpm: number | null | undefined) {
  if (valueFpm === null || valueFpm === undefined || !Number.isFinite(valueFpm)) {
    return "-";
  }
  const feetPerMinute = Math.round(valueFpm);
  return `${feetPerMinute} ft/min (${Math.round(
    feetPerMinute * M_PER_FT
  )} m/min)`;
}

function roleLabel(role: string) {
  return role === "Alternate" ? "Alternate" : role;
}

function parsePlanningMinutes(value: string) {
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return Math.max(0, Math.round(Number(text)));
  }

  const clock = text.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  const duration = text.match(/^(?:(\d+)\s*h)?(?:\s*(\d+)\s*min)?$/);
  if (duration && (duration[1] || duration[2])) {
    return Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0);
  }

  return null;
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
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
      {hint ? (
        <span className="block text-[11px] font-medium text-zinc-500">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function DurationInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => formatOperationalMinutes(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(formatOperationalMinutes(value));
  }, [value]);

  function commit() {
    const parsed = parsePlanningMinutes(draft);
    if (parsed === null) {
      setDraft(formatOperationalMinutes(value));
      return;
    }
    onChange(parsed);
    setDraft(formatOperationalMinutes(parsed));
  }

  return (
    <input
      type="text"
      inputMode="text"
      value={draft}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
      }}
      className="w-full min-w-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium outline-none focus:border-zinc-500"
    />
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
      <p className="mt-1 leading-5">
        POH {distanceDual(requiredM)} · 125% {distanceDual(marginRequired)} ·
        available {distanceDual(availableM)}
      </p>
    </div>
  );
}

function CgStateCard({
  label,
  point,
}: {
  label: "TO" | "LDG" | "ALT";
  point:
    | {
        weightLb: number;
        cgIn: number;
        forwardLimitIn: number;
        aftLimitIn: number;
        withinEnvelope: boolean;
      }
    | undefined;
}) {
  const ok = Boolean(point?.withinEnvelope);

  return (
    <div
      className={[
        "rounded-2xl border p-4",
        point
          ? ok
            ? "border-emerald-200 bg-emerald-50"
            : "border-red-200 bg-red-50"
          : "border-amber-200 bg-amber-50",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-700">
          {label}
        </p>
        <span className="text-[11px] font-semibold text-zinc-500">
          {point ? (ok ? "IN ENVELOPE" : "CHECK") : "UNAVAILABLE"}
        </span>
      </div>
      {point ? (
        <>
          <p className="mt-2 text-lg font-bold text-zinc-950">
            {weightDual(point.weightLb)} · CG {fixed(point.cgIn, 2)} in
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Limits {fixed(point.forwardLimitIn, 2)}-{fixed(point.aftLimitIn, 2)} in
          </p>
        </>
      ) : null}
    </div>
  );
}

function FuelRow({
  label,
  minutes,
  fuelL,
  onMinutesChange,
  strong = false,
  total = false,
}: {
  label: string;
  minutes: number;
  fuelL: number;
  onMinutesChange?: (value: number) => void;
  strong?: boolean;
  total?: boolean;
}) {
  return (
    <tr
      className={total ? "bg-emerald-50" : strong ? "bg-zinc-50" : "bg-white"}
    >
      <td
        className={[
          "border-b border-r border-zinc-200 px-4 py-3",
          strong || total ? "font-semibold" : "",
        ].join(" ")}
      >
        {label}
      </td>
      <td className="border-b border-r border-zinc-200 px-3 py-2 text-center">
        {onMinutesChange ? (
          <DurationInput value={minutes} onChange={onMinutesChange} />
        ) : (
          <span className="font-medium">{formatOperationalMinutes(minutes)}</span>
        )}
      </td>
      <td className="border-b border-zinc-200 px-4 py-3 text-center font-semibold">
        {operationalFuel(fuelL)}
      </td>
    </tr>
  );
}

function englishWarning(message: string) {
  let match = message.match(
    /^Fora da tabela do POH: PA (.+) ft \/ OAT (.+) °C \(máx\. (.+) ft \/ (.+) °C\)\.$/
  );
  if (match) {
    return `Outside POH table: PA ${match[1]} ft / OAT ${match[2]} °C (max ${match[3]} ft / ${match[4]} °C).`;
  }

  if (
    message ===
    "PA abaixo de sea level: usada a linha SL (0 ft), sem extrapolação."
  ) {
    return "PA below sea level: the SL (0 ft) row is used without extrapolation.";
  }
  if (
    message ===
    "OAT abaixo de 0 °C: usada a coluna 0 °C, de forma conservadora e sem extrapolação."
  ) {
    return "OAT below 0 °C: the 0 °C column is used conservatively without extrapolation.";
  }

  match = message.match(
    /^Componente de cauda (.+) kt excede os 10 kt cobertos pela nota do POH; distância não calculada por extrapolação\.$/
  );
  if (match) {
    return `Tailwind component ${match[1]} kt exceeds the 10 kt covered by the POH note; distance is not extrapolated.`;
  }

  match = message.match(
    /^ROC fora da tabela do POH: PA (.+) ft \/ OAT (.+) °C \(máx\. (.+) ft \/ (.+) °C\)\.$/
  );
  if (match) {
    return `ROC outside POH table: PA ${match[1]} ft / OAT ${match[2]} °C (max ${match[3]} ft / ${match[4]} °C).`;
  }

  if (message === "ROC: usada a linha SL para PA abaixo de 0 ft.") {
    return "ROC: the SL row is used for PA below 0 ft.";
  }
  if (message === "ROC: usada a coluna -20 °C, sem extrapolação.") {
    return "ROC: the -20 °C column is used without extrapolation.";
  }

  match = message.match(/^Fuel utilizável excede (.+) US gal \(standard tanks\)\.$/);
  if (match) return `Usable fuel exceeds ${match[1]} US gal (standard tanks).`;

  if (
    message ===
    "Limite de bagagem excedido: Area 1 120 lb, Area 2 40 lb, combinado 120 lb."
  ) {
    return "Baggage limit exceeded: Area 1 120 lb, Area 2 40 lb, combined 120 lb.";
  }

  match = message.match(/^Takeoff weight (.+) lb excede MTOW (.+) lb\.$/);
  if (match) {
    return `Takeoff weight ${match[1]} lb exceeds MTOW ${match[2]} lb.`;
  }

  match = message.match(/^CG de descolagem (.+) in fora de (.+)–(.+) in\.$/);
  if (match) {
    return `Takeoff CG ${match[1]} in is outside ${match[2]}-${match[3]} in.`;
  }

  if (
    message ===
    "Fuel de start/taxi/run-up superior ao fuel carregado; limitado ao fuel disponível."
  ) {
    return "Start/taxi/run-up fuel exceeds loaded fuel and is limited to the available fuel.";
  }
  if (
    message ===
    "Ramp weight acima de 1670 lb: confirmar que o combustível previsto para start/taxi/run-up reduz o peso para MTOW antes da descolagem."
  ) {
    return "Ramp weight is above 1670 lb; confirm start/taxi/run-up burn reduces takeoff weight to MTOW.";
  }
  if (
    message ===
    "A tabela base assume pista pavimentada, nivelada e seca. A pista está marcada como não pavimentada; nenhuma correção de superfície foi aplicada automaticamente."
  ) {
    return "The base table assumes a paved, level, dry runway. This runway is marked non-paved; no surface correction is applied automatically.";
  }

  match = message.match(
    /^A tabela base assume pista nivelada\. Slope (.+)% não foi corrigido automaticamente\.$/
  );
  if (match) {
    return `The base table assumes a level runway. Slope ${match[1]}% is not corrected automatically.`;
  }

  match = message.match(
    /^Componente de vento cruzado (.+) kt excede o máximo demonstrado de (.+) kt\.$/
  );
  if (match) {
    return `Crosswind component ${match[1]} kt exceeds the demonstrated value of ${match[2]} kt.`;
  }

  return message;
}

export function C152ClientV3() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [legs, setLegs] = useState<PerformanceLegInput[]>(INITIAL_LEGS);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const [loading, setLoading] = useState<LoadingState>({
    pilotKg: Number(C152_PERFORMANCE_PRESET.pilotKg),
    passengerKg: Number(C152_PERFORMANCE_PRESET.passengerKg),
    fuelL: FULL_USABLE_FUEL_L,
    baggageArea1Kg: Number(C152_PERFORMANCE_PRESET.baggageArea1Kg),
    baggageArea2Kg: Number(C152_PERFORMANCE_PRESET.baggageArea2Kg),
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
    () =>
      performanceResults.map((result) => calculateC152Performance(result)),
    [performanceResults]
  );

  const cgTrack = useMemo(
    () =>
      buildC152FlightCgTrack(
        wb,
        fuelPlan.tripFuelL,
        fuelPlan.alternateFuelL
      ),
    [wb, fuelPlan.tripFuelL, fuelPlan.alternateFuelL]
  );

  const cgByLabel = useMemo(
    () => Object.fromEntries(cgTrack.map((point) => [point.label, point])),
    [cgTrack]
  ) as Partial<Record<"TO" | "LDG" | "ALT", (typeof cgTrack)[number]>>;

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
      setWeatherStatus(`${updatedCount}/${legs.length} airfields updated.`);
    } catch (error) {
      setWeatherStatus(
        error instanceof Error ? error.message : "Weather update failed."
      );
    } finally {
      setWeatherBusy(false);
    }
  }

  async function exportOfficialPdf() {
    setPdfBusy(true);
    setPdfError("");
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
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "PDF export failed.");
    } finally {
      setPdfBusy(false);
    }
  }

  const allWarnings = Array.from(
    new Set(
      [
        ...wb.warnings,
        ...performanceRows.flatMap((row) => row?.warnings ?? []),
      ].map(englishWarning)
    )
  );

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
          </div>
          <div className="grid min-w-64 grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">BEW</p>
              <p className="mt-1 font-semibold">
                {weightDual(C152_CS_AVC.basicEmptyWeightLb)} @{" "}
                {C152_CS_AVC.basicEmptyCgDisplayIn.toFixed(2)} in
              </p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">MTOW / MLW</p>
              <p className="mt-1 font-semibold">
                {weightDual(C152_CS_AVC.maxTakeoffWeightLb, 0)}
              </p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">Usable fuel</p>
              <p className="mt-1 font-semibold">{exactFuel(FULL_USABLE_FUEL_L)}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <p className="text-zinc-500">Demonstrated crosswind</p>
              <p className="mt-1 font-semibold">
                {C152_CS_AVC.maxDemonstratedCrosswindKt} kt
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-bold text-zinc-950">
            1. Mass &amp; Balance
          </h2>
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
            hint={`${fixed(c152KgToLb(loading.pilotKg), 1)} lb`}
            onChange={(pilotKg) =>
              setLoading((current) => ({ ...current, pilotKg }))
            }
          />
          <NumberField
            label="Passenger (kg)"
            value={loading.passengerKg}
            min={0}
            step={0.5}
            hint={`${fixed(c152KgToLb(loading.passengerKg), 1)} lb`}
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
            hint={exactFuel(loading.fuelL)}
            onChange={updateLoadedFuel}
          />
          <NumberField
            label="Baggage Area 1 (kg)"
            value={loading.baggageArea1Kg}
            min={0}
            step={0.5}
            hint={`${fixed(c152KgToLb(loading.baggageArea1Kg), 1)} lb`}
            onChange={(baggageArea1Kg) =>
              setLoading((current) => ({ ...current, baggageArea1Kg }))
            }
          />
          <NumberField
            label="Baggage Area 2 (kg)"
            value={loading.baggageArea2Kg}
            min={0}
            step={0.5}
            hint={`${fixed(c152KgToLb(loading.baggageArea2Kg), 1)} lb`}
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
            hint={exactFuel(loading.startTaxiRunupL)}
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
                <th className="px-3 py-2 font-semibold">Weight</th>
                <th className="px-3 py-2 font-semibold">Arm in</th>
                <th className="px-3 py-2 font-semibold">Moment /1000</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {wb.rows.map((row) => (
                <tr key={row.label}>
                  <td className="px-3 py-2 font-medium text-zinc-800">
                    {row.label}
                  </td>
                  <td className="px-3 py-2">{weightDual(row.weightLb)}</td>
                  <td className="px-3 py-2">{fixed(row.armIn, 2)}</td>
                  <td className="px-3 py-2">
                    {fixed(row.momentLbIn / 1000, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <CgStateCard label="TO" point={cgByLabel.TO} />
          <CgStateCard label="LDG" point={cgByLabel.LDG} />
          <CgStateCard label="ALT" point={cgByLabel.ALT} />
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="text-lg font-bold text-zinc-950">
            2. Aerodromes &amp; Weather
          </h2>
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
              {weatherBusy ? "Updating..." : "Update weather"}
            </button>
          </div>
        </div>

        {weatherStatus ? (
          <p className="mt-3 text-xs text-zinc-600">{weatherStatus}</p>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {legs.map((leg, index) => {
            const result = performanceResults[index];
            return (
              <div
                key={leg.role}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
              >
                <p className="font-semibold text-zinc-950">
                  {roleLabel(leg.role)}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Airfield
                    </span>
                    <select
                      value={leg.icao}
                      onChange={(event) =>
                        updateLeg(index, { icao: event.target.value })
                      }
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
                    onChange={(forecastHourUtc) =>
                      updateLeg(index, { forecastHourUtc })
                    }
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
                    RWY {result.bestRunway?.id ?? "-"} · PA{" "}
                    {altitudeDual(result.pressureAltitudeFt)} · DA{" "}
                    {altitudeDual(result.densityAltitudeFt)} · XW{" "}
                    {fixed(result.crosswindKt, 1)} kt
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-950">
          3. Aerodrome Performance
        </h2>

        <div className="mt-5 space-y-4">
          {performanceRows.map((row, index) => {
            const result = performanceResults[index];
            if (!row || !result.aerodrome) {
              return (
                <div
                  key={legs[index].role}
                  className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                >
                  {roleLabel(legs[index].role)}: performance unavailable for the
                  selected conditions.
                </div>
              );
            }

            return (
              <div
                key={row.role}
                className="rounded-2xl border border-zinc-200 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-bold text-zinc-950">
                      {roleLabel(row.role)} · {row.icao} · RWY {row.runway}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-600">
                      TODA {distanceDual(row.todaM)} · LDA{" "}
                      {distanceDual(row.ldaM)} · ROC {rocDual(row.rocFpm)}
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-zinc-700">
                    HW {fixed(row.headwindKt, 1)} kt · XW{" "}
                    {fixed(row.crosswindKt, 1)} kt
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
                    {row.warnings.map(englishWarning).join(" · ")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-950">4. Fuel Planning</h2>

        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-950">
                Planning consumption
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Fuel loaded: {operationalFuel(fuelPlan.fuelLoadedL)}
              </p>
            </div>
            <label className="flex flex-wrap items-center justify-end gap-2">
              <input
                type="number"
                min={0}
                step={0.5}
                value={fuelPlan.rateLh}
                onChange={(event) =>
                  updateFuelPlan("rateLh", Number(event.target.value))
                }
                className="w-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium outline-none focus:border-zinc-500"
              />
              <span className="text-sm font-medium text-zinc-600">
                {fuelRate(fuelPlan.rateLh)}
              </span>
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead className="bg-zinc-100 text-zinc-700">
                  <tr>
                    <th className="border-b border-r border-zinc-200 px-4 py-3 text-left font-semibold">
                      Fuel planning
                    </th>
                    <th className="w-48 border-b border-r border-zinc-200 px-4 py-3 text-center font-semibold">
                      Time
                    </th>
                    <th className="w-52 border-b border-zinc-200 px-4 py-3 text-center font-semibold">
                      Fuel
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <FuelRow
                    label="Start-up and Taxi"
                    minutes={fuelPlan.taxiMin}
                    fuelL={fuelPlan.taxiFuelL}
                    onMinutesChange={(value) =>
                      updateFuelPlan("taxiMin", value)
                    }
                  />
                  <FuelRow
                    label="Climb"
                    minutes={fuelPlan.climbMin}
                    fuelL={fuelPlan.climbFuelL}
                    onMinutesChange={(value) =>
                      updateFuelPlan("climbMin", value)
                    }
                  />
                  <FuelRow
                    label="Enroute"
                    minutes={fuelPlan.enrouteMin}
                    fuelL={fuelPlan.enrouteFuelL}
                    onMinutesChange={(value) =>
                      updateFuelPlan("enrouteMin", value)
                    }
                  />
                  <FuelRow
                    label="Descent"
                    minutes={fuelPlan.descentMin}
                    fuelL={fuelPlan.descentFuelL}
                    onMinutesChange={(value) =>
                      updateFuelPlan("descentMin", value)
                    }
                  />
                  <FuelRow
                    label="Trip Fuel"
                    minutes={fuelPlan.tripMin}
                    fuelL={fuelPlan.tripFuelL}
                    strong
                  />
                  <FuelRow
                    label="Contingency 5%"
                    minutes={fuelPlan.contingencyMin}
                    fuelL={fuelPlan.contingencyFuelL}
                  />
                  <FuelRow
                    label="Alternate"
                    minutes={fuelPlan.alternateMin}
                    fuelL={fuelPlan.alternateFuelL}
                    onMinutesChange={(value) =>
                      updateFuelPlan("alternateMin", value)
                    }
                  />
                  <FuelRow
                    label="Reserve"
                    minutes={fuelPlan.reserveMin}
                    fuelL={fuelPlan.reserveFuelL}
                    onMinutesChange={(value) =>
                      updateFuelPlan("reserveMin", value)
                    }
                  />
                  <FuelRow
                    label="Required Ramp Fuel"
                    minutes={fuelPlan.requiredRampMin}
                    fuelL={fuelPlan.requiredRampFuelL}
                    strong
                  />
                  <FuelRow
                    label="Extra"
                    minutes={fuelPlan.extraMin}
                    fuelL={fuelPlan.extraFuelL}
                  />
                  <FuelRow
                    label="Total Ramp Fuel"
                    minutes={fuelPlan.totalRampMin}
                    fuelL={fuelPlan.totalRampFuelL}
                    total
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {!fuelPlan.fuelSufficient ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
            Shortfall:{" "}
            {operationalFuel(
              fuelPlan.requiredRampFuelL - fuelPlan.fuelLoadedL
            )}
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
              RVP.CFI.066.02
            </p>
            <h2 className="mt-1 text-lg font-bold text-zinc-950">
              5. Export PDF
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void exportOfficialPdf()}
            disabled={pdfBusy}
            className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:bg-zinc-300"
          >
            {pdfBusy ? "Generating..." : "Export RVP.CFI.066.02"}
          </button>
        </div>
        {pdfError ? (
          <p className="mt-3 text-sm font-medium text-red-700">{pdfError}</p>
        ) : null}
      </section>

      {allWarnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
          {allWarnings.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}
