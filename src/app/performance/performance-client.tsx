"use client";

import { logUsageEvent } from "@/lib/usage-events";
import { useMemo, useState } from "react";
import { WorkflowChecklist, type WorkflowStep } from "@/components/workflow-checklist";
import { piperRegistrations, tecnamRegistrations } from "@/lib/navlog";
import {
  PERFORMANCE_AERODROMES,
  PERFORMANCE_ICAOS,
} from "@/lib/performance/aerodromes";
import { fetchOpenMeteoForLeg } from "@/lib/performance/open-meteo";
import { getFleetDefaults } from "@/lib/performance/fleet";
import { buildPerformancePdf } from "@/lib/pdf/performance-template-pdf";
import {
  defaultFuelPlanForAircraft,
  formatFuelLiters,
  formatFuelTime,
  recalculateFuelPlan,
  type FuelPlanningInput,
} from "@/lib/performance/fuel-planning";
import {
  calculatePa28Performance,
  type Pa28PerformanceRow,
} from "@/lib/performance/pa28-performance";
import {
  evaluatePerformanceLeg,
  type PerformanceLegInput,
  type PerformanceLegRole,
} from "@/lib/performance/aerodrome-performance";
import {
  calculateTecnamPerformance,
  type TecnamPerformanceRow,
} from "@/lib/performance/tecnam-performance";
import {
  calculatePa28Mb,
  calculateTecnamMb,
  PA28,
  TECNAM,
  type Pa28Point,
  type PerformanceAircraft,
  type TecnamLine,
} from "@/lib/performance/mb";

function NumberInput({
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

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
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
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
      />
    </label>
  );
}

function AircraftButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
        active
          ? "bg-zinc-950 text-white"
          : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Pa28Table({ rows }: { rows: Pa28Point[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Condition</th>
            <th className="px-4 py-3">Weight lb</th>
            <th className="px-4 py-3">Weight kg</th>
            <th className="px-4 py-3">Moment in·lb</th>
            <th className="px-4 py-3">CG in</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="px-4 py-3 font-semibold text-zinc-950">
                {row.label}
              </td>
              <td className="px-4 py-3">{row.weightLb.toFixed(0)}</td>
              <td className="px-4 py-3">{row.weightKg.toFixed(0)}</td>
              <td className="px-4 py-3">{row.momentInLb.toFixed(0)}</td>
              <td className="px-4 py-3">{row.cgIn.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TecnamTable({ rows }: { rows: TecnamLine[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Weight kg</th>
            <th className="px-4 py-3">Arm m</th>
            <th className="px-4 py-3">Moment kg·m</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="px-4 py-3 font-semibold text-zinc-950">
                {row.label}
              </td>
              <td className="px-4 py-3">{row.weightKg.toFixed(1)}</td>
              <td className="px-4 py-3">{row.armM.toFixed(3)}</td>
              <td className="px-4 py-3">{row.momentKgM.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FitBadge({
  ok,
  margin,
  pct,
}: {
  ok: boolean;
  margin: number;
  pct: number;
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
      {ok ? "OK" : "NOK"} {margin >= 0 ? "+" : "−"}
      {Math.abs(margin).toFixed(0)} m · {pct.toFixed(0)}%
    </span>
  );
}

function TecnamPerformanceTable({
  rows,
}: {
  rows: TecnamPerformanceRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
        Not enough data for Tecnam performance.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-3">Leg</th>
            <th className="px-3 py-3">RWY</th>
            <th className="px-3 py-3">PA/DA</th>
            <th className="px-3 py-3">TODR 50ft</th>
            <th className="px-3 py-3">TODA</th>
            <th className="px-3 py-3">Takeoff fit</th>
            <th className="px-3 py-3">LDR 50ft</th>
            <th className="px-3 py-3">LDA</th>
            <th className="px-3 py-3">Landing fit</th>
            <th className="px-3 py-3">Wind</th>
            <th className="px-3 py-3">ROC</th>
            <th className="px-3 py-3">Vy</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={`${row.role}-${row.icao}`}>
              <td className="px-3 py-3 font-semibold text-zinc-950">
                {row.role} {row.icao}
              </td>
              <td className="px-3 py-3">
                {row.runway} / {row.qfu.toFixed(0)}°
              </td>
              <td className="px-3 py-3">
                {row.paFt.toFixed(0)} / {row.daFt.toFixed(0)}
              </td>
              <td className="px-3 py-3">
                {row.takeoff50M.toFixed(0)}
                <span className="ml-1 text-xs text-zinc-400">
                  GR {row.takeoffGroundRollM.toFixed(0)}
                </span>
              </td>
              <td className="px-3 py-3">{row.todaM.toFixed(0)}</td>
              <td className="px-3 py-3">
                <FitBadge
                  ok={row.takeoffOk}
                  margin={row.takeoffMarginM}
                  pct={row.takeoffPct}
                />
              </td>
              <td className="px-3 py-3">
                {row.landing50M.toFixed(0)}
                <span className="ml-1 text-xs text-zinc-400">
                  GR {row.landingGroundRollM.toFixed(0)}
                </span>
              </td>
              <td className="px-3 py-3">{row.ldaM.toFixed(0)}</td>
              <td className="px-3 py-3">
                <FitBadge
                  ok={row.landingOk}
                  margin={row.landingMarginM}
                  pct={row.landingPct}
                />
              </td>
              <td className="px-3 py-3">
                {row.headwindKt >= 0 ? "HW" : "TW"}{" "}
                {Math.abs(row.headwindKt).toFixed(0)} / XW{" "}
                {row.crosswindKt.toFixed(0)} {row.crosswindSide}
              </td>
              <td className="px-3 py-3">{row.rocFpm.toFixed(0)}</td>
              <td className="px-3 py-3">{row.vyKt.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pa28PerformanceTable({
  rows,
}: {
  rows: Pa28PerformanceRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
        Fill in Weight & Balance to calculate PA-28 performance.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200">
      <table className="w-full min-w-[780px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Leg</th>
            <th className="px-4 py-3">Takeoff (ft)</th>
            <th className="px-4 py-3">Climb</th>
            <th className="px-4 py-3">Landing (ft)</th>
            <th className="px-4 py-3">TODR PDF (m)</th>
            <th className="px-4 py-3">LDR PDF (m)</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={`${row.role}-${row.icao}`}>
              <td className="px-4 py-3 font-medium text-zinc-950">
                {row.label}
              </td>
              <td className="px-4 py-3">{row.toFt.toFixed(0)} ft</td>
              <td className="px-4 py-3">{row.rocFpm.toFixed(0)} fpm</td>
              <td className="px-4 py-3">{row.ldgFt.toFixed(0)} ft</td>
              <td className="px-4 py-3">{row.toMWithPct}</td>
              <td className="px-4 py-3">{row.ldgMWithPct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusCard({
  label,
  value,
  detail,
  ok,
}: {
  label: string;
  value: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-4",
        ok
          ? "border-emerald-200 bg-emerald-50"
          : "border-red-200 bg-red-50",
      ].join(" ")}
    >
      <p className="text-sm text-zinc-500">{label}</p>
      <p
        className={[
          "mt-1 text-2xl font-semibold tracking-tight",
          ok ? "text-emerald-700" : "text-red-700",
        ].join(" ")}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-zinc-500">{detail}</p>
    </div>
  );
}

const defaultPerformanceLegs: PerformanceLegInput[] = [
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

function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function FuelPlanningSection({
  fuelPlan,
  onChange,
}: {
  fuelPlan: FuelPlanningInput;
  onChange: <K extends keyof FuelPlanningInput>(
    key: K,
    value: FuelPlanningInput[K]
  ) => void;
}) {
  const enrouteHours = Math.floor(fuelPlan.enrouteMin / 60);
  const enrouteMinutes = fuelPlan.enrouteMin % 60;

  const rows = [
    ["(1) Start-up & Taxi", fuelPlan.taxiMin, fuelPlan.taxiFuelL],
    ["(2) Climb", fuelPlan.climbMin, fuelPlan.climbFuelL],
    ["(3) Enroute", fuelPlan.enrouteMin, fuelPlan.enrouteFuelL],
    ["(4) Descent", fuelPlan.descentMin, fuelPlan.descentFuelL],
    ["(5) Trip Fuel (2+3+4)", fuelPlan.tripMin, fuelPlan.tripFuelL],
    ["(6) Contingency 5%", fuelPlan.contingencyMin, fuelPlan.contingencyFuelL],
    ["(7) Alternate", fuelPlan.alternateMin, fuelPlan.alternateFuelL],
    ["(8) Reserve 45 min", fuelPlan.reserveMin, fuelPlan.reserveFuelL],
    [
      "(9) Required Ramp Fuel",
      fuelPlan.requiredRampMin,
      fuelPlan.requiredRampFuelL,
    ],
    ["(10) Extra", fuelPlan.extraMin, fuelPlan.extraFuelL],
    ["(11) Total Ramp Fuel", fuelPlan.totalRampMin, fuelPlan.totalRampFuelL],
  ];

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Step 03
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            Fuel planning
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Trip fuel is calculated as climb + enroute + descent. Extra fuel is the amount remaining after required ramp fuel.
          </p>
        </div>

        <div
          className={[
            "rounded-2xl border px-4 py-3 text-sm",
            fuelPlan.fuelSufficient
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50",
          ].join(" ")}
        >
          <p className="text-zinc-500">Fuel loaded</p>
          <p className="text-lg font-semibold text-zinc-950">
            {formatFuelLiters(fuelPlan.fuelLoadedL)} L
          </p>
          {!fuelPlan.fuelSufficient ? (
            <p className="mt-1 text-xs font-medium text-red-700">
              Below required ramp fuel.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2 xl:grid-cols-1">
          <NumberInput
            label="Consumption L/h"
            value={fuelPlan.rateLh}
            min={0}
            step={0.5}
            onChange={(value) => onChange("rateLh", value)}
          />

          <NumberInput
            label="Taxi min"
            value={fuelPlan.taxiMin}
            min={0}
            step={1}
            onChange={(value) => onChange("taxiMin", value)}
          />

          <NumberInput
            label="Climb min"
            value={fuelPlan.climbMin}
            min={0}
            step={1}
            onChange={(value) => onChange("climbMin", value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              label="Enroute h"
              value={enrouteHours}
              min={0}
              step={1}
              onChange={(value) =>
                onChange("enrouteMin", value * 60 + enrouteMinutes)
              }
            />

            <NumberInput
              label="Enroute min"
              value={enrouteMinutes}
              min={0}
              max={55}
              step={5}
              onChange={(value) =>
                onChange("enrouteMin", enrouteHours * 60 + value)
              }
            />
          </div>

          <NumberInput
            label="Descent min"
            value={fuelPlan.descentMin}
            min={0}
            step={1}
            onChange={(value) => onChange("descentMin", value)}
          />

          <NumberInput
            label="Alternate min"
            value={fuelPlan.alternateMin}
            min={0}
            step={5}
            onChange={(value) => onChange("alternateMin", value)}
          />

          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-500">
            Reserve fixed:{" "}
            <span className="font-semibold text-zinc-950">
              {fuelPlan.reserveMin} min
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-200">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Fuel</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {rows.map(([label, minutes, liters]) => (
                <tr key={String(label)}>
                  <td className="px-4 py-3 font-medium text-zinc-950">
                    {label}
                  </td>
                  <td className="px-4 py-3">
                    {formatFuelTime(Number(minutes))}
                  </td>
                  <td className="px-4 py-3">
                    {formatFuelLiters(Number(liters))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ExportPdfSection({
  aircraft,
  registration,
  date,
  pdfBusy,
  pdfStatus,
  onExport,
}: {
  aircraft: PerformanceAircraft;
  registration: string;
  date: string;
  pdfBusy: boolean;
  pdfStatus: string;
  onExport: () => void;
}) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-[1fr_260px] md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Step 06
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            Performance PDF
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Export the completed performance form after validating loading, fuel, MET and performance.
          </p>
          <p className="mt-3 text-sm text-zinc-500">
            {aircraft} · {registration || "—"} · {date || "—"}
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={onExport}
            disabled={pdfBusy}
            className="w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            {pdfBusy ? "Generating..." : "Export performance PDF"}
          </button>

          {pdfStatus ? (
            <p className="mt-2 text-sm text-zinc-500">{pdfStatus}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function PerformanceClient() {
  const [aircraft, setAircraft] =
    useState<PerformanceAircraft>("Piper PA-28");

  const registrationOptions =
    aircraft === "Piper PA-28" ? piperRegistrations : tecnamRegistrations;

  const [registration, setRegistration] = useState(
    registrationOptions[0] ?? ""
  );
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");

  const mission = "";
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [performanceLegs, setPerformanceLegs] = useState<PerformanceLegInput[]>(
    defaultPerformanceLegs
  );
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState("");
  const [fuelPlan, setFuelPlan] = useState<FuelPlanningInput>(() =>
    defaultFuelPlanForAircraft("Piper PA-28", 182)
  );

  const [pa28Input, setPa28Input] = useState({
    emptyWeightLb: 1690.2,
    emptyMomentInLb: 151319.5,
    studentKg: 50,
    instructorKg: 80,
    frontKg: 130,
    rearKg: 0,
    baggageKg: 5,
    fuelL: 182,
    tripFuelL: defaultFuelPlanForAircraft("Piper PA-28", 182).tripFuelL,
  });

  const [tecnamInput, setTecnamInput] = useState({
    emptyWeightKg: 435.75,
    emptyMomentKgM: 811.33,
    studentKg: 80,
    instructorKg: 80,
    pilotPassengerKg: 160,
    baggageKg: 5,
    fuelL: 120,
  });

  const pa28InputForCalculation = useMemo(
    () => ({
      ...pa28Input,
      tripFuelL: fuelPlan.tripFuelL,
    }),
    [pa28Input, fuelPlan.tripFuelL]
  );

  const pa28 = useMemo(
    () => calculatePa28Mb(pa28InputForCalculation),
    [pa28InputForCalculation]
  );
  const tecnam = useMemo(
    () => calculateTecnamMb(tecnamInput),
    [tecnamInput]
  );

  const displayedPerformanceLegs = useMemo(() => {
    if (aircraft === "Piper PA-28") {
      return performanceLegs;
    }

    return performanceLegs.filter((leg) => leg.role !== "Alternate 2");
  }, [aircraft, performanceLegs]);

  const performanceResults = useMemo(
    () => displayedPerformanceLegs.map((leg) => evaluatePerformanceLeg(leg)),
    [displayedPerformanceLegs]
  );

  const tecnamPerformanceRows = useMemo(() => {
    if (aircraft !== "Tecnam P2008") return [];

    return performanceResults
      .map((result) =>
        calculateTecnamPerformance(result, tecnam.total.weightKg)
      )
      .filter((row): row is TecnamPerformanceRow => Boolean(row));
  }, [aircraft, performanceResults, tecnam.total.weightKg]);

  const pa28PerformanceRows = useMemo(() => {
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
  }, [
    aircraft,
    performanceResults,
    pa28.takeoff.weightLb,
    pa28.landing.weightLb,
  ]);

  function applyRegistrationDefaults(
    nextAircraft: PerformanceAircraft,
    nextRegistration: string
  ) {
    const defaults = getFleetDefaults(nextAircraft, nextRegistration);

    if (!defaults) return;

    if (nextAircraft === "Piper PA-28") {
      if ("emptyWeightLb" in defaults) {
        setPa28Input((current) => ({
          ...current,
          emptyWeightLb: defaults.emptyWeightLb,
          emptyMomentInLb: defaults.emptyMomentInLb,
        }));
      }

      return;
    }

    if ("emptyWeightKg" in defaults) {
      setTecnamInput((current) => ({
        ...current,
        emptyWeightKg: defaults.emptyWeightKg,
        emptyMomentKgM: defaults.emptyMomentKgM,
      }));
    }
  }

  function selectAircraft(nextAircraft: PerformanceAircraft) {
    setAircraft(nextAircraft);

    const options =
      nextAircraft === "Piper PA-28"
        ? piperRegistrations
        : tecnamRegistrations;

    const nextRegistration = options[0] ?? "";

    setRegistration(nextRegistration);
    applyRegistrationDefaults(nextAircraft, nextRegistration);
    setFuelPlan(
      defaultFuelPlanForAircraft(
        nextAircraft,
        nextAircraft === "Piper PA-28" ? 182 : 120
      )
    );
  }

  function updatePerformanceLeg(
    role: PerformanceLegRole,
    patch: Partial<PerformanceLegInput>
  ) {
    setPerformanceLegs((current) =>
      current.map((leg) =>
        leg.role === role
          ? {
              ...leg,
              ...patch,
            }
          : leg
      )
    );
  }

  function updateFuelPlan<K extends keyof FuelPlanningInput>(
    key: K,
    value: FuelPlanningInput[K]
  ) {
    setFuelPlan((current) =>
      recalculateFuelPlan({
        ...current,
        [key]: Number(value),
      })
    );
  }

  async function fetchWeatherForPerformanceLegs() {
    setWeatherBusy(true);
    setWeatherStatus("");

    try {
      const activeLegs = displayedPerformanceLegs.filter(
        (leg) => leg.icao !== "-"
      );

      const fetched = await Promise.all(
        activeLegs.map(async (leg) => ({
          role: leg.role,
          met: await fetchOpenMeteoForLeg(leg, date),
        }))
      );

      setPerformanceLegs((current) =>
        current.map((leg) => {
          const item = fetched.find((entry) => entry.role === leg.role);

          if (!item?.met) return leg;

          return {
            ...leg,
            tempC: item.met.tempC,
            qnhHpa: item.met.qnhHpa,
            windFrom: item.met.windFrom,
            windKt: item.met.windKt,
          };
        })
      );

      const ok = fetched.filter((entry) => entry.met).length;
      setWeatherStatus(`Weather updated: ${ok}/${activeLegs.length}`);
    } catch (error) {
      console.error(error);
      setWeatherStatus("Could not update the weather.");
    } finally {
      setWeatherBusy(false);
    }
  }


    async function exportPerformancePdf() {
    setPdfBusy(true);
    setPdfStatus("");

    try {
      const bytes = await buildPerformancePdf({
        aircraft,
        registration,
        mission,
        date,
        pa28: aircraft === "Piper PA-28" ? pa28 : undefined,
        tecnam: aircraft === "Tecnam P2008" ? tecnam : undefined,
        pa28Input:
          aircraft === "Piper PA-28" ? pa28InputForCalculation : undefined,
        tecnamInput: aircraft === "Tecnam P2008" ? tecnamInput : undefined,
        fuelPlan,
        performanceResults,
        pa28PerformanceRows:
          aircraft === "Piper PA-28" ? pa28PerformanceRows : [],
        tecnamPerformanceRows:
          aircraft === "Tecnam P2008" ? tecnamPerformanceRows : [],
      });

      const safeReg = registration || aircraft.replace(/\s+/g, "_");

      downloadPdfBytes(
        bytes,
        `performance_${safeReg}_${date || "no-date"}.pdf`
      );

      void logUsageEvent({
        eventType: "performance_export",
        module: "performance",
        title: `Performance ${registration || aircraft}`,
        aircraftType: aircraft,
        registration,
        summary: {
          aircraft,
          registration,
          date,
          mission,
          fuelSufficient: fuelPlan.fuelSufficient,
          totalRampFuelL: fuelPlan.totalRampFuelL,
          requiredRampFuelL: fuelPlan.requiredRampFuelL,
          extraFuelL: fuelPlan.extraFuelL,
        },
        payload: {
          mission,
          date,
          aircraft,
          registration,
          fuelPlan,
          performanceResults,
        },
      });

      setPdfStatus("Performance PDF exported.");
    } catch (error) {
      console.error(error);
      setPdfStatus("Could not generate the performance PDF.");
    } finally {
      setPdfBusy(false);
    }
  }




  const activeWarnings =
    aircraft === "Piper PA-28" ? pa28.warnings : tecnam.warnings;

  const performanceRowsReady =
    aircraft === "Piper PA-28"
      ? pa28PerformanceRows.length > 0
      : tecnamPerformanceRows.length > 0;

  const metRunwayReady = displayedPerformanceLegs.every((leg) => {
    if (leg.icao === "-") return true;

    return Boolean(
      leg.icao &&
        Object.prototype.hasOwnProperty.call(PERFORMANCE_AERODROMES, leg.icao) &&
        Number.isFinite(leg.tempC) &&
        Number.isFinite(leg.qnhHpa) &&
        Number.isFinite(leg.windFrom) &&
        Number.isFinite(leg.windKt)
    );
  });

  const performanceWorkflow = useMemo<WorkflowStep[]>(
    () => [
      {
        label: "Aircraft setup",
        description: `${aircraft} · ${registration || "no registration"} · ${date || "no date"}`,
        complete: Boolean(aircraft && registration && date),
      },
      {
        label: "Loading & M&B",
        description:
          activeWarnings.length === 0
            ? "Weight, mass and CG are within the configured checks."
            : `${activeWarnings.length} warning${activeWarnings.length === 1 ? "" : "s"} to review.`,
        complete: activeWarnings.length === 0,
        attention: activeWarnings.length > 0,
      },
      {
        label: "Fuel planning",
        description: fuelPlan.fuelSufficient
          ? `${formatFuelLiters(fuelPlan.totalRampFuelL)} L total ramp fuel planned.`
          : "Fuel loaded is below required ramp fuel.",
        complete: fuelPlan.fuelSufficient,
        attention: !fuelPlan.fuelSufficient,
      },
      {
        label: "MET & runway",
        description: metRunwayReady
          ? "Weather and runway data are available for each active leg."
          : "Check ICAO, temperature, QNH, wind and runway data.",
        complete: metRunwayReady,
        attention: !metRunwayReady,
      },
      {
        label: "Performance & export",
        description: performanceRowsReady
          ? "Performance rows are ready. Review margins before export."
          : "Complete loading and MET/runway data first.",
        complete:
          performanceRowsReady &&
          activeWarnings.length === 0 &&
          fuelPlan.fuelSufficient,
        attention: performanceRowsReady && activeWarnings.length > 0,
      },
    ],
    [
      activeWarnings.length,
      aircraft,
      date,
      fuelPlan.fuelSufficient,
      fuelPlan.totalRampFuelL,
      metRunwayReady,
      performanceRowsReady,
      registration,
    ]
  );

  return (
    <div className="space-y-6">
      <section className="border-b border-zinc-200 pb-6">
        <p className="mb-3 text-sm font-medium text-zinc-500">
          Performance & Mass Balance
        </p>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
              Performance & M&B
            </h1>

            <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
              Follow the workflow from aircraft setup to loading, fuel planning, MET/runway checks, performance review and PDF export.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <AircraftButton
              active={aircraft === "Piper PA-28"}
              onClick={() => selectAircraft("Piper PA-28")}
            >
              Piper PA-28
            </AircraftButton>

            <AircraftButton
              active={aircraft === "Tecnam P2008"}
              onClick={() => selectAircraft("Tecnam P2008")}
            >
              Tecnam P2008
            </AircraftButton>
          </div>
        </div>
      </section>

      <WorkflowChecklist steps={performanceWorkflow} />

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Step 01
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            Flight setup
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Choose the aircraft, registration and date first. The aircraft selection controls the calculation model; the registration applies saved fleet empty weight/moment defaults.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr_240px]">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 md:col-span-3">
            <strong>Aircraft selection matters.</strong> The selected aircraft changes empty-weight defaults, M&B arms/moments, fuel assumptions and the performance tables used for takeoff, landing, climb and margins. Confirm the aircraft before entering or trusting any numbers.
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Registration
            </span>
            <select
              value={registration}
              onChange={(event) => {
                const nextRegistration = event.target.value;

                setRegistration(nextRegistration);
                applyRegistrationDefaults(aircraft, nextRegistration);
              }}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
            >
              {registrationOptions.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
          </label>
          <DateInput label="Date" value={date} onChange={setDate} />

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
            <p>
              {aircraft === "Piper PA-28"
                ? "PA-28 uses lb / in·lb internally, with loading inputs entered in kg."
                : "Tecnam uses kg / kg·m internally, with CG shown in metres."}
            </p>
          </div>
        </div>
      </section>

      <FuelPlanningSection fuelPlan={fuelPlan} onChange={updateFuelPlan} />

      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Step 04
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Aerodromes & MET
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Manual weather or Open-Meteo forecast by aerodrome and UTC hour.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {weatherStatus ? (
              <span className="text-sm text-zinc-500">{weatherStatus}</span>
            ) : null}

            <button
              type="button"
              onClick={fetchWeatherForPerformanceLegs}
              disabled={weatherBusy || !date}
              className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
            >
              {weatherBusy ? "Fetching..." : "Fetch meteo"}
            </button>
          </div>
        </div>

        <div
          className={[
            "mt-5 grid gap-4",
            aircraft === "Piper PA-28"
              ? "lg:grid-cols-2 2xl:grid-cols-4"
              : "lg:grid-cols-3",
          ].join(" ")}
        >
          {displayedPerformanceLegs.map((leg) => {
            const result = performanceResults.find(
              (item) => item.leg.role === leg.role
            );

            return (
              <div
                key={leg.role}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
              >
                <h3 className="text-sm font-semibold text-zinc-950">
                  {leg.role}
                </h3>

                <div className="mt-4 grid gap-3">
                  <SelectInput
                    label="Aerodrome"
                    value={leg.icao}
                    options={
                      leg.role === "Alternate 2"
                        ? ["-", ...PERFORMANCE_ICAOS]
                        : PERFORMANCE_ICAOS
                    }
                    onChange={(value) =>
                      updatePerformanceLeg(leg.role, { icao: value })
                    }
                  />

                  <SelectInput
                    label="Forecast UTC"
                    value={String(leg.forecastHourUtc ?? 9)}
                    options={Array.from({ length: 24 }, (_, hour) =>
                      String(hour)
                    )}
                    onChange={(value) =>
                      updatePerformanceLeg(leg.role, {
                        forecastHourUtc: Number(value),
                      })
                    }
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <NumberInput
                      label="OAT °C"
                      value={leg.tempC}
                      step={1}
                      onChange={(value) =>
                        updatePerformanceLeg(leg.role, { tempC: value })
                      }
                    />

                    <NumberInput
                      label="QNH"
                      value={leg.qnhHpa}
                      min={900}
                      max={1050}
                      step={1}
                      onChange={(value) =>
                        updatePerformanceLeg(leg.role, { qnhHpa: value })
                      }
                    />

                    <NumberInput
                      label="Wind from"
                      value={leg.windFrom}
                      min={0}
                      max={360}
                      step={10}
                      onChange={(value) =>
                        updatePerformanceLeg(leg.role, { windFrom: value })
                      }
                    />

                    <NumberInput
                      label="Wind kt"
                      value={leg.windKt}
                      min={0}
                      step={1}
                      onChange={(value) =>
                        updatePerformanceLeg(leg.role, { windKt: value })
                      }
                    />
                  </div>
                </div>

                {leg.role === "Alternate 2" && leg.icao === "-" ? (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-500">
                    Alternate 2 not used.
                  </div>
                ) : result?.aerodrome ? (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 text-sm">
                    <p className="font-semibold text-zinc-950">
                      {result.aerodrome.name}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-zinc-600">
                      <p>
                        Elev{" "}
                        <span className="font-medium text-zinc-950">
                          {result.aerodrome.elev_ft.toFixed(0)} ft
                        </span>
                      </p>
                      <p>
                        RWY{" "}
                        <span className="font-medium text-zinc-950">
                          {result.bestRunway?.id ?? "—"}
                        </span>
                      </p>
                      <p>
                        QFU{" "}
                        <span className="font-medium text-zinc-950">
                          {result.bestRunway?.qfu.toFixed(0) ?? "—"}°
                        </span>
                      </p>
                      <p>
                        PA/DA{" "}
                        <span className="font-medium text-zinc-950">
                          {result.pressureAltitudeFt.toFixed(0)}/
                          {result.densityAltitudeFt.toFixed(0)}
                        </span>
                      </p>
                      <p>
                        TODA{" "}
                        <span className="font-medium text-zinc-950">
                          {result.bestRunway?.toda.toFixed(0) ?? "—"} m
                        </span>
                      </p>
                      <p>
                        LDA{" "}
                        <span className="font-medium text-zinc-950">
                          {result.bestRunway?.lda.toFixed(0) ?? "—"} m
                        </span>
                      </p>
                    </div>

                    <p className="mt-3 text-zinc-600">
                      {result.headwindKt >= 0 ? "HW" : "TW"}{" "}
                      <span className="font-medium text-zinc-950">
                        {Math.abs(result.headwindKt).toFixed(0)}
                      </span>{" "}
                      kt · XW{" "}
                      <span className="font-medium text-zinc-950">
                        {result.crosswindKt.toFixed(0)}
                      </span>{" "}
                      kt {result.crosswindSide}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-red-600">
                    Aerodrome not found.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {aircraft === "Piper PA-28" ? (
        <>
          <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
            <aside className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Step 02
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">
                PA-28 loading
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Enter passenger, baggage and fuel loaded. Fuel loaded is also sent to the fuel planning section.
              </p>

              <div className="mt-5 grid gap-4">
                <NumberInput
                  label="Empty weight lb"
                  value={pa28Input.emptyWeightLb}
                  min={0}
                  step={1}
                  onChange={(value) =>
                    setPa28Input((current) => ({
                      ...current,
                      emptyWeightLb: value,
                    }))
                  }
                />

                <NumberInput
                  label="Empty moment in·lb"
                  value={pa28Input.emptyMomentInLb}
                  min={0}
                  step={100}
                  onChange={(value) =>
                    setPa28Input((current) => ({
                      ...current,
                      emptyMomentInLb: value,
                    }))
                  }
                />

                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    label="Student kg"
                    value={pa28Input.studentKg ?? 0}
                    min={0}
                    step={1}
                    onChange={(value) =>
                      setPa28Input((current) => ({
                        ...current,
                        studentKg: value,
                        frontKg: value + Number(current.instructorKg ?? 0),
                      }))
                    }
                  />

                  <NumberInput
                    label="Instructor kg"
                    value={pa28Input.instructorKg ?? 0}
                    min={0}
                    step={1}
                    onChange={(value) =>
                      setPa28Input((current) => ({
                        ...current,
                        instructorKg: value,
                        frontKg: Number(current.studentKg ?? 0) + value,
                      }))
                    }
                  />
                </div>

                <NumberInput
                  label="Rear seats kg"
                  value={pa28Input.rearKg}
                  min={0}
                  step={1}
                  onChange={(value) =>
                    setPa28Input((current) => ({
                      ...current,
                      rearKg: value,
                    }))
                  }
                />

                <NumberInput
                  label="Baggage kg"
                  value={pa28Input.baggageKg}
                  min={0}
                  step={1}
                  onChange={(value) =>
                    setPa28Input((current) => ({
                      ...current,
                      baggageKg: value,
                    }))
                  }
                />

                <NumberInput
                  label="Fuel L"
                  value={pa28Input.fuelL}
                  min={0}
                  max={PA28.fuelUsableL}
                  step={1}
                  onChange={(value) => {
                    setPa28Input((current) => ({
                      ...current,
                      fuelL: value,
                    }));
                    setFuelPlan((current) =>
                      recalculateFuelPlan({
                        ...current,
                        fuelLoadedL: value,
                      })
                    );
                  }}
                />
              </div>
            </aside>

            <main className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <StatusCard
                  label="Takeoff weight"
                  value={`${pa28.takeoff.weightLb.toFixed(0)} lb`}
                  detail={`MTOW ${PA28.mtowLb.toFixed(0)} lb`}
                  ok={pa28.takeoff.weightLb <= PA28.mtowLb}
                />

                <StatusCard
                  label="Landing weight"
                  value={`${pa28.landing.weightLb.toFixed(0)} lb`}
                  detail={`MLW ${PA28.mlwLb.toFixed(0)} lb`}
                  ok={pa28.landing.weightLb <= PA28.mlwLb}
                />

                <StatusCard
                  label="Takeoff CG"
                  value={`${pa28.takeoff.cgIn.toFixed(1)} in`}
                  detail="Confirm in the PA-28 envelope"
                  ok={pa28.takeoff.cgIn >= 82 && pa28.takeoff.cgIn <= 93}
                />
              </div>

              {pa28.warnings.length > 0 ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  {pa28.warnings.map((warning) => (
                    <p key={warning} className="text-sm text-red-700">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  No major weight warnings.
                </div>
              )}

              <Pa28Table
                rows={[pa28.empty, pa28.ramp, pa28.takeoff, pa28.landing]}
              />
            </main>
          </section>

      {aircraft === "Piper PA-28" ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              PA-28 performance
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Calculated with the current takeoff/landing weight from Weight & Balance.
            </p>
          </div>

          <div className="mt-5">
            <Pa28PerformanceTable rows={pa28PerformanceRows} />
          </div>
        </section>
      ) : null}

        </>
      ) : (
        <>
          <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
            <aside className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Step 02
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">
                Tecnam loading
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Enter crew, baggage and fuel loaded. Fuel loaded is also sent to the fuel planning section.
              </p>

              <div className="mt-5 grid gap-4">
                <NumberInput
                  label="Empty weight kg"
                  value={tecnamInput.emptyWeightKg}
                  min={0}
                  step={0.1}
                  onChange={(value) =>
                    setTecnamInput((current) => ({
                      ...current,
                      emptyWeightKg: value,
                    }))
                  }
                />

                <NumberInput
                  label="EW moment kg·m"
                  value={tecnamInput.emptyMomentKgM}
                  min={0}
                  step={0.01}
                  onChange={(value) =>
                    setTecnamInput((current) => ({
                      ...current,
                      emptyMomentKgM: value,
                    }))
                  }
                />

                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    label="Student kg"
                    value={tecnamInput.studentKg ?? 0}
                    min={0}
                    max={TECNAM.maxPassengerWeightKg}
                    step={1}
                    onChange={(value) =>
                      setTecnamInput((current) => ({
                        ...current,
                        studentKg: value,
                        pilotPassengerKg:
                          value + Number(current.instructorKg ?? 0),
                      }))
                    }
                  />

                  <NumberInput
                    label="Instructor kg"
                    value={tecnamInput.instructorKg ?? 0}
                    min={0}
                    max={TECNAM.maxPassengerWeightKg}
                    step={1}
                    onChange={(value) =>
                      setTecnamInput((current) => ({
                        ...current,
                        instructorKg: value,
                        pilotPassengerKg:
                          Number(current.studentKg ?? 0) + value,
                      }))
                    }
                  />
                </div>

                <NumberInput
                  label="Baggage kg"
                  value={tecnamInput.baggageKg}
                  min={0}
                  max={TECNAM.maxBaggageWeightKg}
                  step={1}
                  onChange={(value) =>
                    setTecnamInput((current) => ({
                      ...current,
                      baggageKg: value,
                    }))
                  }
                />

                <NumberInput
                  label="Fuel L"
                  value={tecnamInput.fuelL}
                  min={0}
                  max={TECNAM.maxFuelVolumeL}
                  step={1}
                  onChange={(value) => {
                    setTecnamInput((current) => ({
                      ...current,
                      fuelL: value,
                    }));
                    setFuelPlan((current) =>
                      recalculateFuelPlan({
                        ...current,
                        fuelLoadedL: value,
                      })
                    );
                  }}
                />
              </div>
            </aside>

            <main className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <StatusCard
                  label="Total weight"
                  value={`${tecnam.total.weightKg.toFixed(1)} kg`}
                  detail={`MTOW ${TECNAM.maxTakeoffWeightKg.toFixed(0)} kg`}
                  ok={tecnam.total.weightKg <= TECNAM.maxTakeoffWeightKg}
                />

                <StatusCard
                  label="CG"
                  value={`${(tecnam.total.cgM ?? 0).toFixed(3)} m`}
                  detail={`${TECNAM.cgLimitsM[0].toFixed(3)} – ${TECNAM.cgLimitsM[1].toFixed(3)} m`}
                  ok={
                    (tecnam.total.cgM ?? 0) >= TECNAM.cgLimitsM[0] &&
                    (tecnam.total.cgM ?? 0) <= TECNAM.cgLimitsM[1]
                  }
                />

                <StatusCard
                  label="Remaining"
                  value={`${tecnam.remainingByMtowKg.toFixed(1)} kg`}
                  detail="Available to MTOW"
                  ok={tecnam.total.weightKg <= TECNAM.maxTakeoffWeightKg}
                />
              </div>

              {tecnam.warnings.length > 0 ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  {tecnam.warnings.map((warning) => (
                    <p key={warning} className="text-sm text-red-700">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  No major mass or CG warnings.
                </div>
              )}

              <TecnamTable
                rows={[
                  tecnam.empty,
                  tecnam.pilotPassenger,
                  tecnam.fuel,
                  tecnam.baggage,
                  tecnam.total,
                ]}
              />
            </main>
          </section>

      {aircraft === "Tecnam P2008" ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Step 05
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                Tecnam performance
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Calculated with the legacy AFM tables: TODR/LDR 50 ft, ROC and Vy.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <TecnamPerformanceTable rows={tecnamPerformanceRows} />
          </div>
        </section>
      ) : null}

        </>
      )}

      
      <ExportPdfSection
        aircraft={aircraft}
        registration={registration}
        date={date}
        pdfBusy={pdfBusy}
        pdfStatus={pdfStatus}
        onExport={exportPerformancePdf}
      />


    </div>
  );
}
