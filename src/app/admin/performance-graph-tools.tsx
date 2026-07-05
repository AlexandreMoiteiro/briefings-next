"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };
type Segment = { x1: number; y1: number; x2: number; y2: number };
type AxisTick = Point & { value: number };

type Capture = {
  mode?: string;
  zoom?: number;
  page_index?: number;
  panel_corners: Record<string, Point[]>;
  axis_ticks: Record<string, AxisTick[]>;
  lines: Record<string, Segment[]>;
  guides?: Record<string, Segment[]>;
  notes?: string;
};

type Inputs = {
  oatC: number;
  paFt: number;
  weightLb: number;
  windKt: number;
};

type GuidedStep =
  | {
      kind: "panel";
      key: string;
      title: string;
      instruction: string;
      requiredPoints: number;
    }
  | {
      kind: "axis";
      key: string;
      value: number;
      title: string;
      instruction: string;
    }
  | {
      kind: "line";
      key: string;
      title: string;
      instruction: string;
      mode: "segment" | "polyline";
      minPoints: number;
    }
  | {
      kind: "guide";
      key: string;
      title: string;
      instruction: string;
      mode: "segment" | "polyline";
      minPoints: number;
    };

type Chart = {
  key: string;
  aircraft: string;
  title: string;
  shortTitle: string;
  deprecated?: boolean;
  kind: "multi" | "climb";
  backgroundUrl: string;
  jsonUrl: string;
  mode: string;
  panels: string[];
  axisTickKeys: string[];
  lineKeys: string[];
  guideKeys: string[];
  outputAxisKey?: string;
  outputLabel: string;
  unit: string;
  roundTo: number;
  defaultInputs: Inputs;
  expectedExample?: {
    oatC: number;
    paFt: number;
    weightLb: number;
    windKt: number;
    expected: number;
  };
  guidedSteps: GuidedStep[];
  weightGuideKeys?: string[];
  windGuideKeys?: string[];
};

type SolverResult = {
  rawValue: number;
  roundedValue: number;
  label: string;
  unit: string;
  path: Segment[];
  debug: Record<string, unknown>;
};

const panelNames = ["left", "middle", "right"];

type Pa28MultiStepConfig = {
  outputAxisKey: string;
  oatTicks: number[];
  weightTicks: number[];
  windTicks: number[];
  outputTicks: number[];
  pressureLines: Array<[string, string]>;
  weightGuideCount?: number;
  windGuideCount?: number;
};

const pa28CommonOatTicks = [-20, -10, 0, 10, 20, 30, 40, 50];
const pa28CommonWindTicks = [0, 5, 10, 15];

const pa28TakeoffPressureLines: Array<[string, string]> = [
  ["pa_sea_level", "Sea level"],
  ["pa_2000", "2,000 ft"],
  ["pa_4000", "4,000 ft"],
  ["pa_6000", "6,000 ft"],
  ["pa_8000", "8,000 ft"],
];

const pa28LandingPressureLines: Array<[string, string]> = [
  ["pa_sea_level", "Sea level"],
  ["pa_2000", "2,000 ft"],
  ["pa_4000", "4,000 ft"],
  ["pa_6000", "6,000 ft"],
  ["pa_7000", "7,000 ft"],
];

const pa28GuidedConfigs = {
  takeoff50: {
    outputAxisKey: "takeoff_50ft_ft",
    oatTicks: pa28CommonOatTicks,
    weightTicks: [25, 24, 23, 22, 21],
    windTicks: pa28CommonWindTicks,
    outputTicks: [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000],
    pressureLines: pa28TakeoffPressureLines,
  },
  landing50: {
    outputAxisKey: "landing_50ft_ft",
    oatTicks: pa28CommonOatTicks,
    weightTicks: [25, 24, 23, 22, 21, 20],
    windTicks: pa28CommonWindTicks,
    outputTicks: [1200, 1300, 1400, 1500, 1600, 1700, 1800],
    pressureLines: pa28LandingPressureLines,
  },
} satisfies Record<string, Pa28MultiStepConfig>;

function makePa28MultiSteps(config: Pa28MultiStepConfig) {
  const steps: GuidedStep[] = [];

  for (const panel of panelNames) {
    steps.push({
      kind: "panel",
      key: panel,
      title: `Panel ${panel}`,
      instruction:
        "Click 4 panel corners in this order: top-left, top-right, bottom-left, bottom-right.",
      requiredPoints: 4,
    });
  }

  for (const value of config.oatTicks) {
    steps.push({
      kind: "axis",
      key: "oat_c",
      value,
      title: `OAT tick ${value} °C`,
      instruction: `Click the OAT axis tick for ${value} °C.`,
    });
  }

  for (const value of config.weightTicks) {
    steps.push({
      kind: "axis",
      key: "weight_x100_lb",
      value,
      title: `Weight tick ${value}`,
      instruction: `Click the weight axis tick for ${value} × 100 lb.`,
    });
  }

  for (const value of config.windTicks) {
    steps.push({
      kind: "axis",
      key: "wind_kt",
      value,
      title: `Wind tick ${value} kt`,
      instruction: `Click the wind axis tick for ${value} kt.`,
    });
  }

  for (const value of config.outputTicks) {
    steps.push({
      kind: "axis",
      key: config.outputAxisKey,
      value,
      title: `Output tick ${value} ft`,
      instruction: `Click the output axis tick for ${value} ft.`,
    });
  }

  for (const [key, label] of config.pressureLines) {
    steps.push({
      kind: "line",
      key,
      title: `Pressure altitude line · ${label}`,
      instruction:
        "Click several points along this pressure altitude line from left to right. Use 3–6 points if it is not perfectly straight, then press Finish current line.",
      mode: "polyline",
      minPoints: 2,
    });
  }

  steps.push({
    kind: "line",
    key: "weight_ref_line",
    title: "Weight reference line",
    instruction:
      "Click the bottom and top of the vertical reference line at the start of the weight panel.",
    mode: "segment",
    minPoints: 2,
  });

  steps.push({
    kind: "line",
    key: "wind_ref_zero",
    title: "Wind zero reference line",
    instruction:
      "Click the bottom and top of the vertical reference line at zero wind.",
    mode: "segment",
    minPoints: 2,
  });

  for (let i = 1; i <= (config.weightGuideCount ?? 8); i += 1) {
    steps.push({
      kind: "guide",
      key: "guides_weight",
      title: `Weight guide curve ${i}`,
      instruction:
        "Click this weight guide curve from left to right. Use several points if the curve bends, then press Finish current curve.",
      mode: "polyline",
      minPoints: 2,
    });
  }

  for (let i = 1; i <= (config.windGuideCount ?? 8); i += 1) {
    steps.push({
      kind: "guide",
      key: "guides_wind",
      title: `Wind guide curve ${i}`,
      instruction:
        "Click this wind correction curve from left to right. Use several points if the curve bends, then press Finish current curve.",
      mode: "polyline",
      minPoints: 2,
    });
  }

  return steps;
}


