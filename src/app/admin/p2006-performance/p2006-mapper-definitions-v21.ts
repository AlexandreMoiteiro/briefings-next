import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import {
  MASS_BALANCE_STEPS as BASE_MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES as DISTANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type SourceAsset,
  type Stage,
  type StepMetadata,
} from "./p2006-mapper-definitions-v20";

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
} from "./p2006-mapper-definitions-v20";

export type AuditFamily =
  | "distance"
  | "stall"
  | "climb"
  | "cruise"
  | "balked-landing";

export type AuditPerformanceSource = PerformanceSourceDefinition & {
  auditFamily: AuditFamily;
  section: "Take-off" | "Climb" | "Cruise" | "Landing" | "General";
  grid?: {
    columns: number;
    rows: number;
    expectedDataRows: number;
    regionRequired?: boolean;
  };
};

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

function rectStep(
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
    kind: "rect",
    metadata,
  };
}

function gridSteps(config: {
  columns: number;
  rows: number;
  expectedDataRows: number;
  family: AuditFamily;
  regionRequired?: boolean;
  assumptionsLabel?: string;
  notesLabel?: string;
}): GuidedStep[] {
  const steps: GuidedStep[] = [];

  if (config.regionRequired) {
    steps.push(
      rectStep(
        "table-region",
        "Table boundary",
        "Numeric table area",
        "Drag one close rectangle around the complete numeric table, excluding the page title and footer. Automatic line detection will run inside this area.",
        {
          role: "table-region",
          tableFamily: config.family,
          columnCount: config.columns,
          rowCount: config.rows,
        }
      )
    );
  }

  steps.push({
    id: "auto-grid-detection",
    group: "Automatic performance grid",
    title: `${config.columns} × ${config.rows} numeric grid`,
    instruction:
      "Review the detected cell grid against the printed table. Confirm it when the centres follow every published row and column; otherwise use the manual outer-box fallback.",
    kind: "confirm",
    metadata: {
      role: "automatic-grid-detection",
      tableFamily: config.family,
      columnCount: config.columns,
      rowCount: config.rows,
      expectedDataRows: config.expectedDataRows,
    },
  });

  steps.push(
    rectStep(
      "published-assumptions",
      "Published source text",
      config.assumptionsLabel ?? "Operating assumptions",
      "Drag a rectangle around the published weight, configuration, power and speed assumptions that apply to this table.",
      { role: "published-assumptions", tableFamily: config.family }
    )
  );

  if (config.notesLabel !== "none") {
    steps.push(
      rectStep(
        "published-notes",
        "Published source text",
        config.notesLabel ?? "Notes and limitations",
        "Drag a rectangle around any notes, corrections, limitations or definitions needed to interpret the table correctly.",
        { role: "published-notes", tableFamily: config.family }
      )
    );
  }

  return steps;
}

function makeSource(config: {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  family: AuditFamily;
  section: AuditPerformanceSource["section"];
  pages: Record<P2006TRegistration, number>;
  printedPages: Record<P2006TRegistration, string> | string;
  columns?: number;
  rows?: number;
  expectedDataRows?: number;
  regionRequired?: boolean;
  assumptionsLabel?: string;
  notesLabel?: string;
  customSteps?: GuidedStep[];
}): AuditPerformanceSource {
  const printedPage = (registration: P2006TRegistration) =>
    typeof config.printedPages === "string"
      ? config.printedPages
      : config.printedPages[registration];

  return {
    id: config.id,
    performanceKind:
      config.section === "Landing" || config.family === "balked-landing"
        ? "landing"
        : "takeoff",
    weightKg: 1180,
    title: config.title,
    shortTitle: config.shortTitle,
    description: config.description,
    auditFamily: config.family,
    section: config.section,
    grid:
      config.columns && config.rows && config.expectedDataRows
        ? {
            columns: config.columns,
            rows: config.rows,
            expectedDataRows: config.expectedDataRows,
            regionRequired: config.regionRequired,
          }
        : undefined,
    manifest: {
      "CS-EAQ": sourceAsset("CS-EAQ", config.pages["CS-EAQ"], printedPage("CS-EAQ")),
      "CS-EBX": sourceAsset("CS-EBX", config.pages["CS-EBX"], printedPage("CS-EBX")),
      "D-GSEV": sourceAsset("D-GSEV", config.pages["D-GSEV"], printedPage("D-GSEV")),
    },
    steps:
      config.customSteps ??
      gridSteps({
        columns: config.columns ?? 1,
        rows: config.rows ?? 1,
        expectedDataRows: config.expectedDataRows ?? 1,
        family: config.family,
        regionRequired: config.regionRequired,
        assumptionsLabel: config.assumptionsLabel,
        notesLabel: config.notesLabel,
      }),
  };
}

