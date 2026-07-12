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
  if (step.kind === "rect") return Boolean(capture.rect);
  if (step.kind === "point") return capture.points.length === 1;
  if (step.kind === "points") {
    return capture.points.length === (step.requiredPoints ?? 1);
  }
  return capture.points.length >= (step.minPoints ?? 2);
}

function pointsForPanel(points: Point[]) {
  if (points.length !== 4) return points;
  return [points[0], points[1], points[3], points[2], points[0]];
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
  if (step.kind === "point") return "Click the requested point. It will save and advance automatically.";
  if (step.kind === "points") {
    const done = capture?.points.length ?? 0;
    return `Click point ${done + 1} of ${step.requiredPoints ?? 1}. The task advances automatically after the final point.`;
  }
  if (step.lineMode === "segment") {
    const done = capture?.points.length ?? 0;
    return `Click endpoint ${done + 1} of 2. The task advances automatically after the second point.`;
  }
  return "Click along the line in order. Use Undo when needed, then press Finish line and continue.";
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
      >
        {current ? (
          <span className="absolute left-0 top-0 max-w-64 truncate rounded-br bg-zinc-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {step.title}
          </span>
        ) : null}
      </div>
    );
  }

  const displayPoints =
    step.kind === "points" && step.requiredPoints === 4
      ? pointsForPanel(capture.points)
      : capture.points;

  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {displayPoints.length > 1 ? (
        <polyline
          points={displayPoints
            .map((point) => `${point.x * 1000},${point.y * 1000}`)
            .join(" ")}
          fill={step.kind === "points" && step.requiredPoints === 4 ? fill : "none"}
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
            r="7"
            fill={stroke}
          />
          {current ? (
            <text
              x={point.x * 1000 + 11}
              y={point.y * 1000 - 11}
              fill="rgb(24 24 27)"
              fontSize="19"
              fontWeight="700"
            >
              {capture.points.length > 1 ? index + 1 : step.title}
            </text>
          ) : null}
        </g>
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
        destroyTask = () => {
          void loadingTask.destroy();
        };
        const pdf = await loadingTask.promise;
        const pdfPage = await pdf.getPage(page);
        const viewport = pdfPage.getViewport({ scale: 2.1 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });

        if (!context) throw new Error("Canvas is unavailable.");

        await pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise;

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
    return (
      <div className="flex min-h-96 items-center justify-center p-8 text-center text-sm text-red-700">
        <div>
          <p className="font-semibold">Unable to render form page {page}</p>
          <p className="mt-2">{error}</p>
          <a
            href="/api/p2006-form"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block font-semibold underline"
          >
            Open the original PDF
          </a>
        </div>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="flex min-h-96 items-center justify-center text-sm text-zinc-500">
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
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [zoom, setZoom] = useState(100);

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
  const sourceAsset =
    stage.type === "performance" ? stage.source!.manifest[registration] : null;
  const currentKey = mappingKey(stage, registration, step);
  const currentCapture = captures[currentKey];
  const currentComplete = captureIsComplete(step, currentCapture);
  const draftRect = drag ? rectFromDrag(drag) : null;
  const isSharedStage = stage.type !== "performance";

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

  const totalItems = STAGES.reduce(
    (sum, candidate) => sum + candidate.steps.length,
    0
  );
  const totalConfirmed = STAGES.reduce(
    (sum, candidate) =>
      sum +
      candidate.steps.filter((candidateStep) => {
        const key = mappingKey(candidate, registration, candidateStep);
        return captures[key]?.confirmed;
      }).length,
    0
  );

  function resetInteraction() {
    setCaptureMode(false);
    setDrag(null);
  }

  function goToStage(nextStageIndex: number) {
    setStageIndex(nextStageIndex);
    setStepIndex(0);
    resetInteraction();
    setImageReady(false);
    setSaveStatus("");
    setZoom(100);
  }

  function goNext() {
    if (stepIndex < stage.steps.length - 1) {
      setStepIndex((current) => current + 1);
    } else if (stageIndex < STAGES.length - 1) {
      goToStage(stageIndex + 1);
      return;
    }
    resetInteraction();
  }

  function goPrevious() {
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
    } else if (stageIndex > 0) {
      const previousStageIndex = stageIndex - 1;
      setStageIndex(previousStageIndex);
      setStepIndex(STAGES[previousStageIndex].steps.length - 1);
      setImageReady(false);
      setZoom(100);
    }
    resetInteraction();
  }

  function replaceCurrentCapture(capture: Capture | undefined) {
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
    setCaptureMode(false);
    setDrag(null);
    window.setTimeout(goNext, 180);
  }

  function beginCapture() {
    replaceCurrentCapture(undefined);
    setCaptureMode(true);
    setDrag(null);
  }

  function cancelCapture() {
    replaceCurrentCapture(undefined);
    resetInteraction();
  }

  function undoLastPoint() {
    if (!currentCapture || currentCapture.kind === "rect") return;
    const points = currentCapture.points.slice(0, -1);
    replaceCurrentCapture(
      points.length > 0
        ? { ...currentCapture, points, confirmed: false }
        : undefined
    );
  }

  function finishPolyline() {
    if (step.kind !== "line" || !currentCapture || !currentComplete) return;
    saveAndAdvance(currentCapture);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!captureMode || !imageReady) return;
    const point = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (step.kind === "rect") {
      setDrag({ startX: point.x, startY: point.y, x: point.x, y: point.y });
      return;
    }

    const existingPoints =
      currentCapture && currentCapture.kind === step.kind
        ? currentCapture.points
        : [];
    const points = step.kind === "point" ? [point] : [...existingPoints, point];
    const nextCapture: Capture = {
      kind: step.kind,
      points,
      confirmed: false,
    };

    const autoComplete =
      step.kind === "point" ||
      (step.kind === "points" &&
        points.length >= (step.requiredPoints ?? 1)) ||
      (step.kind === "line" &&
        step.lineMode === "segment" &&
        points.length >= (step.maxPoints ?? 2));

    if (autoComplete) {
      saveAndAdvance(nextCapture);
      return;
    }

    replaceCurrentCapture(nextCapture);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!captureMode || step.kind !== "rect" || !drag) return;
    const point = pointerPosition(event);
    setDrag({ ...drag, x: point.x, y: point.y });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!captureMode || step.kind !== "rect" || !drag) return;
    const point = pointerPosition(event);
    const rect = rectFromDrag({ ...drag, x: point.x, y: point.y });
    saveAndAdvance({
      kind: "rect",
      points: [],
      rect,
      confirmed: false,
    });
  }

  function saveCaptures() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(captures));
    setSaveStatus("Guided mapping saved in this browser.");
  }

  function exportCaptures() {
    const serializeCapture = (key: string, capture: Capture) => {
      const isPdfGeometry =
        key.startsWith("shared:mass-balance-graph:") ||
        key.startsWith("shared:form-page-");

      return {
        ...capture,
        normalizedPoints: capture.points,
        normalizedRect: capture.rect ?? null,
        pdfPoints: isPdfGeometry
          ? capture.points.map((point) => ({
              x: point.x * A4_WIDTH_PT,
              y: (1 - point.y) * A4_HEIGHT_PT,
            }))
          : null,
        pdfRect:
          isPdfGeometry && capture.rect
            ? {
                x: capture.rect.x * A4_WIDTH_PT,
                y: (1 - capture.rect.y - capture.rect.height) * A4_HEIGHT_PT,
                width: capture.rect.width * A4_WIDTH_PT,
                height: capture.rect.height * A4_HEIGHT_PT,
                pageSize: [A4_WIDTH_PT, A4_HEIGHT_PT],
                origin: "bottom-left",
              }
            : null,
      };
    };

    const performanceByRegistration = Object.fromEntries(
      P2006T_REGISTRATIONS.map((candidateRegistration) => [
        candidateRegistration,
        Object.fromEntries(
          Object.entries(captures)
            .filter(([key]) => key.includes(`:${candidateRegistration}:`))
            .map(([key, capture]) => [key, serializeCapture(key, capture)])
        ),
      ])
    );

    const sharedFormAndGraph = Object.fromEntries(
      Object.entries(captures)
        .filter(([key]) => key.startsWith("shared:"))
        .map(([key, capture]) => [key, serializeCapture(key, capture)])
    );

    downloadJson("p2006t-guided-coordinate-map.json", {
      version: 6,
      scope: {
        performanceTables: "per-registration",
        massBalanceGraph: "shared-across-P2006T-registrations",
        formFields: "shared-across-P2006T-registrations",
      },
      performanceSources: Object.fromEntries(
        P2006T_REGISTRATIONS.map((candidateRegistration) => [
          candidateRegistration,
          PERFORMANCE_SOURCES.map((source) => ({
            id: source.id,
            asset: source.manifest[candidateRegistration],
          })),
        ])
      ),
      coordinateSystem: {
        normalized: "x/y 0..1 with top-left origin",
        pdf: "A4 points with bottom-left origin",
      },
      stageDefinitions: STAGES.map((candidate) => ({
        id: candidate.id,
        type: candidate.type,
        page: candidate.page ?? null,
        shared: candidate.type !== "performance",
        steps: candidate.steps.map((candidateStep) => ({
          id: candidateStep.id,
          group: candidateStep.group,
          title: candidateStep.title,
          kind: candidateStep.kind,
          metadata: candidateStep.metadata ?? null,
        })),
      })),
      performanceByRegistration,
      sharedFormAndGraph,
    });
  }

  const visibleCaptures = stageCaptures.filter((entry) => {
    if (!entry.capture) return false;
    if (entry.key === currentKey) return true;
    return showConfirmed && entry.capture.confirmed;
  });

  return (
    <section className="space-y-5 rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Guided geometry capture
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            One clear task, one capture, automatic advance
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            Use zoom and scroll to place points precisely. Takeoff and landing table
            geometry is stored separately for each aircraft. The M&B graph and both form
            pages are shared and independent of registration.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {stage.type === "performance" ? (
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Aircraft for this AFM table
              </span>
              <select
                value={registration}
                onChange={(event) => {
                  setRegistration(event.target.value as P2006TRegistration);
                  setStepIndex(0);
                  resetInteraction();
                  setImageReady(false);
                  setZoom(100);
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
          <a
            href="/api/p2006-form"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100"
          >
            Open original PDF
          </a>
        </div>
      </div>

      <nav className="grid gap-2 md:grid-cols-5">
        {STAGES.map((candidate, index) => {
          const confirmed = candidate.steps.filter((candidateStep) => {
            const key = mappingKey(candidate, registration, candidateStep);
            return captures[key]?.confirmed;
          }).length;

          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => goToStage(index)}
              className={[
                "rounded-2xl border p-3 text-left transition",
                index === stageIndex
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-sky-200 bg-white text-zinc-700 hover:border-zinc-400",
              ].join(" ")}
            >
              <span className="block text-xs font-semibold uppercase tracking-wide opacity-60">
                Step {index + 1}
              </span>
              <span className="mt-1 block text-sm font-semibold">
                {candidate.shortTitle}
              </span>
              <span className="mt-1 block text-xs opacity-70">
                {confirmed}/{candidate.steps.length} complete
                {candidate.type === "performance" ? ` · ${registration}` : " · shared"}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-zinc-950">{stage.title}</p>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
                {stage.description}
                {sourceAsset
                  ? ` PDF page ${sourceAsset.pdfPage} · printed AFM page ${sourceAsset.printedPage}.`
                  : ` Original PDF page ${stage.page}.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600">
                <input
                  type="checkbox"
                  checked={showConfirmed}
                  onChange={(event) => setShowConfirmed(event.target.checked)}
                />
                Show completed geometry
              </label>
              <span
                className={[
                  "rounded-full px-2 py-1 text-xs font-semibold",
                  imageReady
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-900",
                ].join(" ")}
              >
                {imageReady ? "Page ready" : "Loading page"}
              </span>
            </div>
          </div>

          <section className="mb-3 rounded-2xl border-2 border-sky-300 bg-sky-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Current task · {stepIndex + 1}/{stage.steps.length} · {step.group}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-zinc-950">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm font-medium leading-6 text-zinc-700">
                  {step.instruction}
                </p>
                {captureMode ? (
                  <p className="mt-2 rounded-xl bg-fuchsia-100 px-3 py-2 text-sm font-semibold text-fuchsia-900">
                    {activeInstruction(step, currentCapture)}
                  </p>
                ) : null}
              </div>

              <div className="flex min-w-56 flex-col gap-2">
                {!captureMode ? (
                  <>
                    <button
                      type="button"
                      disabled={!imageReady}
                      onClick={beginCapture}
                      className="rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:bg-zinc-300"
                    >
                      {currentCapture?.confirmed
                        ? `Redo — ${startButtonLabel(step)}`
                        : startButtonLabel(step)}
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                    >
                      Skip this task
                    </button>
                  </>
                ) : (
                  <>
                    {step.kind === "line" && step.lineMode === "polyline" ? (
                      <button
                        type="button"
                        disabled={!currentComplete}
                        onClick={finishPolyline}
                        className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-zinc-300"
                      >
                        Finish line and continue
                      </button>
                    ) : null}
                    {step.kind !== "rect" ? (
                      <button
                        type="button"
                        disabled={!currentCapture?.points.length}
                        onClick={undoLastPoint}
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-600 disabled:text-zinc-300"
                      >
                        Undo last point
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={cancelCapture}
                      className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700"
                    >
                      Cancel this capture
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Zoom
              </span>
              <button
                type="button"
                onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))}
                disabled={zoom <= MIN_ZOOM}
                className="h-9 w-9 rounded-lg border border-zinc-200 bg-white text-lg font-semibold disabled:text-zinc-300"
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
                className="w-36"
              />
              <button
                type="button"
                onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))}
                disabled={zoom >= MAX_ZOOM}
                className="h-9 w-9 rounded-lg border border-zinc-200 bg-white text-lg font-semibold disabled:text-zinc-300"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600"
              >
                Fit
              </button>
              <span className="min-w-14 text-right font-mono text-xs font-semibold text-zinc-600">
                {zoom}%
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Enlarge, then use the scrollbars to pan around the page.
            </p>
          </div>

          <div className="max-h-[78vh] overflow-auto rounded-2xl border border-zinc-300 bg-zinc-100 p-2">
            <div
              className="relative mx-auto select-none bg-white"
              style={{
                width: `${zoom}%`,
                cursor: captureMode && imageReady ? "crosshair" : "default",
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
                  alt={`${stage.title} source page`}
                  draggable={false}
                  onLoad={() => setImageReady(true)}
                  onError={() => setImageReady(false)}
                  className="block h-auto w-full"
                />
              ) : (
                <PdfFormPage
                  page={stage.page!}
                  onReady={() => setImageReady(true)}
                />
              )}

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
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
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
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Stage progress
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950">
                  {stageConfirmed}/{stage.steps.length}
                </p>
              </div>
              <span className="text-xs font-semibold text-zinc-500">
                {Math.round((stageConfirmed / stage.steps.length) * 100)}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{
                  width: `${(stageConfirmed / stage.steps.length) * 100}%`,
                }}
              />
            </div>
            <label className="mt-4 block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Jump to task
              </span>
              <select
                value={stepIndex}
                onChange={(event) => {
                  setStepIndex(Number(event.target.value));
                  resetInteraction();
                }}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                {stageCaptures.map((entry, index) => (
                  <option key={entry.key} value={index}>
                    {entry.capture?.confirmed ? "✓" : "—"} {index + 1}. {entry.step.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={stageIndex === 0 && stepIndex === 0}
                onClick={goPrevious}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600 disabled:text-zinc-300"
              >
                Previous task
              </button>
              <button
                type="button"
                onClick={goNext}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600"
              >
                Next task
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Mapping scope
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {isSharedStage
                ? "This geometry is saved once and reused by CS-EAQ, CS-EBX and D-GSEV."
                : `This AFM table geometry belongs only to ${registration}.`}
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Save and export
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              {totalConfirmed}/{totalItems} current-scope items complete. The JSON separates
              per-aircraft performance tables from the shared form and M&B geometry.
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={saveCaptures}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Save browser progress
              </button>
              <button
                type="button"
                onClick={exportCaptures}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
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