function makePa28ClimbSteps() {
  const steps: GuidedStep[] = [
    {
      kind: "panel",
      key: "main",
      title: "Main panel",
      instruction:
        "Click 4 panel corners in this order: top-left, top-right, bottom-left, bottom-right.",
      requiredPoints: 4,
    },
  ];

  for (const value of [-20, -10, 0, 10, 20, 30, 40, 50]) {
    steps.push({
      kind: "axis",
      key: "oat_c",
      value,
      title: `OAT tick ${value} °C`,
      instruction: `Click the OAT axis tick for ${value} °C.`,
    });
  }

  for (const value of [0, 100, 200, 300, 400, 500, 600, 700]) {
    steps.push({
      kind: "axis",
      key: "roc_fpm",
      value,
      title: `ROC tick ${value} fpm`,
      instruction: `Click the rate-of-climb axis tick for ${value} fpm.`,
    });
  }

  const paValues = [
    ["pa_sea_level", "Sea level"],
    ["pa_1000", "1,000 ft"],
    ["pa_2000", "2,000 ft"],
    ["pa_3000", "3,000 ft"],
    ["pa_4000", "4,000 ft"],
    ["pa_5000", "5,000 ft"],
    ["pa_6000", "6,000 ft"],
    ["pa_7000", "7,000 ft"],
    ["pa_8000", "8,000 ft"],
    ["pa_9000", "9,000 ft"],
    ["pa_10000", "10,000 ft"],
    ["pa_11000", "11,000 ft"],
    ["pa_12000", "12,000 ft"],
    ["pa_13000", "13,000 ft"],
  ];

  for (const [key, label] of paValues) {
    steps.push({
      kind: "line",
      key,
      title: `Pressure altitude line · ${label}`,
      instruction:
        "Click several points along this pressure altitude curve from left to right, then press Finish current line.",
      mode: "polyline",
      minPoints: 2,
    });
  }

  return steps;
}

const CHARTS: Chart[] = [
  {
    key: "pa28_takeoff_50ft",
    aircraft: "PA-28",
    title: "PA-28 Takeoff Distance Over 50 ft",
    shortTitle: "Takeoff 50 ft",
    kind: "multi",
    backgroundUrl: "/admin/performance-graphs/pa28/to_perf.png",
    jsonUrl: "/admin/performance-graphs/pa28/to_perf.json",
    mode: "takeoff",
    panels: ["left", "middle", "right"],
    axisTickKeys: ["oat_c", "weight_x100_lb", "wind_kt", "takeoff_50ft_ft"],
    lineKeys: [
      "pa_sea_level",
      "pa_2000",
      "pa_4000",
      "pa_6000",
      "pa_8000",
      "weight_ref_line",
      "wind_ref_zero",
    ],
    guideKeys: ["guides_weight", "guides_wind"],
    outputAxisKey: "takeoff_50ft_ft",
    outputLabel: "Takeoff distance over 50 ft",
    unit: "ft",
    roundTo: 5,
    defaultInputs: { oatC: 23, paFt: 2000, weightLb: 2400, windKt: 8 },
    expectedExample: {
      oatC: 23,
      paFt: 2000,
      weightLb: 2400,
      windKt: 8,
      expected: 1907,
    },
    guidedSteps: makePa28MultiSteps(pa28GuidedConfigs.takeoff50),
    weightGuideKeys: ["guides_weight"],
    windGuideKeys: ["guides_wind"],
  },
  {
    key: "pa28_landing_50ft",
    aircraft: "PA-28",
    title: "PA-28 Landing Distance Over 50 ft",
    shortTitle: "Landing 50 ft",
    kind: "multi",
    backgroundUrl: "/admin/performance-graphs/pa28/ldg_perf.png",
    jsonUrl: "/admin/performance-graphs/pa28/ldg_perf.json",
    mode: "landing",
    panels: ["left", "middle", "right"],
    axisTickKeys: ["oat_c", "weight_x100_lb", "wind_kt", "landing_50ft_ft"],
    lineKeys: [
      "pa_sea_level",
      "pa_2000",
      "pa_4000",
      "pa_6000",
      "pa_7000",
      "weight_ref_line",
      "wind_ref_zero",
    ],
    guideKeys: ["guides_weight", "guides_wind"],
    outputAxisKey: "landing_50ft_ft",
    outputLabel: "Landing distance over 50 ft",
    unit: "ft",
    roundTo: 5,
    defaultInputs: { oatC: 21, paFt: 2500, weightLb: 2240, windKt: 5 },
    guidedSteps: makePa28MultiSteps(pa28GuidedConfigs.landing50),
    weightGuideKeys: ["guides_weight"],
    windGuideKeys: ["guides_wind"],
  },
  {
    key: "pa28_climb",
    aircraft: "PA-28",
    title: "PA-28 Climb Performance",
    shortTitle: "Climb",
    kind: "climb",
    backgroundUrl: "/admin/performance-graphs/pa28/climb_perf.jpg",
    jsonUrl: "/admin/performance-graphs/pa28/climb_perf.json",
    mode: "climb",
    panels: ["main"],
    axisTickKeys: ["oat_c", "roc_fpm"],
    lineKeys: [
      "pa_sea_level",
      "pa_1000",
      "pa_2000",
      "pa_3000",
      "pa_4000",
      "pa_5000",
      "pa_6000",
      "pa_7000",
      "pa_8000",
      "pa_9000",
      "pa_10000",
      "pa_11000",
      "pa_12000",
      "pa_13000",
    ],
    guideKeys: [],
    outputLabel: "Rate of climb",
    unit: "fpm",
    roundTo: 10,
    defaultInputs: { oatC: 19, paFt: 4000, weightLb: 2400, windKt: 0 },
    guidedSteps: makePa28ClimbSteps(),
  },
];

