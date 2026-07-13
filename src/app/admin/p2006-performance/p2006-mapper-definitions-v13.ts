import {
  MASS_BALANCE_STEPS as BASE_MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type Stage,
} from "./p2006-mapper-definitions-v12";

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
} from "./p2006-mapper-definitions-v12";

const ROW_ENDPOINT_STEP: GuidedStep = {
  id: "row-seed",
  group: "Table rows",
  title: "Position the first and last result rows",
  instruction:
    "Click once in the centre of the S.L. Ground Roll row and once in the centre of the 10,000 ft At 50 ft AGL row. Only the two Y positions are used. The builder distributes 22 perfectly horizontal rows between them and limits every row from -25/-13 to ISA.",
  kind: "points",
  requiredPoints: 2,
  metadata: {
    role: "regular-row-endpoints",
    pointOrder: "sl-ground-roll,10000ft-50ft",
    orientationLock: "horizontal",
    rowCount: 22,
    positionMethod: "uniform-between-first-and-last-row-centres",
    sharedExtentMethod: "first-to-last-generated-column-centre",
  },
};

function updatePerformanceSteps(steps: GuidedStep[]): GuidedStep[] {
  const withoutRows = steps.filter((step) => step.id !== "row-seed");
  const result: GuidedStep[] = [];

  for (const step of withoutRows) {
    if (step.id === "column-seed") {
      result.push({
        ...step,
        title: "Position two consecutive temperature columns",
        instruction:
          "Use -25/-13 and 0/32. For each column, click once near its upper centre and once near its lower centre. The builder averages each pair and forces both lines perfectly vertical. These clicks define only the column X positions; row positions are captured in the next task.",
        metadata: {
          ...step.metadata,
          role: "regular-column-seed",
          orientationLock: "vertical",
          positionMethod: "mean-x-of-each-click-pair",
          rowGeneration: null,
        },
      });
      result.push(ROW_ENDPOINT_STEP);
      continue;
    }

    if (step.id === "grid-confirmation") {
      result.push({
        ...step,
        group: "Automatic grid · confirmation",
        title: "Confirm the complete table grid",
        instruction:
          "Inspect the generated grid. The five columns are perfectly vertical. The 22 rows are perfectly horizontal and evenly distributed between the two row endpoints you selected. Confirm everything together or redraw only columns or rows.",
        metadata: {
          ...step.metadata,
          columnSource: "two-consecutive-column-centres",
          rowSource: "first-and-last-row-centres",
          rowSpacing: "uniform-between-endpoints",
          rowExtent: "first-to-last-temperature-column-centre",
        },
      });
      continue;
    }

    result.push(step);
  }

  return result;
}

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] =
  BASE_PERFORMANCE_SOURCES.map((source) => ({
    ...source,
    description:
      "Columns and rows are calibrated separately. Two consecutive temperature columns define the horizontal scale; the first and last result rows define the vertical scale. The builder creates an orthogonal 5 × 22 grid and asks for one confirmation.",
    steps: updatePerformanceSteps(source.steps),
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
