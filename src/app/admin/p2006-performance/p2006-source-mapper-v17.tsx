"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import { P2006T_FORM_PAGE_1_WEBP_BASE64 } from "@/lib/pdf/p2006t-form-page-1";
import { P2006T_FORM_PAGE_2_WEBP_BASE64 } from "@/lib/pdf/p2006t-form-page-2";
import {
  PERFORMANCE_SOURCES,
  STAGES,
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
} from "./p2006-grid-detector";

type DragState = {
  startX: number;
  startY: number;
  x: number;
  y: number;
} | null;

type GridMeta = {
  confidence: number;
  method: DetectedPerformanceGrid["method"];
  diagnostics: DetectedPerformanceGrid["diagnostics"];
};
type GridMetaStore = Record<string, GridMeta>;

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const GRID_META_KEY = "briefings_p2006_auto_grid_meta_v17";
const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
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

function captureIsComplete(step: GuidedStep, capture?: Capture) {
  if (!capture) return false;
  if (step.kind === "confirm") return capture.confirmed;
  if (step.kind === "rect") return Boolean(capture.rect);
  if (step.kind === "point") return capture.points.length === 1;
  if (step.kind === "points") {
    return capture.points.length >= (step.requiredPoints ?? 1);
  }
  return capture.points.length >= (step.minPoints ?? 2);
}

function captureFromGrid(
  grid: DetectedPerformanceGrid,
  confirmed: boolean
): Capture {
  return {
    kind: "confirm",
    confirmed,
    points: [
      ...grid.columnCenters.map((x) => ({ x, y: 0.5 })),
      ...grid.rowCenters.map((y) => ({ x: 0.5, y })),
    ],
  };
}

function gridFromCapture(capture?: Capture): DetectedPerformanceGrid | null {
  if (!capture || capture.points.length < 27) return null;
  const columnCenters = capture.points.slice(0, 5).map((point) => point.x);
  const rowCenters = capture.points.slice(5, 27).map((point) => point.y);
  if (columnCenters.length !== 5 || rowCenters.length !== 22) return null;

  return {
    columnCenters,
    rowCenters,
    confidence: capture.confirmed ? 1 : 0.5,
    method: "layout-fallback",
    diagnostics: {
      verticalCandidates: 0,
      horizontalCandidates: 0,
      matchedColumns: 5,
      matchedRows: 22,
    },
  };
}

function centersToBoundaries(centers: number[]) {
  if (centers.length < 2) return [];
  const boundaries = [centers[0] - (centers[1] - centers[0]) / 2];
  for (let index = 0; index < centers.length - 1; index += 1) {
    boundaries.push((centers[index] + centers[index + 1]) / 2);
  }
  boundaries.push(
    centers[centers.length - 1] +
      (centers[centers.length - 1] - centers[centers.length - 2]) / 2
  );
  return boundaries.map(clamp);
}

function migrateCaptures(input: CaptureStore): CaptureStore {
  const next: CaptureStore = { ...input };

  for (const key of Object.keys(next)) {
    if (!key.startsWith("performance-")) continue;
    if (
      key.endsWith(":column-seed") ||
      key.endsWith(":row-seed") ||
      key.endsWith(":grid-confirmation") ||
      /:row-\d+-(ground-roll|50ft)$/.test(key)
    ) {
      delete next[key];
    }
  }

  return next;
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
}: {
  grid: DetectedPerformanceGrid;
  confirmed: boolean;
}) {
  const xBoundaries = centersToBoundaries(grid.columnCenters);
  const yBoundaries = centersToBoundaries(grid.rowCenters);
  const stroke = confirmed ? "rgb(5 150 105)" : "rgb(217 119 6)";
  const fill = confirmed ? "rgba(5,150,105,0.055)" : "rgba(245,158,11,0.07)";

  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {grid.rowCenters.flatMap((y, rowIndex) =>
        grid.columnCenters.map((x, columnIndex) => {
          const left = xBoundaries[columnIndex];
          const right = xBoundaries[columnIndex + 1];
          const top = yBoundaries[rowIndex];
          const bottom = yBoundaries[rowIndex + 1];
          return (
            <rect
              key={`${rowIndex}-${columnIndex}`}
              x={left * 1000}
              y={top * 1000}
              width={(right - left) * 1000}
              height={(bottom - top) * 1000}
              fill={fill}
              stroke={stroke}
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
          );
        })
      )}
      {grid.rowCenters.flatMap((y, rowIndex) =>
        grid.columnCenters.map((x, columnIndex) => (
          <circle
            key={`center-${rowIndex}-${columnIndex}`}
            cx={x * 1000}
            cy={y * 1000}
            r="2.4"
            fill={stroke}
          />
        ))
      )}
    </svg>
  );
}

