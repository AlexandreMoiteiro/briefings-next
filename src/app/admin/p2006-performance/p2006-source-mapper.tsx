"use client";

import { useEffect, useMemo, useState } from "react";
import { PDFDocument } from "pdf-lib";
import rawDataset from "@/lib/performance/p2006t-distance-tables.json";
import {
  P2006T_DISTANCE_KINDS,
  type P2006TDistanceKind,
  type P2006TDistanceTable,
} from "@/lib/performance/p2006t-distance";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import { P2006T_FORM_PAGE_1_WEBP_BASE64 } from "@/lib/pdf/p2006t-form-page-1";
import { P2006T_FORM_PAGE_2_WEBP_BASE64 } from "@/lib/pdf/p2006t-form-page-2";

type Workspace = "afm" | "form";
type DrawMode = "point" | "rectangle" | "polyline";
type Point = { x: number; y: number };
type Mark = {
  id: string;
  label: string;
  mode: DrawMode;
  points: Point[];
};
type MarkMaps = Record<string, Mark[]>;

type DragState = {
  start: Point;
  current: Point;
} | null;

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const STORAGE_KEY = "briefings_p2006_coordinate_maps_v2";

const TABLE_LABELS: Record<P2006TDistanceKind, string> = {
  "takeoff-ground-roll": "Takeoff ground roll",
  "takeoff-50ft": "Takeoff over 50 ft",
  "landing-ground-roll": "Landing ground roll",
  "landing-50ft": "Landing over 50 ft",
};

const PRINTED_PAGE: Record<P2006TDistanceKind, string> = {
  "takeoff-ground-roll": "5-7",
  "takeoff-50ft": "5-7",
  "landing-ground-roll": "5-21",
  "landing-50ft": "5-21",
};

const FORM_PAGES = [
  `data:image/webp;base64,${P2006T_FORM_PAGE_1_WEBP_BASE64}`,
  `data:image/webp;base64,${P2006T_FORM_PAGE_2_WEBP_BASE64}`,
];

function slugRegistration(value: P2006TRegistration) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function defaultPdfPage(
  registration: P2006TRegistration,
  kind: P2006TDistanceKind
) {
  const firstPage = registration === "D-GSEV" ? 169 : 171;
  return kind.startsWith("takeoff") ? firstPage : firstPage + 14;
}

function candidatePaths(
  registration: P2006TRegistration,
  kind: P2006TDistanceKind,
  pageNumber: number
) {
  const slug = slugRegistration(registration);
  const printedPage = PRINTED_PAGE[kind];
  const stems = [
    `/p2006-performance-pages/${registration}/page-${pageNumber}`,
    `/p2006-performance-pages/${registration}/${pageNumber}`,
    `/p2006-performance-pages/${slug}/page-${pageNumber}`,
    `/p2006-performance-pages/${slug}/${pageNumber}`,
    `/p2006-performance-pages/${registration}/${kind}`,
    `/p2006-performance-pages/${slug}/${kind}`,
    `/p2006-performance-pages/${registration}/section-5-page-${printedPage}`,
    `/p2006-performance-pages/${slug}/section-5-page-${printedPage}`,
  ];

  return stems.flatMap((stem) =>
    ["png", "jpg", "jpeg", "webp"].map((extension) => `${stem}.${extension}`)
  );
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function pointerPoint(event: React.PointerEvent<HTMLDivElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height),
  };
}

function markBounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
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

async function imageDataUrlToJpegBytes(dataUrl: string) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Canvas is unavailable.");

  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  const encoded = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

