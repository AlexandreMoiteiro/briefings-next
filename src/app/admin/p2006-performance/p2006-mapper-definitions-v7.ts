import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type CaptureKind = "point" | "points" | "line" | "rect";
export type Capture = {
  kind: CaptureKind;
  points: Point[];
  rect?: Rect;
  confirmed: boolean;
};
export type CaptureStore = Record<string, Capture>;
export type StepMetadata = Record<string, string | number | boolean | null>;

export type GuidedStep = {
  id: string;
  group: string;
  title: string;
  instruction: string;
  kind: CaptureKind;
  requiredPoints?: number;
  minPoints?: number;
  maxPoints?: number;
  lineMode?: "segment" | "polyline";
  metadata?: StepMetadata;
};

export type SourceAsset = {
  image: string;
  text: string;
  pdfPage: number;
  printedPage: string;
};

export type PerformanceSourceDefinition = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  manifest: Record<P2006TRegistration, SourceAsset>;
  steps: GuidedStep[];
};

export type Stage = {
  id: string;
  type: "performance" | "mass-balance" | "form";
  title: string;
  shortTitle: string;
  description: string;
  steps: GuidedStep[];
  source?: PerformanceSourceDefinition;
  page?: 1 | 2;
};

const PRESSURE_ALTITUDES = [
  0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
];
const TEMPERATURE_COLUMNS = [-25, 0, 25, 50, "ISA"] as const;

function performanceSteps(): GuidedStep[] {
  return [
    {
      id: "matrix-reference-centres",
      group: "Numeric table",
      title: "Four reference cell centres",
      instruction:
        "Click the centres in this order: 1) S.L. Ground Roll at -25 °C, 2) S.L. Ground Roll at ISA, 3) 10,000 ft At 50 ft AGL at -25 °C, 4) 10,000 ft At 50 ft AGL at ISA. The full 5 × 22 matrix is then reconstructed automatically.",
      kind: "points",
      requiredPoints: 4,
      metadata: {
        role: "regular-cell-matrix",
        rowCount: 22,
        columnCount: 5,
        rowOrder: PRESSURE_ALTITUDES.flatMap((altitude) => [
          `${altitude}:ground-roll`,
          `${altitude}:50ft`,
        ]).join(","),
        columnOrder: TEMPERATURE_COLUMNS.join(","),
      },
    },
    {
      id: "reference-weight",
      group: "Published assumptions",
      title: "Reference weight",
      instruction: "Drag a tight rectangle around the published Weight line.",
      kind: "rect",
      metadata: { role: "condition-weight" },
    },
    {
      id: "operating-conditions",
      group: "Published assumptions",
      title: "Operating conditions block",
      instruction:
        "Drag one rectangle around the complete flaps, speeds, throttle and baseline runway-condition block.",
      kind: "rect",
      metadata: { role: "operating-conditions" },
    },
    ...[
      ["correction-headwind", "Headwind correction", "correction-headwind"],
      ["correction-tailwind", "Tailwind correction", "correction-tailwind"],
      ["correction-paved", "Paved-runway correction", "correction-paved"],
      ["correction-slope", "Runway-slope correction", "correction-slope"],
    ].map(([id, title, role]) => ({
      id,
      group: "Published corrections",
      title,
      instruction: `Drag a tight rectangle around the complete ${title} line.`,
      kind: "rect" as const,
      metadata: { role },
    })),
  ];
}

const PERFORMANCE_TABLE_STEPS = performanceSteps();

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] = [
  {
    id: "takeoff",
    title: "Takeoff table calibration",
    shortTitle: "AFM Takeoff",
    description:
      "Four cell centres calibrate the whole Ground Roll and 50 ft matrix. Published assumptions and corrections remain visible for audit.",
    steps: PERFORMANCE_TABLE_STEPS,
    manifest: {
      "CS-EAQ": {
        image: "/p2006-performance-pages/CS-EAQ/page-171.png",
        text: "/p2006-performance-pages/CS-EAQ/page-171.txt",
        pdfPage: 171,
        printedPage: "5-7",
      },
      "CS-EBX": {
        image: "/p2006-performance-pages/CS-EBX/page-171.png",
        text: "/p2006-performance-pages/CS-EBX/page-171.txt",
        pdfPage: 171,
        printedPage: "5-7",
      },
      "D-GSEV": {
        image: "/p2006-performance-pages/D-GSEV/page-169.png",
        text: "/p2006-performance-pages/D-GSEV/page-169.txt",
        pdfPage: 169,
        printedPage: "5-7",
      },
    },
  },
  {
    id: "landing",
    title: "Landing table calibration",
    shortTitle: "AFM Landing",
    description:
      "Four cell centres calibrate the whole Ground Roll and 50 ft matrix. Published assumptions and corrections remain visible for audit.",
    steps: PERFORMANCE_TABLE_STEPS,
    manifest: {
      "CS-EAQ": {
        image: "/p2006-performance-pages/CS-EAQ/page-185.png",
        text: "/p2006-performance-pages/CS-EAQ/page-185.txt",
        pdfPage: 185,
        printedPage: "5-21",
      },
      "CS-EBX": {
        image: "/p2006-performance-pages/CS-EBX/page-185.png",
        text: "/p2006-performance-pages/CS-EBX/page-185.txt",
        pdfPage: 185,
        printedPage: "5-21",
      },
      "D-GSEV": {
        image: "/p2006-performance-pages/D-GSEV/page-183.png",
        text: "/p2006-performance-pages/D-GSEV/page-183.txt",
        pdfPage: 183,
        printedPage: "5-21",
      },
    },
  },
];

