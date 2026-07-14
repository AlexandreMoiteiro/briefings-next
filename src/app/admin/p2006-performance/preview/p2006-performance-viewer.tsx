"use client";

import { useEffect, useMemo, useState } from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  ALL_AUDIT_SOURCES,
  type AuditPerformanceSource,
  type CaptureStore,
} from "../p2006-mapper-definitions";

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const CLIMB_TEMPERATURES = [-25, 0, 25, 50] as const;
const CRUISE_DEVIATIONS = [-30, 0, 30] as const;

type ViewerTab = "climb" | "cruise";

type ClimbRow = {
  weightKg: number;
  altitudeFt: number;
  speedKias: number;
  rates: [number, number, number, number, number];
};

type ClimbPoint = {
  speedKias: number;
  rateFpm: number;
};

type CruiseValue = {
  powerPercent: number;
  ktas: number;
  fuelLphPerEngine: number;
};

type CruiseRow = {
  rpm: number;
  mapInHg: number;
  values: [CruiseValue, CruiseValue, CruiseValue];
};

type CruiseChart = {
  altitudeFt: number;
  source: AuditPerformanceSource;
  rows: CruiseRow[];
};

const CLIMB_SOURCES = ALL_AUDIT_SOURCES.filter(
  (source) => source.auditFamily === "climb"
);
const CRUISE_SOURCES = ALL_AUDIT_SOURCES.filter(
  (source) => source.auditFamily === "cruise"
).sort((a, b) => cruiseAltitude(a) - cruiseAltitude(b));

function cruiseAltitude(source: AuditPerformanceSource) {
  const match = source.id.match(/cruise-(\d+)/);
  return match ? Number(match[1]) : 0;
}

function maximumWeight(registration: P2006TRegistration) {
  return registration === "CS-EAQ" ? 1180 : 1230;
}

function lerp(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

function bracket(value: number, values: readonly number[]) {
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

function parseClimbRows(
  text: string,
  registration: P2006TRegistration
): ClimbRow[] {
  const raw = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      if (/^S\.L\.\s+/.test(line)) {
        const numbers = line.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        if (numbers.length < 6) return null;
        return {
          altitudeFt: 0,
          speedKias: numbers[0],
          rates: numbers.slice(1, 6) as [number, number, number, number, number],
        };
      }

      if (!/^\d{3,5}\s+/.test(line)) return null;
      const numbers = line.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      if (numbers.length < 7) return null;
      return {
        altitudeFt: numbers[0],
        speedKias: numbers[1],
        rates: numbers.slice(2, 7) as [number, number, number, number, number],
      };
    })
    .filter(
      (
        row
      ): row is {
        altitudeFt: number;
        speedKias: number;
        rates: [number, number, number, number, number];
      } =>
        Boolean(
          row &&
            row.altitudeFt >= 0 &&
            row.altitudeFt <= 16000 &&
            row.speedKias >= 50 &&
            row.speedKias <= 120
        )
    );

  if (raw.length < 24) return [];
  const rows = raw.slice(0, 24);
  const weights = [maximumWeight(registration), 1080, 930];
  return rows.map((row, index) => ({
    ...row,
    weightKg: weights[Math.floor(index / 8)],
  }));
}

function climbAtPublishedWeight(
  rows: ClimbRow[],
  altitudeFt: number,
  temperatureC: number
): ClimbPoint | null {
  const ordered = [...rows].sort((a, b) => a.altitudeFt - b.altitudeFt);
  const altitudeValues = ordered.map((row) => row.altitudeFt);
  const altitude = bracket(altitudeFt, altitudeValues);
  const temperature = bracket(temperatureC, CLIMB_TEMPERATURES);
  if (!altitude || !temperature) return null;

  const lower = ordered[altitude.lower];
  const upper = ordered[altitude.upper];
  const lowerRate = lerp(
    lower.rates[temperature.lower],
    lower.rates[temperature.upper],
    temperature.ratio
  );
  const upperRate = lerp(
    upper.rates[temperature.lower],
    upper.rates[temperature.upper],
    temperature.ratio
  );

  return {
    speedKias: lerp(lower.speedKias, upper.speedKias, altitude.ratio),
    rateFpm: lerp(lowerRate, upperRate, altitude.ratio),
  };
}

