"use client";

import { useEffect, useMemo, useState } from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";

type Rect = { x: number; y: number; width: number; height: number };
type MappingKind = "source-region" | "text" | "number" | "graph";
type MappingItem = {
  id: string;
  label: string;
  instruction: string;
  kind: MappingKind;
};
type SavedMapping = { rect: Rect; confirmed: boolean };
type MappingStore = Record<string, SavedMapping>;
type DragState = {
  startX: number;
  startY: number;
  x: number;
  y: number;
} | null;

type SourceAsset = {
  image: string;
  text: string;
  pdfPage: number;
  printedPage: string;
};

type PerformanceSourceDefinition = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  manifest: Record<P2006TRegistration, SourceAsset>;
};

type Stage = {
  id: string;
  type: "afm" | "form";
  title: string;
  shortTitle: string;
  description: string;
  items: MappingItem[];
  source?: PerformanceSourceDefinition;
  page?: 1 | 2;
};

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const STORAGE_KEY = "briefings_p2006_guided_mapper_v4";

const AFM_ITEMS: MappingItem[] = [
  {
    id: "complete-performance-table",
    label: "Complete performance table",
    instruction:
      "Draw one rectangle around the complete published table containing both ground-roll and 50 ft values.",
    kind: "source-region",
  },
  {
    id: "published-corrections",
    label: "Published corrections",
    instruction:
      "Draw a rectangle around the published wind, paved-runway and runway-slope corrections.",
    kind: "source-region",
  },
  {
    id: "pressure-altitude-column",
    label: "Pressure-altitude column",
    instruction:
      "Draw a rectangle around the pressure-altitude labels used to select interpolation rows.",
    kind: "source-region",
  },
  {
    id: "temperature-headings",
    label: "Temperature headings",
    instruction:
      "Draw a rectangle around the OAT headings used to select interpolation columns.",
    kind: "source-region",
  },
  {
    id: "ground-roll-values",
    label: "Ground-roll values",
    instruction:
      "Draw a rectangle around the ground-roll values only. They remain linked to this same source page.",
    kind: "source-region",
  },
  {
    id: "fifty-foot-values",
    label: "50 ft values",
    instruction:
      "Draw a rectangle around the distance-over-50-ft values only.",
    kind: "source-region",
  },
];

const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] = [
  {
    id: "takeoff",
    title: "Takeoff source page",
    shortTitle: "AFM Takeoff",
    description:
      "Ground roll and distance over 50 ft are mapped from the same takeoff page.",
    manifest: {
      "CS-EAQ": {
        image: "/p2006-performance-pages/CS-EAQ/page-171.png",
        text: "/p2006-performance-pages/CS-EAQ/page-171.txt",
        pdfPage: 171,
        printedPage: "5-7",
      },
      "CS-EBX": {
        image: "/p2006-performance-pages/CS-EBX/page-171.png",
        text: "/p2006-performance-pages/CS-EBX/page-171.txt",
        pdfPage: 171,
        printedPage: "5-7",
      },
      "D-GSEV": {
        image: "/p2006-performance-pages/D-GSEV/page-169.png",
        text: "/p2006-performance-pages/D-GSEV/page-169.txt",
        pdfPage: 169,
        printedPage: "5-7",
      },
    },
  },
  {
    id: "landing",
    title: "Landing source page",
    shortTitle: "AFM Landing",
    description:
      "Ground roll and distance over 50 ft are mapped from the same landing page.",
    manifest: {
      "CS-EAQ": {
        image: "/p2006-performance-pages/CS-EAQ/page-185.png",
        text: "/p2006-performance-pages/CS-EAQ/page-185.txt",
        pdfPage: 185,
        printedPage: "5-21",
      },
      "CS-EBX": {
        image: "/p2006-performance-pages/CS-EBX/page-185.png",
        text: "/p2006-performance-pages/CS-EBX/page-185.txt",
        pdfPage: 185,
        printedPage: "5-21",
      },
      "D-GSEV": {
        image: "/p2006-performance-pages/D-GSEV/page-183.png",
        text: "/p2006-performance-pages/D-GSEV/page-183.txt",
        pdfPage: 183,
        printedPage: "5-21",
      },
    },
  },
];

