import {
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type Stage,
  type StepMetadata,
} from "./p2006-mapper-definitions-v19";

export type {
  Point,
  Rect,
  StepMetadata,
  CaptureKind,
  Capture,
  CaptureStore,
  GuidedStep,
  SourceAsset,
  PerformanceSourceDefinition,
  Stage,
} from "./p2006-mapper-definitions-v19";

function pointsStep(
  id: string,
  group: string,
  title: string,
  instruction: string,
  values: readonly number[],
  metadata: StepMetadata
): GuidedStep {
  return {
    id,
    group,
    title,
    instruction,
    kind: "points",
    requiredPoints: values.length,
    metadata: {
      ...metadata,
      tickValues: values.join(","),
      fitMethod: "least-squares-affine",
      residualCheck: true,
    },
  };
}

function segmentStep(
  id: string,
  group: string,
  title: string,
  instruction: string,
  metadata: StepMetadata
): GuidedStep {
  return {
    id,
    group,
    title,
    instruction,
    kind: "line",
    lineMode: "segment",
    minPoints: 2,
    maxPoints: 2,
    metadata,
  };
}

const FORM_FIELDS: GuidedStep[] = [
  ["pilot-front-seat-mass", "Pilot and front-seat mass", "Pilot & Front Seat"],
  ["rear-seats-mass", "Rear-seats mass", "Rear Seats"],
  ["fuel-mass", "Fuel mass", "Fuel Mass"],
  ["baggage-mass", "Baggage mass", "Baggage"],
].map(([id, title, row]) => ({
  id,
  group: "Loading fields",
  title,
  instruction: `Drag the exact writable rectangle in the YOUR AIRPLANE column for ${row}.`,
  kind: "rect" as const,
  metadata: { field: id, valueType: "number", sharedPage: 1 },
}));

const AXIS_CALIBRATION: GuidedStep[] = [
  pointsStep(
    "axis-empty-aircraft-moment",
    "Robust axis calibration",
    "Empty-aircraft moment axis · 7 ticks",
    "Click these labelled kg·m ticks from bottom to top, without pressing Start again: 140, 200, 260, 320, 380, 440, 500. The seven points are fitted together and the residual is used to detect a misplaced click.",
    [140, 200, 260, 320, 380, 440, 500],
    {
      role: "axis-calibration-series",
      axis: "empty-aircraft-moment-kgm",
      dimension: "y",
      unit: "kg·m",
      clickOrder: "ascending-value-bottom-to-top",
    }
  ),
  pointsStep(
    "axis-front-seat-mass",
    "Robust axis calibration",
    "Front-seat mass axis · all labelled ticks",
    "Click the labelled front-seat mass ticks from left to right: 0, 40, 80, 120, 160, 200 kg. Keep capture active until all six points are marked.",
    [0, 40, 80, 120, 160, 200],
    {
      role: "axis-calibration-series",
      axis: "front-seat-mass-kg",
      dimension: "x",
      unit: "kg",
      clickOrder: "ascending-value-left-to-right",
    }
  ),
  pointsStep(
    "axis-rear-seat-mass",
    "Robust axis calibration",
    "Rear-seat mass axis · all labelled ticks",
    "Click the labelled rear-seat mass ticks from left to right: 0, 40, 80, 120, 160, 200 kg.",
    [0, 40, 80, 120, 160, 200],
    {
      role: "axis-calibration-series",
      axis: "rear-seat-mass-kg",
      dimension: "x",
      unit: "kg",
      clickOrder: "ascending-value-left-to-right",
    }
  ),
  pointsStep(
    "axis-fuel-mass",
    "Robust axis calibration",
    "Fuel mass axis · all labelled ticks",
    "Click the labelled fuel-mass ticks from left to right: 0, 20, 40, 60, 80, 100 kg.",
    [0, 20, 40, 60, 80, 100],
    {
      role: "axis-calibration-series",
      axis: "fuel-mass-kg",
      dimension: "x",
      unit: "kg",
      clickOrder: "ascending-value-left-to-right",
    }
  ),
  pointsStep(
    "axis-baggage-mass",
    "Robust axis calibration",
    "Baggage mass axis · all labelled ticks",
    "Click the labelled baggage-mass ticks from left to right: 0, 10, 20, 30, 40 kg.",
    [0, 10, 20, 30, 40],
    {
      role: "axis-calibration-series",
      axis: "baggage-mass-kg",
      dimension: "x",
      unit: "kg",
      clickOrder: "ascending-value-left-to-right",
    }
  ),
  pointsStep(
    "axis-flight-mass",
    "Robust axis calibration",
    "Flight-mass axis · five labelled ticks",
    "Click the labelled flight-mass ticks from left to right: 800, 900, 1000, 1100, 1200 kg. The separate 1180 and 1230 limit lines are captured later.",
    [800, 900, 1000, 1100, 1200],
    {
      role: "axis-calibration-series",
      axis: "flight-mass-kg",
      dimension: "x",
      unit: "kg",
      clickOrder: "ascending-value-left-to-right",
    }
  ),
];

