"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type PageNumber = 1 | 2;
type CaptureMode = "rect" | "point";

type MapperStep = {
  id: string;
  page: PageNumber;
  group: string;
  label: string;
  sample: string;
  mode?: CaptureMode;
  help?: string;
};

type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NormalizedPoint = {
  x: number;
  y: number;
};

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

type Capture = RectCapture | PointCapture;
type CaptureStore = Record<string, Capture>;

type StoredPage = {
  dataUrl: string;
  width: number;
  height: number;
};

type StoredForm = {
  fileName: string;
  pages: Record<PageNumber, StoredPage>;
};

const STORAGE_KEY = "briefings_c152_pdf_mapper_v1";
const DB_NAME = "briefings-c152-pdf-mapper-v1";
const DB_STORE = "form";
const DB_KEY = "c152-form";
const BUNDLED_TEMPLATE_URL =
  "/templates/c152/RVP.CFI.066.02Cessna152MBandPerformanceSheet.pdf";

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
    id: "p1-cg-x-30",
    page: 1,
    group: "Page 1 · CG graph calibration",
    label: "X-axis calibration · Moment/1000 = 30",
    sample: "X 30",
    mode: "point",
    help: "Click the intersection of the vertical 30 grid line with the bottom inner grid line. Click the line intersection, not the printed number.",
  },
  {
    id: "p1-cg-x-65",
    page: 1,
    group: "Page 1 · CG graph calibration",
    label: "X-axis calibration · Moment/1000 = 65",
    sample: "X 65",
    mode: "point",
    help: "Click the intersection of the vertical 65 grid line with the bottom inner grid line. Click the line intersection, not the printed number.",
  },
  {
    id: "p1-cg-y-1000",
    page: 1,
    group: "Page 1 · CG graph calibration",
    label: "Y-axis calibration · Weight = 1000 lb",
    sample: "Y 1000",
    mode: "point",
    help: "Click the intersection of the horizontal 1000 lb grid line with the left inner grid line. Click the line intersection, not the printed number.",
  },
  {
    id: "p1-cg-y-1700",
    page: 1,
    group: "Page 1 · CG graph calibration",
    label: "Y-axis calibration · Weight = 1700 lb",
    sample: "Y 1700",
    mode: "point",
    help: "Click the intersection of the horizontal 1700 lb grid line with the left inner grid line. Click the line intersection, not the printed number.",
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
    label: "CG graph plotting rectangle (inner grid only)",
    sample: "CG PLOT AREA",
    help: "Drag around the complete inner graph grid. Do not include the axis numbers or titles.",
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
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return {
    x: clamp01(left),
    y: clamp01(top),
    width: clamp01(Math.abs(a.x - b.x)),
    height: clamp01(Math.abs(a.y - b.y)),
  };
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

function isPointCapture(capture: Capture | undefined): capture is PointCapture {
  return capture?.kind === "point";
}

function isRectCapture(capture: Capture | undefined): capture is RectCapture {
  return Boolean(capture && "rect" in capture);
}

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

async function clearForm() {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).delete(DB_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove form."));
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

async function renderPdfBytes(data: Uint8Array, fileName: string): Promise<StoredForm> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  try {
    if (pdf.numPages !== 2) {
      throw new Error("Use the original two-page RVP.CFI.066.02 Cessna 152 PDF.");
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
    return { fileName, pages };
  } finally {
    await pdf.destroy();
  }
}

async function renderPdf(file: File) {
  return renderPdfBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

function validRect(value: unknown): value is NormalizedRect {
  if (!value || typeof value !== "object") return false;
  const rect = value as Partial<NormalizedRect>;
  return [rect.x, rect.y, rect.width, rect.height].every((part) => typeof part === "number");
}

function validPoint(value: unknown): value is NormalizedPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<NormalizedPoint>;
  return typeof point.x === "number" && typeof point.y === "number";
}

function validCapture(value: unknown): value is Capture {
  if (!value || typeof value !== "object") return false;
  const capture = value as Record<string, unknown>;
  if (typeof capture.confirmed !== "boolean") return false;
  if (capture.kind === "point") return validPoint(capture.point);
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

export function C152PdfMapper() {
  const importRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<StoredForm | null>(null);
  const [captures, setCaptures] = useState<CaptureStore>({});
  const [currentId, setCurrentId] = useState(STEPS[0].id);
  const [page, setPage] = useState<PageNumber>(1);
  const [dragStart, setDragStart] = useState<NormalizedPoint | null>(null);
  const [draftRect, setDraftRect] = useState<NormalizedRect | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setCaptures(cleanImportedCaptures(JSON.parse(raw) as unknown));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    void readForm()
      .then(async (saved) => {
        if (saved) {
          setForm(saved);
          return;
        }
        try {
          const response = await fetch(BUNDLED_TEMPLATE_URL, { cache: "no-store" });
          if (!response.ok) return;
          const rendered = await renderPdfBytes(
            new Uint8Array(await response.arrayBuffer()),
            "RVP.CFI.066.02Cessna152MBandPerformanceSheet.pdf"
          );
          setForm(rendered);
          await saveForm(rendered);
          setMessage("Bundled original C152 form loaded automatically.");
        } catch {
          // A bundled template is optional while the mapper is being calibrated.
        }
      })
      .catch(() => {
        // The mapper can still be used after selecting the form again.
      });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(captures));
  }, [captures]);

  const currentIndex = STEPS.findIndex((step) => step.id === currentId);
  const currentStep = STEPS[currentIndex] ?? STEPS[0];
  const currentCapture = captures[currentStep.id];
  const pageSteps = useMemo(() => STEPS.filter((step) => step.page === page), [page]);
  const pageGroups = useMemo(
    () => Array.from(new Set(pageSteps.map((step) => step.group))),
    [pageSteps]
  );
  const confirmedCount = useMemo(
    () => STEPS.filter((step) => captures[step.id]?.confirmed).length,
    [captures]
  );
  const graphCalibrationComplete = CG_CALIBRATION_STEPS.every(
    (step) => captures[step.id]?.confirmed
  );

  function selectStep(step: MapperStep) {
    setCurrentId(step.id);
    setPage(step.page);
    setDraftRect(null);
    setDragStart(null);
  }

  function switchPage(nextPage: PageNumber) {
    const first = STEPS.find((step) => step.page === nextPage);
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
    if (currentStep.mode === "point") {
      setCaptures((current) => ({
        ...current,
        [currentStep.id]: { kind: "point", point, confirmed: false },
      }));
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart || currentStep.mode === "point") return;
    setDraftRect(normalizedRect(dragStart, pointerPosition(event)));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart || currentStep.mode === "point") return;
    const rect = normalizedRect(dragStart, pointerPosition(event));
    setDragStart(null);
    setDraftRect(null);
    if (rect.width < 0.003 || rect.height < 0.003) return;
    setCaptures((current) => ({
      ...current,
      [currentStep.id]: { kind: "rect", rect, confirmed: false },
    }));
  }

  function confirmCurrent() {
    if (!currentCapture) return;
    setCaptures((current) => ({
      ...current,
      [currentStep.id]: { ...currentCapture, confirmed: true },
    }));
  }

  function clearCurrent() {
    setCaptures((current) => {
      const next = { ...current };
      delete next[currentStep.id];
      return next;
    });
  }

  function clearAll() {
    if (!window.confirm("Clear every C152 PDF coordinate?")) return;
    setCaptures({});
    setCurrentId(STEPS[0].id);
    setPage(1);
  }

  async function handleFormUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("Choose the original C152 PDF form.");
      return;
    }
    setBusy(true);
    setMessage("Rendering the two original PDF pages locally…");
    try {
      const rendered = await renderPdf(file);
      setForm(rendered);
      await saveForm(rendered);
      setMessage("Original form loaded and saved in this browser.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the PDF form.");
    } finally {
      setBusy(false);
    }
  }

  async function removeForm() {
    setBusy(true);
    try {
      await clearForm();
      setForm(null);
      setMessage("Local copy of the PDF form removed. Coordinate mapping was preserved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove the local form.");
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    const payload = {
      version: 2,
      template: "RVP.CFI.066.02 Cessna C152 M&B and Performance Data Sheet",
      coordinateSystem: "normalized-top-left",
      exportedAt: new Date().toISOString(),
      graphCalibration: {
        xAxis: { unit: "moment-lb-in/1000", lowValue: 30, highValue: 65 },
        yAxis: { unit: "weight-lb", lowValue: 1000, highValue: 1700 },
        captureIds: {
          xLow: "p1-cg-x-30",
          xHigh: "p1-cg-x-65",
          yLow: "p1-cg-y-1000",
          yHigh: "p1-cg-y-1700",
        },
      },
      captures,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "c152-form-coordinate-map.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJson(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const cleaned = cleanImportedCaptures(parsed);
      setCaptures(cleaned);
      setMessage(
        `Imported ${Object.keys(cleaned).length} mapped fields. Existing v1 maps are preserved; add the four CG calibration points and export again.`
      );
    } catch {
      setMessage("Invalid coordinate JSON.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  const visibleRect =
    draftRect ?? (isRectCapture(currentCapture) ? currentCapture.rect : null);
  const pageImage = form?.pages[page];

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Original Sevenair form · mapper
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Map the writable cells and calibrate the original CG graph
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
              Rectangular fields are mapped by dragging. The four CG calibration references are
              mapped with a single click on the actual grid-line intersection. Existing v1 JSON maps
              can be imported without losing the fields you already confirmed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">
              {busy ? "Preparing…" : form ? "Replace PDF" : "Choose original PDF"}
              <input
                type="file"
                accept="application/pdf"
                disabled={busy}
                onChange={(event) => void handleFormUpload(event)}
                className="sr-only"
              />
            </label>
            {form ? (
              <button
                type="button"
                onClick={() => void removeForm()}
                disabled={busy}
                className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700"
              >
                Remove local PDF
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white px-3 py-1 text-zinc-700">
            {form?.fileName ?? "No PDF loaded"}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-zinc-700">
            {confirmedCount}/{STEPS.length} confirmed
          </span>
          <span
            className={`rounded-full px-3 py-1 ${
              graphCalibrationComplete
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            CG axes: {graphCalibrationComplete ? "calibrated" : "4 points required"}
          </span>
        </div>
        {message ? <p className="mt-3 text-sm font-medium text-sky-900">{message}</p> : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm xl:sticky xl:top-5 xl:self-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Guided field mapping
            </p>
            <h3 className="mt-1 text-lg font-semibold text-zinc-950">{currentStep.label}</h3>
            <p className="mt-1 text-xs text-zinc-500">{currentStep.group}</p>
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
              {currentCapture?.confirmed ? "Confirmed" : "Confirm field"}
            </button>
            <button
              type="button"
              onClick={clearCurrent}
              disabled={!currentCapture}
              className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
            >
              Clear field
            </button>
          </div>

          <div className="rounded-2xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
            <p className="font-semibold text-zinc-800">How to capture</p>
            <p>
              {currentStep.help ??
                (currentStep.mode === "point"
                  ? "Click once on the exact reference point."
                  : "Drag tightly inside the blank cell.")}
            </p>
            {currentCapture ? (
              <pre className="mt-2 overflow-auto rounded-xl bg-white p-2 text-[11px]">
                {JSON.stringify(
                  isPointCapture(currentCapture) ? currentCapture.point : currentCapture.rect,
                  null,
                  2
                )}
              </pre>
            ) : null}
          </div>

          <div className="max-h-[440px] space-y-3 overflow-auto pr-1">
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
                onClick={() => setPreview((value) => !value)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  preview
                    ? "bg-amber-500 text-zinc-950"
                    : "border border-zinc-200 bg-white text-zinc-700"
                }`}
              >
                {preview ? "Exit preview" : "Preview samples"}
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importJson(file);
                }}
              />
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700"
              >
                Import JSON
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="rounded-xl bg-sky-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700"
              >
                Clear all
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
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pageImage.dataUrl}
                  alt={`C152 original form page ${page}`}
                  draggable={false}
                  className="pointer-events-none block h-auto w-full"
                />

                {STEPS.filter((step) => step.page === page).map((step) => {
                  const capture = captures[step.id];
                  if (!capture) return null;
                  const active = step.id === currentStep.id;

                  if (isPointCapture(capture)) {
                    return (
                      <div
                        key={step.id}
                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                        style={pointStyle(capture.point)}
                      >
                        <div
                          className={`h-5 w-5 rounded-full border-2 bg-white/80 ${
                            active
                              ? "border-sky-700"
                              : capture.confirmed
                                ? "border-emerald-600"
                                : "border-amber-500"
                          }`}
                        >
                          <span className="absolute left-1/2 top-[-5px] h-7 w-px -translate-x-1/2 bg-current" />
                          <span className="absolute left-[-5px] top-1/2 h-px w-7 -translate-y-1/2 bg-current" />
                        </div>
                        {preview ? (
                          <span className="absolute left-4 top-[-10px] whitespace-nowrap rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-zinc-900 shadow">
                            {step.sample}
                          </span>
                        ) : null}
                      </div>
                    );
                  }

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
                      {preview && step.id === "p1-cg-plot-area" ? (
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-sky-800">
                          CG PLOT AREA
                        </span>
                      ) : null}
                    </div>
                  );
                })}

                {visibleRect && !preview && currentStep.page === page ? (
                  <div
                    className="pointer-events-none absolute border-2 border-sky-700 bg-sky-400/20"
                    style={rectStyle(visibleRect)}
                  />
                ) : null}
              </div>
            ) : (
              <div className="mx-auto flex min-h-[720px] max-w-[900px] items-center justify-center bg-white p-10 text-center">
                <div>
                  <p className="text-xl font-semibold text-zinc-950">Load the original C152 PDF first</p>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-500">
                    Choose RVP.CFI.066.02 above. If the canonical template is later bundled under
                    public/templates/c152, this mapper will load it automatically.
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
