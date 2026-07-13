"use client";

import { useEffect, useMemo, useState } from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";

type ClimbTableKind = "vy" | "vx";
type WeightMode = "maximum" | "1080" | "930";

type SourceAsset = {
  image: string;
  text: string;
  pdfPage: number;
  printedPage: string;
};

type ClimbSource = {
  id: ClimbTableKind;
  title: string;
  speedLabel: "Vy" | "Vx";
  altitudeStepFt: 1000 | 2000;
  maximumAltitudeFt: 7000 | 14000;
  manifest: Record<P2006TRegistration, SourceAsset>;
};

type ClimbRow = {
  weightKg: number;
  altitudeFt: number;
  speedKias: number;
  rates: [number, number, number, number, number];
};

const TEMPERATURES = [-25, 0, 25, 50] as const;
const TEMPERATURE_LABELS = ["-25", "0", "25", "50", "ISA"] as const;

function sourceAsset(
  registration: P2006TRegistration,
  pdfPage: number,
  printedPage: string
): SourceAsset {
  return {
    image: `/p2006-performance-pages/${registration}/page-${pdfPage}.png`,
    text: `/p2006-performance-pages/${registration}/page-${pdfPage}.txt`,
    pdfPage,
    printedPage,
  };
}

const CLIMB_SOURCES: Record<ClimbTableKind, ClimbSource> = {
  vy: {
    id: "vy",
    title: "Take-off Rate of Climb at Vy",
    speedLabel: "Vy",
    altitudeStepFt: 2000,
    maximumAltitudeFt: 14000,
    manifest: {
      "CS-EAQ": sourceAsset("CS-EAQ", 174, "5-10"),
      "CS-EBX": sourceAsset("CS-EBX", 174, "SW5-10"),
      "D-GSEV": sourceAsset("D-GSEV", 172, "S5-10"),
    },
  },
  vx: {
    id: "vx",
    title: "Take-off Rate of Climb at Vx",
    speedLabel: "Vx",
    altitudeStepFt: 1000,
    maximumAltitudeFt: 7000,
    manifest: {
      "CS-EAQ": sourceAsset("CS-EAQ", 175, "5-11"),
      "CS-EBX": sourceAsset("CS-EBX", 175, "SW5-11"),
      "D-GSEV": sourceAsset("D-GSEV", 173, "S5-11"),
    },
  },
};

function maximumWeight(registration: P2006TRegistration) {
  return registration === "CS-EAQ" ? 1180 : 1230;
}

function parseClimbTable(
  text: string,
  registration: P2006TRegistration
): ClimbRow[] {
  const parsed = text
    .split(/\r?\n/)
    .map((line) =>
      line.match(
        /^\s*(S\.L\.|\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/
      )
    )
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      altitudeFt: match[1] === "S.L." ? 0 : Number(match[1]),
      speedKias: Number(match[2]),
      rates: [
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
        Number(match[7]),
      ] as [number, number, number, number, number],
    }));

  if (parsed.length !== 24) return [];

  const weights = [maximumWeight(registration), 1080, 930];
  return parsed.map((row, index) => ({
    ...row,
    weightKg: weights[Math.floor(index / 8)],
  }));
}

function interpolate(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

function bracket(value: number, values: number[]) {
  if (!values.length || value < values[0] || value > values[values.length - 1]) {
    return null;
  }

  let lower = 0;
  let upper = values.length - 1;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] <= value) lower = index;
    if (values[index] >= value) {
      upper = index;
      break;
    }
  }

  const low = values[lower];
  const high = values[upper];
  return {
    lower,
    upper,
    ratio: high === low ? 0 : (value - low) / (high - low),
  };
}