const FORM_PAGE_1_ITEMS: MappingItem[] = [
  {
    id: "pilot-front-seat-mass",
    label: "Pilot and front-seat mass",
    instruction:
      "Draw the writable rectangle in the YOUR AIRPLANE column for Pilot & Front Seat.",
    kind: "number",
  },
  {
    id: "rear-seats-mass",
    label: "Rear-seats mass",
    instruction:
      "Draw the writable rectangle in the YOUR AIRPLANE column for Rear Seats.",
    kind: "number",
  },
  {
    id: "fuel-mass",
    label: "Fuel mass",
    instruction:
      "Draw the writable rectangle in the YOUR AIRPLANE column for Fuel Mass.",
    kind: "number",
  },
  {
    id: "baggage-mass",
    label: "Baggage mass",
    instruction:
      "Draw the writable rectangle in the YOUR AIRPLANE column for Baggage.",
    kind: "number",
  },
  {
    id: "mass-balance-graph",
    label: "Mass and balance graph area",
    instruction:
      "Draw one rectangle around the complete graphical area. Later this will be used to plot points and the mass-and-balance path.",
    kind: "graph",
  },
];

const AIRFIELD_COLUMNS = ["departure", "arrival", "alternate"] as const;
const AIRFIELD_ROWS = [
  ["runway-qfu", "RWY QFU", "text"],
  ["elevation", "Elevation", "number"],
  ["qnh", "QNH", "number"],
  ["temperature", "Temperature", "number"],
  ["wind", "Wind", "text"],
  ["pressure-altitude", "Pressure altitude", "number"],
  ["density-altitude", "Density altitude", "number"],
] as const;
const PERFORMANCE_ROWS = [
  ["toda", "TODA"],
  ["todr", "TODR"],
  ["lda", "LDA"],
  ["ldr", "LDR"],
  ["roc", "ROC"],
] as const;
const FUEL_ROWS = [
  "Start-up and Taxi",
  "Climb",
  "Enroute",
  "Descent",
  "Trip Fuel",
  "Contingency 5%",
  "Alternate",
  "Reserve 45 min",
  "Required Ramp Fuel",
  "Extra",
  "Total Ramp Fuel",
] as const;

const FORM_PAGE_2_ITEMS: MappingItem[] = [
  {
    id: "date",
    label: "Date",
    instruction: "Draw the writable rectangle beside Date.",
    kind: "text",
  },
  {
    id: "aircraft-registration",
    label: "Aircraft registration",
    instruction: "Draw the writable rectangle beside Aircraft Reg.",
    kind: "text",
  },
  ...AIRFIELD_COLUMNS.map((column) => ({
    id: `${column}-airfield`,
    label: `${column[0].toUpperCase()}${column.slice(1)} airfield`,
    instruction: `Draw the ${column} Airfield rectangle.`,
    kind: "text" as const,
  })),
  ...AIRFIELD_ROWS.flatMap(([rowId, rowLabel, kind]) =>
    AIRFIELD_COLUMNS.map((column) => ({
      id: `${column}-${rowId}`,
      label: `${column[0].toUpperCase()}${column.slice(1)} ${rowLabel}`,
      instruction: `Draw the ${rowLabel} rectangle in the ${column} column.`,
      kind: kind as MappingKind,
    }))
  ),
  ...PERFORMANCE_ROWS.flatMap(([rowId, rowLabel]) =>
    AIRFIELD_COLUMNS.map((column) => ({
      id: `${column}-${rowId}`,
      label: `${column[0].toUpperCase()}${column.slice(1)} ${rowLabel}`,
      instruction: `Draw the ${rowLabel} rectangle in the ${column} performance column.`,
      kind: "number" as const,
    }))
  ),
  ...FUEL_ROWS.flatMap((rowLabel, index) =>
    (["time", "fuel"] as const).map((column) => ({
      id: `fuel-${index + 1}-${column}`,
      label: `${rowLabel} · ${column === "time" ? "Time" : "Fuel"}`,
      instruction: `Draw the ${column} rectangle for fuel-planning row ${index + 1}: ${rowLabel}.`,
      kind: column === "time" ? ("text" as const) : ("number" as const),
    }))
  ),
];

