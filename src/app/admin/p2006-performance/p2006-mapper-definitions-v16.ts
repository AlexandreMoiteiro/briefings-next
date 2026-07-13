import {
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type Stage,
} from "./p2006-mapper-definitions-v15";

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
} from "./p2006-mapper-definitions-v15";

const REQUIRED_AXIS_ENDPOINTS: Record<string, Set<number>> = {
  "empty-aircraft-moment-kgm": new Set([140, 500]),
  "front-seat-mass-kg": new Set([0, 200]),
  "rear-seat-mass-kg": new Set([0, 200]),
  "fuel-mass-kg": new Set([0, 100]),
  "baggage-mass-kg": new Set([0, 40]),
  "flight-mass-kg": new Set([900, 1200]),
};

function isRelevantMassBalanceStep(step: GuidedStep) {
  if (String(step.metadata?.role ?? "") !== "axis-calibration-tick") {
    return true;
  }

  const axis = String(step.metadata?.axis ?? "");
  const value = Number(step.metadata?.value);
  return REQUIRED_AXIS_ENDPOINTS[axis]?.has(value) ?? false;
}

function clarifyReferenceStep(step: GuidedStep): GuidedStep {
  if (step.id !== "cg-23-mac") return step;

  return {
    ...step,
    group: "C.G. reference and limit lines",
    title: "23% MAC reference line · validation",
    instruction:
      "Trace the complete 23% MAC reference line. It is retained as an independent visual check between the 16.5% and 31% envelope limits.",
    metadata: {
      ...step.metadata,
      auditRole: "intermediate-cg-linearity-check",
      operationalLimit: false,
    },
  };
}

const MASS_BALANCE_STAGE = BASE_STAGES.find(
  (stage) => stage.id === "mass-balance-graph"
);
const FORM_PAGE_1_STAGE = BASE_STAGES.find(
  (stage) => stage.id === "form-page-1-fields"
);
const FORM_PAGE_2_STAGE = BASE_STAGES.find(
  (stage) => stage.id === "form-page-2-fields"
);

if (!MASS_BALANCE_STAGE || !FORM_PAGE_1_STAGE || !FORM_PAGE_2_STAGE) {
  throw new Error("P2006T shared form stages are incomplete.");
}

export const MASS_BALANCE_STEPS: GuidedStep[] = MASS_BALANCE_STAGE.steps
  .filter(isRelevantMassBalanceStep)
  .map(clarifyReferenceStep);

const PAGE_1_STEPS: GuidedStep[] = [
  ...FORM_PAGE_1_STAGE.steps,
  ...MASS_BALANCE_STEPS,
];

const PAGE_1_STAGE: Stage = {
  id: "mass-balance-graph",
  type: "mass-balance",
  title: "Form page 1 · Loading data and Mass & Balance",
  shortTitle: "Form page 1 + M&B",
  description:
    "One physical page and one coordinate surface. Map the four writable loading fields and the complete chained Mass & Balance graph on the same page. Linear axes use only their two published endpoint ticks; the 23% MAC line is retained as an audit check.",
  page: 1,
  steps: PAGE_1_STEPS,
};

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] =
  BASE_PERFORMANCE_SOURCES;

const PERFORMANCE_STAGES = BASE_STAGES.filter(
  (stage) => stage.type === "performance"
) as Stage[];

export const STAGES: Stage[] = [
  ...PERFORMANCE_STAGES,
  PAGE_1_STAGE,
  FORM_PAGE_2_STAGE,
];
