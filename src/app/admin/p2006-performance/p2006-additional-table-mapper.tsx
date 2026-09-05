"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import {
  centersToOuterRect,
  initialP2006TAdditionalTableMapping,
  p2006TAdditionalTableKey,
  readP2006TAdditionalTableMappings,
  syncLegacyP2006TOeiMapping,
  writeP2006TAdditionalTableMappings,
  type P2006TAdditionalTableDefinition,
  type P2006TAdditionalTableMappingStore,
  type P2006TTableGrid,
  type P2006TTableMapping,
} from "@/lib/performance/p2006t-additional-table-mapper";
import { P2006TDraggableGridOverlay } from "./p2006-draggable-grid-overlay";

type DragState = {
  startX: number;
  startY: number;
  x: number;
  y: number;
} | null;

const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function pointerPosition(event: ReactPointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height),
  };
}

function rectFromDrag(drag: NonNullable<DragState>) {
  const x = Math.min(drag.startX, drag.x);
  const y = Math.min(drag.startY, drag.y);
  return {
    x,
    y,
    width: Math.max(0.002, Math.abs(drag.x - drag.startX)),
    height: Math.max(0.002, Math.abs(drag.y - drag.startY)),
  };
}

function boundariesFromCenters(centers: number[]) {
  if (centers.length === 0) return [];
  if (centers.length === 1) {
    return [clamp(centers[0] - 0.01), clamp(centers[0] + 0.01)];
  }
  const result = [centers[0] - (centers[1] - centers[0]) / 2];
  for (let index = 0; index < centers.length - 1; index += 1) {
    result.push((centers[index] + centers[index + 1]) / 2);
  }
  result.push(
    centers[centers.length - 1] +
      (centers[centers.length - 1] - centers[centers.length - 2]) / 2
  );
  return result.map(clamp);
}

function centersFromBoundaries(boundaries: number[]) {
  return boundaries
    .slice(0, -1)
    .map((boundary, index) => (boundary + boundaries[index + 1]) / 2);
}

