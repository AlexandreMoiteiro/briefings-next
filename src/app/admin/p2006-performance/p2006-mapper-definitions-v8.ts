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
  performanceKind: "takeoff" | "landing";
  weightKg: 1180 | 1080 | 930;
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
] as const;

const TEMPERATURE_COLUMNS = [
  { id: "minus-25", label: "-25 °C / -13 °F", value: -25, interpolation: true },
  { id: "0", label: "0 °C / 32 °F", value: 0, interpolation: true },
  { id: "25", label: "25 °C / 77 °F", value: 25, interpolation: true },
  { id: "50", label: "50 °C / 122 °F", value: 50, interpolation: true },
  { id: "isa", label: "ISA", value: "ISA", interpolation: false },
] as const;

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

function performanceSteps(
  performanceKind: "takeoff" | "landing",
  weightKg: 1180 | 1080 | 930
): GuidedStep[] {
  const temperatureLines = TEMPERATURE_COLUMNS.map((column) =>
    lineStep(
      `temperature-column-${column.id}`,
      "Temperature columns",
      `${column.label} column centre line`,
      `Click the centre of the S.L. Ground Roll cell in the ${column.label} column, then the centre of the 10,000 ft At 50 ft AGL cell in the same column. The line through those points becomes the column centre line.`,
      {
        role: "table-column-centre-line",
        performanceKind,
        weightKg,
        temperature: String(column.value),
        interpolationColumn: column.interpolation,
        point1: "sl-ground-roll-cell-centre",
        point2: "10000ft-50ft-cell-centre",
      }
    )
  );

  const rowLines = PRESSURE_ALTITUDES.flatMap((altitudeFt) => {
    const altitudeLabel = altitudeFt === 0 ? "S.L." : `${altitudeFt.toLocaleString()} ft`;

    return [
      lineStep(
        `row-${altitudeFt}-ground-roll`,
        `${altitudeLabel} rows`,
        `${altitudeLabel} Ground Roll row centre line`,
        `Click the centre of the -25 °C Ground Roll cell at ${altitudeLabel}, then the centre of the ISA Ground Roll cell on that same row.`,
        {
          role: "table-row-centre-line",
          performanceKind,
          weightKg,
          altitudeFt,
          output: "ground-roll",
          point1: "minus-25-cell-centre",
          point2: "isa-cell-centre",
        }
      ),
      lineStep(
        `row-${altitudeFt}-50ft`,
        `${altitudeLabel} rows`,
        `${altitudeLabel} At 50 ft AGL row centre line`,
        `Click the centre of the -25 °C At 50 ft AGL cell at ${altitudeLabel}, then the centre of the ISA cell on that same row.`,
        {
          role: "table-row-centre-line",
          performanceKind,
          weightKg,
          altitudeFt,
          output: "50ft",
          point1: "minus-25-cell-centre",
          point2: "isa-cell-centre",
        }
      ),
    ];
  });

  return [
    ...temperatureLines,
    ...rowLines,
    {
      id: "published-assumptions",
      group: "Published source text",
      title: "Weight and operating assumptions",
      instruction:
        "Drag one rectangle around the complete published block containing Weight, flaps, speeds, throttle and baseline runway condition.",
      kind: "rect",
      metadata: {
        role: "published-assumptions",
        performanceKind,
        weightKg,
      },
    },
    {
      id: "published-corrections",
      group: "Published source text",
      title: "Published corrections block",
      instruction:
        "Drag one rectangle around the complete Corrections block containing headwind, tailwind, paved-runway and runway-slope rules.",
      kind: "rect",
      metadata: {
        role: "published-corrections",
        performanceKind,
        weightKg,
      },
    },
  ];
}

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

