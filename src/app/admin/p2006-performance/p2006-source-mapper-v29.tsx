"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import { P2006T_FORM_PAGE_1_WEBP_BASE64 } from "@/lib/pdf/p2006t-form-page-1";
import { P2006T_FORM_PAGE_2_WEBP_BASE64 } from "@/lib/pdf/p2006t-form-page-2";
import {
  STAGES,
  type AuditPerformanceSource,
  type Capture,
  type CaptureStore,
  type GuidedStep,
  type Point,
  type Rect,
  type Stage,
} from "./p2006-mapper-definitions";
import {
  detectPerformanceGrid,
  gridFromManualBox,
  type DetectedPerformanceGrid,
} from "./p2006-grid-detector-v2";

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const GRID_META_KEY = "briefings_p2006_auto_grid_meta_v29";
const GRID_BOUNDARY_KEY = "briefings_p2006_grid_boundaries_v29";
const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MIN_COLUMN_GAP = 0.0025;

type MapperTab = "todo" | "completed" | "forms";
type DragState = { startX: number; startY: number; x: number; y: number } | null;
type GridMeta = {
  confidence: number;
  method: DetectedPerformanceGrid["method"];
  diagnostics: DetectedPerformanceGrid["diagnostics"];
  manuallyAdjustedColumns?: boolean;
};
type GridMetaStore = Record<string, GridMeta>;
type GridBoundaryRecord = {
  columnBoundaries: number[];
  detectedColumnBoundaries: number[];
  adjusted: boolean;
};
type GridBoundaryStore = Record<string, GridBoundaryRecord>;
type SourceCheck = {
  state: "idle" | "loading" | "ready" | "error";
  parsedRows: number;
  expectedRows: number;
  message: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRect(rect: Rect): Rect {
  const x = clamp(rect.x);
  const y = clamp(rect.y);
  return {
    x,
    y,
    width: Math.max(0.002, Math.min(rect.width, 1 - x)),
    height: Math.max(0.002, Math.min(rect.height, 1 - y)),
  };
}

function rectFromDrag(drag: NonNullable<DragState>): Rect {
  return normalizeRect({
    x: Math.min(drag.startX, drag.x),
    y: Math.min(drag.startY, drag.y),
    width: Math.abs(drag.x - drag.startX),
    height: Math.abs(drag.y - drag.startY),
  });
}

function pointerPosition(event: ReactPointerEvent<HTMLDivElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height),
  };
}

function mappingKey(
  stage: Stage,
  registration: P2006TRegistration,
  step: GuidedStep
) {
  return stage.type === "performance"
    ? `${stage.id}:${registration}:${step.id}`
    : `shared:${stage.id}:${step.id}`;
}

function roleOf(step: GuidedStep) {
  return String(step.metadata?.role ?? "");
}

function isAutoGridStep(step: GuidedStep) {
  return roleOf(step) === "automatic-grid-detection";
}

function gridDimensions(step: GuidedStep) {
  return {
    columns: Math.max(1, Number(step.metadata?.columnCount ?? 5)),
    rows: Math.max(1, Number(step.metadata?.rowCount ?? 22)),
  };
}

function captureIsComplete(step: GuidedStep, capture?: Capture) {
  if (!capture) return false;
  if (step.kind === "confirm") return capture.confirmed;
  if (step.kind === "rect") return Boolean(capture.rect && capture.confirmed);
  if (step.kind === "point") return capture.points.length === 1 && capture.confirmed;
  if (step.kind === "points") {
    return capture.points.length >= (step.requiredPoints ?? 1) && capture.confirmed;
  }
  return capture.points.length >= (step.minPoints ?? 2) && capture.confirmed;
}

function stageIsComplete(
  stage: Stage,
  registration: P2006TRegistration,
  captures: CaptureStore
) {
  return stage.steps.every((step) =>
    captureIsComplete(step, captures[mappingKey(stage, registration, step)])
  );
}

function captureFromGrid(grid: DetectedPerformanceGrid, confirmed: boolean): Capture {
  return {
    kind: "confirm",
    confirmed,
    points: [
      ...grid.columnCenters.map((x) => ({ x, y: 0.5 })),
      ...grid.rowCenters.map((y) => ({ x: 0.5, y })),
    ],
  };
}

function gridFromCapture(
  capture: Capture | undefined,
  columns: number,
  rows: number
): DetectedPerformanceGrid | null {
  if (!capture || capture.points.length < columns + rows) return null;
  const columnCenters = capture.points.slice(0, columns).map((point) => point.x);
  const rowCenters = capture.points
    .slice(columns, columns + rows)
    .map((point) => point.y);
  if (columnCenters.length !== columns || rowCenters.length !== rows) return null;
  if (
    columnCenters.some((value, index) => index > 0 && value <= columnCenters[index - 1]) ||
    rowCenters.some((value, index) => index > 0 && value <= rowCenters[index - 1])
  ) {
    return null;
  }
  return {
    columnCenters,
    rowCenters,
    confidence: capture.confirmed ? 1 : 0.5,
    method: "layout-fallback",
    diagnostics: {
      verticalCandidates: 0,
      horizontalCandidates: 0,
      matchedColumns: columns,
      matchedRows: rows,
    },
  };
}

