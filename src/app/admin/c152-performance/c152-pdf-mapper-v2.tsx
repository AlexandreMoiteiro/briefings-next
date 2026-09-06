"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import embeddedCoordinateMap from "@/lib/performance/c152-coordinate-map.json";

type PageNumber = 1 | 2;
type CaptureMode = "rect" | "point" | "line";

type MapperStep = {
  id: string;
  page: PageNumber;
  group: string;
  label: string;
  sample: string;
  mode?: CaptureMode;
  help?: string;
};

type NormalizedPoint = { x: number; y: number };
type NormalizedRect = NormalizedPoint & { width: number; height: number };

type RectCapture = {
  kind?: "rect";
  rect: NormalizedRect;
  confirmed: boolean;
};

type PointCapture = {
  kind: "point";
  point: NormalizedPoint;
  confirmed: boolean;
};

type LineCapture = {
  kind: "line";
  start: NormalizedPoint;
  end: NormalizedPoint;
  confirmed: boolean;
};

type Capture = RectCapture | PointCapture | LineCapture;
type CaptureStore = Record<string, Capture>;

type StoredPage = {
  dataUrl: string;
  width: number;
  height: number;
};

type StoredForm = {
  fileName: string;
  pages: Record<PageNumber, StoredPage>;
  sourceUrl?: string;
};

const STORAGE_KEY = "briefings_c152_pdf_mapper_v2";
const DB_NAME = "briefings-c152-pdf-mapper-v1";
const DB_STORE = "form";
const DB_KEY = "c152-form";
const TEMPLATE_FILE_NAME = "RVP.CFI.066.02Cessna152MBandPerformanceSheet.pdf";
const LOCAL_TEMPLATE_URL = `/c152/${TEMPLATE_FILE_NAME}`;
const GITHUB_TEMPLATE_URL =
  `https://raw.githubusercontent.com/AlexandreMoiteiro/briefings-next/main/public/c152/${TEMPLATE_FILE_NAME}`;

const PAGE_ONE_ROWS = [
  ["basic-empty-weight", "Basic Empty Weight"],
  ["usable-fuel", "Usable Fuel"],
  ["pilot-passenger", "Pilot & Passenger"],
  ["baggage-area-1", "Baggage Area 1"],
  ["baggage-area-2", "Baggage Area 2"],
  ["ramp", "Ramp Weight & Moment"],
  ["start-taxi-runup", "Start / Taxi / Run-up"],
  ["takeoff", "Takeoff Weight & Moment"],
] as const;

const PAGE_ONE_FIELDS = [
  ["weight", "Weight", "1237"],
  ["arm", "Arm", "32.27"],
  ["moment", "Moment", "39.91"],
] as const;

const AIRFIELD_FIELDS = [
  ["airfield", "Airfield", "LPSO"],
  ["rwy-qfu", "RWY QFU", "27"],
  ["elevation", "Elevation", "740"],
  ["qnh", "QNH", "1013"],
  ["temperature", "Temperature", "18"],
  ["wind", "Wind", "240/08"],
  ["pressure-altitude", "Pressure Altitude", "740"],
  ["density-altitude", "Density Altitude", "1120"],
  ["toda", "TODA", "1200"],
  ["todr", "TODR", "515"],
  ["lda", "LDA", "1200"],
  ["ldr", "LDR", "470"],
  ["roc", "ROC", "620"],
] as const;

const ROLES = [
  ["departure", "Departure"],
  ["arrival", "Arrival"],
  ["alternate", "Alternate"],
] as const;

const FUEL_ROWS = [
  ["startup-taxi", "(1) Start-up and Taxi"],
  ["climb", "(2) Climb"],
  ["enroute", "(3) Enroute"],
  ["descent", "(4) Descent"],
  ["trip-fuel", "(5) Trip Fuel"],
  ["contingency", "(6) Contingency 5%"],
  ["alternate", "(7) Alternate"],
  ["reserve", "(8) Reserve 45 min."],
  ["required-ramp", "(9) Required Ramp Fuel"],
  ["extra", "(10) Extra"],
  ["total-ramp", "(11) Total Ramp Fuel"],
] as const;