function asAuditDistanceSource(
  source: PerformanceSourceDefinition
): AuditPerformanceSource {
  return {
    ...source,
    auditFamily: "distance",
    section: source.performanceKind === "takeoff" ? "Take-off" : "Landing",
    grid: { columns: 5, rows: 22, expectedDataRows: 22 },
    steps: source.steps.map((step) =>
      String(step.metadata?.role ?? "") === "automatic-grid-detection"
        ? {
            ...step,
            metadata: {
              ...step.metadata,
              tableFamily: "distance",
              columnCount: 5,
              rowCount: 22,
              expectedDataRows: 22,
            },
          }
        : step
    ),
  };
}

const STALL_SOURCE = makeSource({
  id: "stall-speed",
  title: "Stall speed table",
  shortTitle: "Stall speeds",
  description:
    "Bank angle against KIAS and KCAS for flaps 0°, T/O and FULL, with the aircraft-specific maximum-weight page kept visible.",
  family: "stall",
  section: "General",
  pages: { "CS-EAQ": 169, "CS-EBX": 169, "D-GSEV": 167 },
  printedPages: "5-5",
  columns: 6,
  rows: 5,
  expectedDataRows: 5,
  regionRequired: true,
  assumptionsLabel: "Stall-test assumptions",
  notesLabel: "Recovery note",
});

const CLIMB_SOURCES: AuditPerformanceSource[] = [
  makeSource({
    id: "takeoff-roc-vy",
    title: "Take-off rate of climb at Vy",
    shortTitle: "T/O ROC Vy",
    description: "Take-off configuration climb speed and rate of climb for three weights.",
    family: "climb",
    section: "Climb",
    pages: { "CS-EAQ": 174, "CS-EBX": 174, "D-GSEV": 172 },
    printedPages: { "CS-EAQ": "5-10", "CS-EBX": "SW5-10", "D-GSEV": "S5-10" },
    columns: 6,
    rows: 24,
    expectedDataRows: 24,
    regionRequired: true,
    assumptionsLabel: "Take-off climb configuration",
    notesLabel: "none",
  }),
  makeSource({
    id: "takeoff-roc-vx",
    title: "Take-off rate of climb at Vx",
    shortTitle: "T/O ROC Vx",
    description: "Take-off configuration Vx and rate of climb for three weights.",
    family: "climb",
    section: "Climb",
    pages: { "CS-EAQ": 175, "CS-EBX": 175, "D-GSEV": 173 },
    printedPages: { "CS-EAQ": "5-11", "CS-EBX": "SW5-11", "D-GSEV": "S5-11" },
    columns: 6,
    rows: 24,
    expectedDataRows: 24,
    regionRequired: true,
    assumptionsLabel: "Take-off climb configuration",
    notesLabel: "none",
  }),
  makeSource({
    id: "enroute-roc-vy",
    title: "Enroute rate of climb at Vy",
    shortTitle: "Enroute ROC Vy",
    description: "Clean-configuration Vy and rate of climb for three weights.",
    family: "climb",
    section: "Climb",
    pages: { "CS-EAQ": 176, "CS-EBX": 176, "D-GSEV": 174 },
    printedPages: { "CS-EAQ": "5-12", "CS-EBX": "SW5-12", "D-GSEV": "S5-12" },
    columns: 6,
    rows: 24,
    expectedDataRows: 24,
    regionRequired: true,
    assumptionsLabel: "Enroute climb configuration",
    notesLabel: "none",
  }),
  makeSource({
    id: "enroute-roc-vx",
    title: "Enroute rate of climb at Vx",
    shortTitle: "Enroute ROC Vx",
    description: "Clean-configuration Vx and rate of climb for three weights.",
    family: "climb",
    section: "Climb",
    pages: { "CS-EAQ": 177, "CS-EBX": 177, "D-GSEV": 175 },
    printedPages: { "CS-EAQ": "5-13", "CS-EBX": "SW5-13", "D-GSEV": "S5-13" },
    columns: 6,
    rows: 24,
    expectedDataRows: 24,
    regionRequired: true,
    assumptionsLabel: "Enroute climb configuration",
    notesLabel: "none",
  }),
  makeSource({
    id: "oei-roc-vyse",
    title: "One-engine rate of climb at VySE",
    shortTitle: "OEI ROC VySE",
    description: "Single-engine climb performance with the inoperative propeller feathered.",
    family: "climb",
    section: "Climb",
    pages: { "CS-EAQ": 178, "CS-EBX": 178, "D-GSEV": 176 },
    printedPages: { "CS-EAQ": "5-14", "CS-EBX": "SW5-14", "D-GSEV": "S5-14" },
    columns: 6,
    rows: 24,
    expectedDataRows: 24,
    regionRequired: true,
    assumptionsLabel: "One-engine climb configuration",
    notesLabel: "none",
  }),
  makeSource({
    id: "oei-roc-vxse",
    title: "One-engine rate of climb at VxSE",
    shortTitle: "OEI ROC VxSE",
    description: "Single-engine obstacle-climb performance with the inoperative propeller feathered.",
    family: "climb",
    section: "Climb",
    pages: { "CS-EAQ": 179, "CS-EBX": 179, "D-GSEV": 177 },
    printedPages: { "CS-EAQ": "5-15", "CS-EBX": "SW5-15", "D-GSEV": "S5-15" },
    columns: 6,
    rows: 24,
    expectedDataRows: 24,
    regionRequired: true,
    assumptionsLabel: "One-engine climb configuration",
    notesLabel: "none",
  }),
];