const LOADING_GUIDES: GuidedStep[] = [
  ["front-seat-max-guide", "Front-seat loading guide", "front-seats", "0 kg", "200 kg"],
  ["rear-seat-max-guide", "Rear-seat loading guide", "rear-seats", "0 kg", "200 kg"],
  ["fuel-max-guide", "Fuel loading guide", "fuel", "0 kg", "100 kg"],
  ["baggage-max-guide", "Baggage loading guide", "baggage", "0 kg", "40 kg"],
].map(([id, title, panel, startLabel, endLabel]) =>
  segmentStep(
    id,
    "Loading guide slopes",
    title,
    `Choose one long, clearly printed diagonal in the ${title.replace(" loading guide", "")} panel. Click its exact intersection at ${startLabel}, then its exact intersection at ${endLabel}. Use a single straight segment; do not trace freehand.`,
    {
      role: "loading-reference-diagonal",
      panel,
      calibration: "long-baseline-two-point-slope",
      startValue: startLabel,
      endValue: endLabel,
    }
  )
);

const CG_LINES: GuidedStep[] = [
  ["cg-16-5-mac", "16.5% MAC forward limit", 16.5, true],
  ["cg-23-mac", "23% MAC audit reference", 23, false],
  ["cg-31-mac", "31% MAC aft limit", 31, true],
].map(([id, title, macPercent, operationalLimit]) =>
  segmentStep(
    String(id),
    "C.G. envelope",
    String(title),
    `Click the lowest visible endpoint and then the highest visible endpoint of the ${macPercent}% MAC line. The builder stores a straight fitted segment.`,
    {
      role: "cg-line",
      macPercent: Number(macPercent),
      operationalLimit: Boolean(operationalLimit),
      calibration: "two-endpoint-segment",
    }
  )
);

const MASS_LIMITS: GuidedStep[] = [
  segmentStep(
    "mass-limit-1180",
    "Maximum-mass limits",
    "1180 kg maximum-mass line",
    "Click the bottom and top of the published 1180 kg vertical line. This is the operational limit used for CS-EAQ.",
    {
      role: "mass-limit",
      valueKg: 1180,
      appliesTo: "CS-EAQ",
      operationalLimit: true,
    }
  ),
  segmentStep(
    "mass-limit-1230",
    "Maximum-mass limits",
    "1230 kg maximum-mass line",
    "Click the bottom and top of the published 1230 kg vertical line. This is the operational limit used for CS-EBX and D-GSEV.",
    {
      role: "mass-limit",
      valueKg: 1230,
      appliesTo: "CS-EBX,D-GSEV",
      operationalLimit: true,
    }
  ),
];

export const MASS_BALANCE_STEPS: GuidedStep[] = [
  ...FORM_FIELDS,
  ...AXIS_CALIBRATION,
  ...LOADING_GUIDES,
  ...CG_LINES,
  ...MASS_LIMITS,
];

const PERFORMANCE_STAGES = BASE_STAGES.filter(
  (stage) => stage.type === "performance"
) as Stage[];

const PAGE_TWO_STAGE = BASE_STAGES.find(
  (stage) => stage.id === "form-page-2-fields"
);

if (!PAGE_TWO_STAGE) {
  throw new Error("P2006T form page two stage is missing.");
}

const PAGE_ONE_STAGE: Stage = {
  id: "mass-balance-graph",
  type: "mass-balance",
  title: "Shared Form page 1 · Loading data and Mass & Balance",
  shortTitle: "Form page 1 + M&B",
  description:
    "One physical page and one shared coordinate surface for all three aircraft. Multi-point axis fits reduce click error and provide a residual check. Both 1180 kg and 1230 kg limit lines are stored; the application selects the correct limit from the aircraft registration.",
  page: 1,
  steps: MASS_BALANCE_STEPS,
};

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] =
  BASE_PERFORMANCE_SOURCES;

export const STAGES: Stage[] = [
  ...PERFORMANCE_STAGES,
  PAGE_ONE_STAGE,
  PAGE_TWO_STAGE,
];
