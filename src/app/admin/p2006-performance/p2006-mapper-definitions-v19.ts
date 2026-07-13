import {
  MASS_BALANCE_STEPS as BASE_MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES as BASE_PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type GuidedStep,
  type PerformanceSourceDefinition,
  type Stage,
} from "./p2006-mapper-definitions-v18";

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
} from "./p2006-mapper-definitions-v18";

const MAX_WEIGHT_BY_REGISTRATION =
  "CS-EAQ:1180,CS-EBX:1230,D-GSEV:1230";

function correctMaximumWeightSource(
  source: PerformanceSourceDefinition
): PerformanceSourceDefinition {
  if (source.weightKg !== 1180) return source;

  const label = source.performanceKind === "takeoff" ? "Takeoff" : "Landing";
  const shortLabel = source.performanceKind === "takeoff" ? "T/O" : "LDG";

  return {
    ...source,
    title: `${label} maximum-weight table calibration`,
    shortTitle: `${shortLabel} MAX`,
    description:
      "Maximum-weight performance page selected by registration: CS-EAQ uses 1180 kg; CS-EBX and D-GSEV use 1230 kg. The source PNG already changes with the selected aircraft.",
    steps: source.steps.map(
      (step): GuidedStep => ({
        ...step,
        metadata: {
          ...step.metadata,
          weightMode: "registration-maximum",
          weightByRegistration: MAX_WEIGHT_BY_REGISTRATION,
        },
      })
    ),
  };
}

export const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] =
  BASE_PERFORMANCE_SOURCES.map(correctMaximumWeightSource);

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
