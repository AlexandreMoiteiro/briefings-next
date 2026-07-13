import {
  ALL_AUDIT_SOURCES as BASE_AUDIT_SOURCES,
  MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type AuditPerformanceSource,
  type Stage,
} from "./p2006-mapper-definitions-v21";

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
} from "./p2006-mapper-definitions-v21";

export { MASS_BALANCE_STEPS, PERFORMANCE_SOURCES };

function withoutStrictTextRowCheck(
  source: AuditPerformanceSource
): AuditPerformanceSource {
  if (source.auditFamily !== "stall") return source;

  // The extracted stall TXT interleaves the weight label with the 15° and 30°
  // rows. The visual mapper still requires the complete 6 × 5 grid, but we do
  // not present a misleading source-text failure for this page.
  return { ...source, grid: undefined };
}

export const ALL_AUDIT_SOURCES: AuditPerformanceSource[] =
  BASE_AUDIT_SOURCES.map(withoutStrictTextRowCheck);

const sourceById = new Map(
  ALL_AUDIT_SOURCES.map((source) => [source.id, source])
);

export const STAGES: Stage[] = BASE_STAGES.map((stage) => {
  if (stage.type !== "performance" || !stage.source) return stage;
  const source = sourceById.get(stage.source.id);
  return source
    ? {
        ...stage,
        title: source.title,
        shortTitle: source.shortTitle,
        description: source.description,
        source,
        steps: source.steps,
      }
    : stage;
});