function centresToBoundaries(centres: number[]) {
  if (centres.length === 1) {
    return [clamp(centres[0] - 0.02), clamp(centres[0] + 0.02)];
  }
  const boundaries = [centres[0] - (centres[1] - centres[0]) / 2];
  for (let index = 0; index < centres.length - 1; index += 1) {
    boundaries.push((centres[index] + centres[index + 1]) / 2);
  }
  boundaries.push(
    centres[centres.length - 1] +
      (centres[centres.length - 1] - centres[centres.length - 2]) / 2
  );
  return boundaries.map((value) => clamp(value));
}

function boundariesToCentres(boundaries: number[]) {
  return boundaries
    .slice(0, -1)
    .map((boundary, index) => (boundary + boundaries[index + 1]) / 2);
}

function normalizeColumnBoundaries(boundaries: number[]) {
  const result = [...boundaries].map((value) => clamp(value));
  for (let index = 1; index < result.length; index += 1) {
    result[index] = Math.max(result[index], result[index - 1] + MIN_COLUMN_GAP);
  }
  if (result[result.length - 1] > 1) {
    const overflow = result[result.length - 1] - 1;
    for (let index = 0; index < result.length; index += 1) {
      result[index] = clamp(result[index] - overflow);
    }
  }
  return result;
}

function gridWithColumnBoundaries(
  grid: DetectedPerformanceGrid,
  columnBoundaries: number[]
): DetectedPerformanceGrid {
  return {
    ...grid,
    columnCenters: boundariesToCentres(columnBoundaries),
  };
}

function captureWithColumnBoundaries(
  capture: Capture,
  columns: number,
  rows: number,
  columnBoundaries: number[],
  confirmed: boolean
): Capture {
  const grid = gridFromCapture(capture, columns, rows);
  if (!grid) return capture;
  return captureFromGrid(
    gridWithColumnBoundaries(grid, columnBoundaries),
    confirmed
  );
}

