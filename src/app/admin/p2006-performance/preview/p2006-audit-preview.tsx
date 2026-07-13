"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import {
  PERFORMANCE_SOURCES,
  type Capture,
  type CaptureStore,
  type PerformanceSourceDefinition,
  type Point,
  type Rect,
} from "../p2006-mapper-definitions";

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const FORM_DB_NAME = "briefings-p2006-form-upload-v2";
const FORM_DB_STORE = "pages";
const TEMPERATURES = [-25, 0, 25, 50] as const;
const ALTITUDES = Array.from({ length: 11 }, (_, index) => index * 1000);

type AuditPayload = {
  captures: CaptureStore;
  source: string;
};

type StoredPageRecord = {
  id: "page-1" | "page-2";
  dataUrl: string;
  fileName?: string;
  width?: number;
  height?: number;
};

type AxisFit = {
  id: string;
  values: readonly number[];
  coordinates: number[];
  slope: number;
  intercept: number;
  rms: number;
  maxResidual: number;
  monotonic: boolean;
  toCoordinate: (value: number) => number;
  toValue: (coordinate: number) => number;
};

type Validation = {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

type PerformanceTable = {
  rows: number[][];
  corrections: {
    headwindMetersPerKt: number;
    tailwindMetersPerKt: number;
    pavedPercent: number;
    slopePercentPerOnePercent: number;
  };
};

type Grid = {
  columnCenters: number[];
  rowCenters: number[];
  columnBounds: number[];
  rowBounds: number[];
};

const AXIS_CONFIG = [
  {
    id: "axis-empty-aircraft-moment",
    label: "Empty-aircraft moment",
    values: [140, 200, 260, 320, 380, 440, 500],
    dimension: "y" as const,
    unit: "kg·m",
  },
  {
    id: "axis-front-seat-mass",
    label: "Front-seat mass",
    values: [0, 40, 80, 120, 160, 200],
    dimension: "x" as const,
    unit: "kg",
  },
  {
    id: "axis-rear-seat-mass",
    label: "Rear-seat mass",
    values: [0, 40, 80, 120, 160, 200],
    dimension: "x" as const,
    unit: "kg",
  },
  {
    id: "axis-fuel-mass",
    label: "Fuel mass",
    values: [0, 20, 40, 60, 80, 100],
    dimension: "x" as const,
    unit: "kg",
  },
  {
    id: "axis-baggage-mass",
    label: "Baggage mass",
    values: [0, 10, 20, 30, 40],
    dimension: "x" as const,
    unit: "kg",
  },
  {
    id: "axis-flight-mass",
    label: "Flight mass",
    values: [800, 900, 1000, 1100, 1200],
    dimension: "x" as const,
    unit: "kg",
  },
] as const;

const GUIDE_CONFIG = [
  { id: "front-seat-max-guide", axis: "axis-front-seat-mass", label: "Front seats" },
  { id: "rear-seat-max-guide", axis: "axis-rear-seat-mass", label: "Rear seats" },
  { id: "fuel-max-guide", axis: "axis-fuel-mass", label: "Fuel" },
  { id: "baggage-max-guide", axis: "axis-baggage-mass", label: "Baggage" },
] as const;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function captureKey(stepId: string) {
  return `shared:mass-balance-graph:${stepId}`;
}

function performanceKey(
  source: PerformanceSourceDefinition,
  registration: P2006TRegistration,
  stepId: string
) {
  return `performance-${source.id}:${registration}:${stepId}`;
}

function looksLikeCapture(value: unknown): value is Capture {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Capture>;
  return (
    typeof candidate.kind === "string" &&
    Array.isArray(candidate.points) &&
    typeof candidate.confirmed === "boolean"
  );
}

function extractCaptures(payload: unknown): CaptureStore {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const input =
    root.captures && typeof root.captures === "object"
      ? (root.captures as Record<string, unknown>)
      : root;
  const captures: CaptureStore = {};

  for (const [key, value] of Object.entries(input)) {
    if (!looksLikeCapture(value)) continue;
    captures[key] = {
      kind: value.kind,
      points: value.points,
      rect: value.rect,
      confirmed: value.confirmed,
    };
  }

  return captures;
}

function fitAxis(
  id: string,
  capture: Capture | undefined,
  values: readonly number[],
  dimension: "x" | "y"
): AxisFit | null {
  if (!capture || capture.points.length < values.length) return null;
  const coordinates = capture.points
    .slice(0, values.length)
    .map((point) => point[dimension]);
  const meanValue = values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanCoordinate =
    coordinates.reduce((sum, value) => sum + value, 0) / coordinates.length;
  const denominator = values.reduce(
    (sum, value) => sum + (value - meanValue) ** 2,
    0
  );
  if (denominator === 0) return null;
  const slope =
    values.reduce(
      (sum, value, index) =>
        sum + (value - meanValue) * (coordinates[index] - meanCoordinate),
      0
    ) / denominator;
  if (Math.abs(slope) < 1e-9) return null;
  const intercept = meanCoordinate - slope * meanValue;
  const residuals = values.map(
    (value, index) => coordinates[index] - (intercept + slope * value)
  );
  const rms = Math.sqrt(
    residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length
  );
  const maxResidual = Math.max(...residuals.map((value) => Math.abs(value)));
  const expectedDirection = Math.sign(slope);
  const monotonic = coordinates.slice(1).every((coordinate, index) => {
    const delta = coordinate - coordinates[index];
    return Math.sign(delta) === expectedDirection || Math.abs(delta) < 0.0008;
  });

  return {
    id,
    values,
    coordinates,
    slope,
    intercept,
    rms,
    maxResidual,
    monotonic,
    toCoordinate: (value: number) => intercept + slope * value,
    toValue: (coordinate: number) => (coordinate - intercept) / slope,
  };
}

function linePoints(capture?: Capture): [Point, Point] | null {
  if (!capture || capture.points.length < 2) return null;
  return [capture.points[0], capture.points[capture.points.length - 1]];
}

function lineAtX(capture: Capture | undefined, x: number) {
  const points = linePoints(capture);
  if (!points) return null;
  const [a, b] = points;
  const dx = b.x - a.x;
  if (Math.abs(dx) < 1e-9) return null;
  return a.y + ((x - a.x) / dx) * (b.y - a.y);
}

function lineSlope(capture?: Capture) {
  const points = linePoints(capture);
  if (!points) return null;
  const [a, b] = points;
  const dx = b.x - a.x;
  if (Math.abs(dx) < 1e-9) return null;
  return (b.y - a.y) / dx;
}

function averageX(capture?: Capture) {
  const points = linePoints(capture);
  if (!points) return null;
  return (points[0].x + points[1].x) / 2;
}

function centersToBounds(centers: number[]) {
  if (centers.length < 2) return [];
  const result = [clamp(centers[0] - (centers[1] - centers[0]) / 2)];
  for (let index = 0; index < centers.length - 1; index += 1) {
    result.push((centers[index] + centers[index + 1]) / 2);
  }
  result.push(
    clamp(
      centers[centers.length - 1] +
        (centers[centers.length - 1] - centers[centers.length - 2]) / 2
    )
  );
  return result;
}

function gridFromCapture(capture?: Capture): Grid | null {
  if (!capture || capture.points.length < 27) return null;
  const columnCenters = capture.points.slice(0, 5).map((point) => point.x);
  const rowCenters = capture.points.slice(5, 27).map((point) => point.y);
  if (
    columnCenters.some((value, index) => index > 0 && value <= columnCenters[index - 1]) ||
    rowCenters.some((value, index) => index > 0 && value <= rowCenters[index - 1])
  ) {
    return null;
  }
  return {
    columnCenters,
    rowCenters,
    columnBounds: centersToBounds(columnCenters),
    rowBounds: centersToBounds(rowCenters),
  };
}

async function readStoredPage(pageId: "page-1" | "page-2") {
  if (!("indexedDB" in window)) return null;
  return await new Promise<StoredPageRecord | null>((resolve) => {
    const request = window.indexedDB.open(FORM_DB_NAME, 1);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FORM_DB_STORE)) {
        database.createObjectStore(FORM_DB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      try {
        const transaction = database.transaction(FORM_DB_STORE, "readonly");
        const getRequest = transaction.objectStore(FORM_DB_STORE).get(pageId);
        getRequest.onsuccess = () =>
          resolve((getRequest.result as StoredPageRecord) ?? null);
        getRequest.onerror = () => resolve(null);
        transaction.oncomplete = () => database.close();
      } catch {
        database.close();
        resolve(null);
      }
    };
  });
}