const CG_CALIBRATION_STEPS: MapperStep[] = [
  {
    id: "p1-cg-x-tick-45",
    page: 1,
    group: "Page 1 · CG graph calibration",
    label: "X grid tick · Moment/1000 = 45",
    sample: "45",
    mode: "point",
    help: "Click the centre of the vertical major grid line at 45. The X coordinate is what matters; do not click the printed number.",
  },
  {
    id: "p1-cg-x-tick-50",
    page: 1,
    group: "Page 1 · CG graph calibration",
    label: "X grid tick · Moment/1000 = 50",
    sample: "50",
    mode: "point",
    help: "Click the next consecutive vertical major grid line at 50. The 45→50 spacing defines the X scale.",
  },
  {
    id: "p1-cg-y-tick-1300",
    page: 1,
    group: "Page 1 · CG graph calibration",
    label: "Y grid tick · Weight = 1300 lb",
    sample: "1300",
    mode: "point",
    help: "Click the centre of the horizontal major grid line at 1300 lb. The Y coordinate is what matters; do not click the printed number.",
  },
  {
    id: "p1-cg-y-tick-1400",
    page: 1,
    group: "Page 1 · CG graph calibration",
    label: "Y grid tick · Weight = 1400 lb",
    sample: "1400",
    mode: "point",
    help: "Click the next consecutive horizontal major grid line at 1400 lb. The 1300→1400 spacing defines the Y scale.",
  },
  {
    id: "p1-cg-envelope-forward",
    page: 1,
    group: "Page 1 · CG envelope lines",
    label: "Envelope · forward / left boundary",
    sample: "FWD",
    mode: "line",
    help: "Drag directly along the centre of the printed forward/left envelope boundary, from one visible end to the other.",
  },
  {
    id: "p1-cg-envelope-upper",
    page: 1,
    group: "Page 1 · CG envelope lines",
    label: "Envelope · upper boundary",
    sample: "TOP",
    mode: "line",
    help: "Drag directly along the short upper boundary of the printed envelope.",
  },
  {
    id: "p1-cg-envelope-aft",
    page: 1,
    group: "Page 1 · CG envelope lines",
    label: "Envelope · aft / right boundary",
    sample: "AFT",
    mode: "line",
    help: "Drag directly along the centre of the printed aft/right envelope boundary, from one visible end to the other.",
  },
];

const STEPS: MapperStep[] = [
  ...PAGE_ONE_ROWS.flatMap(([rowId, rowLabel]) =>
    PAGE_ONE_FIELDS.map(([fieldId, fieldLabel, sample]) => ({
      id: `p1-${rowId}-${fieldId}`,
      page: 1 as const,
      group: "Page 1 · Loading data",
      label: `${rowLabel} · ${fieldLabel}`,
      sample,
    }))
  ),
  {
    id: "p1-mtow",
    page: 1,
    group: "Page 1 · Limits",
    label: "MTOW value",
    sample: "1670",
  },
  {
    id: "p1-mlw",
    page: 1,
    group: "Page 1 · Limits",
    label: "MLW value",
    sample: "1670",
  },
  {
    id: "p1-cg-plot-area",
    page: 1,
    group: "Page 1 · CG graph",
    label: "CG graph outer plotting rectangle",
    sample: "CG PLOT AREA",
    help: "Already embedded from the approved JSON. This rectangle is only the graph reference area; scale calibration comes from consecutive ticks.",
  },
  ...CG_CALIBRATION_STEPS,
  {
    id: "p2-date",
    page: 2,
    group: "Page 2 · Header",
    label: "Date",
    sample: "05/09/2026",
  },
  {
    id: "p2-registration",
    page: 2,
    group: "Page 2 · Header",
    label: "Aircraft Reg.",
    sample: "CS-AVC",
  },
  ...ROLES.flatMap(([roleId, roleLabel]) =>
    AIRFIELD_FIELDS.map(([fieldId, fieldLabel, sample]) => ({
      id: `p2-${roleId}-${fieldId}`,
      page: 2 as const,
      group: `Page 2 · ${roleLabel}`,
      label: `${roleLabel} · ${fieldLabel}`,
      sample,
    }))
  ),
  ...FUEL_ROWS.flatMap(([rowId, rowLabel]) => [
    {
      id: `p2-fuel-${rowId}-time`,
      page: 2 as const,
      group: "Page 2 · Fuel Planning",
      label: `${rowLabel} · Time`,
      sample: rowId === "reserve" ? "00:45" : "00:20",
    },
    {
      id: `p2-fuel-${rowId}-fuel`,
      page: 2 as const,
      group: "Page 2 · Fuel Planning",
      label: `${rowLabel} · Fuel`,
      sample: "3.8",
    },
  ]),
];

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normalizedRect(a: NormalizedPoint, b: NormalizedPoint): NormalizedRect {
  return {
    x: clamp01(Math.min(a.x, b.x)),
    y: clamp01(Math.min(a.y, b.y)),
    width: clamp01(Math.abs(a.x - b.x)),
    height: clamp01(Math.abs(a.y - b.y)),
  };
}

