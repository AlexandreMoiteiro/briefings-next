import {
  ALL_AUDIT_SOURCES as BASE_AUDIT_SOURCES,
  MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type AuditPerformanceSource,
  type GuidedStep,
  type Stage,
} from "./p2006-mapper-definitions-v22";

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
  AuditFamily,
  AuditPerformanceSource,
} from "./p2006-mapper-definitions-v22";

export { MASS_BALANCE_STEPS, PERFORMANCE_SOURCES };

const REMOVED_SOURCE_IDS = new Set([
  "cruise-12000",
  "balked-landing-gradient",
]);

function roleOf(step: GuidedStep) {
  return String(step.metadata?.role ?? "");
}

function automaticGridFirst(
  source: AuditPerformanceSource
): AuditPerformanceSource {
  if (!source.grid) return source;

  // The detector now searches the AFM page directly. A manually drawn table
  // region is no longer a required stage; Manual outer box remains available
  // in the mapper when a page needs human correction.
  const steps = source.steps.filter((step) => roleOf(step) !== "table-region");
  const autoIndex = steps.findIndex(
    (step) => roleOf(step) === "automatic-grid-detection"
  );

  if (autoIndex > 0) {
    const [automatic] = steps.splice(autoIndex, 1);
    steps.unshift(automatic);
  }

  return {
    ...source,
    grid: { ...source.grid, regionRequired: false },
    steps,
  };
}

export const ALL_AUDIT_SOURCES: AuditPerformanceSource[] =
  BASE_AUDIT_SOURCES.filter(
    (source) => !REMOVED_SOURCE_IDS.has(source.id)
  ).map(automaticGridFirst);

const sourceById = new Map(
  ALL_AUDIT_SOURCES.map((source) => [source.id, source])
);

export const STAGES: Stage[] = BASE_STAGES.flatMap((stage) => {
  if (stage.type !== "performance" || !stage.source) return [stage];
  const source = sourceById.get(stage.source.id);
  if (!source) return [];

  return [
    {
      ...stage,
      title: source.title,
      shortTitle: source.shortTitle,
      description: source.description,
      source,
      steps: source.steps,
    },
  ];
});
