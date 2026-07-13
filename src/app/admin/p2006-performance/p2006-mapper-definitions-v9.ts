import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import {
  STAGES as V8_STAGES,
  type Capture as V8Capture,
  type Point,
  type Rect,
  type StepMetadata,
} from "./p2006-mapper-definitions-v8";

export type { Point, Rect, StepMetadata };

export type CaptureKind = "point" | "points" | "line" | "rect" | "confirm";
export type Capture = Omit<V8Capture, "kind"> & { kind: CaptureKind };
export type CaptureStore = Record<string, Capture>;

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

const COLUMN_LABELS = ["-25/-13", "0/32", "25/77", "50/122", "ISA"];
const ROW_LABELS = Array.from({ length: 11 }, (_, index) => {
  const altitude = index * 1000;
  const altitudeLabel = altitude === 0 ? "S.L." : String(altitude);
  return [`${altitudeLabel} Ground Roll`, `${altitudeLabel} At 50 ft AGL`];
}).flat();

function performanceSteps(
  performanceKind: "takeoff" | "landing",
  weightKg: 1180 | 1080 | 930
): GuidedStep[] {
  return [
    {
      id: "column-seed",
      group: "Automatic grid · columns",
      title: "Mark two consecutive temperature columns",
      instruction:
        "Use -25/-13 and 0/32. Click four points in this order: top and bottom of the -25/-13 column centre line, then top and bottom of the 0/32 column centre line. The remaining 25/77, 50/122 and ISA lines will be generated using the same spacing.",
      kind: "points",
      requiredPoints: 4,
      metadata: {
        role: "regular-column-seed",
        performanceKind,
        weightKg,
        seedColumns: "-25,0",
        generatedColumns: "25,50,ISA",
        columnLabels: COLUMN_LABELS.join(","),
        pointOrder: "first-top,first-bottom,second-top,second-bottom",
      },
    },
    {
      id: "row-seed",
      group: "Automatic grid · rows",
      title: "Mark two consecutive result rows",
      instruction:
        "Use S.L. Ground Roll and S.L. At 50 ft AGL. Click four points in this order: left and right ends of the Ground Roll centre line, then left and right ends of the At 50 ft AGL centre line. The remaining 20 row lines will be generated using the same spacing.",
      kind: "points",
      requiredPoints: 4,
      metadata: {
        role: "regular-row-seed",
        performanceKind,
        weightKg,
        seedRows: "SL-ground-roll,SL-50ft",
        generatedRowCount: 20,
        rowCount: 22,
        rowLabels: ROW_LABELS.join(","),
        pointOrder: "first-left,first-right,second-left,second-right",
      },
    },
    {
      id: "grid-confirmation",
      group: "Automatic grid · confirmation",
      title: "Confirm the generated 5 × 22 grid",
      instruction:
        "Inspect the five generated temperature lines and twenty-two generated result-row lines. Confirm them together, or return to either seed task and redraw only that family.",
      kind: "confirm",
      metadata: {
        role: "generated-grid-confirmation",
        performanceKind,
        weightKg,
        columnCount: 5,
        rowCount: 22,
        cellCount: 110,
        intersectionRule: "column-centre-line × row-centre-line",
        oatInterpolationColumns: "-25,0,25,50",
        isaColumn: "audit-only",
      },
    },
    {
      id: "published-assumptions",
      group: "Published source text",
      title: "Weight and operating assumptions",
      instruction:
        "Drag one rectangle around the complete published block containing Weight, flaps, speeds, throttle and baseline runway condition.",
      kind: "rect",
      metadata: { role: "published-assumptions", performanceKind, weightKg },
    },
    {
      id: "published-corrections",
      group: "Published source text",
      title: "Published corrections",
      instruction:
        "Drag one rectangle around the complete Corrections block containing headwind, tailwind, paved-runway and runway-slope rules.",
      kind: "rect",
      metadata: { role: "published-corrections", performanceKind, weightKg },
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
      "Two consecutive column lines and two consecutive row lines seed the complete regular grid. Review the generated overlay once, then confirm all 110 cell intersections together.",
    steps: performanceSteps(performanceKind, weightKg),
    manifest: {
      "CS-EAQ": sourceAsset("CS-EAQ", pages["CS-EAQ"], printedPage),
      "CS-EBX": sourceAsset("CS-EBX", pages["CS-EBX"], printedPage),
      "D-GSEV": sourceAsset("D-GSEV", pages["D-GSEV"], printedPage),
    },
  };
}

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] = [
  makeSource("takeoff", 1180, "5-7", { "CS-EAQ": 171, "CS-EBX": 171, "D-GSEV": 169 }),
  makeSource("takeoff", 1080, "5-8", { "CS-EAQ": 172, "CS-EBX": 172, "D-GSEV": 170 }),
  makeSource("takeoff", 930, "5-9", { "CS-EAQ": 173, "CS-EBX": 173, "D-GSEV": 171 }),
  makeSource("landing", 1180, "5-19", { "CS-EAQ": 183, "CS-EBX": 183, "D-GSEV": 181 }),
  makeSource("landing", 1080, "5-20", { "CS-EAQ": 184, "CS-EBX": 184, "D-GSEV": 182 }),
  makeSource("landing", 930, "5-21", { "CS-EAQ": 185, "CS-EBX": 185, "D-GSEV": 183 }),
];

const SHARED_STAGES = V8_STAGES.filter(
  (stage) => stage.type !== "performance"
) as unknown as Stage[];

export const MASS_BALANCE_STEPS = SHARED_STAGES.find(
  (stage) => stage.id === "mass-balance-graph"
)?.steps ?? [];

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
  ...SHARED_STAGES,
];