function countPublishedRows(text: string, source: AuditPerformanceSource) {
  const lines = text.replace(/\u00a0/g, " ").split(/\r?\n/);
  if (source.auditFamily === "distance") {
    return lines.filter((line) => /Ground Roll|At 50 ft AGL/.test(line)).length;
  }
  if (source.auditFamily === "climb") {
    return lines.filter((line) => {
      const clean = line.trim();
      if (!/^(?:S\.L\.|\d{3,5})\s+/.test(clean)) return false;
      const values = clean.match(/-?\d+(?:\.\d+)?/g) ?? [];
      return values.length >= 6;
    }).length;
  }
  if (source.auditFamily === "stall") {
    return lines.filter((line) => {
      const clean = line.trim();
      if (!/^(?:0|15|30|45|60)\s+/.test(clean)) return false;
      return (clean.match(/-?\d+(?:\.\d+)?/g) ?? []).length >= 7;
    }).length;
  }
  if (source.auditFamily === "cruise") {
    return lines.filter((line) => {
      const clean = line.trim();
      if (!/^(?:1900|2100|2250|2388)\s+/.test(clean)) return false;
      return (clean.match(/-?\d+(?:\.\d+)?/g) ?? []).length >= 14;
    }).length;
  }
  return 0;
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function FormBackground({ page, onReady }: { page: 1 | 2; onReady: () => void }) {
  const source =
    page === 1 ? P2006T_FORM_PAGE_1_WEBP_BASE64 : P2006T_FORM_PAGE_2_WEBP_BASE64;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:image/webp;base64,${source}`}
      alt={`P2006T form page ${page}`}
      draggable={false}
      onLoad={onReady}
      className="block h-auto w-full"
    />
  );
}

function GridOverlay({
  grid,
  confirmed,
  columnBoundaries,
  editingColumns,
}: {
  grid: DetectedPerformanceGrid;
  confirmed: boolean;
  columnBoundaries: number[];
  editingColumns: boolean;
}) {
  const x = columnBoundaries;
  const y = centresToBoundaries(grid.rowCenters);
  const stroke = confirmed ? "rgb(5 150 105)" : "rgb(217 119 6)";
  const fill = confirmed ? "rgba(5,150,105,0.05)" : "rgba(245,158,11,0.07)";
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {grid.rowCenters.flatMap((_, row) =>
        grid.columnCenters.map((__, column) => (
          <rect
            key={`${row}-${column}`}
            x={x[column] * 1000}
            y={y[row] * 1000}
            width={(x[column + 1] - x[column]) * 1000}
            height={(y[row + 1] - y[row]) * 1000}
            fill={fill}
            stroke={stroke}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))
      )}
      {editingColumns
        ? x.map((boundary, index) => (
            <line
              key={`column-guide-${index}`}
              x1={boundary * 1000}
              x2={boundary * 1000}
              y1={y[0] * 1000}
              y2={y[y.length - 1] * 1000}
              stroke="rgb(2 132 199)"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          ))
        : null}
    </svg>
  );
}

function ColumnBoundaryHandles({
  boundaries,
  rowCenters,
  onMove,
}: {
  boundaries: number[];
  rowCenters: number[];
  onMove: (index: number, value: number) => void;
}) {
  const y = centresToBoundaries(rowCenters);
  const top = y[0];
  const height = Math.max(0.02, y[y.length - 1] - top);

  const pointerValue = (
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number
  ) => {
    const parent = event.currentTarget.parentElement;
    if (!parent) return;
    const bounds = parent.getBoundingClientRect();
    onMove(index, (event.clientX - bounds.left) / Math.max(1, bounds.width));
  };

  const keyboardMove = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const increment = event.shiftKey ? 0.005 : 0.001;
    onMove(index, boundaries[index] + direction * increment);
  };

  return (
    <div className="absolute inset-0 z-20">
      {boundaries.map((boundary, index) => (
        <button
          key={`column-boundary-${index}`}
          type="button"
          aria-label={`Adjust vertical line ${index + 1} of ${boundaries.length}`}
          title={`Vertical line ${index + 1}. Drag, or use the arrow keys.`}
          className="absolute -translate-x-1/2 cursor-col-resize touch-none focus:outline-none focus:ring-2 focus:ring-sky-500"
          style={{
            left: `${boundary * 100}%`,
            top: `${top * 100}%`,
            width: "22px",
            height: `${height * 100}%`,
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.stopPropagation();
            pointerValue(event, index);
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onKeyDown={(event) => keyboardMove(event, index)}
        >
          <span className="absolute left-1/2 top-1/2 h-12 w-3 -translate-x-1/2 -translate-y-1/2 rounded-md border border-sky-700 bg-white/95 shadow-md">
            <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-sky-700" />
          </span>
        </button>
      ))}
    </div>
  );
}

function GenericOverlay({ capture, current }: { capture: Capture; current: boolean }) {
  if (capture.kind === "confirm") return null;
  const stroke = current ? "rgb(217 119 6)" : "rgb(5 150 105)";
  if (capture.kind === "rect" && capture.rect) {
    return (
      <div
        className="pointer-events-none absolute border-2"
        style={{
          left: `${capture.rect.x * 100}%`,
          top: `${capture.rect.y * 100}%`,
          width: `${capture.rect.width * 100}%`,
          height: `${capture.rect.height * 100}%`,
          borderColor: stroke,
          background: current ? "rgba(245,158,11,0.08)" : "rgba(5,150,105,0.07)",
        }}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {capture.points.length > 1 && capture.kind !== "point" ? (
        <polyline
          points={capture.points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {capture.points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={point.x * 1000}
          cy={point.y * 1000}
          r="6"
          fill={stroke}
        />
      ))}
    </svg>
  );
}

export function P2006TSourceMapper() {
  const imageRef = useRef<HTMLImageElement>(null);
  const [registration, setRegistration] = useState<P2006TRegistration>("CS-EAQ");
  const [stageIndex, setStageIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [tab, setTab] = useState<MapperTab>("todo");
  const [captures, setCaptures] = useState<CaptureStore>({});
  const [gridMeta, setGridMeta] = useState<GridMetaStore>({});
  const [gridBoundaries, setGridBoundaries] = useState<GridBoundaryStore>({});
  const [captureMode, setCaptureMode] = useState(false);
  const [manualGridBoxMode, setManualGridBoxMode] = useState(false);
  const [columnEditMode, setColumnEditMode] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);
  const [imageReady, setImageReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [showCompletedGeometry, setShowCompletedGeometry] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [saveStatus, setSaveStatus] = useState("");
  const [sourceCheck, setSourceCheck] = useState<SourceCheck>({
    state: "idle",
    parsedRows: 0,
    expectedRows: 0,
    message: "",
  });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setCaptures(JSON.parse(saved) as CaptureStore);
      const savedMeta = window.localStorage.getItem(GRID_META_KEY);
      if (savedMeta) setGridMeta(JSON.parse(savedMeta) as GridMetaStore);
      const savedBoundaries = window.localStorage.getItem(GRID_BOUNDARY_KEY);
      if (savedBoundaries) {
        setGridBoundaries(JSON.parse(savedBoundaries) as GridBoundaryStore);
      }
    } catch {
      window.localStorage.removeItem(GRID_META_KEY);
      window.localStorage.removeItem(GRID_BOUNDARY_KEY);
    }
  }, []);

  const completedPerformance = useMemo(
    () =>
      STAGES.filter(
        (stage) =>
          stage.type === "performance" && stageIsComplete(stage, registration, captures)
      ).length,
    [captures, registration]
  );
  const totalPerformance = STAGES.filter((stage) => stage.type === "performance").length;

  const visibleStageIndexes = useMemo(
    () =>
      STAGES.map((stage, index) => ({ stage, index })).filter(({ stage }) => {
        const complete = stageIsComplete(stage, registration, captures);
        if (tab === "forms") return stage.type !== "performance";
        if (tab === "completed") return stage.type === "performance" && complete;
        return stage.type === "performance" && !complete;
      }),
    [captures, registration, tab]
  );

  useEffect(() => {
    if (visibleStageIndexes.some((entry) => entry.index === stageIndex)) return;
    if (visibleStageIndexes.length) {
      setStageIndex(visibleStageIndexes[0].index);
      setStepIndex(0);
      setImageReady(false);
      return;
    }
    if (tab === "todo" && completedPerformance === totalPerformance && totalPerformance > 0) {
      setTab("completed");
    }
  }, [completedPerformance, stageIndex, tab, totalPerformance, visibleStageIndexes]);

  const stage = STAGES[stageIndex];
  const step = stage.steps[Math.min(stepIndex, stage.steps.length - 1)];
  const source = stage.type === "performance"
    ? (stage.source as AuditPerformanceSource)
    : null;
  const sourceAsset = source?.manifest[registration] ?? null;
  const currentKey = mappingKey(stage, registration, step);
  const currentCapture = captures[currentKey];
  const dimensions = gridDimensions(step);
  const capturedGrid = isAutoGridStep(step)
    ? gridFromCapture(currentCapture, dimensions.columns, dimensions.rows)
    : null;
  const currentBoundaryRecord = gridBoundaries[currentKey];
  const currentColumnBoundaries = useMemo(() => {
    if (
      currentBoundaryRecord?.columnBoundaries.length === dimensions.columns + 1
    ) {
      return normalizeColumnBoundaries(currentBoundaryRecord.columnBoundaries);
    }
    return capturedGrid ? centresToBoundaries(capturedGrid.columnCenters) : [];
  }, [capturedGrid, currentBoundaryRecord, dimensions.columns]);
  const currentGrid =
    capturedGrid && currentColumnBoundaries.length === dimensions.columns + 1
      ? gridWithColumnBoundaries(capturedGrid, currentColumnBoundaries)
      : capturedGrid;
  const currentGridMeta = gridMeta[currentKey];
  const draftRect = drag ? rectFromDrag(drag) : null;

  const stageCaptures = useMemo(
    () =>
      stage.steps.map((candidate) => {
        const key = mappingKey(stage, registration, candidate);
        return { step: candidate, key, capture: captures[key] };
      }),
    [captures, registration, stage]
  );
  const stageCompleteCount = stageCaptures.filter((entry) =>
    captureIsComplete(entry.step, entry.capture)
  ).length;
  const tableRegion = stageCaptures.find(
    (entry) => roleOf(entry.step) === "table-region"
  )?.capture?.rect;

  useEffect(() => {
    setColumnEditMode(false);
  }, [currentKey]);

  useEffect(() => {
    if (!sourceAsset || !source?.grid) {
      setSourceCheck({ state: "idle", parsedRows: 0, expectedRows: 0, message: "" });
      return;
    }
    const controller = new AbortController();
    setSourceCheck({
      state: "loading",
      parsedRows: 0,
      expectedRows: source.grid.expectedDataRows,
      message: "Reading the extracted source text…",
    });
    void fetch(sourceAsset.text, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Source text unavailable");
        return response.text();
      })
      .then((text) => {
        const parsedRows = countPublishedRows(text, source);
        const expectedRows = source.grid!.expectedDataRows;
        setSourceCheck({
          state: parsedRows >= expectedRows ? "ready" : "error",
          parsedRows,
          expectedRows,
          message:
            parsedRows >= expectedRows
              ? `${parsedRows} published rows recognised.`
              : `${parsedRows} of ${expectedRows} published rows recognised. Review the TXT extraction before approving this table.`,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSourceCheck({
            state: "error",
            parsedRows: 0,
            expectedRows: source.grid!.expectedDataRows,
            message: "The extracted source text could not be loaded.",
          });
        }
      });
    return () => controller.abort();
  }, [source, sourceAsset]);

  function resetInteraction() {
    setCaptureMode(false);
    setManualGridBoxMode(false);
    setDrag(null);
  }

  function goToStage(index: number) {
    setStageIndex(index);
    setStepIndex(0);
    setImageReady(false);
    setZoom(100);
    setColumnEditMode(false);
    resetInteraction();
  }

  function goNext() {
    if (stepIndex < stage.steps.length - 1) {
      setStepIndex((value) => value + 1);
    } else {
      const currentPosition = visibleStageIndexes.findIndex(
        (entry) => entry.index === stageIndex
      );
      const next = visibleStageIndexes[currentPosition + 1] ?? visibleStageIndexes[0];
      if (next && next.index !== stageIndex) goToStage(next.index);
    }
    setColumnEditMode(false);
    resetInteraction();
  }

  function goPrevious() {
    if (stepIndex > 0) {
      setStepIndex((value) => value - 1);
    } else {
      const currentPosition = visibleStageIndexes.findIndex(
        (entry) => entry.index === stageIndex
      );
      const previous = visibleStageIndexes[currentPosition - 1];
      if (previous) {
        setStageIndex(previous.index);
        setStepIndex(previous.stage.steps.length - 1);
        setImageReady(false);
      }
    }
    setColumnEditMode(false);
    resetInteraction();
  }

  function saveCapture(key: string, capture: Capture) {
    setCaptures((current) => ({ ...current, [key]: capture }));
  }

  function saveDetectedGrid(grid: DetectedPerformanceGrid) {
    const boundaries = normalizeColumnBoundaries(
      centresToBoundaries(grid.columnCenters)
    );
    saveCapture(currentKey, captureFromGrid(grid, false));
    setGridBoundaries((current) => ({
      ...current,
      [currentKey]: {
        columnBoundaries: boundaries,
        detectedColumnBoundaries: boundaries,
        adjusted: false,
      },
    }));
    setGridMeta((current) => ({
      ...current,
      [currentKey]: {
        confidence: grid.confidence,
        method: grid.method,
        diagnostics: grid.diagnostics,
        manuallyAdjustedColumns: false,
      },
    }));
  }

  function runAutoDetection() {
    const image = imageRef.current;
    if (!image || !image.complete || !image.naturalWidth) return;
    setDetecting(true);
    setColumnEditMode(false);
    window.requestAnimationFrame(() => {
      const grid = detectPerformanceGrid(image, {
        columns: dimensions.columns,
        rows: dimensions.rows,
        searchBounds: tableRegion,
      });
      saveDetectedGrid(grid);
      setDetecting(false);
    });
  }

  function beginColumnEditing() {
    if (!currentGrid || currentColumnBoundaries.length !== dimensions.columns + 1) {
      return;
    }
    setGridBoundaries((current) => {
      if (current[currentKey]) return current;
      return {
        ...current,
        [currentKey]: {
          columnBoundaries: currentColumnBoundaries,
          detectedColumnBoundaries: currentColumnBoundaries,
          adjusted: false,
        },
      };
    });
    setColumnEditMode(true);
    resetInteraction();
  }

  function moveColumnBoundary(index: number, rawValue: number) {
    if (!currentCapture || !currentGrid) return;
    const starting =
      currentColumnBoundaries.length === dimensions.columns + 1
        ? currentColumnBoundaries
        : centresToBoundaries(currentGrid.columnCenters);
    const previous = index > 0 ? starting[index - 1] + MIN_COLUMN_GAP : 0;
    const next =
      index < starting.length - 1
        ? starting[index + 1] - MIN_COLUMN_GAP
        : 1;
    const value = clamp(rawValue, previous, next);
    const updated = [...starting];
    updated[index] = value;
    const normalized = normalizeColumnBoundaries(updated);

    setGridBoundaries((current) => {
      const existing = current[currentKey];
      return {
        ...current,
        [currentKey]: {
          columnBoundaries: normalized,
          detectedColumnBoundaries:
            existing?.detectedColumnBoundaries ?? starting,
          adjusted: true,
        },
      };
    });
    saveCapture(
      currentKey,
      captureWithColumnBoundaries(
        currentCapture,
        dimensions.columns,
        dimensions.rows,
        normalized,
        false
      )
    );
    setGridMeta((current) => ({
      ...current,
      [currentKey]: {
        ...(current[currentKey] ?? {
          confidence: currentGrid.confidence,
          method: currentGrid.method,
          diagnostics: currentGrid.diagnostics,
        }),
        manuallyAdjustedColumns: true,
      },
    }));
  }

  function resetColumnBoundaries() {
    if (!currentCapture || !currentBoundaryRecord) return;
    const boundaries = normalizeColumnBoundaries(
      currentBoundaryRecord.detectedColumnBoundaries
    );
    setGridBoundaries((current) => ({
      ...current,
      [currentKey]: {
        ...currentBoundaryRecord,
        columnBoundaries: boundaries,
        adjusted: false,
      },
    }));
    saveCapture(
      currentKey,
      captureWithColumnBoundaries(
        currentCapture,
        dimensions.columns,
        dimensions.rows,
        boundaries,
        false
      )
    );
    setGridMeta((current) => ({
      ...current,
      [currentKey]: {
        ...(current[currentKey] ?? {
          confidence: currentGrid?.confidence ?? 0.5,
          method: currentGrid?.method ?? "layout-fallback",
          diagnostics:
            currentGrid?.diagnostics ?? {
              verticalCandidates: 0,
              horizontalCandidates: 0,
              matchedColumns: dimensions.columns,
              matchedRows: dimensions.rows,
            },
        }),
        manuallyAdjustedColumns: false,
      },
    }));
  }

  function confirmGrid() {
    if (!currentCapture || !currentGrid) return;
    const boundaries =
      currentColumnBoundaries.length === dimensions.columns + 1
        ? currentColumnBoundaries
        : centresToBoundaries(currentGrid.columnCenters);
    saveCapture(
      currentKey,
      captureWithColumnBoundaries(
        currentCapture,
        dimensions.columns,
        dimensions.rows,
        boundaries,
        true
      )
    );
    setColumnEditMode(false);
    window.setTimeout(goNext, 100);
  }

  function beginCapture() {
    setCaptures((current) => {
      const next = { ...current };
      delete next[currentKey];
      return next;
    });
    setCaptureMode(true);
    setColumnEditMode(false);
    setDrag(null);
  }

  function saveAndAdvance(capture: Capture) {
    saveCapture(currentKey, { ...capture, confirmed: true });
    resetInteraction();
    window.setTimeout(goNext, 100);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((!captureMode && !manualGridBoxMode) || !imageReady) return;
    const point = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (manualGridBoxMode || step.kind === "rect") {
      setDrag({ startX: point.x, startY: point.y, x: point.x, y: point.y });
      return;
    }
    if (step.kind === "confirm") return;
    const existing = currentCapture?.kind === step.kind ? currentCapture.points : [];
    const points = step.kind === "point" ? [point] : [...existing, point];
    const capture: Capture = { kind: step.kind, points, confirmed: false };
    const automatic =
      step.kind === "point" ||
      (step.kind === "points" && points.length >= (step.requiredPoints ?? 1)) ||
      (step.kind === "line" && step.lineMode === "segment" && points.length >= 2);
    if (automatic) saveAndAdvance(capture);
    else saveCapture(currentKey, capture);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const point = pointerPosition(event);
    setDrag({ ...drag, x: point.x, y: point.y });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const point = pointerPosition(event);
    const rect = rectFromDrag({ ...drag, x: point.x, y: point.y });
    if (manualGridBoxMode) {
      const grid = gridFromManualBox(rect, dimensions.columns, dimensions.rows);
      saveDetectedGrid(grid);
      resetInteraction();
      return;
    }
    saveAndAdvance({ kind: "rect", points: [], rect, confirmed: true });
  }

  function finishPolyline() {
    if (step.kind !== "line" || !currentCapture || currentCapture.points.length < 2) return;
    saveAndAdvance(currentCapture);
  }

  function undoLastPoint() {
    if (!currentCapture || currentCapture.kind === "rect") return;
    const points = currentCapture.points.slice(0, -1);
    setCaptures((current) => {
      const next = { ...current };
      if (points.length) next[currentKey] = { ...currentCapture, points, confirmed: false };
      else delete next[currentKey];
      return next;
    });
  }

  function saveProgress() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(captures));
    window.localStorage.setItem(GRID_META_KEY, JSON.stringify(gridMeta));
    window.localStorage.setItem(GRID_BOUNDARY_KEY, JSON.stringify(gridBoundaries));
    setSaveStatus("Progress saved in this browser.");
  }

  function exportMap() {
    const serialize = (key: string, capture: Capture) => {
      const pdfGeometry = key.startsWith("shared:");
      return {
        ...capture,
        normalizedPoints: capture.points,
        normalizedRect: capture.rect ?? null,
        columnBoundaries: gridBoundaries[key]?.columnBoundaries ?? null,
        detectedColumnBoundaries:
          gridBoundaries[key]?.detectedColumnBoundaries ?? null,
        pdfPoints: pdfGeometry
          ? capture.points.map((point) => ({
              x: point.x * A4_WIDTH_PT,
              y: (1 - point.y) * A4_HEIGHT_PT,
            }))
          : null,
        pdfRect:
          pdfGeometry && capture.rect
            ? {
                x: capture.rect.x * A4_WIDTH_PT,
                y: (1 - capture.rect.y - capture.rect.height) * A4_HEIGHT_PT,
                width: capture.rect.width * A4_WIDTH_PT,
                height: capture.rect.height * A4_HEIGHT_PT,
              }
            : null,
      };
    };
    downloadJson("p2006t-guided-coordinate-map.json", {
      version: 29,
      registration,
      stages: STAGES,
      captures: Object.fromEntries(
        Object.entries(captures).map(([key, capture]) => [key, serialize(key, capture)])
      ),
      gridMetadata: gridMeta,
      gridBoundaries,
    });
  }

  const visibleCaptures = stageCaptures.filter((entry) => {
    if (!entry.capture || entry.capture.kind === "confirm") return false;
    return entry.key === currentKey || showCompletedGeometry;
  });
  const confidence = Math.round(
    (currentGridMeta?.confidence ?? currentGrid?.confidence ?? 0) * 100
  );
  const columnsAdjusted = Boolean(currentBoundaryRecord?.adjusted);

  return (
    <section className="space-y-5 rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Guided visual audit mapper
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Automatic performance grid, adjustable columns, manual form fields
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            Automatic detection provides the starting grid. Every vertical boundary can then
            be moved independently, so tables with unequal column widths are stored exactly as
            published.
          </p>
        </div>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Aircraft
          </span>
          <select
            value={registration}
            onChange={(event) => {
              setRegistration(event.target.value as P2006TRegistration);
              setStepIndex(0);
              setImageReady(false);
              setColumnEditMode(false);
              resetInteraction();
            }}
            className="block rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
          >
            {P2006T_REGISTRATIONS.map((candidate) => (
              <option key={candidate}>{candidate}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-2 rounded-2xl border border-sky-200 bg-white p-2 sm:grid-cols-3">
        {([
          ["todo", `To complete · ${totalPerformance - completedPerformance}`],
          ["completed", `Completed · ${completedPerformance}`],
          ["forms", "Form & M&B"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-xl px-4 py-3 text-sm font-semibold ${
              tab === value ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visibleStageIndexes.length ? (
        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleStageIndexes.map(({ stage: candidate, index }) => {
            const complete = stageIsComplete(candidate, registration, captures);
            const done = candidate.steps.filter((candidateStep) =>
              captureIsComplete(
                candidateStep,
                captures[mappingKey(candidate, registration, candidateStep)]
              )
            ).length;
            const candidateSource = candidate.type === "performance"
              ? (candidate.source as AuditPerformanceSource)
              : null;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => goToStage(index)}
                className={`rounded-2xl border p-3 text-left ${
                  index === stageIndex
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : complete
                      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                      : "border-sky-200 bg-white text-zinc-700"
                }`}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-60">
                  {candidateSource?.section ?? "Shared form"}
                </span>
                <span className="mt-1 block text-sm font-semibold">{candidate.shortTitle}</span>
                <span className="mt-1 block text-xs opacity-70">
                  {complete ? "Completed" : `${done}/${candidate.steps.length} complete`}
                </span>
              </button>
            );
          })}
        </nav>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-900">
          There are no tables in this view for {registration}.
        </div>
      )}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_400px]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 rounded-2xl border-2 border-sky-300 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
              {stage.shortTitle} · task {stepIndex + 1}/{stage.steps.length}
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{step.instruction}</p>

            {isAutoGridStep(step) ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-white px-3 py-1.5 text-zinc-700">
                    {dimensions.columns} columns × {dimensions.rows} rows
                  </span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-zinc-700">
                    {currentGrid ? `${confidence}% detection confidence` : "Waiting for detection"}
                  </span>
                  {columnsAdjusted ? (
                    <span className="rounded-full bg-sky-100 px-3 py-1.5 text-sky-900">
                      Column widths adjusted
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!currentGrid || detecting}
                    onClick={confirmGrid}
                    className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
                  >
                    Confirm grid
                  </button>
                  <button
                    type="button"
                    disabled={!currentGrid || detecting}
                    onClick={() =>
                      columnEditMode ? setColumnEditMode(false) : beginColumnEditing()
                    }
                    className={`rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:text-zinc-300 ${
                      columnEditMode
                        ? "border-sky-700 bg-sky-700 text-white"
                        : "border-sky-200 bg-white text-sky-800"
                    }`}
                  >
                    {columnEditMode ? "Finish adjusting columns" : "Adjust vertical lines"}
                  </button>
                  <button
                    type="button"
                    disabled={!columnsAdjusted || detecting}
                    onClick={resetColumnBoundaries}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 disabled:text-zinc-300"
                  >
                    Reset column widths
                  </button>
                  <button
                    type="button"
                    disabled={!imageReady || detecting}
                    onClick={runAutoDetection}
                    className="rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 disabled:text-zinc-300"
                  >
                    {detecting ? "Detecting…" : "Detect again"}
                  </button>
                  <button
                    type="button"
                    disabled={!imageReady}
                    onClick={() => {
                      setManualGridBoxMode(true);
                      setCaptureMode(false);
                      setColumnEditMode(false);
                      setDrag(null);
                    }}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700"
                  >
                    Manual outer box
                  </button>
                </div>
                {columnEditMode ? (
                  <p className="rounded-xl border border-sky-200 bg-white p-3 text-xs leading-5 text-sky-900">
                    Drag each blue vertical handle independently, including the left and right
                    edges. Moving one divider changes only the two adjacent column widths. The
                    arrow keys provide fine adjustment; hold Shift for a larger step.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {!captureMode ? (
                  <button
                    type="button"
                    disabled={!imageReady}
                    onClick={beginCapture}
                    className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
                  >
                    {currentCapture?.confirmed ? "Redo this item" : "Start this item"}
                  </button>
                ) : (
                  <>
                    {step.kind === "line" && step.lineMode === "polyline" ? (
                      <button
                        type="button"
                        disabled={!currentCapture || currentCapture.points.length < 2}
                        onClick={finishPolyline}
                        className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
                      >
                        Finish line
                      </button>
                    ) : null}
                    {step.kind !== "rect" ? (
                      <button
                        type="button"
                        disabled={!currentCapture?.points.length}
                        onClick={undoLastPoint}
                        className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold disabled:text-zinc-300"
                      >
                        Undo point
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={resetInteraction}
                      className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))} className="h-9 w-9 rounded-lg border bg-white font-semibold">−</button>
              <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={ZOOM_STEP} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
              <button type="button" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))} className="h-9 w-9 rounded-lg border bg-white font-semibold">+</button>
              <button type="button" onClick={() => setZoom(100)} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold">Fit</button>
              <span className="font-mono text-xs font-semibold">{zoom}%</span>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
              <input type="checkbox" checked={showCompletedGeometry} onChange={(event) => setShowCompletedGeometry(event.target.checked)} />
              Show completed geometry
            </label>
          </div>

          <div className="max-h-[78vh] overflow-auto rounded-2xl border border-zinc-300 bg-zinc-100 p-2">
            <div
              className="relative mx-auto select-none bg-white"
              style={{
                width: `${zoom}%`,
                cursor: captureMode || manualGridBoxMode ? "crosshair" : "default",
                touchAction:
                  captureMode || manualGridBoxMode || columnEditMode ? "none" : "auto",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {stage.type === "performance" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={imageRef}
                  src={sourceAsset!.image}
                  alt={stage.title}
                  draggable={false}
                  onLoad={() => {
                    setImageReady(true);
                    if (isAutoGridStep(step) && !currentCapture) {
                      window.setTimeout(runAutoDetection, 40);
                    }
                  }}
                  className="block h-auto w-full"
                />
              ) : (
                <FormBackground page={stage.page!} onReady={() => setImageReady(true)} />
              )}

              {currentGrid && currentColumnBoundaries.length === dimensions.columns + 1 ? (
                <GridOverlay
                  grid={currentGrid}
                  confirmed={Boolean(currentCapture?.confirmed)}
                  columnBoundaries={currentColumnBoundaries}
                  editingColumns={columnEditMode}
                />
              ) : null}
              {columnEditMode && currentGrid ? (
                <ColumnBoundaryHandles
                  boundaries={currentColumnBoundaries}
                  rowCenters={currentGrid.rowCenters}
                  onMove={moveColumnBoundary}
                />
              ) : null}
              {visibleCaptures.map((entry) => (
                <GenericOverlay key={entry.key} capture={entry.capture!} current={entry.key === currentKey} />
              ))}
              {draftRect ? (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-amber-600 bg-amber-200/15"
                  style={{
                    left: `${draftRect.x * 100}%`,
                    top: `${draftRect.y * 100}%`,
                    width: `${draftRect.width * 100}%`,
                    height: `${draftRect.height * 100}%`,
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Stage progress</p>
            <p className="mt-2 text-2xl font-semibold">{stageCompleteCount}/{stage.steps.length}</p>
            <select
              value={stepIndex}
              onChange={(event) => {
                setStepIndex(Number(event.target.value));
                setColumnEditMode(false);
                resetInteraction();
              }}
              className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {stageCaptures.map((entry, index) => (
                <option key={entry.key} value={index}>
                  {captureIsComplete(entry.step, entry.capture) ? "✓" : "—"} {index + 1}. {entry.step.title}
                </option>
              ))}
            </select>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={goPrevious} className="rounded-xl border px-3 py-2 text-sm font-semibold">Previous</button>
              <button type="button" onClick={goNext} className="rounded-xl border px-3 py-2 text-sm font-semibold">Skip / next</button>
            </div>
          </section>

          {sourceAsset ? (
            <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Source page</p>
              <p className="mt-2 font-semibold text-zinc-950">{stage.title}</p>
              <p className="mt-1 text-sm text-zinc-600">PDF {sourceAsset.pdfPage} · AFM {sourceAsset.printedPage}</p>
              {source?.grid ? (
                <div className={`mt-3 rounded-xl border p-3 text-sm ${
                  sourceCheck.state === "ready"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : sourceCheck.state === "error"
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600"
                }`}>
                  <p className="font-semibold">Source text check</p>
                  <p className="mt-1">{sourceCheck.message}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {isAutoGridStep(step) && currentGrid ? (
            <section className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Column geometry
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {currentColumnBoundaries.length} vertical boundaries define {dimensions.columns}
                independently sized columns. These exact boundaries are saved and exported.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {currentColumnBoundaries.slice(0, -1).map((left, index) => (
                  <div key={`column-width-${index}`} className="rounded-xl bg-zinc-50 p-2 text-zinc-700">
                    <span className="font-semibold">Column {index + 1}</span>
                    <span className="ml-2 font-mono">
                      {((currentColumnBoundaries[index + 1] - left) * 100).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Save and export</p>
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={saveProgress} className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">Save progress</button>
              <button type="button" onClick={exportMap} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Export coordinate JSON</button>
            </div>
            {saveStatus ? <p className="mt-3 text-xs font-semibold text-emerald-700">{saveStatus}</p> : null}
          </section>
        </aside>
      </div>
    </section>
  );
}