function blankCapture(chart: Chart): Capture {
  return {
    mode: chart.mode,
    zoom: 2.3,
    page_index: 0,
    panel_corners: Object.fromEntries(chart.panels.map((key) => [key, []])),
    axis_ticks: Object.fromEntries(chart.axisTickKeys.map((key) => [key, []])),
    lines: Object.fromEntries(chart.lineKeys.map((key) => [key, []])),
    guides: Object.fromEntries(chart.guideKeys.map((key) => [key, []])),
    notes: "Coordinates captured in image pixels. Lines and guides can be multipoint polylines.",
  };
}

function cloneCapture(capture: Capture): Capture {
  return JSON.parse(JSON.stringify(capture)) as Capture;
}

function normaliseCapture(raw: unknown, chart: Chart): Capture {
  const base = blankCapture(chart);
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<Capture>;

  return {
    mode: value.mode || chart.mode,
    zoom: value.zoom ?? base.zoom,
    page_index: value.page_index ?? base.page_index,
    panel_corners: { ...base.panel_corners, ...(value.panel_corners || {}) },
    axis_ticks: { ...base.axis_ticks, ...(value.axis_ticks || {}) },
    lines: { ...base.lines, ...(value.lines || {}) },
    guides: { ...base.guides, ...(value.guides || {}) },
    notes: value.notes || base.notes,
  };
}

function parseCapture(text: string, chart: Chart): Capture | null {
  try {
    return normaliseCapture(JSON.parse(text), chart);
  } catch {
    return null;
  }
}

function fitAxis(ticks: AxisTick[], coord: "x" | "y", name: string): [number, number] {
  if (ticks.length < 2) throw new Error(`${name} needs at least two ticks.`);

  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sx2 = 0;

  for (const tick of ticks) {
    const c = Number(tick[coord]);
    const v = Number(tick.value);

    if (!Number.isFinite(c) || !Number.isFinite(v)) {
      throw new Error(`${name} has invalid tick data.`);
    }

    sx += c;
    sy += v;
    sxy += c * v;
    sx2 += c * c;
  }

  const len = ticks.length;
  const den = len * sx2 - sx * sx;
  if (Math.abs(den) < 1e-9) throw new Error(`${name} axis fit is degenerate.`);

  const a = (len * sxy - sx * sy) / den;
  const b = (sy - a * sx) / len;
  return [a, b];
}

function coordFromValue(a: number, b: number, value: number) {
  if (Math.abs(a) < 1e-9) throw new Error("Axis scale is degenerate.");
  return (value - b) / a;
}

function valueFromCoord(a: number, b: number, coord: number) {
  return a * coord + b;
}

function yAtX(segment: Segment, x: number) {
  if (Math.abs(segment.x2 - segment.x1) < 1e-9) return segment.y1;
  const t = (x - segment.x1) / (segment.x2 - segment.x1);
  return segment.y1 + t * (segment.y2 - segment.y1);
}

function polylineYAtX(polyline: Segment[], x: number) {
  if (!polyline.length) throw new Error("Polyline has no segments.");

  const candidates = polyline.map((segment) => {
    const minX = Math.min(segment.x1, segment.x2);
    const maxX = Math.max(segment.x1, segment.x2);
    const distance =
      minX <= x && x <= maxX
        ? 0
        : Math.min(Math.abs(x - minX), Math.abs(x - maxX));

    return { segment, distance };
  });

  candidates.sort((a, b) => a.distance - b.distance);
  return yAtX(candidates[0].segment, x);
}

function closePoint(a: Point, b: Point) {
  return Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2;
}

