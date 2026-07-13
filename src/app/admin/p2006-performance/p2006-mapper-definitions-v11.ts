import {
  MASS_BALANCE_STEPS as BASE_MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type Stage,
} from "./p2006-mapper-definitions-v10";

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
} from "./p2006-mapper-definitions-v10";

function updatePerformanceSteps(steps: GuidedStep[]): GuidedStep[] {
  const updated = steps.map((step) => {
    if (step.id === "row-seed") {
      return {
        ...step,
        title: "Position the repeating row pattern",
        instruction:
          "Click three row centres in this order: 1) S.L. Ground Roll, 2) S.L. At 50 ft AGL, 3) 1000 ft Ground Roll. The builder measures the within-pair spacing and the between-altitudes spacing separately, then alternates them through the remaining rows. The X position of every click is ignored.",
        requiredPoints: 3,
        metadata: {
          ...step.metadata,
          pointOrder: "sl-ground-roll,sl-50ft,1000-ground-roll",
          positionMethod: "three-y-seeds-two-alternating-spacings",
          spacingPattern: "within-pair,between-altitudes",
          orientationLock: "horizontal",
          sharedExtentMethod: "first-to-last-generated-column-centre",
        },
      };
    }

    if (step.id === "grid-confirmation") {
      return {
        ...step,
        instruction:
          "Inspect the generated grid. Rows alternate the measured Ground Roll→50 ft spacing and 50 ft→next-altitude Ground Roll spacing. Every row is horizontal and runs exactly from -25/-13 to ISA. Confirm everything together or redraw only columns or rows.",
        metadata: {
          ...step.metadata,
          rowSpacing: "alternating-two-step-pattern",
          rowExtent: "first-to-last-column-centre",
        },
      };
    }

    return step;
  });

  const calculationBox: GuidedStep = {
    id: "calculation-notes-rectangle",
    group: "Generated calculation output",
    title: "White calculation breakdown rectangle",
    instruction:
      "Drag the rectangle that will be painted white on this source page. The generated PDF will use it to show the selected cells, temperature/altitude/weight interpolation, published corrections and final result.",
    kind: "rect",
    metadata: {
      role: "calculation-notes-rectangle",
      output: "performance-calculation-breakdown",
      renderFill: "white",
      perRegistration: true,
      perWeightPage: true,
    },
  };

  return [...updated, calculationBox];
}

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] =
  BASE_PERFORMANCE_SOURCES.map((source) => ({
    ...source,
    description:
      "Two temperature columns define the vertical grid. Three row centres define the alternating Ground Roll/50 ft row pattern. The complete grid is generated for confirmation, and a white rectangle is mapped for the calculation breakdown.",
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