function GenericOverlay({
  capture,
  step,
  current,
}: {
  capture: Capture;
  step: GuidedStep;
  current: boolean;
}) {
  if (capture.kind === "confirm") return null;
  const calculationBox = roleOf(step) === "calculation-notes-rectangle";
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
          background: calculationBox
            ? "rgba(255,255,255,0.97)"
            : "rgba(5,150,105,0.08)",
        }}
      >
        {calculationBox ? (
          <span className="absolute left-2 top-2 rounded bg-zinc-950 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            Calculation breakdown
          </span>
        ) : null}
      </div>
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
          points={capture.points
            .map((point) => `${point.x * 1000},${point.y * 1000}`)
            .join(" ")}
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
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [stageIndex, setStageIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [captures, setCaptures] = useState<CaptureStore>({});
  const [gridMeta, setGridMeta] = useState<GridMetaStore>({});
  const [captureMode, setCaptureMode] = useState(false);
  const [manualGridBoxMode, setManualGridBoxMode] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);
  const [imageReady, setImageReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const migrated = migrateCaptures(JSON.parse(saved) as CaptureStore);
        setCaptures(migrated);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }
      const savedMeta = window.localStorage.getItem(GRID_META_KEY);
      if (savedMeta) setGridMeta(JSON.parse(savedMeta) as GridMetaStore);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(GRID_META_KEY);
    }
  }, []);

  const stage = STAGES[stageIndex];
  const step = stage.steps[stepIndex];
  const sourceAsset =
    stage.type === "performance" ? stage.source!.manifest[registration] : null;
  const currentKey = mappingKey(stage, registration, step);
  const currentCapture = captures[currentKey];
  const currentGrid = isAutoGridStep(step)
    ? gridFromCapture(currentCapture)
    : null;
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
  const stageConfirmed = stageCaptures.filter(
    (entry) => entry.capture?.confirmed
  ).length;

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
    resetInteraction();
  }

  function goNext() {
    if (stepIndex < stage.steps.length - 1) {
      setStepIndex((value) => value + 1);
    } else if (stageIndex < STAGES.length - 1) {
      goToStage(stageIndex + 1);
      return;
    }
    resetInteraction();
  }

  function goPrevious() {
    if (stepIndex > 0) {
      setStepIndex((value) => value - 1);
    } else if (stageIndex > 0) {
      const previousStage = stageIndex - 1;
      setStageIndex(previousStage);
      setStepIndex(STAGES[previousStage].steps.length - 1);
      setImageReady(false);
      setZoom(100);
    }
    resetInteraction();
  }

  function saveCapture(key: string, capture: Capture) {
    setCaptures((current) => ({ ...current, [key]: capture }));
  }

  function runAutoDetection() {
    const image = imageRef.current;
    if (!image || !image.complete || !image.naturalWidth) return;
    setDetecting(true);

    window.requestAnimationFrame(() => {
      const grid = detectPerformanceGrid(image);
      saveCapture(currentKey, captureFromGrid(grid, false));
      setGridMeta((current) => ({
        ...current,
        [currentKey]: {
          confidence: grid.confidence,
          method: grid.method,
          diagnostics: grid.diagnostics,
        },
      }));
      setDetecting(false);
    });
  }

  function confirmGrid() {
    if (!currentCapture || !currentGrid) return;
    saveCapture(currentKey, { ...currentCapture, confirmed: true });
    window.setTimeout(goNext, 120);
  }

  function beginGenericCapture() {
    setCaptures((current) => {
      const next = { ...current };
      delete next[currentKey];
      return next;
    });
    setCaptureMode(true);
    setDrag(null);
  }

  function saveGenericAndAdvance(capture: Capture) {
    saveCapture(currentKey, { ...capture, confirmed: true });
    resetInteraction();
    window.setTimeout(goNext, 120);
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

    if (automatic) saveGenericAndAdvance(capture);
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
      const grid = gridFromManualBox(rect);
      saveCapture(currentKey, captureFromGrid(grid, false));
      setGridMeta((current) => ({
        ...current,
        [currentKey]: {
          confidence: grid.confidence,
          method: grid.method,
          diagnostics: grid.diagnostics,
        },
      }));
      resetInteraction();
      return;
    }

    saveGenericAndAdvance({
      kind: "rect",
      points: [],
      rect,
      confirmed: true,
    });
  }

  function finishPolyline() {
    if (
      step.kind !== "line" ||
      !currentCapture ||
      currentCapture.points.length < 2
    ) {
      return;
    }
    saveGenericAndAdvance(currentCapture);
  }

  function undoLastPoint() {
    if (!currentCapture || currentCapture.kind === "rect") return;
    const points = currentCapture.points.slice(0, -1);
    setCaptures((current) => {
      const next = { ...current };
      if (points.length) {
        next[currentKey] = { ...currentCapture, points, confirmed: false };
      } else {
        delete next[currentKey];
      }
      return next;
    });
  }

  function saveProgress() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(captures));
    window.localStorage.setItem(GRID_META_KEY, JSON.stringify(gridMeta));
    setSaveStatus("Progress saved in this browser.");
  }

  function exportMap() {
    const automaticGrids = Object.fromEntries(
      STAGES.filter((candidate) => candidate.type === "performance").flatMap(
        (candidate) =>
          P2006T_REGISTRATIONS.map((candidateRegistration) => {
            const autoStep = candidate.steps.find(isAutoGridStep);
            const key = autoStep
              ? mappingKey(candidate, candidateRegistration, autoStep)
              : "";
            const capture = key ? captures[key] : undefined;
            const grid = gridFromCapture(capture);
            return [
              `${candidate.id}:${candidateRegistration}`,
              grid
                ? {
                    confirmed: Boolean(capture?.confirmed),
                    columnCenters: grid.columnCenters,
                    rowCenters: grid.rowCenters,
                    metadata: gridMeta[key] ?? null,
                  }
                : null,
            ];
          })
      )
    );

    const serialize = (key: string, capture: Capture) => {
      const pdfGeometry = key.startsWith("shared:");
      return {
        ...capture,
        normalizedPoints: capture.points,
        normalizedRect: capture.rect ?? null,
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
      version: 17,
      gridModel: {
        method: "automatic-pixel-line-detection",
        columns: 5,
        rows: 22,
        visualReviewRequired: true,
        manualFallback: "outer-numeric-matrix-rectangle",
      },
      performanceSources: PERFORMANCE_SOURCES,
      captures: Object.fromEntries(
        Object.entries(captures).map(([key, capture]) => [
          key,
          serialize(key, capture),
        ])
      ),
      automaticGrids,
    });
  }

  const visibleCaptures = stageCaptures.filter((entry) => {
    if (!entry.capture || entry.capture.kind === "confirm") return false;
    return entry.key === currentKey || showCompleted;
  });
  const confidencePercentage = Math.round(
    (currentGridMeta?.confidence ?? currentGrid?.confidence ?? 0) * 100
  );
  const confidenceClass =
    confidencePercentage >= 80
      ? "bg-emerald-100 text-emerald-900"
      : confidencePercentage >= 55
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-900";

  return (
    <section className="space-y-5 rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Guided visual audit mapper
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Automatic performance grid, manual form fields
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            Performance tables are detected from their visible grid lines and shown as
            110 cell overlays. Form and M&B coordinates remain manual and reuse the work
            already saved in the browser or imported JSON.
          </p>
        </div>

        {stage.type === "performance" ? (
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Aircraft for this AFM page
            </span>
            <select
              value={registration}
              onChange={(event) => {
                setRegistration(event.target.value as P2006TRegistration);
                setStepIndex(0);
                setImageReady(false);
                resetInteraction();
              }}
              className="block rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
            >
              {P2006T_REGISTRATIONS.map((candidate) => (
                <option key={candidate}>{candidate}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            Shared form geometry — independent of registration
          </span>
        )}
      </div>

      <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {STAGES.map((candidate, index) => {
          const complete = candidate.steps.filter(
            (candidateStep) =>
              captures[
                mappingKey(candidate, registration, candidateStep)
              ]?.confirmed
          ).length;
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => goToStage(index)}
              className={[
                "rounded-2xl border p-3 text-left",
                index === stageIndex
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-sky-200 bg-white text-zinc-700",
              ].join(" ")}
            >
              <span className="block text-sm font-semibold">
                {candidate.shortTitle}
              </span>
              <span className="mt-1 block text-xs opacity-70">
                {complete}/{candidate.steps.length} complete
                {candidate.type === "performance"
                  ? ` · ${registration}`
                  : " · shared"}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_390px]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          <section className="mb-3 rounded-2xl border-2 border-sky-300 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
              Task {stepIndex + 1}/{stage.steps.length} · {step.group}
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              {step.instruction}
            </p>

            {isAutoGridStep(step) ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${confidenceClass}`}>
                    {currentGrid
                      ? `Detection confidence ${confidencePercentage}%`
                      : "Waiting for detection"}
                  </span>
                  {currentGridMeta ? (
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600">
                      {currentGridMeta.method} · {currentGridMeta.diagnostics.matchedColumns}/5 columns · {currentGridMeta.diagnostics.matchedRows}/22 rows
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
                    Confirm detected grid
                  </button>
                  <button
                    type="button"
                    disabled={!imageReady || detecting}
                    onClick={runAutoDetection}
                    className="rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 disabled:text-zinc-300"
                  >
                    {detecting ? "Detecting…" : "Re-detect automatically"}
                  </button>
                  <button
                    type="button"
                    disabled={!imageReady}
                    onClick={() => {
                      setManualGridBoxMode(true);
                      setCaptureMode(false);
                      setDrag(null);
                    }}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700"
                  >
                    Manual outer-box fallback
                  </button>
                </div>
                {manualGridBoxMode ? (
                  <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
                    Drag one rectangle around the complete 5 × 22 numeric matrix, from the outer top-left boundary to the outer bottom-right boundary.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {!captureMode ? (
                  <button
                    type="button"
                    disabled={!imageReady}
                    onClick={beginGenericCapture}
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
                        Finish line and continue
                      </button>
                    ) : null}
                    {step.kind !== "rect" ? (
                      <button
                        type="button"
                        disabled={!currentCapture?.points.length}
                        onClick={undoLastPoint}
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 disabled:text-zinc-300"
                      >
                        Undo last point
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={resetInteraction}
                      className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700"
                    >
                      Cancel capture
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
                className="h-9 w-9 rounded-lg border bg-white font-semibold"
              >
                −
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={ZOOM_STEP}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
                className="h-9 w-9 rounded-lg border bg-white font-semibold"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold"
              >
                Fit
              </button>
              <span className="font-mono text-xs font-semibold">{zoom}%</span>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(event) => setShowCompleted(event.target.checked)}
              />
              Show completed geometry
            </label>
          </div>

          <div className="max-h-[78vh] overflow-auto rounded-2xl border border-zinc-300 bg-zinc-100 p-2">
            <div
              className="relative mx-auto select-none bg-white"
              style={{
                width: `${zoom}%`,
                cursor:
                  captureMode || manualGridBoxMode ? "crosshair" : "default",
                touchAction:
                  captureMode || manualGridBoxMode ? "none" : "auto",
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
                      window.setTimeout(runAutoDetection, 30);
                    }
                  }}
                  className="block h-auto w-full"
                />
              ) : (
                <FormBackground
                  page={stage.page!}
                  onReady={() => setImageReady(true)}
                />
              )}

              {currentGrid ? (
                <GridOverlay
                  grid={{
                    ...currentGrid,
                    confidence: currentGridMeta?.confidence ?? currentGrid.confidence,
                    method: currentGridMeta?.method ?? currentGrid.method,
                    diagnostics:
                      currentGridMeta?.diagnostics ?? currentGrid.diagnostics,
                  }}
                  confirmed={Boolean(currentCapture?.confirmed)}
                />
              ) : null}

              {visibleCaptures.map((entry) => (
                <GenericOverlay
                  key={entry.key}
                  capture={entry.capture!}
                  step={entry.step}
                  current={entry.key === currentKey}
                />
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
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Stage progress
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {stageConfirmed}/{stage.steps.length}
            </p>
            <select
              value={stepIndex}
              onChange={(event) => {
                setStepIndex(Number(event.target.value));
                resetInteraction();
              }}
              className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {stageCaptures.map((entry, index) => (
                <option key={entry.key} value={index}>
                  {captureIsComplete(entry.step, entry.capture) ? "✓" : "—"}{" "}
                  {index + 1}. {entry.step.title}
                </option>
              ))}
            </select>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={goPrevious}
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={goNext}
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
              >
                Skip / next
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Save and export
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={saveProgress}
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                Save browser progress
              </button>
              <button
                type="button"
                onClick={exportMap}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white"
              >
                Download coordinate JSON
              </button>
            </div>
            {saveStatus ? (
              <p className="mt-3 text-xs font-semibold text-emerald-700">
                {saveStatus}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </section>
  );
}