function groupConnectedSegments(segments: Segment[]) {
  const groups: Segment[][] = [];

  for (const segment of segments) {
    const lastGroup = groups[groups.length - 1];
    const lastSegment = lastGroup?.[lastGroup.length - 1];

    if (
      lastGroup &&
      lastSegment &&
      closePoint(
        { x: lastSegment.x2, y: lastSegment.y2 },
        { x: segment.x1, y: segment.y1 }
      )
    ) {
      lastGroup.push(segment);
    } else {
      groups.push([segment]);
    }
  }

  return groups;
}

function parsePaLines(lines: Record<string, Segment[]>) {
  const levels: { ft: number; key: string }[] = [];

  Object.entries(lines).forEach(([key, segments]) => {
    if (!key.startsWith("pa_") || !segments.length) return;

    if (key === "pa_sea_level") {
      levels.push({ ft: 0, key });
      return;
    }

    const ft = Number(key.replace("pa_", ""));
    if (Number.isFinite(ft)) levels.push({ ft, key });
  });

  return levels.sort((a, b) => a.ft - b.ft);
}

function interpolatePa(paFt: number, levels: { ft: number; key: string }[]) {
  if (!levels.length) throw new Error("No pressure altitude lines are available.");

  if (paFt <= levels[0].ft) return { lo: levels[0], hi: levels[0], alpha: 0 };

  const last = levels[levels.length - 1];
  if (paFt >= last.ft) return { lo: last, hi: last, alpha: 0 };

  for (let i = 0; i < levels.length - 1; i += 1) {
    const lo = levels[i];
    const hi = levels[i + 1];

    if (lo.ft <= paFt && paFt <= hi.ft) {
      return { lo, hi, alpha: (paFt - lo.ft) / (hi.ft - lo.ft) };
    }
  }

  return { lo: last, hi: last, alpha: 0 };
}

function firstSegments(capture: Capture, keys: string[] | undefined, fallback: string[]) {
  const guides = capture.guides || {};

  for (const key of [...(keys || []), ...fallback]) {
    const segments = guides[key];
    if (segments?.length) return segments;
  }

  return [];
}

function interpolateGuides(
  groups: Segment[][],
  xRef: number,
  yRef: number,
  xTarget: number
): [number, string] {
  if (!groups.length) return [yRef, "no guides"];

  const rows = groups
    .map((group) => ({
      yRef: polylineYAtX(group, xRef),
      yTarget: polylineYAtX(group, xTarget),
    }))
    .sort((a, b) => a.yRef - b.yRef);

  if (yRef <= rows[0].yRef) return [rows[0].yTarget, "clamped low"];

  const last = rows[rows.length - 1];
  if (yRef >= last.yRef) return [last.yTarget, "clamped high"];

  for (let i = 0; i < rows.length - 1; i += 1) {
    const lo = rows[i];
    const hi = rows[i + 1];

    if (lo.yRef <= yRef && yRef <= hi.yRef) {
      const alpha = (yRef - lo.yRef) / (hi.yRef - lo.yRef);
      return [
        (1 - alpha) * lo.yTarget + alpha * hi.yTarget,
        `interpolated ${i}-${i + 1}`,
      ];
    }
  }

  return [yRef, "fallback"];
}

function roundStep(value: number, step: number) {
  return step * Math.round(value / step);
}

function validateCapture(capture: Capture, chart: Chart) {
  const errors: string[] = [];

  chart.panels.forEach((key) => {
    if ((capture.panel_corners[key] || []).length !== 4) {
      errors.push(`panel_corners.${key} needs 4 points`);
    }
  });

  chart.axisTickKeys.forEach((key) => {
    if ((capture.axis_ticks[key] || []).length < 2) {
      errors.push(`axis_ticks.${key} needs at least 2 ticks`);
    }
  });

  if (parsePaLines(capture.lines).length < 2) {
    errors.push("At least two pressure altitude lines are required");
  }

  if (chart.kind === "multi") {
    if (!chart.outputAxisKey) errors.push("outputAxisKey missing in chart config");

    if (!(capture.lines.weight_ref_line || []).length) {
      errors.push("lines.weight_ref_line is required");
    }

    if (!(capture.lines.wind_ref_zero || []).length) {
      errors.push("lines.wind_ref_zero is required");
    }

    if (!firstSegments(capture, chart.weightGuideKeys, ["guides_weight"]).length) {
      errors.push("weight guide curves are required");
    }

    if (!firstSegments(capture, chart.windGuideKeys, ["guides_wind"]).length) {
      errors.push("wind guide curves are required");
    }
  }

  return errors;
}

