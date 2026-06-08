import type { PerformanceLegResult } from "@/lib/performance/aerodrome-performance";
import {
  PA28_CLIMB_CHART,
  PA28_LANDING_CHART,
  PA28_TAKEOFF_CHART,
} from "@/lib/performance/pa28-performance-data";

type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type Tick = {
  x?: number;
  y?: number;
  value: number;
};

type ChartCapture = {
  axis_ticks: Record<string, Tick[]>;
  lines: Record<string, Segment[]>;
  guides?: {
    middle?: Segment[];
    right?: Segment[];
  };
  panel_corners?: Record<string, Array<{ x: number; y: number }>>;
};

export type Pa28ChartPreview = {
  title: string;
  valueLabel: string;
  viewBox: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  lines: Array<{
    key: string;
    segments: Segment[];
    kind: "pa" | "guide" | "ref" | "axis" | "other";
  }>;
  trace: Array<{
    x: number;
    y: number;
    label: string;
  }>;
};

export type Pa28PerformanceRow = {
  role: string;
  icao: string;
  label: string;
  runway: string;
  qfu: number;
  paFt: number;
  daFt: number;
  todaM: number;
  ldaM: number;
  toFt: number;
  toM: number;
  toMWithPct: string;
  ldgFt: number;
  ldgM: number;
  ldgMWithPct: string;
  rocFpm: number;
  takeoffMarginM: number;
  landingMarginM: number;
  takeoffPct: number;
  landingPct: number;
  takeoffOk: boolean;
  landingOk: boolean;
  headwindKt: number;
  crosswindKt: number;
  crosswindSide: "L" | "R" | "";
  charts: {
    takeoff: Pa28ChartPreview;
    climb: Pa28ChartPreview;
    landing: Pa28ChartPreview;
  };
};

const FT_TO_M = 0.3048;

const ASSETS = {
  takeoff: {
    title: "Takeoff distance over 50 ft",
    roundTo: 5,
    outAxisKey: "takeoff_50ft_ft",
  },
  landing: {
    title: "Landing distance over 50 ft",
    roundTo: 5,
    outAxisKey: "landing_50ft_ft",
  },
  climb: {
    title: "Climb performance",
    roundTo: 10,
  },
};

function roundToStep(value: number, step: number) {
  return step * Math.round(value / step);
}

function ftToM(ft: number) {
  return ft * FT_TO_M;
}

function fmtMWithPct(distanceM: number, availableM: number) {
  const dist = Math.max(0, Number(distanceM));
  const avail = Math.max(0, Number(availableM));

  if (avail > 0) {
    return `${dist.toFixed(0)} (${Math.round((dist / avail) * 100)}%)`;
  }

  return dist.toFixed(0);
}

function fitAxisValueFromTicks(
  ticks: Tick[],
  coord: "x" | "y",
  axisName: string
): [number, number] {
  if (!ticks || ticks.length < 2) {
    throw new Error(
      `Axis '${axisName}' needs at least 2 ticks, but only has ${
        ticks?.length ?? 0
      }.`
    );
  }

  const xs = ticks.map((tick) => Number(tick[coord]));
  const vs = ticks.map((tick) => Number(tick.value));

  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumV = vs.reduce((a, b) => a + b, 0);
  const sumXX = xs.reduce((a, b) => a + b * b, 0);
  const sumXV = xs.reduce((acc, x, index) => acc + x * vs[index], 0);
  const denom = n * sumXX - sumX * sumX;

  if (Math.abs(denom) < 1e-12) {
    throw new Error(`Axis fit degenerate: ${axisName}.`);
  }

  const a = (n * sumXV - sumX * sumV) / denom;
  const b = (sumV - a * sumX) / n;

  return [a, b];
}

function axisValue(a: number, b: number, coordValue: number) {
  return a * coordValue + b;
}

function axisCoordFromValue(a: number, b: number, value: number) {
  if (Math.abs(a) < 1e-12) {
    throw new Error("Axis fit degenerate.");
  }

  return (value - b) / a;
}