function pointStep(
  id: string,
  group: string,
  title: string,
  instruction: string,
  metadata: StepMetadata
): GuidedStep {
  return { id, group, title, instruction, kind: "point", metadata };
}

function lineStep(
  id: string,
  group: string,
  title: string,
  instruction: string,
  metadata: StepMetadata,
  lineMode: "segment" | "polyline" = "segment"
): GuidedStep {
  return {
    id,
    group,
    title,
    instruction,
    kind: "line",
    lineMode,
    minPoints: 2,
    maxPoints: lineMode === "segment" ? 2 : 8,
    metadata,
  };
}

function axisEndpointSteps(): GuidedStep[] {
  const axes = [
    {
      key: "empty-aircraft-moment-kgm",
      label: "empty-aircraft moment",
      values: [140, 500],
      dimension: "y",
      unit: "kg·m",
    },
    {
      key: "front-seat-mass-kg",
      label: "front-seat mass",
      values: [0, 200],
      dimension: "x",
      unit: "kg",
    },
    {
      key: "rear-seat-mass-kg",
      label: "rear-seat mass",
      values: [0, 200],
      dimension: "x",
      unit: "kg",
    },
    {
      key: "fuel-mass-kg",
      label: "fuel mass",
      values: [0, 100],
      dimension: "x",
      unit: "kg",
    },
    {
      key: "baggage-mass-kg",
      label: "baggage mass",
      values: [0, 40],
      dimension: "x",
      unit: "kg",
    },
    {
      key: "flight-mass-kg",
      label: "flight mass",
      values: [900, 1200],
      dimension: "x",
      unit: "kg",
    },
  ] as const;

  return axes.flatMap((axis) =>
    axis.values.map((value) =>
      pointStep(
        axis.key === "empty-aircraft-moment-kgm"
          ? `moment-tick-${value}`
          : `${axis.key}-tick-${value}`,
        "Axis endpoints",
        `${axis.label} ${value} ${axis.unit}`,
        `Click the ${value} ${axis.unit} tick on the ${axis.label} axis. Only the two endpoints are needed; intermediate ticks are interpolated.`,
        { axis: axis.key, value, dimension: axis.dimension }
      )
    )
  );
}

function massBalanceSteps(): GuidedStep[] {
  const guides = [
    ["front-seat-max-guide", "Front-seat diagonal", "front-seats"],
    ["rear-seat-max-guide", "Rear-seat diagonal", "rear-seats"],
    ["fuel-max-guide", "Fuel diagonal", "fuel"],
    ["baggage-max-guide", "Baggage diagonal", "baggage"],
  ] as const;

  return [
    ...axisEndpointSteps(),
    ...guides.map(([id, title, panel]) =>
      lineStep(
        id,
        "Loading guide lines",
        title,
        `Trace one clear interior diagonal in the ${title.replace(" diagonal", "")} panel. Do not trace a vertical panel border. Click along it in order, then press Finish line.`,
        { role: "loading-guide", panel },
        "polyline"
      )
    ),
    ...[
      ["cg-16-5-mac", "16.5% MAC limit", "16.5"],
      ["cg-23-mac", "23% MAC limit", "23"],
      ["cg-31-mac", "31% MAC limit", "31"],
    ].map(([id, title, macPercent]) =>
      lineStep(
        id,
        "C.G. limit lines",
        title,
        `Trace the complete ${title} line, then press Finish line.`,
        { role: "cg-limit", macPercent },
        "polyline"
      )
    ),
    lineStep(
      "mass-limit-1180",
      "Maximum mass lines",
      "1180 kg limit line",
      "Click the bottom and top of the 1180 kg vertical limit line.",
      { role: "mass-limit", valueKg: 1180 }
    ),
    lineStep(
      "mass-limit-1230",
      "Maximum mass lines",
      "1230 kg limit line",
      "Click the bottom and top of the 1230 kg vertical limit line.",
      { role: "mass-limit", valueKg: 1230 }
    ),
  ];
}

export const MASS_BALANCE_STEPS = massBalanceSteps();

const FORM_PAGE_1_FIELD_STEPS: GuidedStep[] = [
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
  metadata: { field: id, valueType: "number" },
}));