function solve(chart: Chart, capture: Capture, inputs: Inputs): SolverResult {
  const errors = validateCapture(capture, chart);
  if (errors.length) throw new Error(errors.join("; "));

  const ticks = capture.axis_ticks;
  const levels = parsePaLines(capture.lines);
  const [oatA, oatB] = fitAxis(ticks.oat_c || [], "x", "oat_c");
  const xOat = coordFromValue(oatA, oatB, inputs.oatC);

  const pa = interpolatePa(inputs.paFt, levels);
  const yLo = polylineYAtX(capture.lines[pa.lo.key], xOat);
  const yHi = polylineYAtX(capture.lines[pa.hi.key], xOat);
  const yEntry = (1 - pa.alpha) * yLo + pa.alpha * yHi;

  if (chart.kind === "climb") {
    const [rocA, rocB] = fitAxis(ticks.roc_fpm || [], "y", "roc_fpm");
    const rawValue = valueFromCoord(rocA, rocB, yEntry);

    return {
      rawValue,
      roundedValue: roundStep(rawValue, chart.roundTo),
      label: chart.outputLabel,
      unit: chart.unit,
      path: [{ x1: xOat, y1: yEntry, x2: xOat, y2: yEntry }],
      debug: {
        paLineLow: pa.lo.key,
        paLineHigh: pa.hi.key,
        alpha: pa.alpha,
      },
    };
  }

  const outputAxisKey = chart.outputAxisKey || "";
  const [weightA, weightB] = fitAxis(ticks.weight_x100_lb || [], "x", "weight_x100_lb");
  const [windA, windB] = fitAxis(ticks.wind_kt || [], "x", "wind_kt");
  const [outA, outB] = fitAxis(ticks[outputAxisKey] || [], "y", outputAxisKey);

  const weightRef = capture.lines.weight_ref_line[0];
  const windRef = capture.lines.wind_ref_zero[0];

  const xWeightRef = (weightRef.x1 + weightRef.x2) / 2;
  const xWindRef = (windRef.x1 + windRef.x2) / 2;
  const xWeight = coordFromValue(weightA, weightB, inputs.weightLb / 100);
  const xWind = coordFromValue(windA, windB, inputs.windKt);

  const oatTicks = ticks.oat_c || [];
  const outputTicks = ticks[outputAxisKey] || [];
  const yOatBase =
    oatTicks.length > 0
      ? oatTicks.reduce((sum, tick) => sum + tick.y, 0) / oatTicks.length
      : yEntry;
  const xOutputAxis =
    outputTicks.length > 0
      ? outputTicks.reduce((sum, tick) => sum + tick.x, 0) / outputTicks.length
      : xWind;

  const weightGuideGroups = groupConnectedSegments(
    firstSegments(capture, chart.weightGuideKeys, ["guides_weight"])
  );

  const windGuideGroups = groupConnectedSegments(
    firstSegments(capture, chart.windGuideKeys, ["guides_wind"])
  );

  const [yWeight, weightGuide] = interpolateGuides(
    weightGuideGroups,
    xWeightRef,
    yEntry,
    xWeight
  );

  const [yOutput, windGuide] = interpolateGuides(
    windGuideGroups,
    xWindRef,
    yWeight,
    xWind
  );

  const rawValue = valueFromCoord(outA, outB, yOutput);

  return {
    rawValue,
    roundedValue: roundStep(rawValue, chart.roundTo),
    label: chart.outputLabel,
    unit: chart.unit,
    path: [
      { x1: xOat, y1: yOatBase, x2: xOat, y2: yEntry },
      { x1: xOat, y1: yEntry, x2: xWeightRef, y2: yEntry },
      { x1: xWeightRef, y1: yEntry, x2: xWeight, y2: yWeight },
      { x1: xWeight, y1: yWeight, x2: xWindRef, y2: yWeight },
      { x1: xWindRef, y1: yWeight, x2: xWind, y2: yOutput },
      { x1: xWind, y1: yOutput, x2: xOutputAxis, y2: yOutput },
    ],
    debug: {
      paLineLow: pa.lo.key,
      paLineHigh: pa.hi.key,
      alpha: pa.alpha,
      weightGuide,
      windGuide,
      rawValue,
      yOatBase,
      xOutputAxis,
    },
  };
}

function drawCanvas(args: {
  canvas: HTMLCanvasElement;
  image: HTMLImageElement;
  capture: Capture;
  result: SolverResult | null;
  showOverlay: boolean;
  showLabels: boolean;
  showPath: boolean;
  currentPolylinePoints: Point[];
}) {
  const {
    canvas,
    image,
    capture,
    result,
    showOverlay,
    showLabels,
    showPath,
    currentPolylinePoints,
  } = args;

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  ctx.lineWidth = 2;
  ctx.font = "13px sans-serif";

  const label = (text: string, x: number, y: number) => {
    if (!showLabels) return;
    ctx.fillText(text, x + 6, y - 6);
  };

  if (showOverlay) {
    Object.entries(capture.panel_corners).forEach(([key, points]) => {
      if (!points.length) return;

      ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
      ctx.fillStyle = "rgba(59, 130, 246, 0.95)";

      points.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fill();
        label(`${key}.${index + 1}`, point.x, point.y);
      });
    });

    Object.entries(capture.axis_ticks).forEach(([key, ticks]) => {
      ctx.fillStyle = "rgba(5, 150, 105, 0.95)";

      ticks.forEach((tick) => {
        ctx.beginPath();
        ctx.arc(tick.x, tick.y, 4, 0, Math.PI * 2);
        ctx.fill();
        label(`${key}:${tick.value}`, tick.x, tick.y);
      });
    });

    Object.entries(capture.lines).forEach(([key, segments]) => {
      ctx.strokeStyle = "rgba(220, 38, 38, 0.9)";
      ctx.fillStyle = "rgba(220, 38, 38, 0.9)";

      segments.forEach((segment, index) => {
        ctx.beginPath();
        ctx.moveTo(segment.x1, segment.y1);
        ctx.lineTo(segment.x2, segment.y2);
        ctx.stroke();
        label(`${key}.${index + 1}`, segment.x1, segment.y1);
      });
    });

    Object.entries(capture.guides || {}).forEach(([key, segments]) => {
      ctx.strokeStyle = "rgba(168, 85, 247, 0.85)";
      ctx.fillStyle = "rgba(168, 85, 247, 0.85)";

      segments.forEach((segment, index) => {
        ctx.beginPath();
        ctx.moveTo(segment.x1, segment.y1);
        ctx.lineTo(segment.x2, segment.y2);
        ctx.stroke();
        label(`${key}.${index + 1}`, segment.x1, segment.y1);
      });
    });
  }

  if (currentPolylinePoints.length) {
    ctx.strokeStyle = "rgba(245, 158, 11, 0.95)";
    ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
    ctx.lineWidth = 4;

    currentPolylinePoints.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
      ctx.fill();

      if (index > 0) {
        const previous = currentPolylinePoints[index - 1];
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    });
  }

  if (showPath && result) {
    ctx.strokeStyle = "rgba(234, 179, 8, 0.95)";
    ctx.lineWidth = 5;

    result.path.forEach((segment) => {
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
    });
  }
}