function lineYAtX(segment: Segment, x: number) {
  const { x1, y1, x2, y2 } = segment;

  if (Math.abs(x2 - x1) < 1e-12) return y1;

  const t = (x - x1) / (x2 - x1);

  return y1 + t * (y2 - y1);
}

function parsePaLevelsFt(lines: Record<string, Segment[]>) {
  const out: Array<[number, string]> = [];

  for (const [key, segments] of Object.entries(lines)) {
    if (!key.startsWith("pa_")) continue;
    if (!segments?.length) continue;

    if (key === "pa_sea_level") {
      out.push([0, key]);
      continue;
    }

    const value = Number(key.replace("pa_", ""));

    if (Number.isFinite(value)) {
      out.push([value, key]);
    }
  }

  return out.sort((a, b) => a[0] - b[0]);
}

function interpBetweenLevels(value: number, levels: Array<[number, string]>) {
  if (!levels.length) {
    throw new Error("No PA levels available.");
  }

  if (value <= levels[0][0]) {
    return [levels[0], levels[0], 0] as const;
  }

  if (value >= levels[levels.length - 1][0]) {
    const last = levels[levels.length - 1];
    return [last, last, 0] as const;
  }

  for (let index = 0; index < levels.length - 1; index += 1) {
    const lower = levels[index];
    const upper = levels[index + 1];

    if (lower[0] <= value && value <= upper[0]) {
      const alpha =
        upper[0] === lower[0] ? 0 : (value - lower[0]) / (upper[0] - lower[0]);

      return [lower, upper, alpha] as const;
    }
  }

  const last = levels[levels.length - 1];

  return [last, last, 0] as const;
}

function xOfVerticalRef(segment: Segment) {
  return 0.5 * (segment.x1 + segment.x2);
}

function segmentEndpoints(
  segment: Segment
): [[number, number], [number, number]] {
  return [
    [segment.x1, segment.y1],
    [segment.x2, segment.y2],
  ];
}

function samePoint(
  a: [number, number],
  b: [number, number],
  tolerance = 1.5
) {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance
  );
}

function groupGuidesPolylinePairs(segments: Segment[]) {
  const groups: Segment[][] = [];
  let index = 0;

  while (index < segments.length) {
    if (index + 1 < segments.length) {
      const first = segments[index];
      const second = segments[index + 1];
      const [, firstEnd] = segmentEndpoints(first);
      const [secondStart] = segmentEndpoints(second);

      if (samePoint(firstEnd, secondStart)) {
        groups.push([first, second]);
        index += 2;
        continue;
      }
    }

    groups.push([segments[index]]);
    index += 1;
  }

  return groups;
}

function polylineYAtX(polyline: Segment[], x: number) {
  if (!polyline.length) {
    throw new Error("Polyline vazia.");
  }

  if (polyline.length === 1) {
    return lineYAtX(polyline[0], x);
  }

  const candidates = polyline.map((segment) => {
    const xmin = Math.min(segment.x1, segment.x2);
    const xmax = Math.max(segment.x1, segment.x2);
    const inRange = xmin - 1e-9 <= x && x <= xmax + 1e-9;
    const distance = inRange
      ? 0
      : Math.min(Math.abs(x - xmin), Math.abs(x - xmax));

    return {
      distance,
      inRange,
      segment,
    };
  });

  candidates.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.inRange === b.inRange) return 0;
    return a.inRange ? -1 : 1;
  });

  return lineYAtX(candidates[0].segment, x);
}

function interpGuidesY(
  guideGroups: Segment[][],
  xRef: number,
  yRef: number,
  xTarget: number
) {
  if (!guideGroups.length) {
    return yRef;
  }

  const rows = guideGroups
    .map((polyline) => ({
      yRef: polylineYAtX(polyline, xRef),
      yTarget: polylineYAtX(polyline, xTarget),
    }))
    .sort((a, b) => a.yRef - b.yRef);

  if (yRef <= rows[0].yRef) {
    return rows[0].yTarget;
  }

  if (yRef >= rows[rows.length - 1].yRef) {
    return rows[rows.length - 1].yTarget;
  }

  for (let index = 0; index < rows.length - 1; index += 1) {
    const lower = rows[index];
    const upper = rows[index + 1];

    if (lower.yRef <= yRef && yRef <= upper.yRef) {
      const denom = upper.yRef - lower.yRef;
      const alpha = Math.abs(denom) < 1e-12 ? 0 : (yRef - lower.yRef) / denom;

      return (1 - alpha) * lower.yTarget + alpha * upper.yTarget;
    }
  }

  return yRef;
}

