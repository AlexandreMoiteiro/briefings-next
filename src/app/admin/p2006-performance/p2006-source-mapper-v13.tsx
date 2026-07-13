"use client";

import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
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

type DragState = {
  startX: number;
  startY: number;
  x: number;
  y: number;
} | null;

type Segment = { start: Point; end: Point };
type DerivedGrid = {
  columns: Segment[];
  rows: Segment[];
  intersections: Point[];
  rowSpacing: number;
};

const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function average(...values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function migrateCaptures(input: CaptureStore): CaptureStore {
  const next: CaptureStore = { ...input };

  for (const key of Object.keys(next)) {
    if (key.endsWith(":row-seed")) {
      delete next[key];
      delete next[key.replace(/:row-seed$/, ":grid-confirmation")];
    }
  }

  return next;
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

function lockedColumns(points: Point[]): Segment[] {
  if (points.length < 4) return [];

  const firstX = average(points[0].x, points[1].x);
  const secondX = average(points[2].x, points[3].x);
  const firstTop = Math.min(points[0].y, points[1].y);
  const firstBottom = Math.max(points[0].y, points[1].y);
  const secondTop = Math.min(points[2].y, points[3].y);
  const secondBottom = Math.max(points[2].y, points[3].y);
  const topY = average(firstTop, secondTop);
  const bottomY = average(firstBottom, secondBottom);
  const spacing = secondX - firstX;

  if (spacing <= 0 || bottomY <= topY) return [];

  return Array.from({ length: 5 }, (_, index) => {
    const x = firstX + spacing * index;
    return {
      start: { x, y: topY },
      end: { x, y: bottomY },
    };
  });
}

function deriveGrid(columnCapture?: Capture): DerivedGrid | null {
  if (!columnCapture) return null;

  const columns = lockedColumns(columnCapture.points);
  if (columns.length !== 5) return null;

  const topY = columns[0].start.y;
  const bottomY = columns[0].end.y;
  const leftX = columns[0].start.x;
  const rightX = columns[columns.length - 1].start.x;
  const rowSpacing = (bottomY - topY) / 21;

  if (rowSpacing <= 0) return null;

  const rows = Array.from({ length: 22 }, (_, index) => {
    const y = topY + rowSpacing * index;
    return {
      start: { x: leftX, y },
      end: { x: rightX, y },
    };
  });

  const intersections = rows.flatMap((row) =>
    columns.map((column) => ({ x: column.start.x, y: row.start.y }))
  );

  return { columns, rows, intersections, rowSpacing };
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

function startButtonLabel(step: GuidedStep) {
  if (step.kind === "confirm") return "Confirm generated grid and continue";
  if (step.kind === "rect") return "Start — drag the rectangle";
  if (step.kind === "point") return "Start — click the point";
  if (step.kind === "points") {
    return `Start — click ${step.requiredPoints ?? 1} points`;
  }
  return step.lineMode === "segment"
    ? "Start — click both ends"
    : "Start — trace the line";
}

function activeInstruction(step: GuidedStep, capture?: Capture) {
  if (step.kind === "rect") {
    return step.metadata?.role === "calculation-notes-rectangle"
      ? "Drag the white calculation area. Release to save it and continue."
      : "Drag from one corner to the opposite corner.";
  }
  if (step.kind === "point") return "Click the requested point.";
  if (step.kind === "points") {
    const done = capture?.points.length ?? 0;
    return `Click point ${done + 1} of ${step.requiredPoints ?? 1}.`;
  }
  if (step.lineMode === "segment") {
    const done = capture?.points.length ?? 0;
    return `Click endpoint ${done + 1} of 2.`;
  }
  return "Click along the line in order, then press Finish line and continue.";
}

function CaptureOverlay({
  capture,
  step,
  current,
}: {
  capture: Capture;
  step: GuidedStep;
  current: boolean;
}) {
  if (capture.kind === "confirm") return null;

  const role = String(step.metadata?.role ?? "");
  const stroke = current ? "rgb(217 119 6)" : "rgb(5 150 105)";

  if (capture.kind === "rect" && capture.rect) {
    const calculationBox = role === "calculation-notes-rectangle";
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
          boxShadow: calculationBox
            ? "0 0 0 1px rgba(0,0,0,0.08)"
            : undefined,
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

  const lockedSeedLines =
    role === "regular-column-and-row-seed"
      ? lockedColumns(capture.points).slice(0, 2)
      : [];
  const showPolyline =
    lockedSeedLines.length === 0 &&
    capture.kind !== "point" &&
    capture.points.length > 1;

  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {lockedSeedLines.map((line, index) => (
        <line
          key={`seed-${index}`}
          x1={line.start.x * 1000}
          y1={line.start.y * 1000}
          x2={line.end.x * 1000}
          y2={line.end.y * 1000}
          stroke={stroke}
          strokeWidth="4"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {showPolyline ? (
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
        <g key={`${point.x}-${point.y}-${index}`}>
          <circle
            cx={point.x * 1000}
            cy={point.y * 1000}
            r="6"
            fill={stroke}
            opacity="0.65"
          />
          {current ? (
            <text
              x={point.x * 1000 + 10}
              y={point.y * 1000 - 10}
              fill="rgb(24 24 27)"
              fontSize="18"
              fontWeight="700"
            >
              {index + 1}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

function GridOverlay({ grid }: { grid: DerivedGrid }) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {grid.columns.map((line, index) => (
        <line
          key={`column-${index}`}
          x1={line.start.x * 1000}
          y1={line.start.y * 1000}
          x2={line.end.x * 1000}
          y2={line.end.y * 1000}
          stroke="rgb(5 150 105)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {grid.rows.map((line, index) => (
        <line
          key={`row-${index}`}
          x1={line.start.x * 1000}
          y1={line.start.y * 1000}
          x2={line.end.x * 1000}
          y2={line.end.y * 1000}
          stroke="rgb(5 150 105)"
          strokeWidth="2.2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {grid.intersections.map((point, index) => (
        <circle
          key={`cell-${index}`}
          cx={point.x * 1000}
          cy={point.y * 1000}
          r="2.8"
          fill="rgb(5 150 105)"
        />
      ))}
    </svg>
  );
}

function PdfFormPage({
  page,
  onReady,
}: {
  page: 1 | 2;
  onReady: () => void;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let destroyTask: (() => void) | null = null;

    async function renderPage() {
      setImageUrl("");
      setError("");

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const loadingTask = pdfjs.getDocument({ url: "/api/p2006-form" });
        destroyTask = () => void loadingTask.destroy();
        const pdf = await loadingTask.promise;
        const pdfPage = await pdf.getPage(page);
        const viewport = pdfPage.getViewport({ scale: 2.1 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });

        if (!context) throw new Error("Canvas is unavailable.");

        await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
        if (!cancelled) setImageUrl(canvas.toDataURL("image/png"));
        await pdf.destroy();
      } catch (reason) {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "The original PDF page could not be rendered."
          );
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      destroyTask?.();
    };
  }, [page]);

  if (error) {
    return <div className="p-8 text-center text-sm text-red-700">{error}</div>;
  }

  if (!imageUrl) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">
        Rendering original PDF page {page}…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={`P2006T form page ${page}`}
      draggable={false}
      onLoad={onReady}
      className="block h-auto w-full"
    />
  );
}

export function P2006TSourceMapper() {
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [stageIndex, setStageIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [captures, setCaptures] = useState<CaptureStore>({});
  const [captureMode, setCaptureMode] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);
  const [imageReady, setImageReady] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const migrated = migrateCaptures(JSON.parse(saved) as CaptureStore);
      setCaptures(migrated);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const stage = STAGES[stageIndex];
  const step = stage.steps[stepIndex];
  const sourceAsset =
    stage.type === "performance" ? stage.source!.manifest[registration] : null;
  const currentKey = mappingKey(stage, registration, step);
  const currentCapture = captures[currentKey];
  const draftRect = drag ? rectFromDrag(drag) : null;

  const stageCaptures = useMemo(
    () =>
      stage.steps.map((candidate) => {
        const key = mappingKey(stage, registration, candidate);
        return { step: candidate, key, capture: captures[key] };
      }),
    [captures, registration, stage]
  );

  const columnStep =
    stage.type === "performance"
      ? stage.steps.find((candidate) => candidate.id === "column-seed")
      : undefined;
  const confirmationStep =
    stage.type === "performance"
      ? stage.steps.find((candidate) => candidate.id === "grid-confirmation")
      : undefined;
  const columnCapture = columnStep
    ? captures[mappingKey(stage, registration, columnStep)]
    : undefined;
  const confirmationCapture = confirmationStep
    ? captures[mappingKey(stage, registration, confirmationStep)]
    : undefined;
  const derivedGrid = stage.type === "performance" ? deriveGrid(columnCapture) : null;
  const showGrid = Boolean(
    derivedGrid &&
      (step.id === "grid-confirmation" ||
        confirmationCapture?.confirmed ||
        showCompleted)
  );
  const stageConfirmed = stageCaptures.filter(
    (entry) => entry.capture?.confirmed
  ).length;

  function resetInteraction() {
    setCaptureMode(false);
    setDrag(null);
  }

  function goToStage(index: number) {
    setStageIndex(index);
    setStepIndex(0);
    resetInteraction();
    setImageReady(false);
    setZoom(100);
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
      const previous = stageIndex - 1;
      setStageIndex(previous);
      setStepIndex(STAGES[previous].steps.length - 1);
      setImageReady(false);
      setZoom(100);
    }
    resetInteraction();
  }

  function replaceCurrentCapture(capture?: Capture) {
    setCaptures((current) => {
      const next = { ...current };
      if (capture) next[currentKey] = capture;
      else delete next[currentKey];
      return next;
    });
  }

  function saveAndAdvance(capture: Capture) {
    setCaptures((current) => ({
      ...current,
      [currentKey]: { ...capture, confirmed: true },
    }));
    resetInteraction();
    window.setTimeout(goNext, 150);
  }

  function beginCapture() {
    if (step.kind === "confirm") {
      if (!derivedGrid) return;
      saveAndAdvance({ kind: "confirm", points: [], confirmed: true });
      return;
    }

    replaceCurrentCapture(undefined);
    setCaptureMode(true);
  }

  function redoColumns() {
    if (!columnStep) return;
    const columnIndex = stage.steps.findIndex(
      (candidate) => candidate.id === "column-seed"
    );
    const columnKey = mappingKey(stage, registration, columnStep);
    const confirmationKey = confirmationStep
      ? mappingKey(stage, registration, confirmationStep)
      : null;

    setCaptures((current) => {
      const next = { ...current };
      delete next[columnKey];
      if (confirmationKey) delete next[confirmationKey];
      return next;
    });
    setStepIndex(Math.max(0, columnIndex));
    setCaptureMode(true);
    setDrag(null);
  }

  function cancelCapture() {
    replaceCurrentCapture(undefined);
    resetInteraction();
  }

  function undoLastPoint() {
    if (
      !currentCapture ||
      currentCapture.kind === "rect" ||
      currentCapture.kind === "confirm"
    ) {
      return;
    }

    const points = currentCapture.points.slice(0, -1);
    replaceCurrentCapture(
      points.length
        ? { ...currentCapture, points, confirmed: false }
        : undefined
    );
  }

  function finishPolyline() {
    if (
      step.kind !== "line" ||
      !currentCapture ||
      currentCapture.points.length < 2
    ) {
      return;
    }
    saveAndAdvance(currentCapture);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!captureMode || !imageReady || step.kind === "confirm") return;
    const point = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (step.kind === "rect") {
      setDrag({ startX: point.x, startY: point.y, x: point.x, y: point.y });
      return;
    }

    const existing =
      currentCapture?.kind === step.kind ? currentCapture.points : [];
    const points =
      step.kind === "point" ? [point] : [...existing, point];
    const capture: Capture = {
      kind: step.kind,
      points,
      confirmed: false,
    };
    const automatic =
      step.kind === "point" ||
      (step.kind === "points" &&
        points.length >= (step.requiredPoints ?? 1)) ||
      (step.kind === "line" &&
        step.lineMode === "segment" &&
        points.length >= 2);

    if (automatic) saveAndAdvance(capture);
    else replaceCurrentCapture(capture);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!captureMode || step.kind !== "rect" || !drag) return;
    const point = pointerPosition(event);
    setDrag({ ...drag, x: point.x, y: point.y });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!captureMode || step.kind !== "rect" || !drag) return;
    const point = pointerPosition(event);
    saveAndAdvance({
      kind: "rect",
      points: [],
      rect: rectFromDrag({ ...drag, x: point.x, y: point.y }),
      confirmed: true,
    });
  }

  function saveProgress() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(captures));
    setSaveStatus("Progress saved in this browser.");
  }

  function exportMap() {
    const performanceDerivedGrids = Object.fromEntries(
      STAGES.filter((candidate) => candidate.type === "performance").flatMap(
        (candidate) =>
          P2006T_REGISTRATIONS.map((candidateRegistration) => {
            const candidateColumnStep = candidate.steps.find(
              (candidateStep) => candidateStep.id === "column-seed"
            );
            const candidateConfirmationStep = candidate.steps.find(
              (candidateStep) => candidateStep.id === "grid-confirmation"
            );
            const candidateColumnCapture = candidateColumnStep
              ? captures[
                  mappingKey(
                    candidate,
                    candidateRegistration,
                    candidateColumnStep
                  )
                ]
              : undefined;
            const candidateConfirmation = candidateConfirmationStep
              ? captures[
                  mappingKey(
                    candidate,
                    candidateRegistration,
                    candidateConfirmationStep
                  )
                ]
              : undefined;
            const grid = deriveGrid(candidateColumnCapture);

            return [
              `${candidate.id}:${candidateRegistration}`,
              grid
                ? {
                    confirmed: Boolean(candidateConfirmation?.confirmed),
                    columns: grid.columns,
                    rows: grid.rows,
                    intersections: grid.intersections,
                    rowSpacing: grid.rowSpacing,
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
      version: 13,
      scope: {
        performanceTables: "per-registration-and-weight-page",
        sharedFormAndMassBalance: "independent-of-registration",
      },
      gridModel: {
        columns: 5,
        rows: 22,
        seed:
          "two-column-centres, each clicked at first-row and last-row centres",
        rowGeneration: "uniform interpolation from first to last row centre",
        axisLock: "columns-vertical-rows-horizontal",
        rowExtent: "first-to-last-temperature-column-centre",
        cellLocation: "intersection",
        oatInterpolationColumns: [-25, 0, 25, 50],
        isa: "audit-only",
      },
      performanceSources: PERFORMANCE_SOURCES,
      stageDefinitions: STAGES.map((candidate) => ({
        id: candidate.id,
        type: candidate.type,
        page: candidate.page ?? null,
        steps: candidate.steps,
      })),
      captures: Object.fromEntries(
        Object.entries(captures).map(([key, capture]) => [
          key,
          serialize(key, capture),
        ])
      ),
      performanceDerivedGrids,
    });
  }

  const visibleCaptures = stageCaptures.filter((entry) => {
    if (!entry.capture || entry.capture.kind === "confirm") return false;
    return entry.key === currentKey || showCompleted;
  });

  return (
    <section className="space-y-5 rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Guided geometry capture
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Four table clicks, one generated grid
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            The column clicks now define both the vertical columns and the first/last
            row centres. All 22 horizontal rows are distributed between those endpoints,
            so there is no cumulative row drift.
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
                resetInteraction();
                setImageReady(false);
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
            Shared geometry — independent of registration
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

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_380px]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          <div className="mb-3">
            <p className="font-semibold text-zinc-950">{stage.title}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              {stage.description}
              {sourceAsset
                ? ` PDF page ${sourceAsset.pdfPage} · printed page ${sourceAsset.printedPage}.`
                : ` Original form page ${stage.page}.`}
            </p>
          </div>

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
            {captureMode ? (
              <p className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
                {activeInstruction(step, currentCapture)}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  !imageReady ||
                  (step.kind === "confirm" && !derivedGrid)
                }
                onClick={beginCapture}
                className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
              >
                {currentCapture?.confirmed && step.kind !== "confirm"
                  ? `Redo — ${startButtonLabel(step)}`
                  : startButtonLabel(step)}
              </button>

              {step.kind === "confirm" ? (
                <>
                  <button
                    type="button"
                    onClick={redoColumns}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700"
                  >
                    Redo four table clicks
                  </button>
                  {derivedGrid ? (
                    <span className="rounded-xl bg-emerald-100 px-3 py-2.5 text-sm font-semibold text-emerald-900">
                      5 columns · 22 rows · 110 intersections
                    </span>
                  ) : null}
                </>
              ) : null}

              {captureMode &&
              step.kind !== "rect" &&
              step.kind !== "confirm" ? (
                <button
                  type="button"
                  disabled={!currentCapture?.points.length}
                  onClick={undoLastPoint}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 disabled:text-zinc-300"
                >
                  Undo last point
                </button>
              ) : null}

              {captureMode &&
              step.kind === "line" &&
              step.lineMode === "polyline" ? (
                <button
                  type="button"
                  onClick={finishPolyline}
                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Finish line and continue
                </button>
              ) : null}

              {captureMode ? (
                <button
                  type="button"
                  onClick={cancelCapture}
                  className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700"
                >
                  Cancel capture
                </button>
              ) : null}
            </div>
          </section>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setZoom((value) =>
                    Math.max(MIN_ZOOM, value - ZOOM_STEP)
                  )
                }
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
                onClick={() =>
                  setZoom((value) =>
                    Math.min(MAX_ZOOM, value + ZOOM_STEP)
                  )
                }
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
                cursor: captureMode ? "crosshair" : "default",
                touchAction: captureMode ? "none" : "auto",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {stage.type === "performance" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sourceAsset!.image}
                  alt={stage.title}
                  draggable={false}
                  onLoad={() => setImageReady(true)}
                  className="block h-auto w-full"
                />
              ) : (
                <PdfFormPage
                  page={stage.page!}
                  onReady={() => setImageReady(true)}
                />
              )}

              {showGrid && derivedGrid ? (
                <GridOverlay grid={derivedGrid} />
              ) : null}

              {visibleCaptures.map((entry) => (
                <CaptureOverlay
                  key={entry.key}
                  capture={entry.capture!}
                  step={entry.step}
                  current={entry.key === currentKey}
                />
              ))}

              {draftRect ? (
                <CaptureOverlay
                  capture={{
                    kind: "rect",
                    points: [],
                    rect: draftRect,
                    confirmed: false,
                  }}
                  step={step}
                  current
                />
              ) : null}
            </div>
          </div>

          {sourceAsset ? (
            <div className="mt-3 flex gap-3 text-xs">
              <a
                href={sourceAsset.image}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-sky-700"
              >
                Open source PNG
              </a>
              <a
                href={sourceAsset.text}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-sky-700"
              >
                Open extracted text
              </a>
            </div>
          ) : null}
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