async function downloadFormPdf() {
  const pdf = await PDFDocument.create();

  for (const source of FORM_PAGES) {
    const jpegBytes = await imageDataUrlToJpegBytes(source);
    const embedded = await pdf.embedJpg(jpegBytes);
    const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);

    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: A4_WIDTH_PT,
      height: A4_HEIGHT_PT,
    });
  }

  const bytes = await pdf.save();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "RVP.CFI.071.02_Tecnam_P2006T_MB_Performance_Sheet.pdf";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function MarkOverlay({ mark }: { mark: Mark }) {
  if (mark.mode === "point") {
    const point = mark.points[0];

    return (
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      >
        <span className="block h-4 w-4 rounded-full border-2 border-white bg-red-600 shadow" />
        <span className="absolute left-3 top-3 whitespace-nowrap rounded bg-zinc-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {mark.label}
        </span>
      </div>
    );
  }

  if (mark.mode === "rectangle") {
    const bounds = markBounds(mark.points);

    return (
      <div
        className="pointer-events-none absolute border-2 border-red-600 bg-red-500/10"
        style={{
          left: `${bounds.left * 100}%`,
          top: `${bounds.top * 100}%`,
          width: `${bounds.width * 100}%`,
          height: `${bounds.height * 100}%`,
        }}
      >
        <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-zinc-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {mark.label}
        </span>
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <polyline
        points={mark.points
          .map((point) => `${point.x * 100},${point.y * 100}`)
          .join(" ")}
        fill="none"
        stroke="rgb(220 38 38)"
        strokeWidth="0.55"
        vectorEffect="non-scaling-stroke"
      />
      {mark.points.map((point, index) => (
        <circle
          key={`${mark.id}-${index}`}
          cx={point.x * 100}
          cy={point.y * 100}
          r="0.7"
          fill="rgb(220 38 38)"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function StoredTable({
  registration,
  kind,
}: {
  registration: P2006TRegistration;
  kind: P2006TDistanceKind;
}) {
  const table = (rawDataset.tables as P2006TDistanceTable[]).find(
    (candidate) => candidate.kind === kind
  );

  if (registration !== "CS-EAQ" || !table) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Esta matrícula ainda não tem uma tabela transcrita no repositório. A imagem
        real pode ser carregada aqui e os valores devem ser criados como dataset
        independente no builder editável abaixo.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="bg-zinc-50 text-zinc-500">
          <tr>
            <th className="px-2 py-2 text-left">PA</th>
            {table.axes.oatC.map((temperature) => (
              <th key={temperature} className="px-2 py-2 text-center">
                {temperature} °C
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {table.axes.pressureAltitudeFt.map((altitude, rowIndex) => (
            <tr key={altitude}>
              <td className="bg-zinc-50 px-2 py-2 font-semibold">
                {altitude.toLocaleString()} ft
              </td>
              {table.valuesM[0][rowIndex].map((value, columnIndex) => (
                <td
                  key={`${altitude}-${table.axes.oatC[columnIndex]}`}
                  className="px-2 py-2 text-center font-mono"
                >
                  {value} m
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function P2006TSourceMapper() {
  const [workspace, setWorkspace] = useState<Workspace>("afm");
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [kind, setKind] =
    useState<P2006TDistanceKind>("takeoff-ground-roll");
  const [pdfPage, setPdfPage] = useState(() =>
    defaultPdfPage("CS-EAQ", "takeoff-ground-roll")
  );
  const [formPage, setFormPage] = useState(1);
  const [exactPath, setExactPath] = useState("");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [localImageUrl, setLocalImageUrl] = useState("");
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [mode, setMode] = useState<DrawMode>("rectangle");
  const [label, setLabel] = useState("");
  const [maps, setMaps] = useState<MarkMaps>({});
  const [drag, setDrag] = useState<DragState>(null);
  const [polyline, setPolyline] = useState<Point[]>([]);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    if (!saved) return;

    try {
      setMaps(JSON.parse(saved) as MarkMaps);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const candidates = useMemo(
    () => candidatePaths(registration, kind, pdfPage),
    [registration, kind, pdfPage]
  );

  const activeImagePath =
    workspace === "form"
      ? FORM_PAGES[formPage - 1]
      : localImageUrl || exactPath.trim() || candidates[candidateIndex] || "";

  const mapKey =
    workspace === "form"
      ? `form:page-${formPage}`
      : `afm:${registration}:${kind}:pdf-page-${pdfPage}`;
  const marks = maps[mapKey] ?? [];

  function resetSource(
    nextRegistration: P2006TRegistration,
    nextKind: P2006TDistanceKind
  ) {
    setPdfPage(defaultPdfPage(nextRegistration, nextKind));
    setExactPath("");
    setCandidateIndex(0);
    setLocalImageUrl("");
    setImageReady(false);
    setImageFailed(false);
  }

  function addMark(mark: Omit<Mark, "id">) {
    const next = {
      ...mark,
      id: window.crypto.randomUUID(),
    };

    setMaps((current) => ({
      ...current,
      [mapKey]: [...(current[mapKey] ?? []), next],
    }));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!imageReady) return;

    const point = pointerPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (mode === "point") {
      addMark({
        label: label.trim() || `Point ${marks.length + 1}`,
        mode,
        points: [point],
      });
      return;
    }

    if (mode === "polyline") {
      setPolyline((current) => [...current, point]);
      return;
    }

    setDrag({ start: point, current: point });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag || mode !== "rectangle") return;
    setDrag({ ...drag, current: pointerPoint(event) });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag || mode !== "rectangle") return;

    const end = pointerPoint(event);
    const bounds = markBounds([drag.start, end]);
    setDrag(null);

    if (bounds.width < 0.002 || bounds.height < 0.002) return;

    addMark({
      label: label.trim() || `Field ${marks.length + 1}`,
      mode,
      points: [drag.start, end],
    });
  }

  function finishPolyline() {
    if (polyline.length < 2) return;

    addMark({
      label: label.trim() || `Path ${marks.length + 1}`,
      mode: "polyline",
      points: polyline,
    });
    setPolyline([]);
  }

  function saveMaps() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(maps));
    setSaveStatus("Coordinate maps saved in this browser.");
  }

  function exportMaps() {
    const exportedMaps = Object.fromEntries(
      Object.entries(maps).map(([key, values]) => [
        key,
        values.map((mark) => {
          const bounds = markBounds(mark.points);
          const isForm = key.startsWith("form:");

          return {
            ...mark,
            normalizedBounds: bounds,
            pdfPoints: isForm
              ? {
                  x: bounds.left * A4_WIDTH_PT,
                  y: (1 - bounds.top - bounds.height) * A4_HEIGHT_PT,
                  width: bounds.width * A4_WIDTH_PT,
                  height: bounds.height * A4_HEIGHT_PT,
                  pageSize: [A4_WIDTH_PT, A4_HEIGHT_PT],
                  origin: "bottom-left",
                }
              : null,
          };
        }),
      ])
    );

    downloadJson("p2006t-source-and-pdf-coordinate-maps.json", {
      version: 2,
      normalizedCoordinates: {
        x: "0 at left, 1 at right",
        y: "0 at top, 1 at bottom",
      },
      maps: exportedMaps,
    });
  }

  const draftBounds = drag ? markBounds([drag.start, drag.current]) : null;

  return (
    <section className="space-y-5 rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Visual source and PDF mapper
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Real pages beside stored values
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            A página real fica lado a lado com os dados transcritos. Podes marcar
            células, campos, pontos e percursos completos para reutilizarmos a mesma
            geometria no PDF final.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-sky-200 bg-white p-1">
          <button
            type="button"
            onClick={() => {
              setWorkspace("afm");
              setImageReady(false);
              setImageFailed(false);
            }}
            className={[
              "rounded-xl px-4 py-2 text-sm font-semibold",
              workspace === "afm"
                ? "bg-zinc-950 text-white"
                : "text-zinc-600 hover:bg-zinc-50",
            ].join(" ")}
          >
            AFM tables
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspace("form");
              setImageReady(false);
              setImageFailed(false);
            }}
            className={[
              "rounded-xl px-4 py-2 text-sm font-semibold",
              workspace === "form"
                ? "bg-zinc-950 text-white"
                : "text-zinc-600 hover:bg-zinc-50",
            ].join(" ")}
          >
            PDF template
          </button>
        </div>
      </div>

      {workspace === "afm" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Aircraft
            </span>
            <select
              value={registration}
              onChange={(event) => {
                const next = event.target.value as P2006TRegistration;
                setRegistration(next);
                resetSource(next, kind);
              }}
              className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
            >
              {P2006T_REGISTRATIONS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 xl:col-span-2">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Performance table
            </span>
            <select
              value={kind}
              onChange={(event) => {
                const next = event.target.value as P2006TDistanceKind;
                setKind(next);
                resetSource(registration, next);
              }}
              className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
            >
              {P2006T_DISTANCE_KINDS.map((item) => (
                <option key={item} value={item}>
                  {TABLE_LABELS[item]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Source PDF page
            </span>
            <input
              type="number"
              value={pdfPage}
              onChange={(event) => {
                setPdfPage(Number(event.target.value));
                setCandidateIndex(0);
                setImageReady(false);
                setImageFailed(false);
              }}
              className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Load real image
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setLocalImageUrl(URL.createObjectURL(file));
                setImageReady(false);
                setImageFailed(false);
              }}
              className="block w-full text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:font-semibold file:text-white"
            />
          </label>

          <label className="space-y-1 md:col-span-2 xl:col-span-5">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Exact public image path or URL
            </span>
            <input
              value={exactPath}
              onChange={(event) => {
                setExactPath(event.target.value);
                setCandidateIndex(0);
                setImageReady(false);
                setImageFailed(false);
              }}
              placeholder="Auto-detects common /p2006-performance-pages paths"
              className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Form page
            </span>
            <select
              value={formPage}
              onChange={(event) => {
                setFormPage(Number(event.target.value));
                setImageReady(false);
                setImageFailed(false);
              }}
              className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"
            >
              <option value={1}>Page 1 · Loading and M&B graph</option>
              <option value={2}>Page 2 · Performance and fuel</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void downloadFormPdf()}
            className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white"
          >
            Download two-page PDF template
          </button>
          <p className="max-w-xl text-xs leading-5 text-zinc-500">
            As duas páginas de RVP.CFI.071.02 estão incorporadas no builder como
            fundo do mapeamento de coordenadas.
          </p>
        </div>
      )}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(520px,0.9fr)]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-zinc-950">
                {workspace === "form"
                  ? `RVP.CFI.071.02 · page ${formPage}`
                  : `${registration} · ${TABLE_LABELS[kind]} · AFM ${PRINTED_PAGE[kind]}`}
              </p>
              <p className="max-w-3xl break-all text-xs text-zinc-500">
                {workspace === "form" ? "Embedded form page" : activeImagePath}
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
              {imageReady ? "Real page loaded" : "Loading page"}
            </span>
          </div>

          <div
            className="relative mx-auto select-none overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-100"
            style={{ cursor: imageReady ? "crosshair" : "default" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImagePath}
              alt="P2006T source page"
              draggable={false}
              onLoad={() => {
                setImageReady(true);
                setImageFailed(false);
              }}
              onError={() => {
                setImageReady(false);

                if (
                  workspace === "afm" &&
                  !localImageUrl &&
                  !exactPath.trim() &&
                  candidateIndex < candidates.length - 1
                ) {
                  setCandidateIndex((current) => current + 1);
                } else {
                  setImageFailed(true);
                }
              }}
              className="block h-auto w-full"
            />

            {marks.map((mark) => (
              <MarkOverlay key={mark.id} mark={mark} />
            ))}

            {draftBounds ? (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-sky-600 bg-sky-400/10"
                style={{
                  left: `${draftBounds.left * 100}%`,
                  top: `${draftBounds.top * 100}%`,
                  width: `${draftBounds.width * 100}%`,
                  height: `${draftBounds.height * 100}%`,
                }}
              />
            ) : null}

            {polyline.length > 0 ? (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                <polyline
                  points={polyline
                    .map((point) => `${point.x * 100},${point.y * 100}`)
                    .join(" ")}
                  fill="none"
                  stroke="rgb(2 132 199)"
                  strokeWidth="0.55"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : null}
          </div>

          {imageFailed ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              Nenhum dos caminhos comuns resolveu a imagem. Cola o path público
              exato ou carrega a imagem real acima; a marcação fica imediatamente
              disponível quando a página carregar.
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {workspace === "afm" ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-4">
              <p className="text-sm font-semibold text-zinc-950">
                Stored table beside original page
              </p>
              <p className="mb-3 mt-1 text-xs leading-5 text-zinc-500">
                Confirma cada célula diretamente contra a página real antes de a
                aprovar no builder editável abaixo.
              </p>
              <StoredTable registration={registration} kind={kind} />
            </div>
          ) : null}

          <div className="rounded-3xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-950">
              Coordinate and calculation-path tool
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_170px]">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Element label
                </span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="OAT 25 °C, TODR departure, front-seat line..."
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Drawing mode
                </span>
                <select
                  value={mode}
                  onChange={(event) => {
                    setMode(event.target.value as DrawMode);
                    setDrag(null);
                    setPolyline([]);
                  }}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="rectangle">Rectangle / field</option>
                  <option value="point">Point</option>
                  <option value="polyline">Polyline / path</option>
                </select>
              </label>
            </div>

            <p className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
              Arrasta um retângulo sobre uma célula ou campo, clica num ponto exato,
              ou clica em cada etapa de um cálculo gráfico e termina a polyline.
            </p>

            {mode === "polyline" ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={polyline.length < 2}
                  onClick={finishPolyline}
                  className="rounded-xl bg-sky-700 px-3 py-2 text-xs font-semibold text-white disabled:bg-zinc-300"
                >
                  Finish path ({polyline.length} points)
                </button>
                <button
                  type="button"
                  onClick={() => setPolyline([])}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold"
                >
                  Clear draft
                </button>
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {marks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-500">
                  No coordinates marked on this page yet.
                </p>
              ) : (
                marks.map((mark) => {
                  const bounds = markBounds(mark.points);
                  const pdf =
                    workspace === "form"
                      ? {
                          x: bounds.left * A4_WIDTH_PT,
                          y: (1 - bounds.top - bounds.height) * A4_HEIGHT_PT,
                          width: bounds.width * A4_WIDTH_PT,
                          height: bounds.height * A4_HEIGHT_PT,
                        }
                      : null;

                  return (
                    <div
                      key={mark.id}
                      className="rounded-xl border border-zinc-200 p-3 text-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-zinc-950">
                            {mark.label} · {mark.mode}
                          </p>
                          <p className="mt-1 font-mono leading-5 text-zinc-500">
                            x {bounds.left.toFixed(5)} · y {bounds.top.toFixed(5)} ·
                            w {bounds.width.toFixed(5)} · h {bounds.height.toFixed(5)}
                          </p>
                          {pdf ? (
                            <p className="font-mono leading-5 text-sky-700">
                              PDF pt: x {pdf.x.toFixed(1)} · y {pdf.y.toFixed(1)} · w{" "}
                              {pdf.width.toFixed(1)} · h {pdf.height.toFixed(1)}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setMaps((current) => ({
                              ...current,
                              [mapKey]: (current[mapKey] ?? []).filter(
                                (item) => item.id !== mark.id
                              ),
                            }))
                          }
                          className="font-semibold text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={saveMaps}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700"
              >
                Save coordinate maps
              </button>
              <button
                type="button"
                onClick={exportMaps}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white"
              >
                Export coordinate JSON
              </button>
            </div>
            {saveStatus ? (
              <p className="mt-2 text-xs text-zinc-500">{saveStatus}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