function parsePerformanceText(text: string): PerformanceTable | null {
  const rows = text
    .split(/\r?\n/)
    .filter((line) => /Ground Roll|At 50 ft AGL/.test(line))
    .map((line) =>
      Array.from(line.matchAll(/(\d+(?:\.\d+)?)\s*\(\s*\d+/g)).map((match) =>
        Number(match[1])
      )
    )
    .filter((values) => values.length >= 5)
    .map((values) => values.slice(0, 5));

  if (rows.length < 22) return null;
  const normalized = text.replace(/\s+/g, " ");
  const number = (expression: RegExp, fallback = 0) => {
    const match = normalized.match(expression);
    return match ? Number(match[1]) : fallback;
  };
  const slopeMatch = normalized.match(
    /Runway slope:\s*([+-])\s*([\d.]+)%[^%]*each\s*\+?1%/i
  );
  const slope = slopeMatch
    ? (slopeMatch[1] === "-" ? -1 : 1) * Number(slopeMatch[2])
    : 0;

  return {
    rows: rows.slice(0, 22),
    corrections: {
      headwindMetersPerKt: number(/Headwind:\s*-\s*([\d.]+)m/i),
      tailwindMetersPerKt: number(/Tailwind:\s*\+\s*([\d.]+)m/i),
      pavedPercent: number(/Paved Runway:\s*-\s*([\d.]+)%/i),
      slopePercentPerOnePercent: slope,
    },
  };
}

function bounds(value: number, values: readonly number[]) {
  const clamped = clamp(value, values[0], values[values.length - 1]);
  let lower = 0;
  let upper = values.length - 1;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] <= clamped) lower = index;
    if (values[index] >= clamped) {
      upper = index;
      break;
    }
  }
  const lowValue = values[lower];
  const highValue = values[upper];
  const ratio =
    highValue === lowValue ? 0 : (clamped - lowValue) / (highValue - lowValue);
  return { clamped, lower, upper, ratio };
}

function lerp(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

function statusClass(status: Validation["status"]) {
  if (status === "pass") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "warn") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-red-200 bg-red-50 text-red-900";
}

