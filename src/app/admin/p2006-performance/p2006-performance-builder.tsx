"use client";

import { useEffect, useMemo, useState } from "react";
import rawDataset from "@/lib/performance/p2006t-distance-tables.json";
import {
  P2006T_DISTANCE_KINDS,
  type P2006TDistanceKind,
  type P2006TDistanceTable,
} from "@/lib/performance/p2006t-distance";
import {
  getP2006TFleetAircraft,
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";

type EditableTable = Omit<P2006TDistanceTable, "valuesM"> & {
  valuesM: Array<Array<Array<number | null>>>;
};

type SourceDraft = {
  imagePath: string;
  textPath: string;
  sourceText: string;
};

type CorrectionDraft = {
  headwindReductionMPerKt: number;
  tailwindIncreaseMPerKt: number;
  pavedFactor: number;
  uphillFactorPerPct: number;
};

const TABLE_LABELS: Record<P2006TDistanceKind, string> = {
  "takeoff-ground-roll": "Takeoff ground roll",
  "takeoff-50ft": "Takeoff over 50 ft",
  "landing-ground-roll": "Landing ground roll",
  "landing-50ft": "Landing over 50 ft",
};

const STORAGE_KEY = "briefings_p2006_guided_builder_v1";

const DEFAULT_ALTITUDES = [
  0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
];
const DEFAULT_TEMPERATURES = [-25, 0, 25, 50];

function cloneTable(table: P2006TDistanceTable): EditableTable {
  return {
    ...table,
    axes: {
      weightKg: [...table.axes.weightKg],
      pressureAltitudeFt: [...table.axes.pressureAltitudeFt],
      oatC: [...table.axes.oatC],
    },
    valuesM: table.valuesM.map((weightLayer) =>
      weightLayer.map((row) => row.map((value) => value))
    ),
  };
}

function emptyTable(
  registration: P2006TRegistration,
  kind: P2006TDistanceKind
): EditableTable {
  const referenceWeight = kind.startsWith("takeoff") ? 1180 : 930;

  return {
    id: `${registration.toLowerCase()}-${kind}`,
    kind,
    sourcePage: "",
    notes: "",
    axes: {
      weightKg: [referenceWeight],
      pressureAltitudeFt: [...DEFAULT_ALTITUDES],
      oatC: [...DEFAULT_TEMPERATURES],
    },
    valuesM: [
      DEFAULT_ALTITUDES.map(() => DEFAULT_TEMPERATURES.map(() => null)),
    ],
  };
}

function initialTables() {
  const csEaqTables = (rawDataset.tables as P2006TDistanceTable[]).map(cloneTable);

  return Object.fromEntries(
    P2006T_REGISTRATIONS.map((registration) => [
      registration,
      registration === "CS-EAQ"
        ? csEaqTables
        : P2006T_DISTANCE_KINDS.map((kind) => emptyTable(registration, kind)),
    ])
  ) as Record<P2006TRegistration, EditableTable[]>;
}

function initialSources() {
  return Object.fromEntries(
    P2006T_REGISTRATIONS.flatMap((registration) =>
      P2006T_DISTANCE_KINDS.map((kind) => [
        `${registration}:${kind}`,
        {
          imagePath: "",
          textPath: "",
          sourceText: "",
        } satisfies SourceDraft,
      ])
    )
  ) as Record<string, SourceDraft>;
}

function initialReviews() {
  return Object.fromEntries(
    P2006T_REGISTRATIONS.flatMap((registration) =>
      P2006T_DISTANCE_KINDS.map((kind) => [
        `${registration}:${kind}`,
        false,
      ])
    )
  ) as Record<string, boolean>;
}

function defaultCorrections(kind: P2006TDistanceKind): CorrectionDraft {
  if (kind.startsWith("takeoff")) {
    return {
      headwindReductionMPerKt: 2.5,
      tailwindIncreaseMPerKt: 10,
      pavedFactor: kind === "takeoff-ground-roll" ? 0.94 : 1,
      uphillFactorPerPct: kind === "takeoff-ground-roll" ? 0.05 : 0,
    };
  }

  return {
    headwindReductionMPerKt: 5,
    tailwindIncreaseMPerKt: 11,
    pavedFactor: kind === "landing-ground-roll" ? 0.98 : 1,
    uphillFactorPerPct: kind === "landing-ground-roll" ? -0.025 : 0,
  };
}

function bracket(axis: number[], value: number) {
  if (value < axis[0] || value > axis[axis.length - 1]) return null;

  const exact = axis.indexOf(value);
  if (exact >= 0) {
    return { lower: exact, upper: exact, fraction: 0 };
  }

  for (let upper = 1; upper < axis.length; upper += 1) {
    if (value <= axis[upper]) {
      const lower = upper - 1;
      return {
        lower,
        upper,
        fraction:
          (value - axis[lower]) / (axis[upper] - axis[lower]),
      };
    }
  }

  return null;
}

function lerp(a: number, b: number, fraction: number) {
  return a + (b - a) * fraction;
}

function tableIsComplete(table: EditableTable) {
  return table.valuesM.every((weightLayer) =>
    weightLayer.every((row) =>
      row.every((value) => typeof value === "number" && Number.isFinite(value))
    )
  );
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
      {children}
    </span>
  );
}