function pickGuides(cap: ChartCapture, mode: "takeoff" | "landing") {
  const guides = cap.guides ?? {};
  const middle = guides.middle ?? [];
  const right = guides.right ?? [];

  if (mode === "takeoff") {
    return {
      middle: groupGuidesPolylinePairs(middle),
      right: right.map((segment) => [segment]),
    };
  }

  return {
    middle: middle.map((segment) => [segment]),
    right: right.map((segment) => [segment]),
  };
}

function normalizedPanel(
  cap: ChartCapture,
  name: string
): Array<{ x: number; y: number }> {
  const panel = cap.panel_corners?.[name];

  if (!Array.isArray(panel) || panel.length !== 4) {
    return [];
  }

  return panel.map((point) => ({
    x: Number(point.x),
    y: Number(point.y),
  }));
}

function groundRollTracePoints({
  cap,
  xOat,
  yEntry,
  xRefMid,
  xWeight,
  yMid,
  xRefRight,
  xWind,
  yOut,
}: {
  cap: ChartCapture;
  xOat: number;
  yEntry: number;
  xRefMid: number;
  xWeight: number;
  yMid: number;
  xRefRight: number;
  xWind: number;
  yOut: number;
}) {
  const leftPanel = normalizedPanel(cap, "left");
  const rightPanel = normalizedPanel(cap, "right");

  const yBottomLeft = leftPanel[2]?.y ?? yEntry;
  const xRightEdge = rightPanel[1]?.x ?? xWind;

  return [
    { x: xOat, y: yBottomLeft, label: "OAT" },
    { x: xOat, y: yEntry, label: "PA" },
    { x: xRefMid, y: yEntry, label: "ref" },
    { x: xWeight, y: yMid, label: "weight" },
    { x: xRefRight, y: yMid, label: "ref" },
    { x: xWind, y: yOut, label: "wind" },
    { x: xRightEdge, y: yOut, label: "result" },
  ];
}

function climbTracePoints({
  cap,
  xOat,
  y,
}: {
  cap: ChartCapture;
  xOat: number;
  y: number;
}) {
  const main = normalizedPanel(cap, "main");

  const yBottom = main[2]?.y ?? y;
  const xRightEdge = main[1]?.x ?? xOat;

  return [
    { x: xOat, y: yBottom, label: "OAT" },
    { x: xOat, y, label: "PA" },
    { x: xRightEdge, y, label: "ROC" },
  ];
}

