import {
  MASS_BALANCE_STEPS as BASE_MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type Stage,
} from "./p2006-mapper-definitions-v13";

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
} from "./p2006-mapper-definitions-v13";

const ALTITUDES = [
  { value: 0, label: "S.L." },
  { value: 1000, label: "1,000 ft" },
  { value: 2000, label: "2,000 ft" },
  { value: 3000, label: "3,000 ft" },
  { value: 4000, label: "4,000 ft" },
  { value: 5000, label: "5,000 ft" },
  { value: 6000, label: "6,000 ft" },
  { value: 7000, label: "7,000 ft" },
  { value: 8000, label: "8,000 ft" },
  { value: 9000, label: "9,000 ft" },
  { value: 10000, label: "10,000 ft" },
] as const;

function manualRowSteps(): GuidedStep[] {
  return ALTITUDES.flatMap((altitude, altitudeIndex) => {
    const baseIndex = altitudeIndex * 2;

    return [
      {
        id: `row-${altitude.value}-ground-roll`,
        group: `${altitude.label} rows`,
        title: `${altitude.label} Ground Roll`,
        instruction:
          `Click once anywhere on the horizontal centre of the ${altitude.label} Ground Roll result row. ` +
          "The X position is ignored; the builder draws a perfectly horizontal line from -25/-13 to ISA and advances automatically.",
        kind: "point" as const,
        metadata: {
          role: "manual-row-centre",
          rowIndex: baseIndex,
          altitudeFt: altitude.value,
          output: "ground-roll",
          orientationLock: "horizontal",
          xIgnored: true,
        },
      },
      {
        id: `row-${altitude.value}-50ft`,
        group: `${altitude.label} rows`,
        title: `${altitude.label} At 50 ft AGL`,
        instruction:
          `Click once anywhere on the horizontal centre of the ${altitude.label} At 50 ft AGL result row. ` +
          "The X position is ignored; the builder draws a perfectly horizontal line from -25/-13 to ISA and advances automatically.",
        kind: "point" as const,
        metadata: {
          role: "manual-row-centre",
          rowIndex: baseIndex + 1,
          altitudeFt: altitude.value,
          output: "50ft",
          orientationLock: "horizontal",
          xIgnored: true,
        },
      },
    ];
  });
}

const MANUAL_ROWS = manualRowSteps();

function updatePerformanceSteps(steps: GuidedStep[]): GuidedStep[] {
  const result: GuidedStep[] = [];

  for (const step of steps) {
    if (step.id === "row-seed") continue;

    if (step.id === "column-seed") {
      result.push({
        ...step,
        title: "Position two consecutive temperature columns",
        instruction:
          "Use -25/-13 and 0/32. For each column, click once near its upper centre and once near its lower centre. The builder averages each pair, forces perfectly vertical lines and generates 25/77, 50/122 and ISA. These clicks define X positions only.",
        metadata: {
          ...step.metadata,
          role: "regular-column-seed",
          orientationLock: "vertical",
          positionMethod: "mean-x-of-each-click-pair",
          rowGeneration: null,
        },
      });
      result.push(...MANUAL_ROWS);
      continue;
    }

    if (step.id === "grid-confirmation") {
      result.push({
        ...step,
        group: "Manual rows · confirmation",
        title: "Confirm the complete table grid",
        instruction:
          "Inspect the five vertical columns and all 22 manually positioned horizontal rows. Confirm the grid together, redo the columns, or return to any individual row from the task selector.",
        metadata: {
          ...step.metadata,
          columnSource: "two-consecutive-column-centres",
          rowSource: "22-individual-row-centres",
          rowSpacing: "manual",
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
      "The five temperature columns are generated from two consecutive columns. Every Ground Roll and 50 ft row is then positioned individually with one click, eliminating cumulative vertical drift.",
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