function gridFromOuterBox(
  rect: { x: number; y: number; width: number; height: number },
  columns: number,
  rows: number
): P2006TTableGrid {
  return {
    columnCenters: Array.from(
      { length: columns },
      (_, index) => rect.x + (rect.width * (index + 0.5)) / columns
    ),
    rowCenters: Array.from(
      { length: rows },
      (_, index) => rect.y + (rect.height * (index + 0.5)) / rows
    ),
  };
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function refineVisibleGrid(
  image: HTMLImageElement,
  expected: P2006TTableGrid
): Pick<P2006TTableMapping, "columnCenters" | "rowCenters" | "confidence"> {
  const scale = Math.min(1, 1600 / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { ...expected, confidence: 0 };
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;

  const isDark = (x: number, y: number) => {
    const safeX = Math.max(0, Math.min(width - 1, x));
    const safeY = Math.max(0, Math.min(height - 1, y));
    const offset = (safeY * width + safeX) * 4;
    const luminance =
      pixels[offset] * 0.299 +
      pixels[offset + 1] * 0.587 +
      pixels[offset + 2] * 0.114;
    return luminance < 190 && pixels[offset + 3] > 100;
  };

  const expectedX = boundariesFromCenters(expected.columnCenters);
  const expectedY = boundariesFromCenters(expected.rowCenters);
  const left = expectedX[0];
  const right = expectedX[expectedX.length - 1];
  const top = expectedY[0];
  const bottom = expectedY[expectedY.length - 1];
  const xSpacing =
    expected.columnCenters.length > 1
      ? Math.min(
          ...expected.columnCenters
            .slice(1)
            .map((value, index) => value - expected.columnCenters[index])
        )
      : 0.03;
  const ySpacing =
    expected.rowCenters.length > 1
      ? Math.min(
          ...expected.rowCenters
            .slice(1)
            .map((value, index) => value - expected.rowCenters[index])
        )
      : 0.03;

  const searchBoundary = (
    target: number,
    orientation: "vertical" | "horizontal"
  ) => {
    const axisSize = orientation === "vertical" ? width : height;
    const toleranceNormalized =
      (orientation === "vertical" ? xSpacing : ySpacing) * 0.32;
    const centre = Math.round(target * axisSize);
    const tolerance = Math.max(2, Math.round(toleranceNormalized * axisSize));
    let bestPosition = centre;
    let bestScore = -1;

    for (
      let candidate = Math.max(0, centre - tolerance);
      candidate <= Math.min(axisSize - 1, centre + tolerance);
      candidate += 1
    ) {
      let marked = 0;
      let samples = 0;
      if (orientation === "vertical") {
        for (
          let y = Math.max(0, Math.floor(top * height));
          y <= Math.min(height - 1, Math.ceil(bottom * height));
          y += 2
        ) {
          samples += 1;
          if (
            isDark(candidate - 1, y) ||
            isDark(candidate, y) ||
            isDark(candidate + 1, y)
          ) {
            marked += 1;
          }
        }
      } else {
        for (
          let x = Math.max(0, Math.floor(left * width));
          x <= Math.min(width - 1, Math.ceil(right * width));
          x += 2
        ) {
          samples += 1;
          if (
            isDark(x, candidate - 1) ||
            isDark(x, candidate) ||
            isDark(x, candidate + 1)
          ) {
            marked += 1;
          }
        }
      }
      const score = marked / Math.max(1, samples);
      if (score > bestScore) {
        bestScore = score;
        bestPosition = candidate;
      }
    }

    return { position: bestPosition / axisSize, score: Math.max(0, bestScore) };
  };

  const refinedX = expectedX.map((boundary) =>
    searchBoundary(boundary, "vertical")
  );
  const refinedY = expectedY.map((boundary) =>
    searchBoundary(boundary, "horizontal")
  );

  return {
    columnCenters: centersFromBoundaries(
      refinedX.map((result) => result.position)
    ),
    rowCenters: centersFromBoundaries(refinedY.map((result) => result.position)),
    confidence: clamp(
      mean([...refinedX, ...refinedY].map((result) => result.score)) * 2.8
    ),
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

export function P2006TAdditionalTableMapper({
  definition,
  registration,
  onPrevious,
  onNext,
  onProgressChange,
}: {
  definition: P2006TAdditionalTableDefinition;
  registration: P2006TRegistration;
  onPrevious: () => void;
  onNext: () => void;
  onProgressChange?: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [store, setStore] = useState<P2006TAdditionalTableMappingStore>({});
  const [mapping, setMapping] = useState<P2006TTableMapping>(() =>
    initialP2006TAdditionalTableMapping(definition, registration)
  );
  const [imageReady, setImageReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [manualBoxMode, setManualBoxMode] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);
  const [zoom, setZoom] = useState(100);
  const [status, setStatus] = useState("");

  const key = p2006TAdditionalTableKey(definition.id, registration);
  const source = definition.sourceByRegistration[registration];

  useEffect(() => {
    const loaded = readP2006TAdditionalTableMappings();
    setStore(loaded);
    setMapping(
      loaded[key] ?? initialP2006TAdditionalTableMapping(definition, registration)
    );
    setImageReady(false);
    setDetecting(false);
    setManualBoxMode(false);
    setDrag(null);
    setZoom(100);
    setStatus(
      loaded[key]
        ? "Mapeamento guardado carregado."
        : "Geometria AFM carregada para confirmação."
    );
  }, [definition, key, registration]);

  const draftRect = useMemo(() => (drag ? rectFromDrag(drag) : null), [drag]);
  const confidencePercentage = Math.round(mapping.confidence * 100);
  const confidenceClass =
    confidencePercentage >= 80
      ? "bg-emerald-100 text-emerald-900"
      : confidencePercentage >= 55
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-900";

  function persist(nextMapping: P2006TTableMapping) {
    const nextStore = { ...store, [key]: nextMapping };
    writeP2006TAdditionalTableMappings(nextStore);
    if (definition.id === "oei-vyse") {
      syncLegacyP2006TOeiMapping(registration, nextMapping);
    }
    setStore(nextStore);
    setMapping(nextMapping);
    onProgressChange?.();
  }

  function confirmGrid() {
    persist({
      ...mapping,
      confirmed: true,
      savedAt: new Date().toISOString(),
    });
    setStatus(`${definition.shortTitle} · ${registration}: grelha confirmada.`);
  }

  function restoreAfmGeometry() {
    setMapping(initialP2006TAdditionalTableMapping(definition, registration));
    setManualBoxMode(false);
    setDrag(null);
    setStatus("Geometria AFM reposta; confirme para a guardar.");
  }

  function runDetection() {
    const image = imageRef.current;
    if (!image || !image.complete || !image.naturalWidth) return;
    setDetecting(true);
    window.requestAnimationFrame(() => {
      try {
        const refined = refineVisibleGrid(image, mapping);
        setMapping({
          ...mapping,
          ...refined,
          confirmed: false,
          method: "pixel-refine",
          savedAt: null,
        });
        setStatus("Grelha redetetada; verifique e confirme.");
      } catch {
        setStatus("Não foi possível redetetar esta página.");
      } finally {
        setDetecting(false);
      }
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!manualBoxMode || !imageReady) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    setDrag({ startX: point.x, startY: point.y, ...point });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const point = pointerPosition(event);
    setDrag((current) => (current ? { ...current, ...point } : null));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const point = pointerPosition(event);
    const rect = rectFromDrag({ ...drag, ...point });
    setMapping({
      ...gridFromOuterBox(
        rect,
        source.columnCenters.length,
        source.rowCenters.length
      ),
      confirmed: false,
      confidence: 0.55,
      method: "manual-box",
      savedAt: null,
    });
    setDrag(null);
    setManualBoxMode(false);
    setStatus("Matriz delimitada; arraste diretamente qualquer linha para afinar.");
  }

  return (
    <section className="space-y-5 rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_390px]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          <section className="mb-3 rounded-2xl border-2 border-sky-300 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
              {definition.group}
            </p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950">
              {definition.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              {definition.description}
            </p>
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-sky-800">
              Arraste diretamente as linhas azuis da grelha. A posição fica guardada ao largar.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${confidenceClass}`}>
                {mapping.method === "afm-overlay"
                  ? "Geometria AFM preparada"
                  : `Confiança ${confidencePercentage}%`}
              </span>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600">
                {mapping.columnCenters.length} colunas · {mapping.rowCenters.length} linhas
              </span>
              {mapping.confirmed ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900">
                  Concluído
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!imageReady || detecting}
                onClick={confirmGrid}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
              >
                Confirmar grelha
              </button>
              <button
                type="button"
                disabled={!imageReady || detecting}
                onClick={runDetection}
                className="rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 disabled:text-zinc-300"
              >
                {detecting ? "A detetar…" : "Redetetar automaticamente"}
              </button>
              <button
                type="button"
                disabled={!imageReady}
                onClick={() => {
                  setManualBoxMode(true);
                  setDrag(null);
                }}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 disabled:text-zinc-300"
              >
                Redesenhar limite exterior
              </button>
              <button
                type="button"
                onClick={restoreAfmGeometry}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700"
              >
                Repor geometria AFM
              </button>
            </div>

            {manualBoxMode ? (
              <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
                Arraste um retângulo à volta da matriz completa.
              </p>
            ) : null}
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
                Ajustar
              </button>
              <span className="font-mono text-xs font-semibold">{zoom}%</span>
            </div>
            <span className="text-xs font-semibold text-zinc-600">
              {source.sourceLabel} · {registration}
            </span>
          </div>

          <div className="max-h-[78vh] overflow-auto rounded-2xl border border-zinc-300 bg-zinc-100 p-2">
            <div
              className="relative mx-auto select-none bg-white"
              style={{
                width: `${zoom}%`,
                cursor: manualBoxMode ? "crosshair" : "default",
                touchAction: manualBoxMode ? "none" : "auto",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={source.image}
                alt={`${definition.title} ${registration}`}
                draggable={false}
                onLoad={() => setImageReady(true)}
                className="block h-auto w-full"
              />
              <P2006TDraggableGridOverlay
                grid={mapping}
                disabled={manualBoxMode}
                onCommit={(grid) => {
                  persist({
                    ...mapping,
                    columnCenters: grid.columnCenters,
                    rowCenters: grid.rowCenters,
                    confirmed: mapping.confirmed,
                    confidence: 1,
                    method: "manual-box",
                    savedAt: new Date().toISOString(),
                  });
                  setStatus("Ajuste guardado.");
                }}
              />
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
              Estado
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {mapping.confirmed ? "Concluído" : "Por confirmar"}
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Limite mapeado: {centersToOuterRect(mapping).width.toFixed(3)} ×{" "}
              {centersToOuterRect(mapping).height.toFixed(3)} da página.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onPrevious}
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={onNext}
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
              >
                Seguinte
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Guardar e exportar
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  persist({ ...mapping, savedAt: new Date().toISOString() });
                  setStatus("Progresso guardado neste browser.");
                }}
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                Guardar progresso no browser
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadJson("p2006t-additional-table-mappings.json", {
                    version: 1,
                    mappings: store,
                  })
                }
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white"
              >
                Download do JSON das tabelas
              </button>
            </div>
            {status ? (
              <p className="mt-3 text-xs font-semibold text-emerald-700">
                {status}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </section>
  );
}
