"use client";

import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";

import embeddedMapV3 from "@/lib/performance/c152-coordinate-map-v3.json";

type NormalizedPoint = { x: number; y: number };
type NormalizedRect = NormalizedPoint & { width: number; height: number };

type RawRectCapture = {
  rect: NormalizedRect;
  confirmed: boolean;
};

type RawPointCapture = {
  kind: "point";
  point: NormalizedPoint;
  confirmed: boolean;
};

type RawLineCapture = {
  kind: "line";
  start: NormalizedPoint;
  end: NormalizedPoint;
  confirmed: boolean;
};

type RawPolylineCapture = {
  kind: "polyline";
  points: NormalizedPoint[];
  confirmed: boolean;
};

type RawCapture = RawRectCapture | RawPointCapture | RawLineCapture | RawPolylineCapture;

type SourceMap = {
  version: number;
  template: string;
  coordinateSystem: string;
  calibration: {
    xTicks: Array<{ id: string; value: number }>;
    yTicks: Array<{ id: string; value: number }>;
    envelopeLines?: string[];
    envelopePolylines?: string[];
  };
  captures: Record<string, RawCapture>;
};

type StoredPage = {
  dataUrl: string;
  width: number;
  height: number;
};

const sourceMap = embeddedMapV3 as unknown as SourceMap;

const TEMPLATE_FILE_NAME = "RVP.CFI.066.02Cessna152MBandPerformanceSheet.pdf";
const LOCAL_TEMPLATE_URL = `/c152/${TEMPLATE_FILE_NAME}`;
const GITHUB_TEMPLATE_URL =
  `https://raw.githubusercontent.com/AlexandreMoiteiro/briefings-next/main/public/c152/${TEMPLATE_FILE_NAME}`;
const STORAGE_KEY = "briefings_c152_cg_polyline_mapper_v4";

const ENVELOPE_IDS = [
  "p1-cg-envelope-forward",
  "p1-cg-envelope-upper",
  "p1-cg-envelope-aft",
] as const;

type EnvelopeId = (typeof ENVELOPE_IDS)[number];
type EnvelopeState = Record<EnvelopeId, RawPolylineCapture>;