function calculateClimb(
  rows: ClimbRow[],
  weightKg: number,
  altitudeFt: number,
  temperatureC: number
): ClimbPoint | null {
  const weights = Array.from(new Set(rows.map((row) => row.weightKg))).sort(
    (a, b) => a - b
  );
  const weight = bracket(weightKg, weights);
  if (!weight) return null;

  const lowerWeight = weights[weight.lower];
  const upperWeight = weights[weight.upper];
  const lower = climbAtPublishedWeight(
    rows.filter((row) => row.weightKg === lowerWeight),
    altitudeFt,
    temperatureC
  );
  const upper = climbAtPublishedWeight(
    rows.filter((row) => row.weightKg === upperWeight),
    altitudeFt,
    temperatureC
  );
  if (!lower || !upper) return null;

  return {
    speedKias: lerp(lower.speedKias, upper.speedKias, weight.ratio),
    rateFpm: lerp(lower.rateFpm, upper.rateFpm, weight.ratio),
  };
}

function parseCruiseBlock(text: string, altitudeFt: number): CruiseRow[] {
  const lines = text.replace(/\u00a0/g, " ").split(/\r?\n/);
  const altitudeExpression = new RegExp(
    `Pressure\\s+Altitude:\\s*${altitudeFt}\\s*ft`,
    "i"
  );
  const start = lines.findIndex((line) => altitudeExpression.test(line));
  if (start < 0) return [];
  const next = lines.findIndex(
    (line, index) =>
      index > start && /Pressure\s+Altitude:\s*\d+\s*ft/i.test(line)
  );
  const block = lines.slice(start + 1, next > start ? next : undefined);

  return block
    .map((line) => line.trim())
    .filter((line) => /^(?:1900|2100|2250|2388)\s+/.test(line))
    .map((line) => line.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [])
    .filter((numbers) => numbers.length >= 14)
    .map((numbers) => ({
      rpm: numbers[0],
      mapInHg: numbers[1],
      values: [
        {
          powerPercent: numbers[2],
          ktas: numbers[3],
          fuelLphPerEngine: numbers[4],
        },
        {
          powerPercent: numbers[6],
          ktas: numbers[7],
          fuelLphPerEngine: numbers[8],
        },
        {
          powerPercent: numbers[10],
          ktas: numbers[11],
          fuelLphPerEngine: numbers[12],
        },
      ] as [CruiseValue, CruiseValue, CruiseValue],
    }));
}

function interpolateCruiseTemperature(
  row: CruiseRow,
  deviationC: number
): CruiseValue | null {
  const temperature = bracket(deviationC, CRUISE_DEVIATIONS);
  if (!temperature) return null;
  const lower = row.values[temperature.lower];
  const upper = row.values[temperature.upper];
  return {
    powerPercent: lerp(
      lower.powerPercent,
      upper.powerPercent,
      temperature.ratio
    ),
    ktas: lerp(lower.ktas, upper.ktas, temperature.ratio),
    fuelLphPerEngine: lerp(
      lower.fuelLphPerEngine,
      upper.fuelLphPerEngine,
      temperature.ratio
    ),
  };
}

function evaluateCruiseChart(
  chart: CruiseChart,
  rpm: number,
  mapInHg: number,
  deviationC: number
): CruiseValue | null {
  const rows = chart.rows
    .filter((row) => row.rpm === rpm)
    .sort((a, b) => a.mapInHg - b.mapInHg);
  const maps = rows.map((row) => row.mapInHg);
  const manifold = bracket(mapInHg, maps);
  if (!manifold) return null;
  const lower = interpolateCruiseTemperature(rows[manifold.lower], deviationC);
  const upper = interpolateCruiseTemperature(rows[manifold.upper], deviationC);
  if (!lower || !upper) return null;

  return {
    powerPercent: lerp(
      lower.powerPercent,
      upper.powerPercent,
      manifold.ratio
    ),
    ktas: lerp(lower.ktas, upper.ktas, manifold.ratio),
    fuelLphPerEngine: lerp(
      lower.fuelLphPerEngine,
      upper.fuelLphPerEngine,
      manifold.ratio
    ),
  };
}