function pointDistance(a: NormalizedPoint, b: NormalizedPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function rectStyle(rect: NormalizedRect) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

function pointStyle(point: NormalizedPoint) {
  return {
    left: `${point.x * 100}%`,
    top: `${point.y * 100}%`,
  };
}

function isRectCapture(capture: Capture | undefined): capture is RectCapture {
  return Boolean(capture && "rect" in capture);
}

function isPointCapture(capture: Capture | undefined): capture is PointCapture {
  return capture?.kind === "point";
}

function isLineCapture(capture: Capture | undefined): capture is LineCapture {
  return capture?.kind === "line";
}

function validPoint(value: unknown): value is NormalizedPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<NormalizedPoint>;
  return typeof point.x === "number" && typeof point.y === "number";
}

function validRect(value: unknown): value is NormalizedRect {
  if (!value || typeof value !== "object") return false;
  const rect = value as Partial<NormalizedRect>;
  return (
    typeof rect.x === "number" &&
    typeof rect.y === "number" &&
    typeof rect.width === "number" &&
    typeof rect.height === "number"
  );
}

function validCapture(value: unknown): value is Capture {
  if (!value || typeof value !== "object") return false;
  const capture = value as Record<string, unknown>;
  if (typeof capture.confirmed !== "boolean") return false;
  if (capture.kind === "point") return validPoint(capture.point);
  if (capture.kind === "line") return validPoint(capture.start) && validPoint(capture.end);
  return validRect(capture.rect);
}

function cleanImportedCaptures(value: unknown): CaptureStore {
  if (!value || typeof value !== "object") return {};
  const root = value as Record<string, unknown>;
  const raw =
    root.captures && typeof root.captures === "object"
      ? (root.captures as Record<string, unknown>)
      : root;
  const allowed = new Set(STEPS.map((step) => step.id));
  const output: CaptureStore = {};
  for (const [key, candidate] of Object.entries(raw)) {
    if (allowed.has(key) && validCapture(candidate)) output[key] = candidate;
  }
  return output;
}

const DEFAULT_CAPTURES = cleanImportedCaptures(embeddedCoordinateMap);
const CALIBRATION_IDS = new Set(CG_CALIBRATION_STEPS.map((step) => step.id));

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DB_STORE)) database.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
}

async function saveForm(form: StoredForm) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put(form, DB_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save form."));
    });
  } finally {
    database.close();
  }
}

async function readForm() {
  const database = await openDatabase();
  try {
    return await new Promise<StoredForm | null>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readonly");
      const request = transaction.objectStore(DB_STORE).get(DB_KEY);
      request.onsuccess = () => resolve((request.result as StoredForm | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read form."));
    });
  } finally {
    database.close();
  }
}

function canvasToStoredPage(canvas: HTMLCanvasElement): StoredPage {
  const maxWidth = 1500;
  const scale = Math.min(1, maxWidth / canvas.width);
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(canvas.width * scale));
  output.height = Math.max(1, Math.round(canvas.height * scale));
  const context = output.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is unavailable.");
  context.fillStyle = "white";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0, output.width, output.height);

  let quality = 0.9;
  let dataUrl = output.toDataURL("image/webp", quality);
  while (dataUrl.length > 3_500_000 && quality > 0.5) {
    quality -= 0.1;
    dataUrl = output.toDataURL("image/webp", quality);
  }
  return { dataUrl, width: output.width, height: output.height };
}