function solveGroundRollTrace(
  cap: ChartCapture,
  mode: "takeoff" | "landing",
  oatC: number,
  paFt: number,
  weightLb: number,
  windKt: number
) {
  const ticks = cap.axis_ticks;
  const lines = cap.lines;

  const [oatA, oatB] = fitAxisValueFromTicks(ticks.oat_c, "x", "oat_c");
  const [weightA, weightB] = fitAxisValueFromTicks(
    ticks.weight_x100_lb,
    "x",
    "weight_x100_lb"
  );
  const [windA, windB] = fitAxisValueFromTicks(ticks.wind_kt, "x", "wind_kt");

  const outAxisKey =
    mode === "takeoff" ? ASSETS.takeoff.outAxisKey : ASSETS.landing.outAxisKey;
  const [outA, outB] = fitAxisValueFromTicks(
    ticks[outAxisKey],
    "y",
    outAxisKey
  );

  if (!lines.weight_ref_line?.length || !lines.wind_ref_zero?.length) {
    throw new Error("Missing weight_ref_line or wind_ref_zero in JSON lines.");
  }

  const xRefMid = xOfVerticalRef(lines.weight_ref_line[0]);
  const xRefRight = xOfVerticalRef(lines.wind_ref_zero[0]);
  const xOat = axisCoordFromValue(oatA, oatB, oatC);

  const paLevels = parsePaLevelsFt(lines);
  const [[, loKey], [, hiKey], alpha] = interpBetweenLevels(paFt, paLevels);

  const segmentLo = lines[loKey][0];
  const segmentHi = lines[hiKey][0];

  const yEntry =
    (1 - alpha) * lineYAtX(segmentLo, xOat) +
    alpha * lineYAtX(segmentHi, xOat);

  const xWeight = axisCoordFromValue(weightA, weightB, weightLb / 100);
  const guides = pickGuides(cap, mode);
  const yMid = interpGuidesY(guides.middle, xRefMid, yEntry, xWeight);

  const xWind = axisCoordFromValue(windA, windB, windKt);
  const yOut = interpGuidesY(guides.right, xRefRight, yMid, xWind);
  const valueFt = axisValue(outA, outB, yOut);

  return {
    valueFt,
    points: groundRollTracePoints({
      cap,
      xOat,
      yEntry,
      xRefMid,
      xWeight,
      yMid,
      xRefRight,
      xWind,
      yOut,
    }),
  };
}

function solveClimbTrace(cap: ChartCapture, oatC: number, paFt: number) {
  const ticks = cap.axis_ticks;
  const lines = cap.lines;

  const [oatA, oatB] = fitAxisValueFromTicks(ticks.oat_c, "x", "oat_c");
  const [rocA, rocB] = fitAxisValueFromTicks(ticks.roc_fpm, "y", "roc_fpm");

  const xOat = axisCoordFromValue(oatA, oatB, oatC);
  const paLevels = parsePaLevelsFt(lines);
  const [[, loKey], [, hiKey], alpha] = interpBetweenLevels(paFt, paLevels);

  const segmentLo = lines[loKey][0];
  const segmentHi = lines[hiKey][0];

  const y =
    (1 - alpha) * lineYAtX(segmentLo, xOat) +
    alpha * lineYAtX(segmentHi, xOat);

  const valueFpm = axisValue(rocA, rocB, y);

  return {
    valueFpm,
    points: climbTracePoints({
      cap,
      xOat,
      y,
    }),
  };
}

function allSegments(cap: ChartCapture) {
  const out: Array<{
    key: string;
    segments: Segment[];
    kind: Pa28ChartPreview["lines"][number]["kind"];
  }> = [];

  for (const [key, segments] of Object.entries(cap.lines ?? {})) {
    let kind: Pa28ChartPreview["lines"][number]["kind"] = "other";

    if (key.startsWith("pa_")) kind = "pa";
    else if (key.includes("ref")) kind = "ref";
    else if (key.includes("axis")) kind = "axis";

    out.push({ key, segments, kind });
  }

  for (const [key, segments] of Object.entries(cap.guides ?? {})) {
    out.push({ key: `guide_${key}`, segments: segments ?? [], kind: "guide" });
  }

  return out;
}