function calculateCruise(
  lowerChart: CruiseChart,
  upperChart: CruiseChart,
  requestedAltitudeFt: number,
  rpm: number,
  mapInHg: number,
  deviationC: number
) {
  const lower = evaluateCruiseChart(lowerChart, rpm, mapInHg, deviationC);
  const upper = evaluateCruiseChart(upperChart, rpm, mapInHg, deviationC);
  if (!lower || !upper) return null;
  const ratio =
    upperChart.altitudeFt === lowerChart.altitudeFt
      ? 0
      : (requestedAltitudeFt - lowerChart.altitudeFt) /
        (upperChart.altitudeFt - lowerChart.altitudeFt);

  return {
    powerPercent: lerp(lower.powerPercent, upper.powerPercent, ratio),
    ktas: lerp(lower.ktas, upper.ktas, ratio),
    fuelLphPerEngine: lerp(
      lower.fuelLphPerEngine,
      upper.fuelLphPerEngine,
      ratio
    ),
  };
}

function isCaptureComplete(capture: CaptureStore[string] | undefined) {
  return Boolean(capture?.confirmed);
}

function sourceComplete(
  captures: CaptureStore,
  source: AuditPerformanceSource,
  registration: P2006TRegistration
) {
  return source.steps.every((step) =>
    isCaptureComplete(
      captures[`performance-${source.id}:${registration}:${step.id}`]
    )
  );
}

function SourceImage({
  source,
  registration,
  label,
}: {
  source: AuditPerformanceSource;
  registration: P2006TRegistration;
  label: string;
}) {
  const asset = source.manifest[registration];
  return (
    <figure className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <figcaption className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-800">
        {label} · PDF {asset.pdfPage} · AFM {asset.printedPage}
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.image}
        alt={`${source.title} for ${registration}`}
        className="block h-auto w-full"
      />
    </figure>
  );
}