export function P2006TPerformanceBuilder() {
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [kind, setKind] =
    useState<P2006TDistanceKind>("takeoff-ground-roll");
  const [tables, setTables] = useState(initialTables);
  const [sources, setSources] = useState(initialSources);
  const [reviews, setReviews] = useState(initialReviews);
  const [pressureAltitudeFt, setPressureAltitudeFt] = useState(1500);
  const [oatC, setOatC] = useState(15);
  const [windComponentKt, setWindComponentKt] = useState(0);
  const [uphillSlopePct, setUphillSlopePct] = useState(0);
  const [corrections, setCorrections] = useState<CorrectionDraft>(() =>
    defaultCorrections("takeoff-ground-roll")
  );
  const [status, setStatus] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as {
        tables?: Record<P2006TRegistration, EditableTable[]>;
        sources?: Record<string, SourceDraft>;
        reviews?: Record<string, boolean>;
      };

      if (parsed.tables) setTables(parsed.tables);
      if (parsed.sources) setSources(parsed.sources);
      if (parsed.reviews) setReviews(parsed.reviews);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    setCorrections(defaultCorrections(kind));
  }, [kind]);

  const aircraft = getP2006TFleetAircraft(registration);
  const table = tables[registration].find((item) => item.kind === kind)!;
  const tableKey = `${registration}:${kind}`;
  const source = sources[tableKey];

  const reviewedCount = P2006T_DISTANCE_KINDS.filter(
    (tableKind) => reviews[`${registration}:${tableKind}`]
  ).length;

  const interpolation = useMemo(() => {
    const altitude = bracket(table.axes.pressureAltitudeFt, pressureAltitudeFt);
    const temperature = bracket(table.axes.oatC, oatC);

    if (!altitude || !temperature) {
      return {
        ok: false as const,
        reason: "Input is outside the published table axes. Extrapolation is blocked.",
        highlighted: new Set<string>(),
      };
    }

    const values = table.valuesM[0];
    const v00 = values[altitude.lower][temperature.lower];
    const v01 = values[altitude.lower][temperature.upper];
    const v10 = values[altitude.upper][temperature.lower];
    const v11 = values[altitude.upper][temperature.upper];

    if ([v00, v01, v10, v11].some((value) => value === null)) {
      return {
        ok: false as const,
        reason: "One or more required table cells are still empty.",
        highlighted: new Set([
          `${altitude.lower}:${temperature.lower}`,
          `${altitude.lower}:${temperature.upper}`,
          `${altitude.upper}:${temperature.lower}`,
          `${altitude.upper}:${temperature.upper}`,
        ]),
      };
    }

    const lowerAltitudeValue = lerp(
      Number(v00),
      Number(v01),
      temperature.fraction
    );
    const upperAltitudeValue = lerp(
      Number(v10),
      Number(v11),
      temperature.fraction
    );
    const rawDistanceM = lerp(
      lowerAltitudeValue,
      upperAltitudeValue,
      altitude.fraction
    );

    const afterWind =
      windComponentKt >= 0
        ? rawDistanceM -
          corrections.headwindReductionMPerKt * windComponentKt
        : rawDistanceM +
          corrections.tailwindIncreaseMPerKt * Math.abs(windComponentKt);
    const afterPaved = afterWind * corrections.pavedFactor;
    const correctedDistanceM =
      afterPaved * (1 + corrections.uphillFactorPerPct * uphillSlopePct);

    return {
      ok: true as const,
      altitude,
      temperature,
      v00: Number(v00),
      v01: Number(v01),
      v10: Number(v10),
      v11: Number(v11),
      lowerAltitudeValue,
      upperAltitudeValue,
      rawDistanceM,
      afterWind,
      afterPaved,
      correctedDistanceM,
      highlighted: new Set([
        `${altitude.lower}:${temperature.lower}`,
        `${altitude.lower}:${temperature.upper}`,
        `${altitude.upper}:${temperature.lower}`,
        `${altitude.upper}:${temperature.upper}`,
      ]),
    };
  }, [
    corrections,
    oatC,
    pressureAltitudeFt,
    table,
    uphillSlopePct,
    windComponentKt,
  ]);

  function updateCell(
    altitudeIndex: number,
    temperatureIndex: number,
    value: string
  ) {
    setTables((current) => ({
      ...current,
      [registration]: current[registration].map((item) => {
        if (item.kind !== kind) return item;

        return {
          ...item,
          valuesM: item.valuesM.map((weightLayer, weightIndex) =>
            weightIndex === 0
              ? weightLayer.map((row, rowIndex) =>
                  rowIndex === altitudeIndex
                    ? row.map((cell, columnIndex) =>
                        columnIndex === temperatureIndex
                          ? value.trim() === ""
                            ? null
                            : Number(value)
                          : cell
                      )
                    : row
                )
              : weightLayer
          ),
        };
      }),
    }));

    setReviews((current) => ({ ...current, [tableKey]: false }));
  }

  function updateTableMetadata(
    patch: Partial<Pick<EditableTable, "sourcePage" | "notes">>
  ) {
    setTables((current) => ({
      ...current,
      [registration]: current[registration].map((item) =>
        item.kind === kind ? { ...item, ...patch } : item
      ),
    }));
    setReviews((current) => ({ ...current, [tableKey]: false }));
  }

  function updateSource(patch: Partial<SourceDraft>) {
    setSources((current) => ({
      ...current,
      [tableKey]: { ...current[tableKey], ...patch },
    }));
  }

  function saveDrafts() {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tables, sources, reviews })
    );
    setStatus("Draft saved in this browser.");
  }

  function exportAircraftJson() {
    const payload = {
      aircraft: "Tecnam P2006T",
      registration,
      serialNumber: aircraft.serialNumber,
      status: reviewedCount === 4 ? "reviewed-in-builder" : "draft",
      runwaySurface: "paved",
      tables: tables[registration],
      sourceAssets: Object.fromEntries(
        P2006T_DISTANCE_KINDS.map((tableKind) => [
          tableKind,
          sources[`${registration}:${tableKind}`],
        ])
      ),
      reviews: Object.fromEntries(
        P2006T_DISTANCE_KINDS.map((tableKind) => [
          tableKind,
          reviews[`${registration}:${tableKind}`],
        ])
      ),
    };

    downloadText(
      `p2006t_${registration.toLowerCase()}_guided-draft.json`,
      JSON.stringify(payload, null, 2)
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Step 1 of 4 · aircraft and source
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Select the aircraft-specific dataset
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              No values are shared automatically between registrations. Source
              image and text paths remain editable so the exact GitHub assets can
              be connected and corrected without changing calculation code.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="space-y-1">
              <FieldLabel>Aircraft</FieldLabel>
              <select
                value={registration}
                onChange={(event) =>
                  setRegistration(event.target.value as P2006TRegistration)
                }
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                {P2006T_REGISTRATIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <p className="font-semibold text-zinc-950">
                S/N {aircraft.serialNumber} · {aircraft.buildYear}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {aircraft.afmDocument}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {P2006T_DISTANCE_KINDS.map((tableKind, index) => {
            const active = kind === tableKind;
            const reviewed = reviews[`${registration}:${tableKind}`];
            const complete = tableIsComplete(
              tables[registration].find((item) => item.kind === tableKind)!
            );

            return (
              <button
                key={tableKind}
                type="button"
                onClick={() => setKind(tableKind)}
                className={[
                  "rounded-2xl border p-3 text-left transition",
                  active
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                ].join(" ")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide opacity-60">
                  Table {index + 1}
                </span>
                <span className="mt-1 block text-sm font-semibold">
                  {TABLE_LABELS[tableKind]}
                </span>
                <span className="mt-1 block text-xs opacity-70">
                  {reviewed ? "Reviewed" : complete ? "Complete · review needed" : "Incomplete"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Step 2 of 4 · source and table values
            </p>
            <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-zinc-950">
                  {TABLE_LABELS[kind]}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Reference weight {table.axes.weightKg[0]} kg · paved runway used
                  operationally; raw source values remain separate.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={reviews[tableKey]}
                  disabled={!tableIsComplete(table)}
                  onChange={(event) =>
                    setReviews((current) => ({
                      ...current,
                      [tableKey]: event.target.checked,
                    }))
                  }
                />
                Table checked against source
              </label>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <FieldLabel>AFM page</FieldLabel>
                <input
                  value={table.sourcePage}
                  onChange={(event) =>
                    updateTableMetadata({ sourcePage: event.target.value })
                  }
                  placeholder="Section 5, page ..."
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <FieldLabel>Source image path in /public</FieldLabel>
                <input
                  value={source.imagePath}
                  onChange={(event) =>
                    updateSource({ imagePath: event.target.value })
                  }
                  placeholder="/p2006-performance-pages/...png"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <FieldLabel>Source text path in /public</FieldLabel>
                <input
                  value={source.textPath}
                  onChange={(event) =>
                    updateSource({ textPath: event.target.value })
                  }
                  placeholder="/p2006-performance-pages/...txt"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <FieldLabel>Notes / published conditions</FieldLabel>
                <textarea
                  value={table.notes ?? ""}
                  onChange={(event) =>
                    updateTableMetadata({ notes: event.target.value })
                  }
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {source.imagePath ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={source.imagePath}
                  alt={`${registration} ${TABLE_LABELS[kind]} source`}
                  className="max-h-[720px] w-full object-contain"
                />
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
                Enter the existing GitHub public image path to display the original
                performance page beside the editable values.
              </div>
            )}

            <label className="mt-5 block space-y-1">
              <FieldLabel>Extracted source text</FieldLabel>
              <textarea
                value={source.sourceText}
                onChange={(event) =>
                  updateSource({ sourceText: event.target.value })
                }
                rows={6}
                placeholder="Paste or correct the extracted page text here."
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono text-xs leading-5"
              />
            </label>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-200">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-3 text-left">Pressure altitude</th>
                    {table.axes.oatC.map((temperature) => (
                      <th key={temperature} className="px-3 py-3 text-center">
                        {temperature} °C
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {table.axes.pressureAltitudeFt.map((altitude, altitudeIndex) => (
                    <tr key={altitude}>
                      <td className="bg-zinc-50 px-3 py-2 font-semibold text-zinc-700">
                        {altitude.toLocaleString()} ft
                      </td>
                      {table.axes.oatC.map((temperature, temperatureIndex) => {
                        const highlighted = interpolation.highlighted.has(
                          `${altitudeIndex}:${temperatureIndex}`
                        );
                        const value =
                          table.valuesM[0][altitudeIndex][temperatureIndex];

                        return (
                          <td
                            key={`${altitude}-${temperature}`}
                            className={[
                              "px-2 py-2",
                              highlighted ? "bg-amber-100" : "bg-white",
                            ].join(" ")}
                          >
                            <input
                              type="number"
                              value={value ?? ""}
                              onChange={(event) =>
                                updateCell(
                                  altitudeIndex,
                                  temperatureIndex,
                                  event.target.value
                                )
                              }
                              className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-center font-mono text-sm"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Step 3 of 4 · interpolation check
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Show every calculation step
            </h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="space-y-1">
                <FieldLabel>Pressure altitude ft</FieldLabel>
                <input
                  type="number"
                  value={pressureAltitudeFt}
                  onChange={(event) =>
                    setPressureAltitudeFt(Number(event.target.value))
                  }
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <FieldLabel>OAT °C</FieldLabel>
                <input
                  type="number"
                  value={oatC}
                  onChange={(event) => setOatC(Number(event.target.value))}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <FieldLabel>Wind component kt</FieldLabel>
                <input
                  type="number"
                  value={windComponentKt}
                  onChange={(event) =>
                    setWindComponentKt(Number(event.target.value))
                  }
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
                <p className="text-xs text-zinc-500">
                  Positive = headwind; negative = tailwind.
                </p>
              </label>
              <label className="space-y-1">
                <FieldLabel>Uphill slope %</FieldLabel>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={uphillSlopePct}
                  onChange={(event) =>
                    setUphillSlopePct(Number(event.target.value))
                  }
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {(
                [
                  ["Headwind m/kt", "headwindReductionMPerKt"],
                  ["Tailwind m/kt", "tailwindIncreaseMPerKt"],
                  ["Paved factor", "pavedFactor"],
                  ["Slope factor / 1%", "uphillFactorPerPct"],
                ] as const
              ).map(([label, key]) => (
                <label key={key} className="space-y-1">
                  <FieldLabel>{label}</FieldLabel>
                  <input
                    type="number"
                    step="any"
                    value={corrections[key]}
                    onChange={(event) =>
                      setCorrections((current) => ({
                        ...current,
                        [key]: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>

            {interpolation.ok ? (
              <div className="mt-5 space-y-3 text-sm">
                <div className="rounded-xl bg-zinc-50 p-3 font-mono text-xs leading-5 text-zinc-700">
                  <p>
                    PA bracket: {table.axes.pressureAltitudeFt[interpolation.altitude.lower]} / {table.axes.pressureAltitudeFt[interpolation.altitude.upper]} ft
                  </p>
                  <p>
                    OAT bracket: {table.axes.oatC[interpolation.temperature.lower]} / {table.axes.oatC[interpolation.temperature.upper]} °C
                  </p>
                  <p>
                    Cells: {interpolation.v00}, {interpolation.v01}, {interpolation.v10}, {interpolation.v11} m
                  </p>
                  <p>
                    Lower-altitude OAT interpolation = {interpolation.lowerAltitudeValue.toFixed(2)} m
                  </p>
                  <p>
                    Upper-altitude OAT interpolation = {interpolation.upperAltitudeValue.toFixed(2)} m
                  </p>
                  <p>
                    Altitude interpolation = {interpolation.rawDistanceM.toFixed(2)} m
                  </p>
                </div>

                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                    Corrections · paved fixed
                  </p>
                  <p className="mt-2">After wind: {interpolation.afterWind.toFixed(2)} m</p>
                  <p>After paved factor: {interpolation.afterPaved.toFixed(2)} m</p>
                  <p>After slope: {interpolation.correctedDistanceM.toFixed(2)} m</p>
                  <p className="mt-2 text-xl font-semibold text-zinc-950">
                    Final {interpolation.correctedDistanceM.toFixed(0)} m
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {interpolation.reason}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Step 4 of 4 · review package
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Export the editable draft
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              This does not approve the operational dataset. It creates a reviewable
              JSON package containing the values, source paths and review flags.
            </p>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <p className="font-semibold text-zinc-950">
                {reviewedCount}/4 tables reviewed
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                All four tables must be complete and checked before the repository
                dataset can be marked verified.
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={saveDrafts}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Save browser draft
              </button>
              <button
                type="button"
                onClick={exportAircraftJson}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Download review JSON
              </button>
              {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
            </div>
          </section>

          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
            <p className="font-semibold">P2006T PDF template queued next</p>
            <p className="mt-1">
              Page 1 contains loading entries and the graphical M&B worksheet. Page
              2 contains Departure, Arrival and Alternate airfield data, TODA/TODR,
              LDA/LDR, ROC and the eleven-line fuel plan. The PDF mapping builder
              will use the same reviewed values and calculation trace rather than a
              separate calculation path.
            </p>
          </section>
        </aside>
      </section>
    </div>
  );
}
