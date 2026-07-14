import {
  ALL_AUDIT_SOURCES as BASE_AUDIT_SOURCES,
  MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type AuditPerformanceSource,
  type GuidedStep,
  type Stage,
} from "./p2006-mapper-definitions-v24";

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
} from "./p2006-mapper-definitions-v24";

export { MASS_BALANCE_STEPS, PERFORMANCE_SOURCES };

const CRUISE_COLUMNS_BY_REGISTRATION =
  "CS-EAQ:14,CS-EBX:11,D-GSEV:11";

const CRUISE_ROWS_BY_SOURCE: Record<string, string> = {
  "cruise-0": "CS-EAQ:15,CS-EBX:15,D-GSEV:15",
  "cruise-3000": "CS-EAQ:15,CS-EBX:16,D-GSEV:16",
  "cruise-6000": "CS-EAQ:13,CS-EBX:13,D-GSEV:13",
  "cruise-9000": "CS-EAQ:10,CS-EBX:10,D-GSEV:10",
};

function roleOf(step: GuidedStep) {
  return String(step.metadata?.role ?? "");
}

function aircraftSpecificCruiseGrid(
  source: AuditPerformanceSource
): AuditPerformanceSource {
  if (source.auditFamily !== "cruise") return source;

  const rowsByRegistration = CRUISE_ROWS_BY_SOURCE[source.id];
  if (!rowsByRegistration) return source;

  const steps = source.steps.map((step): GuidedStep => {
    const role = roleOf(step);
    if (role !== "automatic-grid-detection" && role !== "table-region") {
      return step;
    }

    const automatic = role === "automatic-grid-detection";
    return {
      ...step,
      title: automatic
        ? `Aircraft-specific cruise grid`
        : step.title,
      instruction: automatic
        ? `${step.instruction} The exact grid changes with the selected aircraft: CS-EAQ uses 14 columns; CS-EBX and D-GSEV use 11. The 3,000 ft table uses 15 rows on CS-EAQ and 16 rows on CS-EBX/D-GSEV.`
        : step.instruction,
      metadata: {
        ...step.metadata,
        columnCountByRegistration: CRUISE_COLUMNS_BY_REGISTRATION,
        rowCountByRegistration: rowsByRegistration,
      },
    };
  });

  return {
    ...source,
    description:
      `${source.description} Grid dimensions are aircraft-specific: CS-EAQ includes both L/h and US gal/h fuel columns, while CS-EBX and D-GSEV publish L/h only.`,
    steps,
  };
}

export const ALL_AUDIT_SOURCES: AuditPerformanceSource[] =
  BASE_AUDIT_SOURCES.map(aircraftSpecificCruiseGrid);

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