async function renderPdfBytes(data: Uint8Array, fileName: string, sourceUrl?: string) {
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
    const pages = {} as Record<PageNumber, StoredPage>;
    for (const pageNumber of [1, 2] as const) {
      const pdfPage = await pdf.getPage(pageNumber);
      const viewport = pdfPage.getViewport({ scale: 2.2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas is unavailable.");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
      pages[pageNumber] = canvasToStoredPage(canvas);
    }
    return { fileName, pages, sourceUrl } satisfies StoredForm;
  } finally {
    await pdf.destroy();
  }
}

async function renderPdf(file: File) {
  return renderPdfBytes(new Uint8Array(await file.arrayBuffer()), file.name, "local-fallback");
}

async function fetchAndRenderTemplate(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Template fetch failed (${response.status})`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("pdf") && !url.includes("raw.githubusercontent.com")) {
    throw new Error("Template URL did not return a PDF.");
  }
  return renderPdfBytes(new Uint8Array(await response.arrayBuffer()), TEMPLATE_FILE_NAME, url);
}

function LineOverlay({
  line,
  active,
  draft = false,
}: {
  line: { start: NormalizedPoint; end: NormalizedPoint };
  active: boolean;
  draft?: boolean;
}) {
  const className = draft
    ? "text-sky-700"
    : active
      ? "text-sky-700"
      : "text-emerald-600";
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        x1={line.start.x * 100}
        y1={line.start.y * 100}
        x2={line.end.x * 100}
        y2={line.end.y * 100}
        stroke="currentColor"
        strokeWidth={active || draft ? 3 : 2}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={line.start.x * 100} cy={line.start.y * 100} r="0.55" fill="currentColor" />
      <circle cx={line.end.x * 100} cy={line.end.y * 100} r="0.55" fill="currentColor" />
    </svg>
  );
}

export function C152PdfMapperV2() {
  const [form, setForm] = useState<StoredForm | null>(null);
  const [captures, setCaptures] = useState<CaptureStore>({ ...DEFAULT_CAPTURES });
  const [currentId, setCurrentId] = useState(CG_CALIBRATION_STEPS[0].id);
  const [page, setPage] = useState<PageNumber>(1);
  const [dragStart, setDragStart] = useState<NormalizedPoint | null>(null);
  const [draftRect, setDraftRect] = useState<NormalizedRect | null>(null);
  const [draftLine, setDraftLine] = useState<{ start: NormalizedPoint; end: NormalizedPoint } | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading the original C152 sheet from the repository…");

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setCaptures({ ...DEFAULT_CAPTURES, ...cleanImportedCaptures(JSON.parse(raw) as unknown) });
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    let cancelled = false;
    void (async () => {
      setBusy(true);
      const candidates = [LOCAL_TEMPLATE_URL, GITHUB_TEMPLATE_URL];
      for (const url of candidates) {
        try {
          const rendered = await fetchAndRenderTemplate(url);
          if (cancelled) return;
          setForm(rendered);
          await saveForm(rendered);
          setMessage(
            url === LOCAL_TEMPLATE_URL
              ? "Original C152 PDF loaded directly from this deployment."
              : "Original C152 PDF loaded directly from GitHub main."
          );
          setBusy(false);
          return;
        } catch {
          // Try the next repository source.
        }
      }

      try {
        const cached = await readForm();
        if (!cancelled && cached) {
          setForm(cached);
          setMessage("Repository PDF could not be fetched; using the browser's cached copy.");
        } else if (!cancelled) {
          setMessage("Repository PDF could not be fetched. Use the local PDF fallback button.");
        }
      } catch {
        if (!cancelled) setMessage("Repository PDF could not be fetched. Use the local PDF fallback button.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(captures));
  }, [captures]);

  const currentIndex = STEPS.findIndex((step) => step.id === currentId);
  const currentStep = STEPS[currentIndex] ?? STEPS[0];
  const currentCapture = captures[currentStep.id];
  const currentMode = currentStep.mode ?? "rect";
  const pageSteps = useMemo(() => STEPS.filter((step) => step.page === page), [page]);
  const pageGroups = useMemo(
    () => Array.from(new Set(pageSteps.map((step) => step.group))),
    [pageSteps]
  );
  const confirmedCount = useMemo(
    () => STEPS.filter((step) => captures[step.id]?.confirmed).length,
    [captures]
  );
  const calibrationCount = useMemo(
    () => CG_CALIBRATION_STEPS.filter((step) => captures[step.id]?.confirmed).length,
    [captures]
  );

  function selectStep(step: MapperStep) {
    setCurrentId(step.id);
    setPage(step.page);
    setDragStart(null);
    setDraftRect(null);
    setDraftLine(null);
  }

  function switchPage(nextPage: PageNumber) {
    const firstUnconfirmed = STEPS.find(
      (step) => step.page === nextPage && !captures[step.id]?.confirmed
    );
    const first = firstUnconfirmed ?? STEPS.find((step) => step.page === nextPage);
    if (first) selectStep(first);
  }

  function move(delta: number) {
    const next = Math.min(STEPS.length - 1, Math.max(0, currentIndex + delta));
    selectStep(STEPS[next]);
  }

  function pointerPosition(event: ReactPointerEvent<HTMLDivElement>): NormalizedPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!form || preview || currentStep.page !== page) return;
    const point = pointerPosition(event);
    if (currentMode === "point") {
      setCaptures((current) => ({
        ...current,
        [currentStep.id]: { kind: "point", point, confirmed: false },
      }));
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    if (currentMode === "rect") {
      setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
    } else {
      setDraftLine({ start: point, end: point });
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const point = pointerPosition(event);
    if (currentMode === "rect") setDraftRect(normalizedRect(dragStart, point));
    if (currentMode === "line") setDraftLine({ start: dragStart, end: point });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const end = pointerPosition(event);
    const start = dragStart;
    setDragStart(null);
    setDraftRect(null);
    setDraftLine(null);

    if (currentMode === "rect") {
      const rect = normalizedRect(start, end);
      if (rect.width < 0.003 || rect.height < 0.003) return;
      setCaptures((current) => ({
        ...current,
        [currentStep.id]: { kind: "rect", rect, confirmed: false },
      }));
      return;
    }

    if (currentMode === "line") {
      if (pointDistance(start, end) < 0.01) return;
      setCaptures((current) => ({
        ...current,
        [currentStep.id]: { kind: "line", start, end, confirmed: false },
      }));
    }
  }

  function confirmCurrent() {
    if (!currentCapture) return;
    setCaptures((current) => ({
      ...current,
      [currentStep.id]: { ...currentCapture, confirmed: true } as Capture,
    }));
    const nextUnconfirmed = STEPS.slice(currentIndex + 1).find(
      (step) => !captures[step.id]?.confirmed
    );
    if (nextUnconfirmed) selectStep(nextUnconfirmed);
  }

  function clearCurrent() {
    setCaptures((current) => {
      const next = { ...current };
      if (currentStep.id in DEFAULT_CAPTURES) next[currentStep.id] = DEFAULT_CAPTURES[currentStep.id];
      else delete next[currentStep.id];
      return next;
    });
  }

  function resetCalibration() {
    if (!window.confirm("Reset only the CG tick and envelope calibration?")) return;
    setCaptures((current) => {
      const next = { ...current };
      for (const id of CALIBRATION_IDS) delete next[id];
      return next;
    });
    selectStep(CG_CALIBRATION_STEPS[0]);
  }

  async function reloadRepositoryPdf() {
    setBusy(true);
    setMessage("Reloading the original C152 PDF from the repository…");
    try {
      for (const url of [LOCAL_TEMPLATE_URL, GITHUB_TEMPLATE_URL]) {
        try {
          const rendered = await fetchAndRenderTemplate(url);
          setForm(rendered);
          await saveForm(rendered);
          setMessage(
            url === LOCAL_TEMPLATE_URL
              ? "Original C152 PDF reloaded from this deployment."
              : "Original C152 PDF reloaded from GitHub main."
          );
          return;
        } catch {
          // Continue to the next source.
        }
      }
      throw new Error("Could not fetch the C152 PDF from the repository.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reload the repository PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFallbackUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("Choose a PDF file.");
      return;
    }
    setBusy(true);
    setMessage("Rendering the local fallback PDF…");
    try {
      const rendered = await renderPdf(file);
      setForm(rendered);
      await saveForm(rendered);
      setMessage("Local fallback PDF loaded. Coordinate JSON remains embedded in the app.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the fallback PDF.");
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    const payload = {
      version: 3,
      template: embeddedCoordinateMap.template,
      coordinateSystem: "normalized-top-left",
      calibration: {
        xTicks: [
          { id: "p1-cg-x-tick-45", value: 45 },
          { id: "p1-cg-x-tick-50", value: 50 },
        ],
        yTicks: [
          { id: "p1-cg-y-tick-1300", value: 1300 },
          { id: "p1-cg-y-tick-1400", value: 1400 },
        ],
        envelopeLines: [
          "p1-cg-envelope-forward",
          "p1-cg-envelope-upper",
          "p1-cg-envelope-aft",
        ],
      },
      exportedAt: new Date().toISOString(),
      captures,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "c152-form-coordinate-map-v3.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const pageImage = form?.pages[page];

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Original Sevenair form · repository-backed
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              C152 field map is embedded — only graph calibration remains
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
              The approved field rectangles are loaded from source code. The original two-page PDF is fetched automatically from the repository, so no PDF or JSON upload is required for normal use.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void reloadRepositoryPdf()}
              disabled={busy}
              className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Loading…" : "Reload repository PDF"}
            </button>
            <label className="cursor-pointer rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700">
              Local PDF fallback
              <input
                type="file"
                accept="application/pdf"
                disabled={busy}
                onChange={(event) => void handleFallbackUpload(event)}
                className="sr-only"
              />
            </label>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white px-3 py-1 text-zinc-700">
            {form?.fileName ?? "PDF loading"}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-zinc-700">
            Embedded fields: {Object.keys(DEFAULT_CAPTURES).length}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-zinc-700">
            CG calibration: {calibrationCount}/{CG_CALIBRATION_STEPS.length}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-zinc-700">
            Total confirmed: {confirmedCount}/{STEPS.length}
          </span>
        </div>
        {message ? <p className="mt-3 text-sm font-medium text-sky-900">{message}</p> : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm xl:sticky xl:top-5 xl:self-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Guided mapping · {currentMode}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-zinc-950">{currentStep.label}</h3>
            <p className="mt-1 text-xs text-zinc-500">{currentStep.group}</p>
          </div>

          <div className="rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            {currentStep.help ??
              (currentMode === "rect"
                ? "Drag tightly inside the blank cell."
                : currentMode === "point"
                  ? "Click exactly on the requested grid tick."
                  : "Drag from one end of the printed line to the other.")}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={currentIndex === 0}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              disabled={currentIndex === STEPS.length - 1}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={confirmCurrent}
              disabled={!currentCapture}
              className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:bg-zinc-300"
            >
              {currentCapture?.confirmed ? "Confirmed" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={clearCurrent}
              disabled={!currentCapture}
              className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
            >
              Clear / restore
            </button>
          </div>

          {currentCapture ? (
            <pre className="max-h-40 overflow-auto rounded-xl bg-zinc-50 p-2 text-[10px] leading-4 text-zinc-600">
              {JSON.stringify(currentCapture, null, 2)}
            </pre>
          ) : null}

          <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
            {pageGroups.map((group) => (
              <div key={group}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {group.replace(/^Page \d · /, "")}
                </p>
                <div className="space-y-1">
                  {pageSteps
                    .filter((step) => step.group === group)
                    .map((step) => {
                      const capture = captures[step.id];
                      const active = step.id === currentStep.id;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => selectStep(step)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                            active
                              ? "bg-sky-100 font-semibold text-sky-900"
                              : "text-zinc-700 hover:bg-zinc-50"
                          }`}
                        >
                          <span className="pr-2">{step.label}</span>
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                              capture?.confirmed
                                ? "bg-emerald-500"
                                : capture
                                  ? "bg-amber-400"
                                  : "bg-zinc-200"
                            }`}
                          />
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="flex gap-2">
              {[1, 2].map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => switchPage(pageNumber as PageNumber)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    page === pageNumber ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  Page {pageNumber}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => selectStep(CG_CALIBRATION_STEPS[0])}
                className="rounded-xl bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-900"
              >
                CG calibration
              </button>
              <button
                type="button"
                onClick={() => setPreview((value) => !value)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  preview ? "bg-amber-500 text-zinc-950" : "border border-zinc-200 bg-white text-zinc-700"
                }`}
              >
                {preview ? "Exit preview" : "Preview samples"}
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="rounded-xl bg-sky-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Export JSON v3
              </button>
              <button
                type="button"
                onClick={resetCalibration}
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700"
              >
                Reset CG calibration
              </button>
            </div>
          </div>

          <div className="overflow-auto rounded-3xl border border-zinc-200 bg-zinc-200 p-3 shadow-sm">
            {pageImage ? (
              <div
                className={`relative mx-auto max-w-[1100px] select-none overflow-hidden bg-white shadow-lg ${
                  preview ? "cursor-default" : "cursor-crosshair touch-none"
                }`}
                style={{ aspectRatio: `${pageImage.width} / ${pageImage.height}` }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                  setDragStart(null);
                  setDraftRect(null);
                  setDraftLine(null);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pageImage.dataUrl}
                  alt={`C152 original form page ${page}`}
                  draggable={false}
                  className="block h-auto w-full pointer-events-none"
                />

                {STEPS.filter((step) => step.page === page).map((step) => {
                  const capture = captures[step.id];
                  if (!capture) return null;
                  const active = step.id === currentStep.id;

                  if (isRectCapture(capture)) {
                    return (
                      <div
                        key={step.id}
                        className={`pointer-events-none absolute border-2 ${
                          active
                            ? "border-sky-600 bg-sky-400/20"
                            : capture.confirmed
                              ? "border-emerald-500 bg-emerald-400/10"
                              : "border-amber-500 bg-amber-400/10"
                        }`}
                        style={rectStyle(capture.rect)}
                      >
                        {preview && step.id !== "p1-cg-plot-area" ? (
                          <span className="absolute inset-0 flex items-center justify-center overflow-hidden px-1 text-center text-[clamp(7px,1.15vw,14px)] font-semibold text-zinc-950">
                            {step.sample}
                          </span>
                        ) : null}
                      </div>
                    );
                  }

                  if (isPointCapture(capture)) {
                    return (
                      <div
                        key={step.id}
                        className={`pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                          active
                            ? "border-sky-700 bg-sky-300/40"
                            : capture.confirmed
                              ? "border-emerald-600 bg-emerald-300/30"
                              : "border-amber-600 bg-amber-300/30"
                        }`}
                        style={pointStyle(capture.point)}
                      >
                        <span className="absolute left-1/2 top-[-6px] h-8 w-px -translate-x-1/2 bg-current" />
                        <span className="absolute left-[-6px] top-1/2 h-px w-8 -translate-y-1/2 bg-current" />
                      </div>
                    );
                  }

                  if (isLineCapture(capture)) {
                    return <LineOverlay key={step.id} line={capture} active={active} />;
                  }

                  return null;
                })}

                {draftRect && currentMode === "rect" ? (
                  <div
                    className="pointer-events-none absolute border-2 border-sky-700 bg-sky-400/20"
                    style={rectStyle(draftRect)}
                  />
                ) : null}

                {draftLine && currentMode === "line" ? (
                  <LineOverlay line={draftLine} active draft />
                ) : null}
              </div>
            ) : (
              <div className="mx-auto flex min-h-[720px] max-w-[900px] items-center justify-center bg-white p-10 text-center">
                <div>
                  <p className="text-xl font-semibold text-zinc-950">Loading the repository C152 PDF</p>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-500">
                    The mapper first tries /c152/{TEMPLATE_FILE_NAME}, then the same file on GitHub main. No JSON upload is required.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