function buttonClass(active: boolean) {
  return `rounded-xl px-3 py-2 text-sm font-semibold transition ${
    active
      ? "bg-zinc-950 text-white"
      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
  }`;
}

function inputClass() {
  return "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500";
}

function segmentsFromPoints(points: Point[]) {
  const segments: Segment[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];

    segments.push({
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
    });
  }

  return segments;
}

export default function PerformanceGraphTools() {
  const [chartKey, setChartKey] = useState(CHARTS[0].key);
  const chart = useMemo(
    () => CHARTS.find((item) => item.key === chartKey) || CHARTS[0],
    [chartKey]
  );

  const [mode, setMode] = useState<"solver" | "builder">("solver");
  const [jsonText, setJsonText] = useState("");
  const [loadError, setLoadError] = useState("");
  const [showOverlay, setShowOverlay] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [showPath, setShowPath] = useState(true);
  const [chartZoom, setChartZoom] = useState(160);
  const [inputs, setInputs] = useState<Inputs>(chart.defaultInputs);
  const [guidedIndex, setGuidedIndex] = useState(0);
  const [currentPolylinePoints, setCurrentPolylinePoints] = useState<Point[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const visibleCharts = CHARTS;

  const capture = useMemo(() => parseCapture(jsonText, chart), [chart, jsonText]);

  const validation = useMemo(
    () => (capture ? validateCapture(capture, chart) : ["JSON is invalid"]),
    [capture, chart]
  );

  const result = useMemo(() => {
    if (!capture || validation.length) return null;

    try {
      return solve(chart, capture, inputs);
    } catch {
      return null;
    }
  }, [capture, chart, inputs, validation]);

  const solverError = useMemo(() => {
    if (!capture || validation.length) return validation.join("; ");

    try {
      solve(chart, capture, inputs);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Could not solve chart.";
    }
  }, [capture, chart, inputs, validation]);

  const currentStep = chart.guidedSteps[guidedIndex];

  useEffect(() => {
    setInputs(chart.defaultInputs);
    setGuidedIndex(0);
    setCurrentPolylinePoints([]);
  }, [chart]);

  useEffect(() => {
    setChartZoom(mode === "builder" ? 180 : 100);
  }, [mode, chartKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadJson() {
      setLoadError("");

      try {
        const response = await fetch(chart.jsonUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = normaliseCapture(await response.json(), chart);

        if (!cancelled) {
          setJsonText(JSON.stringify(data, null, 2));
        }
      } catch (error) {
        if (!cancelled) {
          setJsonText(JSON.stringify(blankCapture(chart), null, 2));
          setLoadError(
            `Could not load ${chart.jsonUrl}: ${
              error instanceof Error ? error.message : "unknown error"
            }`
          );
        }
      }
    }

    void loadJson();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !capture) return;

    const image = new Image();

    image.onload = () =>
      drawCanvas({
        canvas,
        image,
        capture,
        result,
        showOverlay,
        showLabels,
        showPath: mode === "solver" && showPath,
        currentPolylinePoints,
      });

    image.src = chart.backgroundUrl;
  }, [
    capture,
    chart.backgroundUrl,
    currentPolylinePoints,
    mode,
    result,
    showLabels,
    showOverlay,
    showPath,
  ]);

  function updateCapture(next: Capture) {
    setJsonText(JSON.stringify(next, null, 2));
  }

  function advanceStep() {
    setCurrentPolylinePoints([]);
    setGuidedIndex((current) => Math.min(current + 1, chart.guidedSteps.length - 1));
  }

  function setInput(name: keyof Inputs, value: string) {
    const parsed = Number(value);

    setInputs((current) => ({
      ...current,
      [name]: Number.isFinite(parsed) ? parsed : 0,
    }));
  }

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (mode !== "builder" || !capture || !currentStep) return;

    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();

    const point = {
      x: Number((((event.clientX - rect.left) / rect.width) * canvas.width).toFixed(1)),
      y: Number((((event.clientY - rect.top) / rect.height) * canvas.height).toFixed(1)),
    };

    const next = cloneCapture(capture);

    if (currentStep.kind === "panel") {
      const existing = next.panel_corners[currentStep.key] || [];
      const updated = existing.length >= currentStep.requiredPoints ? [point] : [...existing, point];

      next.panel_corners[currentStep.key] = updated;
      updateCapture(next);

      if (updated.length >= currentStep.requiredPoints) {
        setTimeout(advanceStep, 150);
      }

      return;
    }

    if (currentStep.kind === "axis") {
      next.axis_ticks[currentStep.key] = [
        ...(next.axis_ticks[currentStep.key] || []),
        { ...point, value: currentStep.value },
      ];

      updateCapture(next);
      setTimeout(advanceStep, 150);
      return;
    }

    if (currentStep.mode === "segment") {
      const updatedPoints = [...currentPolylinePoints, point];

      if (updatedPoints.length < 2) {
        setCurrentPolylinePoints(updatedPoints);
        return;
      }

      const segment = segmentsFromPoints(updatedPoints)[0];

      if (currentStep.kind === "line") {
        next.lines[currentStep.key] = [...(next.lines[currentStep.key] || []), segment];
      } else {
        next.guides = next.guides || {};
        next.guides[currentStep.key] = [...(next.guides[currentStep.key] || []), segment];
      }

      updateCapture(next);
      setCurrentPolylinePoints([]);
      setTimeout(advanceStep, 150);
      return;
    }

    setCurrentPolylinePoints((current) => [...current, point]);
  }

  function finishPolyline() {
    if (!capture || !currentStep) return;
    if (currentStep.kind !== "line" && currentStep.kind !== "guide") return;
    if (currentPolylinePoints.length < currentStep.minPoints) return;

    const next = cloneCapture(capture);
    const segments = segmentsFromPoints(currentPolylinePoints);

    if (currentStep.kind === "line") {
      next.lines[currentStep.key] = [...(next.lines[currentStep.key] || []), ...segments];
    } else {
      next.guides = next.guides || {};
      next.guides[currentStep.key] = [...(next.guides[currentStep.key] || []), ...segments];
    }

    updateCapture(next);
    advanceStep();
  }

  function undoCurrentPoint() {
    if (currentPolylinePoints.length) {
      setCurrentPolylinePoints((current) => current.slice(0, -1));
      return;
    }

    if (!capture || !currentStep) return;

    const next = cloneCapture(capture);

    if (currentStep.kind === "panel") {
      next.panel_corners[currentStep.key] = (next.panel_corners[currentStep.key] || []).slice(
        0,
        -1
      );
    }

    if (currentStep.kind === "axis") {
      next.axis_ticks[currentStep.key] = (next.axis_ticks[currentStep.key] || []).slice(0, -1);
    }

    if (currentStep.kind === "line") {
      next.lines[currentStep.key] = (next.lines[currentStep.key] || []).slice(0, -1);
    }

    if (currentStep.kind === "guide" && next.guides) {
      next.guides[currentStep.key] = (next.guides[currentStep.key] || []).slice(0, -1);
    }

    updateCapture(next);
  }

  function clearCurrentTarget() {
    if (!capture || !currentStep) return;

    const next = cloneCapture(capture);

    if (currentStep.kind === "panel") next.panel_corners[currentStep.key] = [];
    if (currentStep.kind === "axis") next.axis_ticks[currentStep.key] = [];
    if (currentStep.kind === "line") next.lines[currentStep.key] = [];
    if (currentStep.kind === "guide") {
      next.guides = next.guides || {};
      next.guides[currentStep.key] = [];
    }

    setCurrentPolylinePoints([]);
    updateCapture(next);
  }

  function downloadJson() {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `${chart.key}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  async function copyJson() {
    await navigator.clipboard.writeText(jsonText);
  }

  function loadExpectedExample() {
    if (!chart.expectedExample) return;
    setInputs({
      oatC: chart.expectedExample.oatC,
      paFt: chart.expectedExample.paFt,
      weightLb: chart.expectedExample.weightLb,
      windKt: chart.expectedExample.windKt,
    });
  }

  const progress = Math.round(((guidedIndex + 1) / chart.guidedSteps.length) * 100);
  const exampleDelta =
    result && chart.expectedExample
      ? result.roundedValue - chart.expectedExample.expected
      : null;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Admin tool
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
              Performance graph tools
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Guided solver/builder for graph coordinate JSONs. Curved chart lines can now
              be captured as multipoint polylines.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("solver")}
              className={buttonClass(mode === "solver")}
            >
              Solver
            </button>
            <button
              type="button"
              onClick={() => setMode("builder")}
              className={buttonClass(mode === "builder")}
            >
              Guided Builder
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[320px_1fr]">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Chart
            </span>
            <select
              value={chartKey}
              onChange={(event) => setChartKey(event.target.value)}
              className={`${inputClass()} w-full`}
            >
              {visibleCharts.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.aircraft} · {item.shortTitle}
                  {item.deprecated ? " · legacy" : ""}
                </option>
              ))}
            </select>

            
          </label>

          <div className="rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
            <strong className="text-zinc-900">P2006T note:</strong> this tool is ready to
            accept Tecnam chart images and JSONs later. Piper coordinates must not be reused.
            Ground-roll graphs are kept as legacy only; operational workflow should prefer
            over-50-ft charts.
          </div>
        </div>
      </section>

      {loadError ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
        </p>
      ) : null}

      <section
        className={`grid gap-6 ${
          mode === "builder"
            ? "xl:grid-cols-[330px_minmax(0,1fr)]"
            : "xl:grid-cols-[360px_minmax(0,1fr)]"
        }`}
      >
        <aside className="space-y-4">
          {mode === "solver" ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-zinc-950">Solver inputs</h3>

              <div className="mt-4 grid gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    OAT °C
                  </span>
                  <input
                    className={`${inputClass()} w-full`}
                    value={inputs.oatC}
                    onChange={(e) => setInput("oatC", e.target.value)}
                    type="number"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Pressure altitude ft
                  </span>
                  <input
                    className={`${inputClass()} w-full`}
                    value={inputs.paFt}
                    onChange={(e) => setInput("paFt", e.target.value)}
                    type="number"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Weight lb
                  </span>
                  <input
                    className={`${inputClass()} w-full`}
                    value={inputs.weightLb}
                    onChange={(e) => setInput("weightLb", e.target.value)}
                    type="number"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Wind kt
                  </span>
                  <input
                    className={`${inputClass()} w-full`}
                    value={inputs.windKt}
                    onChange={(e) => setInput("windKt", e.target.value)}
                    type="number"
                    disabled={chart.kind === "climb"}
                  />
                </label>
              </div>

              {chart.expectedExample ? (
                <button
                  type="button"
                  onClick={loadExpectedExample}
                  className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Load printed example
                </button>
              ) : null}

              <div className="mt-5 rounded-2xl bg-zinc-950 p-4 text-white">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Result</p>

                {result ? (
                  <p className="mt-1 text-3xl font-semibold">
                    {result.roundedValue.toLocaleString()} {result.unit}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-zinc-300">
                    {solverError || "No result yet."}
                  </p>
                )}

                <p className="mt-2 text-sm text-zinc-300">{chart.outputLabel}</p>

                {exampleDelta !== null && chart.expectedExample ? (
                  <p
                    className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                      Math.abs(exampleDelta) <= chart.roundTo * 2
                        ? "bg-emerald-500/15 text-emerald-100"
                        : "bg-amber-500/15 text-amber-100"
                    }`}
                  >
                    Printed example: {chart.expectedExample.expected.toLocaleString()}{" "}
                    {chart.unit}. Delta: {exampleDelta > 0 ? "+" : ""}
                    {exampleDelta.toLocaleString()} {chart.unit}.
                  </p>
                ) : null}
              </div>

              {result ? (
                <details className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
                    Debug
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-white p-3 text-xs text-zinc-700">
                    {JSON.stringify(result.debug, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-zinc-950">Guided Builder</h3>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-zinc-950"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="mt-2 text-xs text-zinc-500">
                Step {guidedIndex + 1} of {chart.guidedSteps.length}
              </p>

              {currentStep ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-950">{currentStep.title}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {currentStep.instruction}
                  </p>

                  {"mode" in currentStep && currentStep.mode === "polyline" ? (
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      Current points: {currentPolylinePoints.length}. Minimum required:{" "}
                      {currentStep.minPoints}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGuidedIndex((current) => Math.max(0, current - 1))}
                  className={buttonClass(false)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setGuidedIndex((current) =>
                      Math.min(chart.guidedSteps.length - 1, current + 1)
                    )
                  }
                  className={buttonClass(false)}
                >
                  Skip / Next
                </button>
                <button type="button" onClick={undoCurrentPoint} className={buttonClass(false)}>
                  Undo
                </button>
                <button type="button" onClick={clearCurrentTarget} className={buttonClass(false)}>
                  Clear target
                </button>
              </div>

              {currentStep &&
              (currentStep.kind === "line" || currentStep.kind === "guide") &&
              currentStep.mode === "polyline" ? (
                <button
                  type="button"
                  onClick={finishPolyline}
                  disabled={currentPolylinePoints.length < currentStep.minPoints}
                  className="mt-3 w-full rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  Finish current line / curve
                </button>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => capture && updateCapture(blankCapture(chart))}
                  className={buttonClass(false)}
                >
                  Blank JSON
                </button>
                <button type="button" onClick={copyJson} className={buttonClass(false)}>
                  Copy JSON
                </button>
              </div>

              <button type="button" onClick={downloadJson} className="mt-2 w-full rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white">
                Download JSON
              </button>
            </div>
          )}

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-zinc-950">Display</h3>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Zoom
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                    {chartZoom}%
                  </span>
                </div>

                <input
                  type="range"
                  min={60}
                  max={320}
                  step={10}
                  value={chartZoom}
                  onChange={(e) => setChartZoom(Number(e.target.value))}
                  className="w-full"
                />

                <div className="grid grid-cols-4 gap-2">
                  {[100, 150, 200, 250].map((zoom) => (
                    <button
                      key={zoom}
                      type="button"
                      onClick={() => setChartZoom(zoom)}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                        chartZoom === zoom
                          ? "bg-zinc-950 text-white"
                          : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {zoom}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 text-sm text-zinc-600">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showOverlay}
                    onChange={(e) => setShowOverlay(e.target.checked)}
                  />
                  Show captured overlay
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={(e) => setShowLabels(e.target.checked)}
                  />
                  Show overlay labels
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showPath}
                    onChange={(e) => setShowPath(e.target.checked)}
                  />
                  Show solver path
                </label>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-zinc-400">
              Current JSON: {chart.jsonUrl}
            </p>
          </div>
        </aside>

        <div className="space-y-4">
          <div
            className={`overflow-auto rounded-3xl border border-zinc-200 bg-zinc-100 p-3 shadow-sm ${
              mode === "builder" ? "max-h-[78vh]" : "max-h-[72vh]"
            }`}
          >
            <div className="min-w-max">
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                style={{
                  width: `${chartZoom}%`,
                  maxWidth: mode === "solver" ? "100%" : "none",
                }}
                className={`h-auto rounded-2xl bg-white shadow-sm ${
                  mode === "builder" ? "cursor-crosshair" : "cursor-default"
                }`}
              />
            </div>
          </div>

          <details
            className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm"
            open={mode === "builder"}
          >
            <summary className="cursor-pointer text-lg font-semibold text-zinc-950">
              Chart JSON
            </summary>

            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              className="mt-4 h-96 w-full rounded-2xl border border-zinc-200 bg-zinc-950 p-4 font-mono text-xs text-zinc-50 outline-none transition focus:border-zinc-500"
            />

            {validation.length ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {validation.join("; ")}
              </p>
            ) : (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                JSON looks complete for this chart.
              </p>
            )}
          </details>
        </div>
      </section>
    </div>
  );
}
