import {
  MASS_BALANCE_STEPS as BASE_MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type PerformanceSourceDefinition,
  type Stage,
} from "./p2006-mapper-definitions-v9";

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
} from "./p2006-mapper-definitions-v9";

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] =
  BASE_PERFORMANCE_SOURCES.map((source) => ({
    ...source,
    description:
      "Mark two approximate consecutive columns and only the vertical position of two consecutive rows. The builder locks columns perfectly vertical, rows perfectly horizontal, limits every row from the first to the last temperature column, generates the full grid and asks for one confirmation.",
    steps: source.steps.map((step) => {
      if (step.id === "column-seed") {
        return {
          ...step,
          title: "Position two consecutive temperature columns",
          instruction:
            "Use -25/-13 and 0/32. For each column, click once near its top centre and once near its bottom centre. The clicks do not need to align: the builder averages each pair, forces both lines perfectly vertical and gives them the same top and bottom limits before generating 25/77, 50/122 and ISA.",
          metadata: {
            ...step.metadata,
            orientationLock: "vertical",
            commonLength: true,
            positionMethod: "mean-x-of-each-click-pair",
            sharedExtentMethod: "mean-top-and-bottom-y",
          },
        };
      }

      if (step.id === "row-seed") {
        return {
          ...step,
          title: "Position two consecutive result rows",
          instruction:
            "Click once in the centre of the S.L. Ground Roll row and once in the centre of the S.L. At 50 ft AGL row. Only the vertical positions are used. The builder forces perfectly horizontal lines and automatically limits their length from the -25/-13 column centre to the ISA column centre before generating the remaining twenty rows.",
          requiredPoints: 2,
          metadata: {
            ...step.metadata,
            orientationLock: "horizontal",
            commonLength: true,
            pointOrder: "sl-ground-roll,sl-50ft",
            positionMethod: "one-y-position-per-seed-row",
            sharedExtentMethod: "first-to-last-generated-column-centre",
          },
        };
      }

      if (step.id === "grid-confirmation") {
        return {
          ...step,
          instruction:
            "Inspect the locked grid: every column is perfectly vertical, every row is perfectly horizontal, and each horizontal line starts at -25/-13 and ends at ISA. Confirm everything together or redraw only the columns or rows.",
          metadata: {
            ...step.metadata,
            orthogonal: true,
            equalFamilyLengths: true,
            rowExtent: "first-to-last-column-centre",
          },
        };
      }

      return step;
    }),
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