export function P2006TClimbTables() {
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [tableKind, setTableKind] = useState<ClimbTableKind>("vy");
  const [weightMode, setWeightMode] = useState<WeightMode>("maximum");
  const [pressureAltitude, setPressureAltitude] = useState(3000);
  const [temperature, setTemperature] = useState(10);
  const [rows, setRows] = useState<ClimbRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  const source = CLIMB_SOURCES[tableKind];
  const asset = source.manifest[registration];
  const selectedWeight =
    weightMode === "maximum" ? maximumWeight(registration) : Number(weightMode);

  useEffect(() => {
    setPressureAltitude((current) =>
      Math.min(current, CLIMB_SOURCES[tableKind].maximumAltitudeFt)
    );
  }, [tableKind]);

  useEffect(() => {
    const controller = new AbortController();
    setRows([]);
    setLoadState("loading");

    void fetch(asset.text, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Source TXT unavailable");
        return response.text();
      })
      .then((text) => {
        const parsed = parseClimbTable(text, registration);
        setRows(parsed);
        setLoadState(parsed.length === 24 ? "ready" : "error");
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("error");
      });

    return () => controller.abort();
  }, [asset.text, registration]);

  const selectedRows = useMemo(
    () => rows.filter((row) => row.weightKg === selectedWeight),
    [rows, selectedWeight]
  );

  const calculation = useMemo(() => {
    if (selectedRows.length !== 8) return null;
    const altitudeValues = selectedRows.map((row) => row.altitudeFt);
    const altitude = bracket(pressureAltitude, altitudeValues);
    const oat = bracket(temperature, [...TEMPERATURES]);
    if (!altitude || !oat) return null;

    const lowerRow = selectedRows[altitude.lower];
    const upperRow = selectedRows[altitude.upper];
    const lowerAtTemperature = interpolate(
      lowerRow.rates[oat.lower],
      lowerRow.rates[oat.upper],
      oat.ratio
    );
    const upperAtTemperature = interpolate(
      upperRow.rates[oat.lower],
      upperRow.rates[oat.upper],
      oat.ratio
    );

    const selectedCells = [
      `${lowerRow.altitudeFt}:${oat.lower}`,
      `${lowerRow.altitudeFt}:${oat.upper}`,
      `${upperRow.altitudeFt}:${oat.lower}`,
      `${upperRow.altitudeFt}:${oat.upper}`,
    ];

    return {
      speedKias: interpolate(
        lowerRow.speedKias,
        upperRow.speedKias,
        altitude.ratio
      ),
      rateFpm: interpolate(
        lowerAtTemperature,
        upperAtTemperature,
        altitude.ratio
      ),
      lowerAltitudeFt: lowerRow.altitudeFt,
      upperAltitudeFt: upperRow.altitudeFt,
      lowerAtTemperature,
      upperAtTemperature,
      selectedCells: new Set(selectedCells),
    };
  }, [pressureAltitude, selectedRows, temperature]);

  return (
    <section className="space-y-5 rounded-3xl border border-violet-200 bg-violet-50/40 p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
            Next performance tables · draft audit
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-zinc-950">
            Take-off climb performance
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            The next two AFM tables are now parsed aircraft-by-aircraft. The preview
            interpolates only inside the published altitude and temperature ranges and
            keeps the ISA column visible for comparison.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-zinc-700">
            Aircraft
            <select
              value={registration}
              onChange={(event) =>
                setRegistration(event.target.value as P2006TRegistration)
              }
              className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {P2006T_REGISTRATIONS.map((candidate) => (
                <option key={candidate}>{candidate}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-zinc-700">
            Table
            <select
              value={tableKind}
              onChange={(event) =>
                setTableKind(event.target.value as ClimbTableKind)
              }
              className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="vy">Rate of climb at Vy</option>
              <option value="vx">Rate of climb at Vx</option>
            </select>
          </label>

          <label className="text-xs font-semibold text-zinc-700">
            Weight
            <select
              value={weightMode}
              onChange={(event) => setWeightMode(event.target.value as WeightMode)}
              className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="maximum">MAX · {maximumWeight(registration)} kg</option>
              <option value="1080">1080 kg</option>
              <option value="930">930 kg</option>
            </select>
          </label>

          <div className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs text-zinc-600">
            <p className="font-semibold text-zinc-900">Source</p>
            <p>PDF {asset.pdfPage} · AFM {asset.printedPage}</p>
            <p>{loadState === "ready" ? "24 rows parsed" : loadState}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(520px,0.75fr)]">
        <div className="overflow-hidden rounded-2xl border border-zinc-300 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`${registration}-${tableKind}`}
            src={asset.image}
            alt={`${source.title} source page for ${registration}`}
            className="block h-auto w-full"
          />
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
            <label className="text-xs font-semibold text-zinc-700">
              Pressure altitude ft
              <input
                type="number"
                min="0"
                max={source.maximumAltitudeFt}
                step={source.altitudeStepFt / 2}
                value={pressureAltitude}
                onChange={(event) =>
                  setPressureAltitude(Number(event.target.value))
                }
                className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-zinc-700">
              OAT °C
              <input
                type="number"
                min="-25"
                max="50"
                step="1"
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
                className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>

            <div className="col-span-2 rounded-2xl bg-zinc-950 p-4 text-sm text-white">
              <p className="font-semibold">{source.title}</p>
              {calculation ? (
                <div className="mt-2 space-y-1">
                  <p>
                    {source.speedLabel}: {calculation.speedKias.toFixed(1)} KIAS
                  </p>
                  <p>
                    Interpolated ROC: {calculation.rateFpm.toFixed(0)} ft/min
                  </p>
                  <p className="text-xs text-zinc-300">
                    Altitude rows {calculation.lowerAltitudeFt} / {calculation.upperAltitudeFt}
                    ft · temperature interpolation {calculation.lowerAtTemperature.toFixed(1)} /
                    {" "}{calculation.upperAtTemperature.toFixed(1)} ft/min
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-amber-300">
                  Enter values inside the published range after the table has loaded.
                </p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="min-w-full border-collapse text-right text-xs">
              <thead className="bg-zinc-100 text-zinc-700">
                <tr>
                  <th className="px-3 py-2 text-left">Altitude</th>
                  <th className="px-3 py-2">{source.speedLabel}</th>
                  {TEMPERATURE_LABELS.map((label) => (
                    <th key={label} className="px-3 py-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedRows.map((row) => (
                  <tr key={row.altitudeFt} className="border-t border-zinc-100">
                    <th className="px-3 py-2 text-left font-semibold text-zinc-800">
                      {row.altitudeFt === 0 ? "S.L." : row.altitudeFt}
                    </th>
                    <td className="px-3 py-2 text-zinc-700">{row.speedKias}</td>
                    {row.rates.map((rate, column) => {
                      const selected = calculation?.selectedCells.has(
                        `${row.altitudeFt}:${column}`
                      );
                      return (
                        <td
                          key={column}
                          className={`px-3 py-2 font-medium ${
                            selected
                              ? "bg-amber-200 text-amber-950"
                              : "text-zinc-700"
                          }`}
                        >
                          {rate}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {loadState === "error" ? (
              <p className="border-t border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
                The source text did not produce the expected 3 × 8-row table. No
                calculation is exposed until all 24 rows parse correctly.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