function OverlayLine({
  capture,
  stroke,
  width = 3,
  dashed = false,
}: {
  capture?: Capture;
  stroke: string;
  width?: number;
  dashed?: boolean;
}) {
  const points = linePoints(capture);
  if (!points) return null;
  return (
    <line
      x1={points[0].x * 1000}
      y1={points[0].y * 1000}
      x2={points[1].x * 1000}
      y2={points[1].y * 1000}
      stroke={stroke}
      strokeWidth={width}
      strokeDasharray={dashed ? "10 7" : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function RectOverlay({ rect, stroke, fill }: { rect?: Rect; stroke: string; fill: string }) {
  if (!rect) return null;
  return (
    <rect
      x={rect.x * 1000}
      y={rect.y * 1000}
      width={rect.width * 1000}
      height={rect.height * 1000}
      fill={fill}
      stroke={stroke}
      strokeWidth="3"
      vectorEffect="non-scaling-stroke"
    />
  );
}

export function P2006TAuditPreview() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<AuditPayload>({
    captures: {},
    source: "No map loaded",
  });
  const [pageOne, setPageOne] = useState<StoredPageRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"mb" | "performance">("mb");
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [sourceId, setSourceId] = useState(PERFORMANCE_SOURCES[0].id);
  const [performanceTable, setPerformanceTable] =
    useState<PerformanceTable | null>(null);
  const [showAllCells, setShowAllCells] = useState(true);
  const [showAxisTicks, setShowAxisTicks] = useState(true);
  const [showGeometry, setShowGeometry] = useState(true);
  const [emptyMass, setEmptyMass] = useState(850);
  const [emptyMoment, setEmptyMoment] = useState(300);
  const [frontMass, setFrontMass] = useState(160);
  const [rearMass, setRearMass] = useState(0);
  const [fuelMass, setFuelMass] = useState(70);
  const [baggageMass, setBaggageMass] = useState(10);
  const [pressureAltitude, setPressureAltitude] = useState(2500);
  const [temperature, setTemperature] = useState(10);
  const [output, setOutput] = useState<"ground-roll" | "50ft">("ground-roll");
  const [windKt, setWindKt] = useState(5);
  const [pavedRunway, setPavedRunway] = useState(false);
  const [runwaySlope, setRunwaySlope] = useState(0);

  function loadBrowserMap() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setPayload({ captures: {}, source: "Browser map is empty" });
      return;
    }
    try {
      setPayload({
        captures: extractCaptures(JSON.parse(raw) as unknown),
        source: "Current browser map",
      });
    } catch {
      setPayload({ captures: {}, source: "Browser map is invalid" });
    }
  }

  useEffect(() => {
    loadBrowserMap();
    void readStoredPage("page-1").then(setPageOne);
  }, []);

  const selectedSource =
    PERFORMANCE_SOURCES.find((source) => source.id === sourceId) ??
    PERFORMANCE_SOURCES[0];

  useEffect(() => {
    const controller = new AbortController();
    const asset = selectedSource.manifest[registration];
    setPerformanceTable(null);
    void fetch(asset.text, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Source text unavailable");
        return response.text();
      })
      .then((text) => setPerformanceTable(parsePerformanceText(text)))
      .catch(() => {
        if (!controller.signal.aborted) setPerformanceTable(null);
      });
    return () => controller.abort();
  }, [registration, selectedSource]);

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      setPayload({ captures: extractCaptures(parsed), source: file.name });
    } catch {
      setPayload({ captures: {}, source: `${file.name} is not valid JSON` });
    }
  }

  const axisFits = useMemo(() => {
    const result = new Map<string, AxisFit>();
    for (const config of AXIS_CONFIG) {
      const fit = fitAxis(
        config.id,
        payload.captures[captureKey(config.id)],
        config.values,
        config.dimension
      );
      if (fit) result.set(config.id, fit);
    }
    return result;
  }, [payload.captures]);

  const mbValidation = useMemo(() => {
    const validations: Validation[] = [];
    for (const config of AXIS_CONFIG) {
      const fit = axisFits.get(config.id);
      if (!fit) {
        validations.push({
          label: config.label,
          status: "fail",
          detail: `Missing ${config.values.length}-point calibration.`,
        });
        continue;
      }
      const residualPixels = fit.maxResidual * 1000;
      validations.push({
        label: config.label,
        status:
          !fit.monotonic || residualPixels > 4
            ? "fail"
            : residualPixels > 2
              ? "warn"
              : "pass",
        detail: `${config.values.length} points · max residual ${residualPixels.toFixed(
          1
        )} px · ${fit.monotonic ? "monotonic" : "not monotonic"}`,
      });
    }

    for (const guide of GUIDE_CONFIG) {
      const capture = payload.captures[captureKey(guide.id)];
      const points = linePoints(capture);
      const span = points ? Math.abs(points[1].x - points[0].x) : 0;
      validations.push({
        label: `${guide.label} guide`,
        status: !points ? "fail" : span < 0.06 ? "warn" : "pass",
        detail: points
          ? `Horizontal baseline ${(span * 100).toFixed(1)}% of page width.`
          : "Missing guide segment.",
      });
    }

    const cg16 = payload.captures[captureKey("cg-16-5-mac")];
    const cg23 = payload.captures[captureKey("cg-23-mac")];
    const cg31 = payload.captures[captureKey("cg-31-mac")];
    const referenceX = 0.86;
    const y16 = lineAtX(cg16, referenceX);
    const y23 = lineAtX(cg23, referenceX);
    const y31 = lineAtX(cg31, referenceX);
    if (y16 === null || y23 === null || y31 === null) {
      validations.push({
        label: "MAC envelope",
        status: "fail",
        detail: "One or more MAC lines are missing.",
      });
    } else {
      const expected23 = lerp(y16, y31, (23 - 16.5) / (31 - 16.5));
      const residual = Math.abs(y23 - expected23) * 1000;
      validations.push({
        label: "23% MAC audit line",
        status: residual > 12 ? "fail" : residual > 6 ? "warn" : "pass",
        detail: `Deviation from the 16.5–31% interpolation: ${residual.toFixed(
          1
        )} px.`,
      });
    }

    const flightFit = axisFits.get("axis-flight-mass");
    for (const mass of [1180, 1230]) {
      const line = payload.captures[captureKey(`mass-limit-${mass}`)];
      const x = averageX(line);
      const expected = flightFit?.toCoordinate(mass);
      if (x === null || expected === undefined) {
        validations.push({
          label: `${mass} kg limit`,
          status: "fail",
          detail: "Missing line or flight-mass calibration.",
        });
      } else {
        const residual = Math.abs(x - expected) * 1000;
        const points = linePoints(line);
        const verticalError = points
          ? Math.abs(points[1].x - points[0].x) * 1000
          : 999;
        validations.push({
          label: `${mass} kg limit`,
          status:
            residual > 12 || verticalError > 5
              ? "fail"
              : residual > 6 || verticalError > 2
                ? "warn"
                : "pass",
          detail: `Axis residual ${residual.toFixed(
            1
          )} px · vertical error ${verticalError.toFixed(1)} px.`,
        });
      }
    }

    return validations;
  }, [axisFits, payload.captures]);

  const mbExample = useMemo(() => {
    const momentFit = axisFits.get("axis-empty-aircraft-moment");
    const flightFit = axisFits.get("axis-flight-mass");
    if (!momentFit || !flightFit) return null;

    const momentCapture =
      payload.captures[captureKey("axis-empty-aircraft-moment")];
    const momentX = momentCapture?.points.length
      ? momentCapture.points.reduce((sum, point) => sum + point.x, 0) /
        momentCapture.points.length
      : null;
    if (momentX === null) return null;

    const loads = [
      {
        axis: "axis-front-seat-mass",
        guide: "front-seat-max-guide",
        label: "Front seats",
        value: frontMass,
      },
      {
        axis: "axis-rear-seat-mass",
        guide: "rear-seat-max-guide",
        label: "Rear seats",
        value: rearMass,
      },
      {
        axis: "axis-fuel-mass",
        guide: "fuel-max-guide",
        label: "Fuel",
        value: fuelMass,
      },
      {
        axis: "axis-baggage-mass",
        guide: "baggage-max-guide",
        label: "Baggage",
        value: baggageMass,
      },
    ] as const;

    let current: Point = {
      x: momentX,
      y: momentFit.toCoordinate(emptyMoment),
    };
    const segments: Array<{
      from: Point;
      to: Point;
      label: string;
      kind: "transfer" | "load";
    }> = [];
    const steps: Array<{ label: string; mass: number; moment: number }> = [
      { label: "Empty aircraft", mass: emptyMass, moment: emptyMoment },
    ];

    for (const load of loads) {
      const fit = axisFits.get(load.axis);
      const slope = lineSlope(payload.captures[captureKey(load.guide)]);
      if (!fit || slope === null) return null;
      const xZero = fit.toCoordinate(0);
      const xLoad = fit.toCoordinate(load.value);
      const transfer: Point = { x: xZero, y: current.y };
      const loaded: Point = {
        x: xLoad,
        y: current.y + slope * (xLoad - xZero),
      };
      segments.push({
        from: current,
        to: transfer,
        label: `${load.label} transfer`,
        kind: "transfer",
      });
      segments.push({
        from: transfer,
        to: loaded,
        label: load.label,
        kind: "load",
      });
      current = loaded;
      steps.push({
        label: load.label,
        mass: load.value,
        moment: momentFit.toValue(current.y),
      });
    }

    const totalMass = emptyMass + frontMass + rearMass + fuelMass + baggageMass;
    const finalPoint = {
      x: flightFit.toCoordinate(totalMass),
      y: current.y,
    };
    segments.push({
      from: current,
      to: finalPoint,
      label: "Transfer to flight-mass graph",
      kind: "transfer",
    });

    const y16 = lineAtX(
      payload.captures[captureKey("cg-16-5-mac")],
      finalPoint.x
    );
    const y31 = lineAtX(
      payload.captures[captureKey("cg-31-mac")],
      finalPoint.x
    );
    const y23 = lineAtX(
      payload.captures[captureKey("cg-23-mac")],
      finalPoint.x
    );
    const maxMass = registration === "CS-EAQ" ? 1180 : 1230;
    const massLineX = averageX(
      payload.captures[captureKey(`mass-limit-${maxMass}`)]
    );
    const withinCg =
      y16 !== null &&
      y31 !== null &&
      finalPoint.y >= Math.min(y16, y31) &&
      finalPoint.y <= Math.max(y16, y31);
    const withinMass =
      totalMass <= maxMass &&
      (massLineX === null || finalPoint.x <= massLineX + 0.002);
    const mac =
      y16 !== null && y31 !== null && Math.abs(y16 - y31) > 1e-8
        ? 16.5 + ((y16 - finalPoint.y) / (y16 - y31)) * (31 - 16.5)
        : null;

    return {
      segments,
      steps,
      finalPoint,
      totalMass,
      totalMoment: momentFit.toValue(finalPoint.y),
      maxMass,
      withinCg,
      withinMass,
      mac,
      y16,
      y23,
      y31,
      massLineX,
    };
  }, [
    axisFits,
    baggageMass,
    emptyMass,
    emptyMoment,
    frontMass,
    fuelMass,
    payload.captures,
    rearMass,
    registration,
  ]);

  const grid = useMemo(
    () =>
      gridFromCapture(
        payload.captures[
          performanceKey(selectedSource, registration, "auto-grid-detection")
        ]
      ),
    [payload.captures, registration, selectedSource]
  );

  const performanceExample = useMemo(() => {
    if (!grid || !performanceTable) return null;
    const altitude = bounds(pressureAltitude, ALTITUDES);
    const temp = bounds(temperature, TEMPERATURES);
    const outputOffset = output === "ground-roll" ? 0 : 1;
    const lowerRow = altitude.lower * 2 + outputOffset;
    const upperRow = altitude.upper * 2 + outputOffset;
    const values = performanceTable.rows;
    const lowerLow = values[lowerRow]?.[temp.lower];
    const lowerHigh = values[lowerRow]?.[temp.upper];
    const upperLow = values[upperRow]?.[temp.lower];
    const upperHigh = values[upperRow]?.[temp.upper];
    if (
      [lowerLow, lowerHigh, upperLow, upperHigh].some(
        (value) => value === undefined
      )
    ) {
      return null;
    }
    const lowerAltitudeValue = lerp(lowerLow, lowerHigh, temp.ratio);
    const upperAltitudeValue = lerp(upperLow, upperHigh, temp.ratio);
    const base = lerp(lowerAltitudeValue, upperAltitudeValue, altitude.ratio);
    const corrections = performanceTable.corrections;
    const windCorrection =
      windKt >= 0
        ? -corrections.headwindMetersPerKt * windKt
        : corrections.tailwindMetersPerKt * Math.abs(windKt);
    const afterWind = Math.max(0, base + windCorrection);
    const pavedFactor =
      output === "ground-roll" && pavedRunway
        ? 1 - corrections.pavedPercent / 100
        : 1;
    const slopeFactor =
      output === "ground-roll"
        ? 1 +
          (corrections.slopePercentPerOnePercent / 100) * runwaySlope
        : 1;
    const final = Math.max(0, afterWind * pavedFactor * slopeFactor);
    const selected = [
      { row: lowerRow, column: temp.lower, value: lowerLow },
      { row: lowerRow, column: temp.upper, value: lowerHigh },
      { row: upperRow, column: temp.lower, value: upperLow },
      { row: upperRow, column: temp.upper, value: upperHigh },
    ].filter(
      (cell, index, cells) =>
        cells.findIndex(
          (candidate) =>
            candidate.row === cell.row && candidate.column === cell.column
        ) === index
    );

    return {
      altitude,
      temp,
      lowerRow,
      upperRow,
      lowerAltitudeValue,
      upperAltitudeValue,
      base,
      windCorrection,
      afterWind,
      pavedFactor,
      slopeFactor,
      final,
      selected,
    };
  }, [
    grid,
    output,
    pavedRunway,
    performanceTable,
    pressureAltitude,
    runwaySlope,
    temperature,
    windKt,
  ]);

  const performanceValidation = useMemo(() => {
    const validations: Validation[] = [];
    if (!grid) {
      validations.push({
        label: "Detected grid",
        status: "fail",
        detail: "No valid 5 × 22 grid in the loaded map.",
      });
    } else {
      const xSpacing = grid.columnCenters
        .slice(1)
        .map((value, index) => value - grid.columnCenters[index]);
      const ySpacing = grid.rowCenters
        .slice(1)
        .map((value, index) => value - grid.rowCenters[index]);
      const variation = (values: number[]) => {
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        return (
          Math.max(...values.map((value) => Math.abs(value - mean))) / mean
        );
      };
      const xVariation = variation(xSpacing);
      const yVariation = variation(ySpacing);
      validations.push({
        label: "5 temperature columns",
        status: xVariation > 0.08 ? "warn" : "pass",
        detail: `Maximum spacing variation ${(xVariation * 100).toFixed(1)}%.`,
      });
      validations.push({
        label: "22 result rows",
        status: yVariation > 0.25 ? "warn" : "pass",
        detail: `Maximum spacing variation ${(yVariation * 100).toFixed(
          1
        )}%. Manual row heights may legitimately vary.`,
      });
    }
    validations.push({
      label: "TXT table values",
      status: performanceTable?.rows.length === 22 ? "pass" : "fail",
      detail: performanceTable
        ? `${performanceTable.rows.length} rows parsed from the source TXT.`
        : "Source TXT could not be parsed.",
    });
    for (const [stepId, label] of [
      ["published-assumptions", "Assumptions block"],
      ["published-corrections", "Corrections block"],
      ["calculation-notes-rectangle", "Calculation rectangle"],
    ] as const) {
      const capture =
        payload.captures[performanceKey(selectedSource, registration, stepId)];
      validations.push({
        label,
        status: capture?.rect ? "pass" : "warn",
        detail: capture?.rect ? "Mapped." : "Not mapped for this aircraft/page.",
      });
    }
    return validations;
  }, [grid, payload.captures, performanceTable, registration, selectedSource]);

  const assumptionCapture =
    payload.captures[
      performanceKey(selectedSource, registration, "published-assumptions")
    ];
  const correctionsCapture =
    payload.captures[
      performanceKey(selectedSource, registration, "published-corrections")
    ];
  const calculationCapture =
    payload.captures[
      performanceKey(
        selectedSource,
        registration,
        "calculation-notes-rectangle"
      )
    ];
  const selectedImage = selectedSource.manifest[registration].image;
  const applicableMaxMass = registration === "CS-EAQ" ? 1180 : 1230;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Loaded audit data
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              {payload.source}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {Object.keys(payload.captures).length} captures available. The viewer does
              not change the mapper data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void importJson(event)}
            />
            <button
              type="button"
              onClick={loadBrowserMap}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700"
            >
              Reload browser map
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white"
            >
              Open coordinate JSON
            </button>
          </div>
        </div>
      </section>

      <div className="flex gap-2 rounded-2xl border border-zinc-200 bg-white p-2">
        <button
          type="button"
          onClick={() => setActiveTab("mb")}
          className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold ${
            activeTab === "mb" ? "bg-zinc-950 text-white" : "text-zinc-600"
          }`}
        >
          Form page 1 + M&amp;B
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("performance")}
          className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold ${
            activeTab === "performance"
              ? "bg-zinc-950 text-white"
              : "text-zinc-600"
          }`}
        >
          Performance table audit
        </button>
      </div>

      {activeTab === "mb" ? (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_430px]">
          <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-950">
                  Visual M&amp;B explanation
                </h3>
                <p className="text-sm text-zinc-500">
                  The path follows the calibrated axis and the four captured
                  loading-guide slopes.
                </p>
              </div>
              <div className="flex gap-3 text-xs font-semibold text-zinc-600">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showAxisTicks}
                    onChange={(event) => setShowAxisTicks(event.target.checked)}
                  />
                  Axis ticks
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showGeometry}
                    onChange={(event) => setShowGeometry(event.target.checked)}
                  />
                  Captured geometry
                </label>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-100">
              {pageOne?.dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pageOne.dataUrl}
                  alt="Uploaded P2006T form page 1"
                  className="block h-auto w-full"
                />
              ) : (
                <div className="flex aspect-[595/842] items-center justify-center p-10 text-center text-sm text-zinc-500">
                  Upload the form PDF in the mapper once so this viewer can reuse its
                  page-one background.
                </div>
              )}

              {pageOne?.dataUrl ? (
                <svg
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  {showAxisTicks
                    ? AXIS_CONFIG.flatMap((config) => {
                        const capture =
                          payload.captures[captureKey(config.id)];
                        return (capture?.points ?? []).map((point, index) => (
                          <g key={`${config.id}-${index}`}>
                            <circle
                              cx={point.x * 1000}
                              cy={point.y * 1000}
                              r="5"
                              fill="rgb(2 132 199)"
                            />
                            <text
                              x={point.x * 1000 + 8}
                              y={point.y * 1000 - 8}
                              fontSize="13"
                              fontWeight="700"
                              fill="rgb(3 105 161)"
                            >
                              {config.values[index] ?? ""}
                            </text>
                          </g>
                        ));
                      })
                    : null}

                  {showGeometry ? (
                    <>
                      {GUIDE_CONFIG.map((guide) => (
                        <OverlayLine
                          key={guide.id}
                          capture={payload.captures[captureKey(guide.id)]}
                          stroke="rgb(5 150 105)"
                          width={3}
                        />
                      ))}
                      <OverlayLine
                        capture={payload.captures[captureKey("cg-16-5-mac")]}
                        stroke="rgb(217 119 6)"
                        width={4}
                      />
                      <OverlayLine
                        capture={payload.captures[captureKey("cg-23-mac")]}
                        stroke="rgb(124 58 237)"
                        width={3}
                        dashed
                      />
                      <OverlayLine
                        capture={payload.captures[captureKey("cg-31-mac")]}
                        stroke="rgb(217 119 6)"
                        width={4}
                      />
                      <OverlayLine
                        capture={payload.captures[captureKey("mass-limit-1180")]}
                        stroke={
                          registration === "CS-EAQ"
                            ? "rgb(220 38 38)"
                            : "rgb(148 163 184)"
                        }
                        width={registration === "CS-EAQ" ? 5 : 2}
                        dashed={registration !== "CS-EAQ"}
                      />
                      <OverlayLine
                        capture={payload.captures[captureKey("mass-limit-1230")]}
                        stroke={
                          registration !== "CS-EAQ"
                            ? "rgb(220 38 38)"
                            : "rgb(148 163 184)"
                        }
                        width={registration !== "CS-EAQ" ? 5 : 2}
                        dashed={registration === "CS-EAQ"}
                      />
                      {[
                        "pilot-front-seat-mass",
                        "rear-seats-mass",
                        "fuel-mass",
                        "baggage-mass",
                      ].map((id) => (
                        <RectOverlay
                          key={id}
                          rect={payload.captures[captureKey(id)]?.rect}
                          stroke="rgb(14 116 144)"
                          fill="rgba(14,116,144,0.08)"
                        />
                      ))}
                    </>
                  ) : null}

                  {mbExample?.segments.map((segment, index) => (
                    <line
                      key={`${segment.label}-${index}`}
                      x1={segment.from.x * 1000}
                      y1={segment.from.y * 1000}
                      x2={segment.to.x * 1000}
                      y2={segment.to.y * 1000}
                      stroke={
                        segment.kind === "load"
                          ? "rgb(37 99 235)"
                          : "rgb(15 23 42)"
                      }
                      strokeWidth={segment.kind === "load" ? 5 : 3}
                      strokeDasharray={
                        segment.kind === "transfer" ? "8 6" : undefined
                      }
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {mbExample ? (
                    <>
                      <circle
                        cx={mbExample.finalPoint.x * 1000}
                        cy={mbExample.finalPoint.y * 1000}
                        r="10"
                        fill={
                          mbExample.withinCg && mbExample.withinMass
                            ? "rgb(22 163 74)"
                            : "rgb(220 38 38)"
                        }
                      />
                      <circle
                        cx={mbExample.finalPoint.x * 1000}
                        cy={mbExample.finalPoint.y * 1000}
                        r="16"
                        fill="none"
                        stroke="white"
                        strokeWidth="4"
                        vectorEffect="non-scaling-stroke"
                      />
                    </>
                  ) : null}
                </svg>
              ) : null}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 text-sm font-semibold text-zinc-700">
                  Aircraft
                  <select
                    value={registration}
                    onChange={(event) =>
                      setRegistration(event.target.value as P2006TRegistration)
                    }
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2"
                  >
                    {P2006T_REGISTRATIONS.map((candidate) => (
                      <option key={candidate}>{candidate}</option>
                    ))}
                  </select>
                </label>
                {[
                  ["Empty mass", emptyMass, setEmptyMass],
                  ["Empty moment", emptyMoment, setEmptyMoment],
                  ["Front seats", frontMass, setFrontMass],
                  ["Rear seats", rearMass, setRearMass],
                  ["Fuel", fuelMass, setFuelMass],
                  ["Baggage", baggageMass, setBaggageMass],
                ].map(([label, value, setter]) => (
                  <label
                    key={String(label)}
                    className="text-xs font-semibold text-zinc-600"
                  >
                    {String(label)}
                    <input
                      type="number"
                      value={Number(value)}
                      onChange={(event) =>
                        (setter as (value: number) => void)(
                          Number(event.target.value)
                        )
                      }
                      className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </label>
                ))}
              </div>

              {mbExample ? (
                <div className="mt-4 space-y-2 rounded-2xl bg-zinc-950 p-4 text-sm text-white">
                  <p className="font-semibold">Worked result</p>
                  <p>
                    Total mass: <strong>{mbExample.totalMass.toFixed(0)} kg</strong> /
                    limit {mbExample.maxMass} kg
                  </p>
                  <p>
                    Final moment:{" "}
                    <strong>{mbExample.totalMoment.toFixed(1)} kg·m</strong>
                  </p>
                  <p>
                    Estimated C.G.:{" "}
                    <strong>{mbExample.mac?.toFixed(1) ?? "—"}% MAC</strong>
                  </p>
                  <p
                    className={
                      mbExample.withinCg && mbExample.withinMass
                        ? "text-emerald-300"
                        : "text-red-300"
                    }
                  >
                    {mbExample.withinCg && mbExample.withinMass
                      ? "Inside the selected envelope"
                      : "Outside the selected envelope"}
                  </p>
                </div>
              ) : (
                <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
                  The worked path cannot be calculated until all six axes and four
                  guides are present.
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-zinc-950">Geometry checks</h3>
              <div className="mt-3 space-y-2">
                {mbValidation.map((validation) => (
                  <div
                    key={validation.label}
                    className={`rounded-xl border p-3 text-xs ${statusClass(
                      validation.status
                    )}`}
                  >
                    <p className="font-semibold">{validation.label}</p>
                    <p className="mt-1 opacity-80">{validation.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      ) : (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_430px]">
          <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-950">
                  Performance-table visual explanation
                </h3>
                <p className="text-sm text-zinc-500">
                  Selected interpolation cells are highlighted and connected on the
                  original AFM page.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
                <input
                  type="checkbox"
                  checked={showAllCells}
                  onChange={(event) => setShowAllCells(event.target.checked)}
                />
                Show all detected cells
              </label>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-zinc-300 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImage}
                alt={`${selectedSource.title} ${registration}`}
                className="block h-auto w-full"
              />
              <svg
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {grid && showAllCells
                  ? grid.rowCenters.flatMap((_, row) =>
                      grid.columnCenters.map((__, column) => (
                        <rect
                          key={`${row}-${column}`}
                          x={grid.columnBounds[column] * 1000}
                          y={grid.rowBounds[row] * 1000}
                          width={
                            (grid.columnBounds[column + 1] -
                              grid.columnBounds[column]) *
                            1000
                          }
                          height={
                            (grid.rowBounds[row + 1] - grid.rowBounds[row]) *
                            1000
                          }
                          fill="rgba(14,165,233,0.03)"
                          stroke="rgba(2,132,199,0.35)"
                          strokeWidth="1.2"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))
                    )
                  : null}
                {grid && performanceExample
                  ? performanceExample.selected.map((cell, index) => (
                      <g key={`${cell.row}-${cell.column}`}>
                        <rect
                          x={grid.columnBounds[cell.column] * 1000}
                          y={grid.rowBounds[cell.row] * 1000}
                          width={
                            (grid.columnBounds[cell.column + 1] -
                              grid.columnBounds[cell.column]) *
                            1000
                          }
                          height={
                            (grid.rowBounds[cell.row + 1] -
                              grid.rowBounds[cell.row]) *
                            1000
                          }
                          fill={
                            index % 2 === 0
                              ? "rgba(245,158,11,0.35)"
                              : "rgba(37,99,235,0.30)"
                          }
                          stroke={
                            index % 2 === 0
                              ? "rgb(217 119 6)"
                              : "rgb(37 99 235)"
                          }
                          strokeWidth="4"
                          vectorEffect="non-scaling-stroke"
                        />
                        <text
                          x={grid.columnCenters[cell.column] * 1000}
                          y={grid.rowCenters[cell.row] * 1000 + 5}
                          textAnchor="middle"
                          fontSize="18"
                          fontWeight="800"
                          fill="rgb(15 23 42)"
                        >
                          {cell.value}m
                        </text>
                      </g>
                    ))
                  : null}
                {grid &&
                performanceExample &&
                performanceExample.selected.length > 1 ? (
                  <polyline
                    points={performanceExample.selected
                      .map(
                        (cell) =>
                          `${grid.columnCenters[cell.column] * 1000},${
                            grid.rowCenters[cell.row] * 1000
                          }`
                      )
                      .join(" ")}
                    fill="none"
                    stroke="rgb(15 23 42)"
                    strokeWidth="3"
                    strokeDasharray="8 5"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                <RectOverlay
                  rect={assumptionCapture?.rect}
                  stroke="rgb(14 116 144)"
                  fill="rgba(14,116,144,0.08)"
                />
                <RectOverlay
                  rect={correctionsCapture?.rect}
                  stroke="rgb(124 58 237)"
                  fill="rgba(124,58,237,0.08)"
                />
              </svg>

              {calculationCapture?.rect && performanceExample ? (
                <div
                  className="pointer-events-none absolute overflow-hidden border-2 border-zinc-950 bg-white/95 p-2 text-[9px] leading-tight text-zinc-950 shadow-sm"
                  style={{
                    left: `${calculationCapture.rect.x * 100}%`,
                    top: `${calculationCapture.rect.y * 100}%`,
                    width: `${calculationCapture.rect.width * 100}%`,
                    height: `${calculationCapture.rect.height * 100}%`,
                  }}
                >
                  <p className="font-bold uppercase">Calculation audit</p>
                  <p>
                    Altitude: {performanceExample.altitude.clamped.toFixed(0)} ft
                  </p>
                  <p>OAT: {performanceExample.temp.clamped.toFixed(1)} °C</p>
                  <p>Table: {performanceExample.base.toFixed(1)} m</p>
                  <p>
                    Wind: {performanceExample.windCorrection >= 0 ? "+" : ""}
                    {performanceExample.windCorrection.toFixed(1)} m
                  </p>
                  {output === "ground-roll" ? (
                    <p>
                      Runway factor:{" "}
                      {(
                        performanceExample.pavedFactor *
                        performanceExample.slopeFactor
                      ).toFixed(3)}
                    </p>
                  ) : null}
                  <p className="font-bold">
                    Result: {performanceExample.final.toFixed(0)} m
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 text-xs font-semibold text-zinc-600">
                  Aircraft
                  <select
                    value={registration}
                    onChange={(event) =>
                      setRegistration(event.target.value as P2006TRegistration)
                    }
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  >
                    {P2006T_REGISTRATIONS.map((candidate) => (
                      <option key={candidate}>{candidate}</option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 text-xs font-semibold text-zinc-600">
                  Source page
                  <select
                    value={sourceId}
                    onChange={(event) => setSourceId(event.target.value)}
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  >
                    {PERFORMANCE_SOURCES.map((source) => {
                      const mass =
                        source.weightKg === 1180
                          ? applicableMaxMass
                          : source.weightKg;
                      return (
                        <option key={source.id} value={source.id}>
                          {source.performanceKind === "takeoff" ? "T/O" : "LDG"}{" "}
                          {mass} kg
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="text-xs font-semibold text-zinc-600">
                  Pressure altitude ft
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="100"
                    value={pressureAltitude}
                    onChange={(event) =>
                      setPressureAltitude(Number(event.target.value))
                    }
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-zinc-600">
                  OAT °C
                  <input
                    type="number"
                    min="-25"
                    max="50"
                    step="1"
                    value={temperature}
                    onChange={(event) =>
                      setTemperature(Number(event.target.value))
                    }
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-zinc-600">
                  Result
                  <select
                    value={output}
                    onChange={(event) =>
                      setOutput(event.target.value as "ground-roll" | "50ft")
                    }
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  >
                    <option value="ground-roll">Ground Roll</option>
                    <option value="50ft">At 50 ft AGL</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-zinc-600">
                  Wind kt (+ headwind)
                  <input
                    type="number"
                    value={windKt}
                    onChange={(event) => setWindKt(Number(event.target.value))}
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-zinc-600">
                  Runway slope %
                  <input
                    type="number"
                    step="0.1"
                    value={runwaySlope}
                    onChange={(event) =>
                      setRunwaySlope(Number(event.target.value))
                    }
                    className="mt-1 block w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 self-end rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600">
                  <input
                    type="checkbox"
                    checked={pavedRunway}
                    onChange={(event) => setPavedRunway(event.target.checked)}
                  />
                  Paved runway
                </label>
              </div>

              {performanceExample ? (
                <div className="mt-4 space-y-1 rounded-2xl bg-zinc-950 p-4 text-sm text-white">
                  <p className="font-semibold">Worked table result</p>
                  <p>
                    Temperature interpolation:{" "}
                    {performanceExample.lowerAltitudeValue.toFixed(1)} /{" "}
                    {performanceExample.upperAltitudeValue.toFixed(1)} m
                  </p>
                  <p>
                    Altitude interpolation:{" "}
                    <strong>{performanceExample.base.toFixed(1)} m</strong>
                  </p>
                  <p>
                    Wind correction:{" "}
                    {performanceExample.windCorrection >= 0 ? "+" : ""}
                    {performanceExample.windCorrection.toFixed(1)} m
                  </p>
                  {output === "ground-roll" ? (
                    <p>
                      Surface × slope:{" "}
                      {(
                        performanceExample.pavedFactor *
                        performanceExample.slopeFactor
                      ).toFixed(3)}
                    </p>
                  ) : null}
                  <p className="pt-1 text-base font-bold text-emerald-300">
                    Final: {performanceExample.final.toFixed(0)} m
                  </p>
                </div>
              ) : null}
            </section>

            <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-zinc-950">Page checks</h3>
              <div className="mt-3 space-y-2">
                {performanceValidation.map((validation) => (
                  <div
                    key={validation.label}
                    className={`rounded-xl border p-3 text-xs ${statusClass(
                      validation.status
                    )}`}
                  >
                    <p className="font-semibold">{validation.label}</p>
                    <p className="mt-1 opacity-80">{validation.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
