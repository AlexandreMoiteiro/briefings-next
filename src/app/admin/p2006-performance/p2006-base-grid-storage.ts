import distanceOverlaysJson from "@/lib/performance/p2006t-table-overlays.json";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import {
  STAGES,
  type Capture,
  type CaptureStore,
  type Stage,
} from "./p2006-mapper-definitions";

export const P2006T_BASE_MAPPER_STORAGE_KEY =
  "briefings_p2006_guided_mapper_v6";

export type P2006TBaseGrid = {
  columnCenters: number[];
  rowCenters: number[];
  confirmed: boolean;
};

type TableOverlay = {
  columns: number[];
  rows: number[];
};

const DISTANCE_OVERLAYS = distanceOverlaysJson as Record<string, TableOverlay>;
const REGISTRATIONS: P2006TRegistration[] = ["CS-EAQ", "CS-EBX", "D-GSEV"];
const GRID_STEP_ID = "auto-grid-detection";
const LEGACY_GRID_STEP_IDS = [
  "column-seed",
  "row-seed",
  "grid-confirmation",
] as const;
const RETAINED_RECT_STEP_IDS = [
  "published-assumptions",
  "published-corrections",
  "calculation-notes-rectangle",
] as const;

function performanceStages() {
  return STAGES.filter((stage) => stage.type === "performance");
}

export function p2006TBaseMappingKey(
  stage: Stage,
  registration: P2006TRegistration,
  stepId: string
) {
  return stage.type === "performance"
    ? `${stage.id}:${registration}:${stepId}`
    : `shared:${stage.id}:${stepId}`;
}

function overlayKey(stage: Stage, registration: P2006TRegistration) {
  if (stage.type !== "performance" || !stage.source) return null;
  const weight =
    stage.source.weightKg === 930
      ? 930
      : stage.source.weightKg === 1080
        ? 1080
        : 1180;
  return `${registration}:${stage.source.performanceKind}:${weight}`;
}

function captureFromGrid(grid: P2006TBaseGrid): Capture {
  return {
    kind: "confirm",
    confirmed: grid.confirmed,
    points: [
      ...grid.columnCenters.map((x) => ({ x, y: 0.5 })),
      ...grid.rowCenters.map((y) => ({ x: 0.5, y })),
    ],
  };
}

export function p2006TBaseGridFromCapture(
  capture?: Capture
): P2006TBaseGrid | null {
  if (!capture || capture.points.length < 27) return null;
  const columnCenters = capture.points.slice(0, 5).map((point) => point.x);
  const rowCenters = capture.points.slice(5, 27).map((point) => point.y);
  if (
    columnCenters.length !== 5 ||
    rowCenters.length !== 22 ||
    columnCenters.some(
      (value, index) => index > 0 && value <= columnCenters[index - 1]
    ) ||
    rowCenters.some(
      (value, index) => index > 0 && value <= rowCenters[index - 1]
    )
  ) {
    return null;
  }
  return { columnCenters, rowCenters, confirmed: capture.confirmed };
}

function hasLegacyGridEvidence(
  captures: CaptureStore,
  stage: Stage,
  registration: P2006TRegistration
) {
  const prefix = `${stage.id}:${registration}:`;
  const explicitConfirmation = captures[`${prefix}grid-confirmation`]?.confirmed;
  const legacyKeys = Object.keys(captures).filter(
    (key) =>
      key.startsWith(prefix) &&
      (LEGACY_GRID_STEP_IDS.some((stepId) => key.endsWith(`:${stepId}`)) ||
        /:row-\d+-(ground-roll|50ft)$/.test(key))
  );
  const hasLegacyGeometry = legacyKeys.some(
    (key) => captures[key]?.points.length
  );
  const retainedRectsComplete = RETAINED_RECT_STEP_IDS.every(
    (stepId) => captures[`${prefix}${stepId}`]?.confirmed
  );
  return {
    shouldMigrate:
      Boolean(explicitConfirmation) ||
      hasLegacyGeometry ||
      retainedRectsComplete,
    confirmed: Boolean(explicitConfirmation || retainedRectsComplete),
  };
}

export function migrateLegacyP2006TPerformanceCaptures(input: CaptureStore) {
  const captures: CaptureStore = { ...input };
  let migrated = 0;

  for (const stage of performanceStages()) {
    for (const registration of REGISTRATIONS) {
      const currentKey = p2006TBaseMappingKey(
        stage,
        registration,
        GRID_STEP_ID
      );
      if (p2006TBaseGridFromCapture(captures[currentKey])) continue;

      const evidence = hasLegacyGridEvidence(captures, stage, registration);
      if (!evidence.shouldMigrate) continue;
      const key = overlayKey(stage, registration);
      const overlay = key ? DISTANCE_OVERLAYS[key] : null;
      if (!overlay || overlay.columns.length !== 5 || overlay.rows.length !== 22) {
        continue;
      }

      captures[currentKey] = captureFromGrid({
        columnCenters: [...overlay.columns],
        rowCenters: [...overlay.rows],
        confirmed: evidence.confirmed,
      });
      migrated += 1;
    }
  }

  return { captures, migrated };
}

export function readP2006TBaseCaptures() {
  if (typeof window === "undefined") return {} as CaptureStore;
  try {
    const raw = window.localStorage.getItem(P2006T_BASE_MAPPER_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CaptureStore) : {};
    const migrated = migrateLegacyP2006TPerformanceCaptures(parsed);
    if (migrated.migrated > 0) {
      window.localStorage.setItem(
        P2006T_BASE_MAPPER_STORAGE_KEY,
        JSON.stringify(migrated.captures)
      );
    }
    return migrated.captures;
  } catch {
    return {} as CaptureStore;
  }
}

export function writeP2006TBaseCaptures(captures: CaptureStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    P2006T_BASE_MAPPER_STORAGE_KEY,
    JSON.stringify(captures)
  );
}

export function getP2006TBaseGrid(
  captures: CaptureStore,
  stage: Stage,
  registration: P2006TRegistration
) {
  return p2006TBaseGridFromCapture(
    captures[p2006TBaseMappingKey(stage, registration, GRID_STEP_ID)]
  );
}

export function setP2006TBaseGrid(
  captures: CaptureStore,
  stage: Stage,
  registration: P2006TRegistration,
  grid: P2006TBaseGrid
) {
  return {
    ...captures,
    [p2006TBaseMappingKey(stage, registration, GRID_STEP_ID)]:
      captureFromGrid(grid),
  };
}