const AIRFIELD_COLUMNS = [
  { id: "departure", label: "Departure" },
  { id: "arrival", label: "Arrival" },
  { id: "alternate", label: "Alternate 1" },
] as const;
const AIRFIELD_ROWS = [
  ["runway-qfu", "RWY QFU", "text"],
  ["elevation", "Elevation", "number"],
  ["qnh", "QNH", "number"],
  ["temperature", "Temperature", "number"],
  ["wind", "Wind", "text"],
  ["pressure-altitude", "Pressure altitude", "number"],
  ["density-altitude", "Density altitude", "number"],
] as const;
const PERFORMANCE_ROWS = [
  ["toda", "TODA"],
  ["todr", "TODR"],
  ["lda", "LDA"],
  ["ldr", "LDR"],
  ["roc", "ROC"],
] as const;
const FUEL_ROWS = [
  "Start-up and Taxi",
  "Climb",
  "Enroute",
  "Descent",
  "Trip Fuel",
  "Contingency 5%",
  "Alternate",
  "Reserve 45 min",
  "Required Ramp Fuel",
  "Extra",
  "Total Ramp Fuel",
] as const;

const FORM_PAGE_2_FIELD_STEPS: GuidedStep[] = [
  {
    id: "date",
    group: "Header fields",
    title: "Date",
    instruction: "Drag the writable rectangle beside Date.",
    kind: "rect",
    metadata: { field: "date", valueType: "text" },
  },
  {
    id: "aircraft-registration",
    group: "Header fields",
    title: "Aircraft registration",
    instruction: "Drag the writable rectangle beside Aircraft Reg.",
    kind: "rect",
    metadata: { field: "aircraft-registration", valueType: "text" },
  },
  ...AIRFIELD_COLUMNS.map((column) => ({
    id: `${column.id}-airfield`,
    group: "Airfield names",
    title: `${column.label} airfield`,
    instruction: `Drag the ${column.label} Airfield rectangle.`,
    kind: "rect" as const,
    metadata: { field: `${column.id}-airfield`, valueType: "text" },
  })),
  ...AIRFIELD_ROWS.flatMap(([rowId, rowLabel, valueType]) =>
    AIRFIELD_COLUMNS.map((column) => ({
      id: `${column.id}-${rowId}`,
      group: "Airfield conditions",
      title: `${column.label} ${rowLabel}`,
      instruction: `Drag the ${rowLabel} rectangle in the ${column.label} column.`,
      kind: "rect" as const,
      metadata: { field: `${column.id}-${rowId}`, valueType },
    }))
  ),
  ...PERFORMANCE_ROWS.flatMap(([rowId, rowLabel]) =>
    AIRFIELD_COLUMNS.map((column) => ({
      id: `${column.id}-${rowId}`,
      group: "Performance results",
      title: `${column.label} ${rowLabel}`,
      instruction: `Drag the ${rowLabel} rectangle in the ${column.label} performance column.`,
      kind: "rect" as const,
      metadata: { field: `${column.id}-${rowId}`, valueType: "number" },
    }))
  ),
  ...FUEL_ROWS.flatMap((rowLabel, index) =>
    (["time", "fuel"] as const).map((column) => ({
      id: `fuel-${index + 1}-${column}`,
      group: "Fuel planning",
      title: `${rowLabel} · ${column === "time" ? "Time" : "Fuel"}`,
      instruction: `Drag the ${column} rectangle for fuel-planning row ${index + 1}: ${rowLabel}.`,
      kind: "rect" as const,
      metadata: {
        field: `fuel-${index + 1}-${column}`,
        valueType: column === "time" ? "text" : "number",
      },
    }))
  ),
];

export const STAGES: Stage[] = [
  ...PERFORMANCE_SOURCES.map((source) => ({
    id: `performance-${source.id}`,
    type: "performance" as const,
    title: source.title,
    shortTitle: source.shortTitle,
    description: source.description,
    source,
    steps: source.steps,
  })),
  {
    id: "mass-balance-graph",
    type: "mass-balance",
    title: "Mass & Balance graph calibration",
    shortTitle: "M&B graph",
    description:
      "Shared geometry. Only axis endpoints, four interior loading diagonals, C.G. limits and maximum-mass lines are required.",
    page: 1,
    steps: MASS_BALANCE_STEPS,
  },
  {
    id: "form-page-1-fields",
    type: "form",
    title: "Form page 1 writable fields",
    shortTitle: "Form page 1",
    description:
      "Shared by all P2006T registrations. Map only the loading-value rectangles.",
    page: 1,
    steps: FORM_PAGE_1_FIELD_STEPS,
  },
  {
    id: "form-page-2-fields",
    type: "form",
    title: "Form page 2 writable fields",
    shortTitle: "Form page 2",
    description:
      "Shared by all registrations. The original PDF column is Alternate 1; Alternate 2 will be carried on the generated performance appendix, as in the Piper workflow.",
    page: 2,
    steps: FORM_PAGE_2_FIELD_STEPS,
  },
];
