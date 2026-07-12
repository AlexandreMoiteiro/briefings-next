import {
  MASS_BALANCE_STEPS as BASE_MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type Stage,
} from "./p2006-mapper-definitions-v11";

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
} from "./p2006-mapper-definitions-v11";

function updatePerformanceSteps(steps: GuidedStep[]): GuidedStep[] {
  return steps
    .filter((step) => step.id !== "row-seed")
    .map((step) => {
      if (step.id === "column-seed") {
        return {
          ...step,
          title: "Position the table from two temperature columns",
          instruction:
            "Use -25/-13 and 0/32. For each column, click the centre of the S.L. Ground Roll cell and then the centre of the 10,000 ft At 50 ft AGL cell. The builder averages each pair to force perfectly vertical columns. Those same top and bottom row centres define all 22 horizontal rows, so no separate horizontal clicks are required.",
          metadata: {
            ...step.metadata,
            role: "regular-column-and-row-seed",
            orientationLock: "orthogonal",
            rowGeneration: "22-even-centres-between-column-top-and-bottom",
            pointOrder:
              "minus25-first-row,minus25-last-row,zero-first-row,zero-last-row",
          },
        };
      }

      if (step.id === "grid-confirmation") {
        return {
          ...step,
          group: "Automatic grid · confirmation",
          title: "Confirm the complete orthogonal grid",
          instruction:
            "Inspect the generated grid. The five columns are perfectly vertical. The 22 rows are perfectly horizontal and evenly distributed from the S.L. Ground Roll centre to the 10,000 ft At 50 ft AGL centre. Confirm everything together or redraw the four column/end-point clicks.",
          metadata: {
            ...step.metadata,
            rowSpacing: "uniform-between-first-and-last-row-centres",
            rowExtent: "first-to-last-temperature-column-centre",
            rowCount: 22,
          },
        };
      }

      return step;
    });
}

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] =
  BASE_PERFORMANCE_SOURCES.map((source) => ({
    ...source,
    description:
      "Four clicks define two vertical temperature columns and simultaneously provide the first and last row centres. The builder distributes all 22 horizontal rows between those endpoints, preventing cumulative drift. A white rectangle is mapped separately for the calculation breakdown.",
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
