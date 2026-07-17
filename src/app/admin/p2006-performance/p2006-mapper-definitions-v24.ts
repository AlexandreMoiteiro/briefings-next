import {
  ALL_AUDIT_SOURCES as BASE_AUDIT_SOURCES,
  MASS_BALANCE_STEPS,
  PERFORMANCE_SOURCES,
  STAGES as BASE_STAGES,
  type AuditPerformanceSource,
  type GuidedStep,
  type Stage,
} from "./p2006-mapper-definitions-v23";

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
} from "./p2006-mapper-definitions-v23";

export { MASS_BALANCE_STEPS, PERFORMANCE_SOURCES };

const SHARED_CRUISE_PAGE = new Map([
  [
    "cruise-3000",
    {
      altitudeFt: 3000,
      position: "upper",
      regionId: "table-region-3000",
      gridId: "auto-grid-detection-3000",
      regionTitle: "3,000 ft table area",
      regionInstruction:
        "Drag a close rectangle around the complete UPPER cruise table only. Exclude the lower 6,000 ft table, the page title and the footer.",
    },
  ],
  [
    "cruise-6000",
    {
      altitudeFt: 6000,
      position: "lower",
      regionId: "table-region-6000",
      gridId: "auto-grid-detection-6000",
      regionTitle: "6,000 ft table area",
      regionInstruction:
        "Drag a close rectangle around the complete LOWER cruise table only. Exclude the upper 3,000 ft table, the page title and the footer.",
    },
  ],
] as const);

function roleOf(step: GuidedStep) {
  return String(step.metadata?.role ?? "");
}

function separateSharedCruisePage(
  source: AuditPerformanceSource
): AuditPerformanceSource {
  const shared = SHARED_CRUISE_PAGE.get(source.id as "cruise-3000" | "cruise-6000");
  if (!shared || !source.grid) return source;

  const automatic = source.steps.find(
    (step) => roleOf(step) === "automatic-grid-detection"
  );
  if (!automatic) return source;

  const regionStep: GuidedStep = {
    id: shared.regionId,
    group: "Shared-page table boundary",
    title: shared.regionTitle,
    instruction: shared.regionInstruction,
    kind: "rect",
    metadata: {
      role: "table-region",
      tableFamily: "cruise",
      columnCount: source.grid.columns,
      rowCount: source.grid.rows,
      sharedSourcePage: true,
      chartAltitudeFt: shared.altitudeFt,
      chartPosition: shared.position,
    },
  };

  const automaticStep: GuidedStep = {
    ...automatic,
    id: shared.gridId,
    title: `${source.grid.columns} × ${source.grid.rows} grid · ${shared.altitudeFt.toLocaleString("en-US")} ft`,
    instruction:
      "Detection now runs only inside the table rectangle selected in the previous step. Confirm the grid, run detection again, or use Manual outer box to redraw this table only.",
    metadata: {
      ...automatic.metadata,
      sharedSourcePage: true,
      chartAltitudeFt: shared.altitudeFt,
      chartPosition: shared.position,
    },
  };

  const remaining = source.steps.filter(
    (step) =>
      roleOf(step) !== "automatic-grid-detection" &&
      roleOf(step) !== "table-region"
  );

  return {
    ...source,
    description: `${source.description} This chart shares its AFM page with the ${
      shared.altitudeFt === 3000 ? "6,000" : "3,000"
    } ft chart, so its table region is selected separately before grid detection.`,
    grid: { ...source.grid, regionRequired: true },
    steps: [regionStep, automaticStep, ...remaining],
  };
}

export const ALL_AUDIT_SOURCES: AuditPerformanceSource[] =
  BASE_AUDIT_SOURCES.map(separateSharedCruisePage);

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