const CRUISE_SOURCES: AuditPerformanceSource[] = [
  { id: "cruise-0", shortTitle: "Cruise 0 ft", title: "Cruise performance · 0 ft", page: 180, dgPage: 178, printed: "5-16", rows: 15 },
  { id: "cruise-3000", shortTitle: "Cruise 3,000", title: "Cruise performance · 3,000 ft", page: 181, dgPage: 179, printed: "5-17", rows: 15 },
  { id: "cruise-6000", shortTitle: "Cruise 6,000", title: "Cruise performance · 6,000 ft", page: 181, dgPage: 179, printed: "5-17", rows: 13 },
  { id: "cruise-9000", shortTitle: "Cruise 9,000", title: "Cruise performance · 9,000 ft", page: 182, dgPage: 180, printed: "5-18", rows: 10 },
  { id: "cruise-12000", shortTitle: "Cruise 12,000", title: "Cruise performance · 12,000 ft", page: 182, dgPage: 180, printed: "5-18", rows: 7 },
].map((definition) =>
  makeSource({
    id: definition.id,
    title: definition.title,
    shortTitle: definition.shortTitle,
    description:
      "RPM and manifold pressure against power, true airspeed and per-engine fuel consumption for ISA−30, ISA and ISA+30.",
    family: "cruise",
    section: "Cruise",
    pages: {
      "CS-EAQ": definition.page,
      "CS-EBX": definition.page,
      "D-GSEV": definition.dgPage,
    },
    printedPages: definition.printed,
    columns: 14,
    rows: definition.rows,
    expectedDataRows: definition.rows,
    regionRequired: true,
    assumptionsLabel: "Cruise weight and pressure altitude",
    notesLabel: "Fuel-consumption definitions",
  })
);

const BALKED_LANDING_SOURCE = makeSource({
  id: "balked-landing-gradient",
  title: "Balked landing climb gradient",
  shortTitle: "Balked landing",
  description:
    "Published go-around configuration, reference speed and climb gradient at sea level ISA.",
  family: "balked-landing",
  section: "Landing",
  pages: { "CS-EAQ": 186, "CS-EBX": 186, "D-GSEV": 184 },
  printedPages: "5-22",
  customSteps: [
    rectStep(
      "published-assumptions",
      "Published source text",
      "Balked-landing configuration",
      "Drag a rectangle around the complete flight-conditions block: weight, throttles, flaps, landing gear and speed.",
      { role: "published-assumptions", tableFamily: "balked-landing" }
    ),
    rectStep(
      "published-result",
      "Published source text",
      "Published climb gradient",
      "Drag a tight rectangle around the climb-gradient result, including both percent and degrees.",
      { role: "published-result", tableFamily: "balked-landing" }
    ),
  ],
});

const BASE_PERFORMANCE_STAGES = BASE_STAGES.filter(
  (stage) => stage.type === "performance"
) as Stage[];
const SHARED_STAGES = BASE_STAGES.filter(
  (stage) => stage.type !== "performance"
) as Stage[];

const DISTANCE_AUDIT_SOURCES = DISTANCE_SOURCES.map(asAuditDistanceSource);
const DISTANCE_STAGE_BY_ID = new Map(
  BASE_PERFORMANCE_STAGES.map((stage) => [stage.source?.id, stage])
);

function stageFor(source: AuditPerformanceSource): Stage {
  const existing = DISTANCE_STAGE_BY_ID.get(source.id);
  return {
    ...(existing ?? {}),
    id: existing?.id ?? `performance-${source.id}`,
    type: "performance",
    title: source.title,
    shortTitle: source.shortTitle,
    description: source.description,
    source,
    steps: source.steps,
  } as Stage;
}

const TAKEOFF_DISTANCE = DISTANCE_AUDIT_SOURCES.filter(
  (source) => source.performanceKind === "takeoff"
);
const LANDING_DISTANCE = DISTANCE_AUDIT_SOURCES.filter(
  (source) => source.performanceKind === "landing"
);

/** Distance sources remain separate because the calculation preview currently
 * supports this family only. The mapper catalogue below contains every table. */
export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] = DISTANCE_SOURCES;
export const MASS_BALANCE_STEPS = BASE_MASS_BALANCE_STEPS;
export const ALL_AUDIT_SOURCES: AuditPerformanceSource[] = [
  STALL_SOURCE,
  ...TAKEOFF_DISTANCE,
  ...CLIMB_SOURCES,
  ...CRUISE_SOURCES,
  ...LANDING_DISTANCE,
  BALKED_LANDING_SOURCE,
];

export const STAGES: Stage[] = [
  ...ALL_AUDIT_SOURCES.map(stageFor),
  ...SHARED_STAGES,
];