export function P2006TPerformanceViewer() {
  const [tab, setTab] = useState<ViewerTab>("climb");
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [captures, setCaptures] = useState<CaptureStore>({});

  const [climbSourceId, setClimbSourceId] = useState(
    CLIMB_SOURCES[0]?.id ?? ""
  );
  const [climbRows, setClimbRows] = useState<ClimbRow[]>([]);
  const [climbState, setClimbState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [climbWeight, setClimbWeight] = useState(1100);
  const [climbAltitude, setClimbAltitude] = useState(1500);
  const [climbTemperature, setClimbTemperature] = useState(10);

  const [cruiseAltitudeFt, setCruiseAltitudeFt] = useState(1500);
  const [cruiseOatC, setCruiseOatC] = useState(10);
  const [cruiseCharts, setCruiseCharts] = useState<CruiseChart[]>([]);
  const [cruiseState, setCruiseState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [cruiseRpm, setCruiseRpm] = useState(2250);
  const [cruiseMap, setCruiseMap] = useState(24);

  useEffect(() => {
    const load = () => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        setCaptures(saved ? (JSON.parse(saved) as CaptureStore) : {});
      } catch {
        setCaptures({});
      }
    };
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, []);

  useEffect(() => {
    const maximum = maximumWeight(registration);
    setClimbWeight((current) => Math.min(maximum, Math.max(930, current)));
  }, [registration]);

  const climbSource =
    CLIMB_SOURCES.find((source) => source.id === climbSourceId) ??
    CLIMB_SOURCES[0];

  useEffect(() => {
    if (!climbSource) return;
    const controller = new AbortController();
    const asset = climbSource.manifest[registration];
    setClimbRows([]);
    setClimbState("loading");
    void fetch(asset.text, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Source text unavailable");
        return response.text();
      })
      .then((text) => {
        const rows = parseClimbRows(text, registration);
        setClimbRows(rows);
        setClimbState(rows.length === 24 ? "ready" : "error");
      })
      .catch(() => {
        if (!controller.signal.aborted) setClimbState("error");
      });
    return () => controller.abort();
  }, [climbSource, registration]);

  const climbResult = useMemo(
    () =>
      calculateClimb(
        climbRows,
        climbWeight,
        climbAltitude,
        climbTemperature
      ),
    [climbAltitude, climbRows, climbTemperature, climbWeight]
  );

  const cruiseBracket = useMemo(() => {
    const altitudes = CRUISE_SOURCES.map(cruiseAltitude);
    const selected = bracket(cruiseAltitudeFt, altitudes);
    if (!selected) return null;
    return {
      lower: CRUISE_SOURCES[selected.lower],
      upper: CRUISE_SOURCES[selected.upper],
      lowerAltitude: altitudes[selected.lower],
      upperAltitude: altitudes[selected.upper],
    };
  }, [cruiseAltitudeFt]);

  useEffect(() => {
    if (!cruiseBracket) {
      setCruiseCharts([]);
      setCruiseState("error");
      return;
    }
    const controller = new AbortController();
    setCruiseCharts([]);
    setCruiseState("loading");
    const requested = [cruiseBracket.lower, cruiseBracket.upper].filter(
      (source, index, sources) =>
        sources.findIndex((candidate) => candidate.id === source.id) === index
    );

    void Promise.all(
      requested.map(async (source) => {
        const altitudeFt = cruiseAltitude(source);
        const response = await fetch(source.manifest[registration].text, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Source text unavailable");
        const rows = parseCruiseBlock(await response.text(), altitudeFt);
        if (!rows.length) throw new Error("Cruise block could not be parsed");
        return { altitudeFt, source, rows } satisfies CruiseChart;
      })
    )
      .then((charts) => {
        setCruiseCharts(charts);
        setCruiseState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setCruiseState("error");
      });

    return () => controller.abort();
  }, [cruiseBracket, registration]);

  const lowerCruiseChart = cruiseCharts.find(
    (chart) => chart.altitudeFt === cruiseBracket?.lowerAltitude
  );
  const upperCruiseChart =
    cruiseCharts.find(
      (chart) => chart.altitudeFt === cruiseBracket?.upperAltitude
    ) ?? lowerCruiseChart;

  const commonRpms = useMemo(() => {
    if (!lowerCruiseChart || !upperCruiseChart) return [];
    const lower = new Set(lowerCruiseChart.rows.map((row) => row.rpm));
    return Array.from(
      new Set(upperCruiseChart.rows.map((row) => row.rpm).filter((rpm) => lower.has(rpm)))
    ).sort((a, b) => b - a);
  }, [lowerCruiseChart, upperCruiseChart]);

  useEffect(() => {
    if (!commonRpms.length) return;
    if (!commonRpms.includes(cruiseRpm)) setCruiseRpm(commonRpms[0]);
  }, [commonRpms, cruiseRpm]);

  const cruiseMapRange = useMemo(() => {
    if (!lowerCruiseChart || !upperCruiseChart) return null;
    const range = (chart: CruiseChart) => {
      const values = chart.rows
        .filter((row) => row.rpm === cruiseRpm)
        .map((row) => row.mapInHg);
      return values.length
        ? { minimum: Math.min(...values), maximum: Math.max(...values) }
        : null;
    };
    const lower = range(lowerCruiseChart);
    const upper = range(upperCruiseChart);
    if (!lower || !upper) return null;
    const minimum = Math.max(lower.minimum, upper.minimum);
    const maximum = Math.min(lower.maximum, upper.maximum);
    return minimum <= maximum ? { minimum, maximum } : null;
  }, [cruiseRpm, lowerCruiseChart, upperCruiseChart]);

  useEffect(() => {
    if (!cruiseMapRange) return;
    setCruiseMap((current) =>
      Math.min(cruiseMapRange.maximum, Math.max(cruiseMapRange.minimum, current))
    );
  }, [cruiseMapRange]);

  const isaTemperatureC = 15 - 1.98 * (cruiseAltitudeFt / 1000);
  const cruiseDeviationC = cruiseOatC - isaTemperatureC;
  const cruiseResult = useMemo(() => {
    if (!lowerCruiseChart || !upperCruiseChart) return null;
    return calculateCruise(
      lowerCruiseChart,
      upperCruiseChart,
      cruiseAltitudeFt,
      cruiseRpm,
      cruiseMap,
      cruiseDeviationC
    );
  }, [
    cruiseAltitudeFt,
    cruiseDeviationC,
    cruiseMap,
    cruiseRpm,
    lowerCruiseChart,
    upperCruiseChart,
  ]);

  const climbMapped = climbSource
    ? sourceComplete(captures, climbSource, registration)
    : false;
  const lowerCruiseMapped = cruiseBracket
    ? sourceComplete(captures, cruiseBracket.lower, registration)
    : false;
  const upperCruiseMapped = cruiseBracket
    ? sourceComplete(captures, cruiseBracket.upper, registration)
    : false;

  return (
    <section className="space-y-5 rounded-3xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Performance calculation viewer
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-zinc-950">
            Climb and cruise calculations
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            Results are interpolated directly from the aircraft AFM tables. Cruise altitudes
            between published charts use both surrounding charts automatically.
          </p>
        </div>
        <label className="text-xs font-semibold text-zinc-700">
          Aircraft
          <select
            value={registration}
            onChange={(event) =>
              setRegistration(event.target.value as P2006TRegistration)
            }
            className="mt-1 block rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm"
          >
            {P2006T_REGISTRATIONS.map((candidate) => (
              <option key={candidate}>{candidate}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-2 rounded-2xl border border-indigo-200 bg-white p-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setTab("climb")}
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            tab === "climb" ? "bg-zinc-950 text-white" : "text-zinc-600"
          }`}
        >
          Climb
        </button>
        <button
          type="button"
          onClick={() => setTab("cruise")}
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            tab === "cruise" ? "bg-zinc-950 text-white" : "text-zinc-600"
          }`}
        >
          Cruise
        </button>
      </div>

      {tab === "climb" && climbSource ? (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_430px]">
          <SourceImage
            source={climbSource}
            registration={registration}
            label={climbSource.title}
          />
          <aside className="space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-zinc-950">Climb inputs</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    climbMapped
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {climbMapped ? "Mapper completed" : "Mapper not completed"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="col-span-2 text-xs font-semibold text-zinc-600">
                  Table
                  <select
                    value={climbSource.id}
                    onChange={(event) => setClimbSourceId(event.target.value)}
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  >
                    {CLIMB_SOURCES.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-zinc-600">
                  Weight kg
                  <input
                    type="number"
                    min="930"
                    max={maximumWeight(registration)}
                    step="1"
                    value={climbWeight}
                    onChange={(event) => setClimbWeight(Number(event.target.value))}
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-zinc-600">
                  Pressure altitude ft
                  <input
                    type="number"
                    min="0"
                    max="14000"
                    step="100"
                    value={climbAltitude}
                    onChange={(event) => setClimbAltitude(Number(event.target.value))}
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="col-span-2 text-xs font-semibold text-zinc-600">
                  OAT °C
                  <input
                    type="number"
                    min="-25"
                    max="50"
                    step="1"
                    value={climbTemperature}
                    onChange={(event) =>
                      setClimbTemperature(Number(event.target.value))
                    }
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Result
              </p>
              {climbState === "ready" && climbResult ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">
                    At {climbAltitude.toFixed(0)} ft, {climbWeight.toFixed(0)} kg and{" "}
                    {climbTemperature.toFixed(1)} °C, climb speed is{" "}
                    {climbResult.speedKias.toFixed(1)} KIAS.
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    Rate of climb is {climbResult.rateFpm.toFixed(0)} ft/min.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-amber-300">
                  {climbState === "loading"
                    ? "Loading the AFM table…"
                    : "The selected values are outside the published table or the source could not be parsed."}
                </p>
              )}
            </section>
          </aside>
        </div>
      ) : null}

      {tab === "cruise" ? (
        <div className="space-y-5">
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_430px]">
            <div className="grid gap-4 md:grid-cols-2">
              {cruiseBracket ? (
                <SourceImage
                  source={cruiseBracket.lower}
                  registration={registration}
                  label={`${cruiseBracket.lowerAltitude.toLocaleString()} ft chart`}
                />
              ) : null}
              {cruiseBracket &&
              cruiseBracket.upper.id !== cruiseBracket.lower.id ? (
                <SourceImage
                  source={cruiseBracket.upper}
                  registration={registration}
                  label={`${cruiseBracket.upperAltitude.toLocaleString()} ft chart`}
                />
              ) : null}
            </div>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-zinc-950">Cruise inputs</h3>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      lowerCruiseMapped && upperCruiseMapped
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {lowerCruiseMapped && upperCruiseMapped
                      ? "Required charts completed"
                      : "One or more charts not completed"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  AFM cruise weight: 1150 kg. Fuel consumption is published per engine.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-zinc-600">
                    Pressure altitude ft
                    <input
                      type="number"
                      min="0"
                      max="9000"
                      step="100"
                      value={cruiseAltitudeFt}
                      onChange={(event) =>
                        setCruiseAltitudeFt(Number(event.target.value))
                      }
                      className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold text-zinc-600">
                    OAT °C
                    <input
                      type="number"
                      step="1"
                      value={cruiseOatC}
                      onChange={(event) => setCruiseOatC(Number(event.target.value))}
                      className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold text-zinc-600">
                    RPM
                    <select
                      value={cruiseRpm}
                      onChange={(event) => setCruiseRpm(Number(event.target.value))}
                      className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    >
                      {commonRpms.map((rpm) => (
                        <option key={rpm} value={rpm}>
                          {rpm}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-zinc-600">
                    MAP inHg
                    <input
                      type="number"
                      min={cruiseMapRange?.minimum}
                      max={cruiseMapRange?.maximum}
                      step="0.1"
                      value={cruiseMap}
                      onChange={(event) => setCruiseMap(Number(event.target.value))}
                      className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  ISA temperature is {isaTemperatureC.toFixed(1)} °C; selected OAT is{" "}
                  {cruiseDeviationC >= 0 ? "+" : ""}{cruiseDeviationC.toFixed(1)} °C from ISA.
                </p>
              </section>

              <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Result
                </p>
                {cruiseState === "ready" && cruiseResult && cruiseBracket ? (
                  <>
                    <p className="mt-2 text-sm leading-6 text-zinc-200">
                      At {cruiseAltitudeFt.toFixed(0)} ft, {cruiseRpm} RPM, {cruiseMap.toFixed(1)} inHg
                      and {cruiseOatC.toFixed(1)} °C OAT, cruise power is{" "}
                      {cruiseResult.powerPercent.toFixed(1)}%.
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      Cruise speed is {cruiseResult.ktas.toFixed(1)} KTAS.
                    </p>
                    <p className="mt-2 text-sm font-semibold text-emerald-300">
                      Total fuel flow is {(cruiseResult.fuelLphPerEngine * 2).toFixed(1)} L/h
                      ({cruiseResult.fuelLphPerEngine.toFixed(1)} L/h per engine).
                    </p>
                    <p className="mt-3 text-xs leading-5 text-zinc-400">
                      {cruiseBracket.lowerAltitude === cruiseBracket.upperAltitude
                        ? `Calculated from the ${cruiseBracket.lowerAltitude.toLocaleString()} ft chart.`
                        : `Calculated from the ${cruiseBracket.lowerAltitude.toLocaleString()} ft and ${cruiseBracket.upperAltitude.toLocaleString()} ft charts.`}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-amber-300">
                    {cruiseState === "loading"
                      ? "Loading the required AFM charts…"
                      : "The selected altitude, temperature, RPM or MAP is outside the common published range."}
                  </p>
                )}
              </section>
            </aside>
          </div>
        </div>
      ) : null}
    </section>
  );
}