const STAGES: Stage[] = [
  ...PERFORMANCE_SOURCES.map((source) => ({
    id: `afm-${source.id}`,
    type: "afm" as const,
    title: source.title,
    shortTitle: source.shortTitle,
    description: source.description,
    source,
    items: AFM_ITEMS,
  })),
  {
    id: "form-page-1",
    type: "form",
    title: "Form page 1",
    shortTitle: "Form page 1",
    description: "Loading entries and the mass-and-balance graph.",
    page: 1,
    items: FORM_PAGE_1_ITEMS,
  },
  {
    id: "form-page-2",
    type: "form",
    title: "Form page 2",
    shortTitle: "Form page 2",
    description: "Airfield, performance and fuel-planning writable cells.",
    page: 2,
    items: FORM_PAGE_2_ITEMS,
  },
];

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

function mappingKey(
  stage: Stage,
  registration: P2006TRegistration,
  item: MappingItem
) {
  return stage.type === "afm"
    ? `${stage.id}:${registration}:${item.id}`
    : `${stage.id}:${item.id}`;
}

function RectOverlay({
  rect,
  label,
  status,
}: {
  rect: Rect;
  label: string;
  status: "confirmed" | "current" | "other" | "draft";
}) {
  const styles = {
    confirmed: "border-emerald-600 bg-emerald-400/10",
    current: "border-amber-500 bg-amber-300/20",
    other: "border-sky-500/60 bg-sky-300/5",
    draft: "border-fuchsia-600 bg-fuchsia-300/15 border-dashed",
  }[status];

  return (
    <div
      className={`pointer-events-none absolute border-2 ${styles}`}
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`,
        height: `${rect.height * 100}%`,
      }}
    >
      <span className="absolute left-0 top-0 max-w-56 truncate rounded-br bg-zinc-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {label}
      </span>
    </div>
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
        const viewport = pdfPage.getViewport({ scale: 1.7 });
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

        if (!cancelled) {
          setImageUrl(canvas.toDataURL("image/png"));
        }

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
  const [itemIndex, setItemIndex] = useState(0);
  const [mappings, setMappings] = useState<MappingStore>({});
  const [drawMode, setDrawMode] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);
  const [imageReady, setImageReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      setMappings(JSON.parse(saved) as MappingStore);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const stage = STAGES[stageIndex];
  const item = stage.items[itemIndex];
  const sourceAsset =
    stage.type === "afm" ? stage.source!.manifest[registration] : null;
  const currentKey = mappingKey(stage, registration, item);
  const currentMapping = mappings[currentKey];

  const stageMappings = useMemo(
    () =>
      stage.items.map((candidate) => {
        const key = mappingKey(stage, registration, candidate);
        return { item: candidate, key, mapping: mappings[key] };
      }),
    [mappings, registration, stage]
  );

  const stageConfirmed = stageMappings.filter(
    (entry) => entry.mapping?.confirmed
  ).length;
  const totalItems = STAGES.reduce(
    (sum, candidate) => sum + candidate.items.length,
    0
  );
  const totalConfirmed = STAGES.reduce(
    (sum, candidate) =>
      sum +
      candidate.items.filter((candidateItem) => {
        const key = mappingKey(candidate, registration, candidateItem);
        return mappings[key]?.confirmed;
      }).length,
    0
  );
  const draftRect = drag ? rectFromDrag(drag) : null;

  function goToStage(nextStageIndex: number) {
    setStageIndex(nextStageIndex);
    setItemIndex(0);
    setDrawMode(false);
    setDrag(null);
    setImageReady(false);
    setSaveStatus("");
  }

  function goNext() {
    if (itemIndex < stage.items.length - 1) {
      setItemIndex((current) => current + 1);
    } else if (stageIndex < STAGES.length - 1) {
      goToStage(stageIndex + 1);
      return;
    }
    setDrawMode(false);
    setDrag(null);
  }

  function goPrevious() {
    if (itemIndex > 0) {
      setItemIndex((current) => current - 1);
    } else if (stageIndex > 0) {
      const previousStageIndex = stageIndex - 1;
      setStageIndex(previousStageIndex);
      setItemIndex(STAGES[previousStageIndex].items.length - 1);
      setImageReady(false);
    }
    setDrawMode(false);
    setDrag(null);
  }

  function confirmCurrent() {
    if (!currentMapping) return;
    setMappings((current) => ({
      ...current,
      [currentKey]: { ...currentMapping, confirmed: true },
    }));
    goNext();
  }

  function clearCurrent() {
    setMappings((current) => {
      const next = { ...current };
      delete next[currentKey];
      return next;
    });
    setDrawMode(false);
    setDrag(null);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!drawMode || !imageReady) return;
    const point = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ startX: point.x, startY: point.y, x: point.x, y: point.y });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drawMode || !drag) return;
    const point = pointerPosition(event);
    setDrag({ ...drag, x: point.x, y: point.y });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!drawMode || !drag) return;
    const point = pointerPosition(event);
    const rect = rectFromDrag({ ...drag, x: point.x, y: point.y });
    setMappings((current) => ({
      ...current,
      [currentKey]: { rect, confirmed: false },
    }));
    setDrag(null);
    setDrawMode(false);
  }

  function saveMappings() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
    setSaveStatus("Guided mapping saved in this browser.");
  }

  function exportMappings() {
    const entries = Object.fromEntries(
      Object.entries(mappings).map(([key, value]) => {
        const isForm = key.startsWith("form-page-");
        return [
          key,
          {
            ...value,
            normalizedRect: value.rect,
            pdfRect: isForm
              ? {
                  x: value.rect.x * A4_WIDTH_PT,
                  y: (1 - value.rect.y - value.rect.height) * A4_HEIGHT_PT,
                  width: value.rect.width * A4_WIDTH_PT,
                  height: value.rect.height * A4_HEIGHT_PT,
                  pageSize: [A4_WIDTH_PT, A4_HEIGHT_PT],
                  origin: "bottom-left",
                }
              : null,
          },
        ];
      })
    );

    downloadJson("p2006t-guided-coordinate-map.json", {
      version: 4,
      registration,
      performanceSources: PERFORMANCE_SOURCES.map((source) => ({
        id: source.id,
        asset: source.manifest[registration],
      })),
      coordinateSystem: {
        normalized: "x/y 0..1 with top-left origin",
        pdf: "A4 points with bottom-left origin",
      },
      mappings: entries,
    });
  }

  return (
    <section className="space-y-5 rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Manual guided mapper
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Draw one requested area at a time
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            No rectangles are pre-positioned. Select Draw rectangle, drag over the exact
            source or writable area, then confirm it. Takeoff and landing are the first
            two performance sources; additional performance pages can be added later.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Aircraft
            </span>
            <select
              value={registration}
              onChange={(event) => {
                setRegistration(event.target.value as P2006TRegistration);
                setStageIndex(0);
                setItemIndex(0);
                setDrawMode(false);
                setImageReady(false);
              }}
              className="block rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
            >
              {P2006T_REGISTRATIONS.map((candidate) => (
                <option key={candidate}>{candidate}</option>
              ))}
            </select>
          </label>
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

      <nav className="grid gap-2 md:grid-cols-4">
        {STAGES.map((candidate, index) => {
          const confirmed = candidate.items.filter((candidateItem) => {
            const key = mappingKey(candidate, registration, candidateItem);
            return mappings[key]?.confirmed;
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
                {confirmed}/{candidate.items.length} confirmed
              </span>
            </button>
          );
        })}
      </nav>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_430px]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-zinc-950">{stage.title}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                {stage.description}
                {sourceAsset
                  ? ` PDF page ${sourceAsset.pdfPage} · printed AFM page ${sourceAsset.printedPage}.`
                  : ` Original PDF page ${stage.page}.`}
              </p>
            </div>
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

          <div className="max-h-[78vh] overflow-auto rounded-2xl border border-zinc-300 bg-zinc-100 p-2">
            <div
              className="relative mx-auto w-full max-w-[920px] select-none bg-white"
              style={{ cursor: drawMode && imageReady ? "crosshair" : "default" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {stage.type === "afm" ? (
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

              {stageMappings.map((entry) =>
                entry.mapping ? (
                  <RectOverlay
                    key={entry.key}
                    rect={entry.mapping.rect}
                    label={entry.item.label}
                    status={
                      entry.key === currentKey
                        ? "current"
                        : entry.mapping.confirmed
                          ? "confirmed"
                          : "other"
                    }
                  />
                ) : null
              )}

              {draftRect ? (
                <RectOverlay
                  rect={draftRect}
                  label={item.label}
                  status="draft"
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
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Current task
              </p>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                {itemIndex + 1}/{stage.items.length}
              </span>
            </div>
            <h3 className="mt-2 text-xl font-semibold text-zinc-950">
              {item.label}
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {item.instruction}
            </p>

            <div
              className={[
                "mt-4 rounded-2xl border p-4 text-sm",
                currentMapping
                  ? currentMapping.confirmed
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-amber-200 bg-amber-50 text-amber-950"
                  : "border-sky-200 bg-sky-50 text-sky-950",
              ].join(" ")}
            >
              {currentMapping ? (
                <>
                  <p className="font-semibold">
                    {currentMapping.confirmed
                      ? "Rectangle confirmed"
                      : "Rectangle drawn — confirm or redraw it"}
                  </p>
                  <p className="mt-1 font-mono text-xs leading-5 opacity-80">
                    x {currentMapping.rect.x.toFixed(4)} · y{" "}
                    {currentMapping.rect.y.toFixed(4)} · w{" "}
                    {currentMapping.rect.width.toFixed(4)} · h{" "}
                    {currentMapping.rect.height.toFixed(4)}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">No rectangle defined yet</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">
                    Press Draw rectangle, then drag across the exact area on the page.
                  </p>
                </>
              )}
            </div>

            {drawMode ? (
              <div className="mt-4 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-sm font-semibold text-fuchsia-900">
                Drag on the page now. Release to save the rectangle.
              </div>
            ) : null}

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                disabled={!imageReady}
                onClick={() => {
                  setDrawMode(true);
                  setDrag(null);
                }}
                className="rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:bg-zinc-300"
              >
                {currentMapping ? "Redraw rectangle" : "Draw rectangle"}
              </button>
              <button
                type="button"
                disabled={!currentMapping}
                onClick={confirmCurrent}
                className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-zinc-300"
              >
                Confirm rectangle and continue
              </button>
              <button
                type="button"
                disabled={!currentMapping}
                onClick={clearCurrent}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:text-zinc-300"
              >
                Clear rectangle
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={stageIndex === 0 && itemIndex === 0}
                onClick={goPrevious}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600 disabled:text-zinc-300"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={goNext}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600"
              >
                Skip / next
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Stage progress
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">
              {stageConfirmed}/{stage.items.length}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{
                  width: `${(stageConfirmed / stage.items.length) * 100}%`,
                }}
              />
            </div>
            <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
              {stageMappings.map((entry, index) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => {
                    setItemIndex(index);
                    setDrawMode(false);
                    setDrag(null);
                  }}
                  className={[
                    "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs",
                    index === itemIndex
                      ? "bg-zinc-950 text-white"
                      : "hover:bg-zinc-50",
                  ].join(" ")}
                >
                  <span className="truncate pr-2">{entry.item.label}</span>
                  <span className="font-semibold">
                    {entry.mapping?.confirmed
                      ? "✓"
                      : entry.mapping
                        ? "drawn"
                        : "—"}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Save and export
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              {totalConfirmed}/{totalItems} rectangles confirmed for {registration}.
              Form rectangles export in A4 PDF points; AFM regions export in normalized
              image coordinates.
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={saveMappings}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Save browser progress
              </button>
              <button
                type="button"
                onClick={exportMappings}
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