function chartViewBox(cap: ChartCapture) {
  const points: Array<{ x: number; y: number }> = [];

  for (const line of allSegments(cap)) {
    for (const segment of line.segments) {
      points.push({ x: segment.x1, y: segment.y1 });
      points.push({ x: segment.x2, y: segment.y2 });
    }
  }

  for (const ticks of Object.values(cap.axis_ticks ?? {})) {
    for (const tick of ticks) {
      if (typeof tick.x === "number" && typeof tick.y === "number") {
        points.push({ x: tick.x, y: tick.y });
      }
    }
  }

  if (points.length === 0) {
    return { minX: 0, minY: 0, width: 1000, height: 700 };
  }

  const minX = Math.min(...points.map((point) => point.x)) - 25;
  const maxX = Math.max(...points.map((point) => point.x)) + 25;
  const minY = Math.min(...points.map((point) => point.y)) - 25;
  const maxY = Math.max(...points.map((point) => point.y)) + 25;

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function makeChartPreview(
  cap: ChartCapture,
  title: string,
  valueLabel: string,
  trace: Array<{ x: number; y: number; label: string }>
): Pa28ChartPreview {
  return {
    title,
    valueLabel,
    viewBox: chartViewBox(cap),
    lines: allSegments(cap),
    trace,
  };
}

function roleLabel(role: string) {
  if (role === "Alternate") return "Alternate 1";
  return role;
}

export function calculatePa28Performance(
  result: PerformanceLegResult,
  takeoffWeightLb: number,
  landingWeightLb: number
): Pa28PerformanceRow | null {
  if (!result.aerodrome || !result.bestRunway || result.leg.icao === "-") {
    return null;
  }

  if (takeoffWeightLb <= 0 || landingWeightLb <= 0) {
    return null;
  }

  const runway = result.bestRunway;
  const headwind = Math.max(0, result.headwindKt);

  const takeoffTrace = solveGroundRollTrace(
    PA28_TAKEOFF_CHART as unknown as ChartCapture,
    "takeoff",
    result.leg.tempC,
    result.pressureAltitudeFt,
    takeoffWeightLb,
    headwind
  );

  const climbTrace = solveClimbTrace(
    PA28_CLIMB_CHART as unknown as ChartCapture,
    result.leg.tempC,
    result.pressureAltitudeFt
  );

  const landingTrace = solveGroundRollTrace(
    PA28_LANDING_CHART as unknown as ChartCapture,
    "landing",
    result.leg.tempC,
    result.pressureAltitudeFt,
    landingWeightLb,
    headwind
  );

  const toFt = roundToStep(takeoffTrace.valueFt, ASSETS.takeoff.roundTo);
  const ldgFt = roundToStep(landingTrace.valueFt, ASSETS.landing.roundTo);
  const rocFpm = roundToStep(climbTrace.valueFpm, ASSETS.climb.roundTo);

  const toM = ftToM(toFt);
  const ldgM = ftToM(ldgFt);

  return {
    role: result.leg.role,
    icao: result.leg.icao,
    label: `${result.leg.icao} ${roleLabel(result.leg.role)}`,
    runway: runway.id,
    qfu: runway.qfu,
    paFt: result.pressureAltitudeFt,
    daFt: result.densityAltitudeFt,
    todaM: runway.toda,
    ldaM: runway.lda,
    toFt,
    toM,
    toMWithPct: fmtMWithPct(toM, runway.toda),
    ldgFt,
    ldgM,
    ldgMWithPct: fmtMWithPct(ldgM, runway.lda),
    rocFpm,
    takeoffMarginM: runway.toda - toM,
    landingMarginM: runway.lda - ldgM,
    takeoffPct: runway.toda > 0 ? Math.round((toM / runway.toda) * 100) : 0,
    landingPct: runway.lda > 0 ? Math.round((ldgM / runway.lda) * 100) : 0,
    takeoffOk: toM <= runway.toda,
    landingOk: ldgM <= runway.lda,
    headwindKt: result.headwindKt,
    crosswindKt: result.crosswindKt,
    crosswindSide: result.crosswindSide,
    charts: {
      takeoff: makeChartPreview(
        PA28_TAKEOFF_CHART as unknown as ChartCapture,
        ASSETS.takeoff.title,
        `${toFt.toFixed(0)} ft / ${toM.toFixed(0)} m`,
        takeoffTrace.points
      ),
      climb: makeChartPreview(
        PA28_CLIMB_CHART as unknown as ChartCapture,
        ASSETS.climb.title,
        `${rocFpm.toFixed(0)} fpm`,
        climbTrace.points
      ),
      landing: makeChartPreview(
        PA28_LANDING_CHART as unknown as ChartCapture,
        ASSETS.landing.title,
        `${ldgFt.toFixed(0)} ft / ${ldgM.toFixed(0)} m`,
        landingTrace.points
      ),
    },
  };
}