function makeSource(
  performanceKind: "takeoff" | "landing",
  weightKg: 1180 | 1080 | 930,
  printedPage: string,
  pages: Record<P2006TRegistration, number>
): PerformanceSourceDefinition {
  const label = performanceKind === "takeoff" ? "Takeoff" : "Landing";

  return {
    id: `${performanceKind}-${weightKg}`,
    performanceKind,
    weightKg,
    title: `${label} ${weightKg} kg table calibration`,
    shortTitle: `${performanceKind === "takeoff" ? "T/O" : "LDG"} ${weightKg}`,
    description:
      "Each numeric cell is located at the intersection of its temperature-column centre line and its altitude/output row centre line. ISA is mapped for audit but is not treated as a fixed-temperature interpolation column.",
    steps: performanceSteps(performanceKind, weightKg),
    manifest: {
      "CS-EAQ": sourceAsset("CS-EAQ", pages["CS-EAQ"], printedPage),
      "CS-EBX": sourceAsset("CS-EBX", pages["CS-EBX"], printedPage),
      "D-GSEV": sourceAsset("D-GSEV", pages["D-GSEV"], printedPage),
    },
  };
}

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] = [
  makeSource("takeoff", 1180, "5-7", {
    "CS-EAQ": 171,
    "CS-EBX": 171,
    "D-GSEV": 169,
  }),
  makeSource("takeoff", 1080, "5-8", {
    "CS-EAQ": 172,
    "CS-EBX": 172,
    "D-GSEV": 170,
  }),
  makeSource("takeoff", 930, "5-9", {
    "CS-EAQ": 173,
    "CS-EBX": 173,
    "D-GSEV": 171,
  }),
  makeSource("landing", 1180, "5-19", {
    "CS-EAQ": 183,
    "CS-EBX": 183,
    "D-GSEV": 181,
  }),
  makeSource("landing", 1080, "5-20", {
    "CS-EAQ": 184,
    "CS-EBX": 184,
    "D-GSEV": 182,
  }),
  makeSource("landing", 930, "5-21", {
    "CS-EAQ": 185,
    "CS-EBX": 185,
    "D-GSEV": 183,
  }),
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

function axisCalibrationSteps(): GuidedStep[] {
  const axes = [
    {
      key: "empty-aircraft-moment-kgm",
      label: "empty-aircraft moment",
      values: [140, 320, 500],
      dimension: "y",
      unit: "kg·m",
    },
    {
      key: "front-seat-mass-kg",
      label: "front-seat mass",
      values: [0, 100, 200],
      dimension: "x",
      unit: "kg",
    },
    {
      key: "rear-seat-mass-kg",
      label: "rear-seat mass",
      values: [0, 100, 200],
      dimension: "x",
      unit: "kg",
    },
    {
      key: "fuel-mass-kg",
      label: "fuel mass",
      values: [0, 50, 100],
      dimension: "x",
      unit: "kg",
    },
    {
      key: "baggage-mass-kg",
      label: "baggage mass",
      values: [0, 20, 40],
      dimension: "x",
      unit: "kg",
    },
    {
      key: "flight-mass-kg",
      label: "flight mass",
      values: [900, 1100, 1200],
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
        "Three-point axis calibration",
        `${axis.label} ${value} ${axis.unit}`,
        `Click the ${value} ${axis.unit} tick on the ${axis.label} axis. Three ticks are used to validate linearity and reduce placement error.`,
        {
          role: "axis-calibration-tick",
          axis: axis.key,
          value,
          dimension: axis.dimension,
          calibration: "three-point-linear-fit",
        }
      )
    )
  );
}

function massBalanceSteps(): GuidedStep[] {
  const guides = [
    ["front-seat-max-guide", "Front-seat reference diagonal", "front-seats"],
    ["rear-seat-max-guide", "Rear-seat reference diagonal", "rear-seats"],
    ["fuel-max-guide", "Fuel reference diagonal", "fuel"],
    ["baggage-max-guide", "Baggage reference diagonal", "baggage"],
  ] as const;

  return [
    ...axisCalibrationSteps(),
    ...guides.map(([id, title, panel]) =>
      lineStep(
        id,
        "Loading reference diagonals",
        title,
        `Trace one clear interior diagonal in the ${title.replace(" reference diagonal", "")} panel. Do not trace a vertical border. The program will generate the parallel loading path through the current moment.`,
        { role: "loading-reference-diagonal", panel },
        "polyline"
      )
    ),
    ...[
      ["cg-16-5-mac", "16.5% MAC line", "16.5"],
      ["cg-23-mac", "23% MAC line", "23"],
      ["cg-31-mac", "31% MAC line", "31"],
    ].map(([id, title, macPercent]) =>
      lineStep(
        id,
        "C.G. reference and limit lines",
        title,
        `Trace the complete ${title}, then press Finish line.`,
        { role: "cg-line", macPercent },
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
      "Shared geometry. Three ticks calibrate each linear axis; one interior diagonal calibrates each loading panel. Horizontal transfer lines are generated from the current cumulative moment and do not need manual mapping.",
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
