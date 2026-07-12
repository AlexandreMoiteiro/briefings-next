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
  { id: "sl", label: "S.L.", value: 0 },
  ...Array.from({ length: 10 }, (_, index) => {
    const value = (index + 1) * 1000;
    return { id: String(value), label: `${value.toLocaleString()} ft`, value };
  }),
];

const TEMPERATURE_COLUMNS = [
  { id: "minus-25", label: "-25 °C", value: -25 },
  { id: "0", label: "0 °C", value: 0 },
  { id: "25", label: "25 °C", value: 25 },
  { id: "50", label: "50 °C", value: 50 },
  { id: "isa", label: "ISA", value: "ISA" },
] as const;

function makePerformanceTableSteps(): GuidedStep[] {
  return [
    {
      id: "matrix-reference-centres",
      group: "Numeric table",
      title: "Four reference cell centres",
      instruction:
        "Click the centres of these four numeric cells, in order: 1) S.L. Ground Roll at -25 °C, 2) S.L. Ground Roll at ISA, 3) 10,000 ft At 50 ft AGL at -25 °C, 4) 10,000 ft At 50 ft AGL at ISA. The complete 5-column × 22-row cell grid will be reconstructed automatically.",
      kind: "points",
      requiredPoints: 4,
      metadata: {
        role: "regular-cell-matrix",
        rowCount: 22,
        columnCount: 5,
        rowOrder: PRESSURE_ALTITUDES.flatMap((altitude) => [
          `${altitude.value}:ground-roll`,
          `${altitude.value}:50ft`,
        ]).join(","),
        columnOrder: TEMPERATURE_COLUMNS.map((column) => String(column.value)).join(","),
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
        "Drag one rectangle around the complete operating-conditions block: flaps, speeds, throttle and baseline runway condition.",
      kind: "rect",
      metadata: { role: "operating-conditions" },
    },
    {
      id: "correction-headwind",
      group: "Published corrections",
      title: "Headwind correction",
      instruction: "Drag a tight rectangle around the complete Headwind correction line.",
      kind: "rect",
      metadata: { role: "correction-headwind" },
    },
    {
      id: "correction-tailwind",
      group: "Published corrections",
      title: "Tailwind correction",
      instruction: "Drag a tight rectangle around the complete Tailwind correction line.",
      kind: "rect",
      metadata: { role: "correction-tailwind" },
    },
    {
      id: "correction-paved",
      group: "Published corrections",
      title: "Paved-runway correction",
      instruction: "Drag a tight rectangle around the complete Paved Runway correction line.",
      kind: "rect",
      metadata: { role: "correction-paved" },
    },
    {
      id: "correction-slope",
      group: "Published corrections",
      title: "Runway-slope correction",
      instruction: "Drag a tight rectangle around the complete Runway slope correction line.",
      kind: "rect",
      metadata: { role: "correction-slope" },
    },
  ];
}

const PERFORMANCE_TABLE_STEPS = makePerformanceTableSteps();

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] = [
  {
    id: "takeoff",
    title: "Takeoff table calibration",
    shortTitle: "AFM Takeoff",
    description:
      "Four cell centres calibrate the complete Ground Roll and 50 ft matrix; only the published assumptions and correction lines are then boxed.",
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
      "Four cell centres calibrate the complete Ground Roll and 50 ft matrix; only the published assumptions and correction lines are then boxed.",
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

function makeMassBalanceSteps(): GuidedStep[] {
  const steps: GuidedStep[] = [];

  for (const panel of [
    ["front-seats", "Occupants front seats"],
    ["rear-seats", "Occupants rear seats"],
    ["fuel", "Fuel mass"],
    ["baggage", "Baggage mass"],
    ["cg-limits", "Flight mass / C.G. limits"],
  ] as const) {
    steps.push({
      id: `panel-${panel[0]}`,
      group: "Panel geometry",
      title: `${panel[1]} panel corners`,
      instruction:
        "Click the four usable graph corners in this order: top-left, top-right, bottom-left, bottom-right.",
      kind: "points",
      requiredPoints: 4,
      metadata: { role: "panel", panel: panel[0] },
    });
  }

  for (let value = 140; value <= 500; value += 20) {
    steps.push(
      pointStep(
        `moment-tick-${value}`,
        "Moment axis ticks",
        `Empty-aircraft moment tick ${value} kg·m`,
        `Click the ${value} kg·m tick on the left vertical moment axis.`,
        { axis: "empty-aircraft-moment-kgm", value, dimension: "y" }
      )
    );
  }

  const xAxes = [
    {
      key: "front-seat-mass-kg",
      group: "Front-seat mass ticks",
      label: "front-seat mass",
      values: [0, 40, 80, 120, 160, 200],
    },
    {
      key: "rear-seat-mass-kg",
      group: "Rear-seat mass ticks",
      label: "rear-seat mass",
      values: [0, 40, 80, 120, 160, 200],
    },
    {
      key: "fuel-mass-kg",
      group: "Fuel mass ticks",
      label: "fuel mass",
      values: [0, 20, 40, 60, 80, 100],
    },
    {
      key: "baggage-mass-kg",
      group: "Baggage mass ticks",
      label: "baggage mass",
      values: [0, 10, 20, 30, 40],
    },
    {
      key: "flight-mass-kg",
      group: "Flight mass ticks",
      label: "flight mass",
      values: [900, 1000, 1100, 1200],
    },
  ];

  for (const axis of xAxes) {
    for (const value of axis.values) {
      steps.push(
        pointStep(
          `${axis.key}-tick-${value}`,
          axis.group,
          `${value} kg tick`,
          `Click the ${value} kg tick on the ${axis.label} axis.`,
          { axis: axis.key, value, dimension: "x" }
        )
      );
    }
  }

  for (const guide of [
    [
      "front-seat-max-guide",
      "Front-seat 200 kg guide line",
      "Trace the diagonal graph line that passes through the 200 kg front-seat tick.",
      "front-seats",
    ],
    [
      "rear-seat-max-guide",
      "Rear-seat 200 kg guide line",
      "Trace the sloping graph line that passes through the 200 kg rear-seat tick.",
      "rear-seats",
    ],
    [
      "fuel-max-guide",
      "Fuel 100 kg guide line",
      "Trace the diagonal graph line that passes through the 100 kg fuel tick.",
      "fuel",
    ],
    [
      "baggage-max-guide",
      "Baggage 40 kg guide line",
      "Trace the diagonal graph line that passes through the 40 kg baggage tick.",
      "baggage",
    ],
  ] as const) {
    steps.push(
      lineStep(
        guide[0],
        "Loading guide lines",
        guide[1],
        `${guide[2]} Click along it in order, then press Finish line.`,
        { role: "loading-guide", panel: guide[3] },
        "polyline"
      )
    );
  }

  for (const limit of [
    ["cg-16-5-mac", "16.5% MAC limit", "16.5"],
    ["cg-23-mac", "23% MAC limit", "23"],
    ["cg-31-mac", "31% MAC limit", "31"],
  ] as const) {
    steps.push(
      lineStep(
        limit[0],
        "C.G. limit lines",
        limit[1],
        `Trace the complete ${limit[1]} line, then press Finish line.`,
        { role: "cg-limit", macPercent: limit[2] },
        "polyline"
      )
    );
  }

  steps.push(
    lineStep(
      "mass-limit-1180",
      "Maximum mass lines",
      "1180 kg limit line",
      "Click the bottom and top of the vertical 1180 kg mass-limit line.",
      { role: "mass-limit", valueKg: 1180 }
    ),
    lineStep(
      "mass-limit-1230",
      "Maximum mass lines",
      "1230 kg limit line",
      "Click the bottom and top of the vertical 1230 kg mass-limit line.",
      { role: "mass-limit", valueKg: 1230 }
    )
  );

  return steps;
}

export const MASS_BALANCE_STEPS = makeMassBalanceSteps();

const FORM_PAGE_1_FIELD_STEPS: GuidedStep[] = [
  {
    id: "pilot-front-seat-mass",
    group: "Loading fields",
    title: "Pilot and front-seat mass",
    instruction:
      "Drag the exact writable rectangle in the YOUR AIRPLANE column for Pilot & Front Seat.",
    kind: "rect",
    metadata: { field: "pilot-front-seat-mass", valueType: "number" },
  },
  {
    id: "rear-seats-mass",
    group: "Loading fields",
    title: "Rear-seats mass",
    instruction:
      "Drag the exact writable rectangle in the YOUR AIRPLANE column for Rear Seats.",
    kind: "rect",
    metadata: { field: "rear-seats-mass", valueType: "number" },
  },
  {
    id: "fuel-mass",
    group: "Loading fields",
    title: "Fuel mass",
    instruction:
      "Drag the exact writable rectangle in the YOUR AIRPLANE column for Fuel Mass.",
    kind: "rect",
    metadata: { field: "fuel-mass", valueType: "number" },
  },
  {
    id: "baggage-mass",
    group: "Loading fields",
    title: "Baggage mass",
    instruction:
      "Drag the exact writable rectangle in the YOUR AIRPLANE column for Baggage.",
    kind: "rect",
    metadata: { field: "baggage-mass", valueType: "number" },
  },
];

const AIRFIELD_COLUMNS = ["departure", "arrival", "alternate"] as const;
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
    id: `${column}-airfield`,
    group: "Airfield names",
    title: `${column[0].toUpperCase()}${column.slice(1)} airfield`,
    instruction: `Drag the ${column} Airfield rectangle.`,
    kind: "rect" as const,
    metadata: { field: `${column}-airfield`, valueType: "text" },
  })),
  ...AIRFIELD_ROWS.flatMap(([rowId, rowLabel, valueType]) =>
    AIRFIELD_COLUMNS.map((column) => ({
      id: `${column}-${rowId}`,
      group: "Airfield conditions",
      title: `${column[0].toUpperCase()}${column.slice(1)} ${rowLabel}`,
      instruction: `Drag the ${rowLabel} rectangle in the ${column} column.`,
      kind: "rect" as const,
      metadata: { field: `${column}-${rowId}`, valueType },
    }))
  ),
  ...PERFORMANCE_ROWS.flatMap(([rowId, rowLabel]) =>
    AIRFIELD_COLUMNS.map((column) => ({
      id: `${column}-${rowId}`,
      group: "Performance results",
      title: `${column[0].toUpperCase()}${column.slice(1)} ${rowLabel}`,
      instruction: `Drag the ${rowLabel} rectangle in the ${column} performance column.`,
      kind: "rect" as const,
      metadata: { field: `${column}-${rowId}`, valueType: "number" },
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
      "Shared form geometry: panel corners, metric ticks, loading guides, C.G. limits and mass limits.",
    page: 1,
    steps: MASS_BALANCE_STEPS,
  },
  {
    id: "form-page-1-fields",
    type: "form",
    title: "Form page 1 writable fields",
    shortTitle: "Form page 1",
    description:
      "Shared by every P2006T registration. Map only the loading-value rectangles.",
    page: 1,
    steps: FORM_PAGE_1_FIELD_STEPS,
  },
  {
    id: "form-page-2-fields",
    type: "form",
    title: "Form page 2 writable fields",
    shortTitle: "Form page 2",
    description:
      "Shared by every P2006T registration. Map the airfield, performance and fuel-planning rectangles.",
    page: 2,
    steps: FORM_PAGE_2_FIELD_STEPS,
  },
];
