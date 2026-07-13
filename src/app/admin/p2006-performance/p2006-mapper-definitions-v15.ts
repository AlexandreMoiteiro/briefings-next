import {
  MASS_BALANCE_STEPS as BASE_MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type Stage,
} from "./p2006-mapper-definitions-v14";

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
} from "./p2006-mapper-definitions-v14";

const AUTOMATIC_GRID_STEP: GuidedStep = {
  id: "auto-grid-detection",
  group: "Automatic table geometry",
  title: "Review the automatically detected table grid",
  instruction:
    "The builder analyses the visible grid lines in the source PNG and overlays all 110 numeric cells. Confirm when the overlay matches the table, run detection again, or use the manual outer-box fallback.",
  kind: "confirm",
  metadata: {
    role: "automatic-grid-detection",
    columns: 5,
    rows: 22,
    cellLocation: "detected-grid-cell-centre",
    visualReviewRequired: true,
  },
};

function automaticPerformanceSteps(steps: GuidedStep[]): GuidedStep[] {
  const retained = steps.filter((step) => {
    const role = String(step.metadata?.role ?? "");
    return (
      step.id !== "column-seed" &&
      step.id !== "row-seed" &&
      step.id !== "grid-confirmation" &&
      role !== "manual-row-centre"
    );
  });

  return [AUTOMATIC_GRID_STEP, ...retained];
}

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] =
  BASE_PERFORMANCE_SOURCES.map((source) => ({
    ...source,
    description:
      "The numeric 5 × 22 grid is detected automatically from the source PNG and shown as a visual overlay for confirmation. Only the published source blocks and the white calculation area remain manual.",
    steps: automaticPerformanceSteps(source.steps),
  }));

const SHARED_STAGES = BASE_STAGES.filter(
  (stage) => stage.type !== "performance"
) as Stage[];

export const MASS_BALANCE_STEPS = BASE_MASS_BALANCE_STEPS;

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