const LABELS: Record<EnvelopeId, string> = {
  "p1-cg-envelope-forward": "Forward / left boundary",
  "p1-cg-envelope-upper": "Upper boundary",
  "p1-cg-envelope-aft": "Aft / right boundary",
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function asPointCapture(value: RawCapture | undefined): RawPointCapture | null {
  return value && "kind" in value && value.kind === "point" ? value : null;
}

function asRectCapture(value: RawCapture | undefined): RawRectCapture | null {
  return value && "rect" in value ? value : null;
}

function asLineCapture(value: RawCapture | undefined): RawLineCapture | null {
  return value && "kind" in value && value.kind === "line" ? value : null;
}

function initialEnvelopeState(): EnvelopeState {
  const upper = asLineCapture(sourceMap.captures["p1-cg-envelope-upper"]);
  const aft = asLineCapture(sourceMap.captures["p1-cg-envelope-aft"]);

  return {
    "p1-cg-envelope-forward": {
      kind: "polyline",
      points: [],
      confirmed: false,
    },
    "p1-cg-envelope-upper": {
      kind: "polyline",
      points: upper ? [upper.start, upper.end] : [],
      confirmed: Boolean(upper?.confirmed),
    },
    "p1-cg-envelope-aft": {
      kind: "polyline",
      points: aft ? [aft.start, aft.end] : [],
      confirmed: Boolean(aft?.confirmed),
    },
  };
}

function isEnvelopeState(value: unknown): value is EnvelopeState {
  if (!value || typeof value !== "object") return false;
  const root = value as Record<string, unknown>;
  return ENVELOPE_IDS.every((id) => {
    const candidate = root[id];
    if (!candidate || typeof candidate !== "object") return false;
    const capture = candidate as Partial<RawPolylineCapture>;
    return (
      capture.kind === "polyline" &&
      Array.isArray(capture.points) &&
      capture.points.every(
        (point) =>
          Boolean(point) &&
          typeof point === "object" &&
          typeof (point as NormalizedPoint).x === "number" &&
          typeof (point as NormalizedPoint).y === "number"
      ) &&
      typeof capture.confirmed === "boolean"
    );
  });
}

async function renderFirstPdfPage(data: Uint8Array): Promise<StoredPage> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  try {
    if (pdf.numPages !== 2) {
      throw new Error("The C152 performance sheet must contain exactly two pages.");
    }
    const pdfPage = await pdf.getPage(1);
    const viewport = pdfPage.getViewport({ scale: 2.2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is unavailable.");

    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;

    return {
      dataUrl: canvas.toDataURL("image/webp", 0.9),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    await pdf.destroy();
  }
}

async function fetchTemplatePage() {
  let lastError: unknown = null;
  for (const url of [LOCAL_TEMPLATE_URL, GITHUB_TEMPLATE_URL]) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Template fetch failed (${response.status})`);
      const page = await renderFirstPdfPage(new Uint8Array(await response.arrayBuffer()));
      return { page, source: url };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not load the C152 PDF.");
}

function PolylineOverlay({
  points,
  active,
  reference = false,
}: {
  points: NormalizedPoint[];
  active: boolean;
  reference?: boolean;
}) {
  if (points.length === 0) return null;
  const cssClass = reference ? "text-zinc-500" : active ? "text-sky-700" : "text-emerald-600";
  const polylinePoints = points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");

  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${cssClass}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {points.length > 1 ? (
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="currentColor"
          strokeWidth={reference ? 1.5 : active ? 3 : 2}
          strokeDasharray={reference ? "5 4" : undefined}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={point.x * 100}
          cy={point.y * 100}
          r={reference ? 0.35 : 0.6}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

function TickMarker({
  point,
  label,
}: {
  point: NormalizedPoint;
  label: string;
}) {
  return (
    <div
      className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-violet-700 bg-violet-300/30 text-violet-800"
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
    >
      <span className="absolute left-1/2 top-[-5px] h-6 w-px -translate-x-1/2 bg-current" />
      <span className="absolute left-[-5px] top-1/2 h-px w-6 -translate-y-1/2 bg-current" />
      <span className="absolute left-3 top-[-16px] rounded bg-white/90 px-1 text-[10px] font-bold text-violet-900">
        {label}
      </span>
    </div>
  );
}

export function C152PdfMapperV3() {
  const [pageImage, setPageImage] = useState<StoredPage | null>(null);
  const [sourceLabel, setSourceLabel] = useState("Loading repository PDF…");
  const [busy, setBusy] = useState(true);
  const [activeId, setActiveId] = useState<EnvelopeId>("p1-cg-envelope-forward");
  const [envelopes, setEnvelopes] = useState<EnvelopeState>(() => initialEnvelopeState());

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as unknown;
        if (isEnvelopeState(parsed)) setEnvelopes(parsed);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const result = await fetchTemplatePage();
        if (cancelled) return;
        setPageImage(result.page);
        setSourceLabel(
          result.source === LOCAL_TEMPLATE_URL
            ? "Original PDF loaded from this deployment."
            : "Original PDF loaded from GitHub main."
        );
      } catch (error) {
        if (!cancelled) {
          setSourceLabel(error instanceof Error ? error.message : "Could not load the repository PDF.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelopes));
  }, [envelopes]);

  const activeCapture = envelopes[activeId];
  const confirmedCount = useMemo(
    () => ENVELOPE_IDS.filter((id) => envelopes[id].confirmed).length,
    [envelopes]
  );

  const plotArea = asRectCapture(sourceMap.captures["p1-cg-plot-area"])?.rect ?? null;
  const x45 = asPointCapture(sourceMap.captures["p1-cg-x-tick-45"])?.point ?? null;
  const x50 = asPointCapture(sourceMap.captures["p1-cg-x-tick-50"])?.point ?? null;
  const y1300 = asPointCapture(sourceMap.captures["p1-cg-y-tick-1300"])?.point ?? null;
  const y1400 = asPointCapture(sourceMap.captures["p1-cg-y-tick-1400"])?.point ?? null;

  const oldForward = asLineCapture(sourceMap.captures["p1-cg-envelope-forward"]);
  const oldForwardPoints = oldForward ? [oldForward.start, oldForward.end] : [];

  function pointerPosition(event: ReactPointerEvent<HTMLDivElement>): NormalizedPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  function addPoint(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pageImage || busy) return;
    const point = pointerPosition(event);
    setEnvelopes((current) => ({
      ...current,
      [activeId]: {
        kind: "polyline",
        points: [...current[activeId].points, point],
        confirmed: false,
      },
    }));
  }

  function undoLastPoint() {
    setEnvelopes((current) => ({
      ...current,
      [activeId]: {
        kind: "polyline",
        points: current[activeId].points.slice(0, -1),
        confirmed: false,
      },
    }));
  }

  function clearBoundary() {
    setEnvelopes((current) => ({
      ...current,
      [activeId]: {
        kind: "polyline",
        points: [],
        confirmed: false,
      },
    }));
  }

  function confirmBoundary() {
    if (activeCapture.points.length < 2) return;
    setEnvelopes((current) => ({
      ...current,
      [activeId]: {
        ...current[activeId],
        confirmed: true,
      },
    }));

    const next = ENVELOPE_IDS.find((id) => id !== activeId && !envelopes[id].confirmed);
    if (next) setActiveId(next);
  }

  function resetAllEnvelopeTraces() {
    if (!window.confirm("Reset the three envelope traces? The field boxes and grid ticks are kept.")) {
      return;
    }
    setEnvelopes(initialEnvelopeState());
    setActiveId("p1-cg-envelope-forward");
  }

  function exportJson() {
    const captures: Record<string, RawCapture> = {
      ...sourceMap.captures,
      ...envelopes,
    };

    const payload = {
      version: 4,
      template: sourceMap.template,
      coordinateSystem: sourceMap.coordinateSystem,
      calibration: {
        xTicks: sourceMap.calibration.xTicks,
        yTicks: sourceMap.calibration.yTicks,
        envelopePolylines: [...ENVELOPE_IDS],
      },
      exportedAt: new Date().toISOString(),
      captures,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "c152-form-coordinate-map-v4.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Original Sevenair form · CG polyline mapper
        </p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-950">
          Trace the envelope with as many points as needed
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
          The v3 field map you supplied is now embedded in the app. The 45→50 and 1300→1400 tick
          calibration is kept. For the envelope, click successive points along the printed boundary;
          the mapper joins them as a polyline instead of forcing a single straight line.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white px-3 py-1 text-zinc-700">{sourceLabel}</span>
          <span className="rounded-full bg-white px-3 py-1 text-zinc-700">
            Envelope confirmed: {confirmedCount}/3
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-zinc-700">
            Forward points: {envelopes["p1-cg-envelope-forward"].points.length}
          </span>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm xl:sticky xl:top-5 xl:self-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              CG envelope
            </p>
            <h3 className="mt-1 text-lg font-semibold text-zinc-950">{LABELS[activeId]}</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {activeCapture.points.length} point{activeCapture.points.length === 1 ? "" : "s"}
              {activeCapture.confirmed ? " · confirmed" : ""}
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            {activeId === "p1-cg-envelope-forward"
              ? "Click along the forward boundary in order, from one end to the other. Add points wherever the boundary changes direction/curvature; 5–10 points is perfectly fine."
              : "This boundary is nearly straight, so two points are enough, but you can add more if the printed line needs it."}
          </div>

          <div className="space-y-2">
            {ENVELOPE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveId(id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                  id === activeId
                    ? "bg-sky-100 text-sky-900"
                    : "border border-zinc-200 bg-white text-zinc-700"
                }`}
              >
                <span>{LABELS[id]}</span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    envelopes[id].confirmed
                      ? "bg-emerald-500"
                      : envelopes[id].points.length > 0
                        ? "bg-amber-400"
                        : "bg-zinc-200"
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={undoLastPoint}
              disabled={activeCapture.points.length === 0}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Undo last
            </button>
            <button
              type="button"
              onClick={clearBoundary}
              disabled={activeCapture.points.length === 0}
              className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
            >
              Clear boundary
            </button>
          </div>

          <button
            type="button"
            onClick={confirmBoundary}
            disabled={activeCapture.points.length < 2}
            className="w-full rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
          >
            {activeCapture.confirmed ? "Boundary confirmed" : "Confirm boundary"}
          </button>

          <div className="rounded-2xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
            The dashed grey line is only the old v3 two-point forward reference. It is not used in
            the v4 envelope once you trace the new polyline.
          </div>

          <button
            type="button"
            onClick={exportJson}
            className="w-full rounded-xl bg-sky-700 px-3 py-2.5 text-sm font-semibold text-white"
          >
            Export JSON v4
          </button>
          <button
            type="button"
            onClick={resetAllEnvelopeTraces}
            className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700"
          >
            Reset envelope traces
          </button>
        </aside>

        <div className="overflow-auto rounded-3xl border border-zinc-200 bg-zinc-200 p-3 shadow-sm">
          {pageImage ? (
            <div
              className="relative mx-auto max-w-[1100px] cursor-crosshair touch-none select-none overflow-hidden bg-white shadow-lg"
              style={{ aspectRatio: `${pageImage.width} / ${pageImage.height}` }}
              onPointerDown={addPoint}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pageImage.dataUrl}
                alt="C152 original performance form page 1"
                draggable={false}
                className="pointer-events-none block h-auto w-full"
              />

              {plotArea ? (
                <div
                  className="pointer-events-none absolute border border-violet-500/60"
                  style={{
                    left: `${plotArea.x * 100}%`,
                    top: `${plotArea.y * 100}%`,
                    width: `${plotArea.width * 100}%`,
                    height: `${plotArea.height * 100}%`,
                  }}
                />
              ) : null}

              {x45 ? <TickMarker point={x45} label="45" /> : null}
              {x50 ? <TickMarker point={x50} label="50" /> : null}
              {y1300 ? <TickMarker point={y1300} label="1300" /> : null}
              {y1400 ? <TickMarker point={y1400} label="1400" /> : null}

              {oldForwardPoints.length > 1 ? (
                <PolylineOverlay points={oldForwardPoints} active={false} reference />
              ) : null}

              {ENVELOPE_IDS.map((id) => (
                <PolylineOverlay
                  key={id}
                  points={envelopes[id].points}
                  active={id === activeId}
                />
              ))}
            </div>
          ) : (
            <div className="mx-auto flex min-h-[720px] max-w-[900px] items-center justify-center bg-white p-10 text-center">
              <div>
                <p className="text-xl font-semibold text-zinc-950">
                  {busy ? "Loading the original C152 PDF…" : "Could not load the C152 PDF"}
                </p>
                <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">{sourceLabel}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
