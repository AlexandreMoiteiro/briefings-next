"use client";

import { useEffect, useMemo, useState } from "react";
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
};

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const STORAGE_KEY = "briefings_p2006_guided_mapper_v6";
const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;

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

function pointerPosition(event: React.PointerEvent<HTMLDivElement>) {
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

function captureIsComplete(step: GuidedStep, capture?: Capture) {
  if (!capture) return false;
  if (step.kind === "confirm") return capture.confirmed;
  if (step.kind === "rect") return Boolean(capture.rect);
  if (step.kind === "point") return capture.points.length === 1;
  if (step.kind === "points") {
    return capture.points.length === (step.requiredPoints ?? 1);
  }
  return capture.points.length >= (step.minPoints ?? 2);
}

function interpolatePoint(a: Point, b: Point, index: number): Point {
  return {
    x: a.x + (b.x - a.x) * index,
    y: a.y + (b.y - a.y) * index,
  };
}

function extrapolateSegments(points: Point[], count: number): Segment[] {
  if (points.length !== 4) return [];
  const [firstStart, firstEnd, secondStart, secondEnd] = points;
  return Array.from({ length: count }, (_, index) => ({
    start: interpolatePoint(firstStart, secondStart, index),
    end: interpolatePoint(firstEnd, secondEnd, index),
  }));
}

function segmentIntersection(first: Segment, second: Segment): Point | null {
  const x1 = first.start.x;
  const y1 = first.start.y;
  const x2 = first.end.x;
  const y2 = first.end.y;
  const x3 = second.start.x;
  const y3 = second.start.y;
  const x4 = second.end.x;
  const y4 = second.end.y;
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  if (Math.abs(denominator) < 1e-8) return null;

  const determinant1 = x1 * y2 - y1 * x2;
  const determinant2 = x3 * y4 - y3 * x4;
  return {
    x:
      (determinant1 * (x3 - x4) - (x1 - x2) * determinant2) /
      denominator,
    y:
      (determinant1 * (y3 - y4) - (y1 - y2) * determinant2) /
      denominator,
  };
}

function deriveGrid(columnSeed?: Capture, rowSeed?: Capture): DerivedGrid | null {
  if (!columnSeed || !rowSeed) return null;
  if (columnSeed.points.length !== 4 || rowSeed.points.length !== 4) return null;

  const columns = extrapolateSegments(columnSeed.points, 5);
  const rows = extrapolateSegments(rowSeed.points, 22);
  const intersections = rows.flatMap((row) =>
    columns
      .map((column) => segmentIntersection(column, row))
      .filter((point): point is Point => Boolean(point))
  );

  return { columns, rows, intersections };
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
  if (step.kind === "rect") return "Drag from one corner to the opposite corner.";
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

function SeedOverlay({
  capture,
  step,
  current,
}: {
  capture: Capture;
  step: GuidedStep;
  current: boolean;
}) {
  if (capture.kind === "confirm") return null;
  const stroke = current ? "rgb(217 70 239)" : "rgb(5 150 105)";
  const fill = current ? "rgba(217,70,239,0.12)" : "rgba(5,150,105,0.08)";

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
          background: fill,
        }}
      />
    );
  }

  const role = String(step.metadata?.role ?? "");
  const seedSegments =
    role === "regular-column-seed" || role === "regular-row-seed"
      ? [
          capture.points.slice(0, 2),
          capture.points.slice(2, 4),
        ].filter((segment) => segment.length > 1)
      : [];

  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {seedSegments.map((segment, index) => (
        <line
          key={index}
          x1={segment[0].x * 1000}
          y1={segment[0].y * 1000}
          x2={segment[1].x * 1000}
          y2={segment[1].y * 1000}
          stroke={stroke}
          strokeWidth="4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {role !== "regular-column-seed" && role !== "regular-row-seed" && capture.points.length > 1 ? (
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
          <circle cx={point.x * 1000} cy={point.y * 1000} r="7" fill={stroke} />
          {current ? (
            <text
              x={point.x * 1000 + 11}
              y={point.y * 1000 - 11}
              fill="rgb(24 24 27)"
              fontSize="19"
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

function GeneratedGridOverlay({ grid }: { grid: DerivedGrid }) {
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

function PdfFormPage({ page, onReady }: { page: 1 | 2; onReady: () => void }) {
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
          setError(reason instanceof Error ? reason.message : "Unable to render PDF page.");
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
    return <div className="p-8 text-center text-sm text-zinc-500">Rendering page…</div>;
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

export function P2006TSourceMapperV9() {
  const [registration, setRegistration] = useState<P2006TRegistration>("CS-EAQ");
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
      setCaptures(JSON.parse(saved) as CaptureStore);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const stage = STAGES[stageIndex];
  const step = stage.steps[stepIndex];
  const sourceAsset = stage.type === "performance" ? stage.source!.manifest[registration] : null;
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

  const columnSeed =
    stage.type === "performance"
      ? captures[mappingKey(stage, registration, stage.steps[0])]
      : undefined;
  const rowSeed =
    stage.type === "performance"
      ? captures[mappingKey(stage, registration, stage.steps[1])]
      : undefined;
  const gridConfirmation =
    stage.type === "performance"
      ? captures[mappingKey(stage, registration, stage.steps[2])]
      : undefined;
  const derivedGrid = stage.type === "performance" ? deriveGrid(columnSeed, rowSeed) : null;
  const showGrid = Boolean(
    derivedGrid &&
      (step.kind === "confirm" || gridConfirmation?.confirmed || showCompleted)
  );

  const stageConfirmed = stageCaptures.filter((entry) => entry.capture?.confirmed).length;

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
    if (stepIndex > 0) setStepIndex((value) => value - 1);
    else if (stageIndex > 0) {
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

  function redoSeed(targetIndex: 0 | 1) {
    const targetStep = stage.steps[targetIndex];
    const targetKey = mappingKey(stage, registration, targetStep);
    const confirmationKey = mappingKey(stage, registration, stage.steps[2]);
    setCaptures((current) => {
      const next = { ...current };
      delete next[targetKey];
      delete next[confirmationKey];
      return next;
    });
    setStepIndex(targetIndex);
    setCaptureMode(true);
    setDrag(null);
  }

  function undoLastPoint() {
    if (!currentCapture || currentCapture.kind === "rect" || currentCapture.kind === "confirm") return;
    const points = currentCapture.points.slice(0, -1);
    replaceCurrentCapture(
      points.length ? { ...currentCapture, points, confirmed: false } : undefined
    );
  }

  function finishPolyline() {
    if (step.kind !== "line" || !currentCapture || currentCapture.points.length < 2) return;
    saveAndAdvance(currentCapture);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!captureMode || !imageReady || step.kind === "confirm") return;
    const point = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (step.kind === "rect") {
      setDrag({ startX: point.x, startY: point.y, x: point.x, y: point.y });
      return;
    }

    const existing = currentCapture?.kind === step.kind ? currentCapture.points : [];
    const points = step.kind === "point" ? [point] : [...existing, point];
    const capture: Capture = { kind: step.kind, points, confirmed: false };
    const automatic =
      step.kind === "point" ||
      (step.kind === "points" && points.length >= (step.requiredPoints ?? 1)) ||
      (step.kind === "line" && step.lineMode === "segment" && points.length >= 2);

    if (automatic) saveAndAdvance(capture);
    else replaceCurrentCapture(capture);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!captureMode || step.kind !== "rect" || !drag) return;
    const point = pointerPosition(event);
    setDrag({ ...drag, x: point.x, y: point.y });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
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
      STAGES.filter((candidate) => candidate.type === "performance").flatMap((candidate) =>
        P2006T_REGISTRATIONS.map((candidateRegistration) => {
          const candidateColumnSeed = captures[
            mappingKey(candidate, candidateRegistration, candidate.steps[0])
          ];
          const candidateRowSeed = captures[
            mappingKey(candidate, candidateRegistration, candidate.steps[1])
          ];
          const candidateConfirmation = captures[
            mappingKey(candidate, candidateRegistration, candidate.steps[2])
          ];
          const grid = deriveGrid(candidateColumnSeed, candidateRowSeed);
          return [
            `${candidate.id}:${candidateRegistration}`,
            grid
              ? {
                  confirmed: Boolean(candidateConfirmation?.confirmed),
                  columns: grid.columns,
                  rows: grid.rows,
                  intersections: grid.intersections,
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
      version: 9,
      scope: {
        performanceTables: "per-registration-and-weight-page",
        sharedFormAndMassBalance: "independent-of-registration",
      },
      gridModel: {
        columns: 5,
        rows: 22,
        seed: "two-consecutive-columns-and-two-consecutive-rows",
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
        Object.entries(captures).map(([key, capture]) => [key, serialize(key, capture)])
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
            Seed, auto-complete and confirm
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            For each performance table, mark only two consecutive temperature columns and
            two consecutive result rows. The remaining grid is drawn automatically for one
            visual confirmation.
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
          const complete = candidate.steps.filter((candidateStep) =>
            captures[mappingKey(candidate, registration, candidateStep)]?.confirmed
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
              <span className="block text-sm font-semibold">{candidate.shortTitle}</span>
              <span className="mt-1 block text-xs opacity-70">
                {complete}/{candidate.steps.length} complete
                {candidate.type === "performance" ? ` · ${registration}` : " · shared"}
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
            <h3 className="mt-1 text-xl font-semibold text-zinc-950">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{step.instruction}</p>
            {captureMode ? (
              <p className="mt-2 rounded-xl bg-fuchsia-100 px-3 py-2 text-sm font-semibold text-fuchsia-900">
                {activeInstruction(step, currentCapture)}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!imageReady || (step.kind === "confirm" && !derivedGrid)}
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
                    onClick={() => redoSeed(0)}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700"
                  >
                    Redo columns
                  </button>
                  <button
                    type="button"
                    onClick={() => redoSeed(1)}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700"
                  >
                    Redo rows
                  </button>
                  {derivedGrid ? (
                    <span className="rounded-xl bg-emerald-100 px-3 py-2.5 text-sm font-semibold text-emerald-900">
                      5 columns · 22 rows · {derivedGrid.intersections.length} intersections
                    </span>
                  ) : null}
                </>
              ) : null}

              {captureMode && step.kind !== "rect" && step.kind !== "confirm" ? (
                <button
                  type="button"
                  disabled={!currentCapture?.points.length}
                  onClick={undoLastPoint}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 disabled:text-zinc-300"
                >
                  Undo last point
                </button>
              ) : null}

              {captureMode && step.kind === "line" && step.lineMode === "polyline" ? (
                <button
                  type="button"
                  onClick={finishPolyline}
                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Finish line and continue
                </button>
              ) : null}
            </div>
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
                <PdfFormPage page={stage.page!} onReady={() => setImageReady(true)} />
              )}

              {showGrid && derivedGrid ? <GeneratedGridOverlay grid={derivedGrid} /> : null}

              {visibleCaptures.map((entry) => (
                <SeedOverlay
                  key={entry.key}
                  capture={entry.capture!}
                  step={entry.step}
                  current={entry.key === currentKey}
                />
              ))}

              {draftRect ? (
                <SeedOverlay
                  capture={{ kind: "rect", points: [], rect: draftRect, confirmed: false }}
                  step={step}
                  current
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
                  {entry.capture?.confirmed ? "✓" : "—"} {index + 1}. {entry.step.title}
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
              <p className="mt-3 text-xs font-semibold text-emerald-700">{saveStatus}</p>
            ) : null}
          </section>
        </aside>
      </div>
    </section>
  );
}
