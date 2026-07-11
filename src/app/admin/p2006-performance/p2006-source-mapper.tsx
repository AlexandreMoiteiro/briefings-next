"use client";

import { useEffect, useMemo, useState } from "react";
import rawDataset from "@/lib/performance/p2006t-distance-tables.json";
import type {
  P2006TDistanceKind,
  P2006TDistanceTable,
} from "@/lib/performance/p2006t-distance";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";
import { P2006T_FORM_PAGE_1_WEBP_BASE64 } from "@/lib/pdf/p2006t-form-page-1";
import { P2006T_FORM_PAGE_2_WEBP_BASE64 } from "@/lib/pdf/p2006t-form-page-2";

type SourcePage = "takeoff" | "landing";
type StageId = "afm-takeoff" | "afm-landing" | "form-page-1" | "form-page-2";
type Rect = { x: number; y: number; width: number; height: number };
type MappingItem = {
  id: string;
  label: string;
  instruction: string;
  suggested: Rect;
  kind: "source-region" | "text" | "number" | "graph";
};
type SavedMapping = {
  rect: Rect;
  confirmed: boolean;
};
type MappingStore = Record<string, SavedMapping>;
type DragState = { startX: number; startY: number; x: number; y: number } | null;

type Stage = {
  id: StageId;
  title: string;
  shortTitle: string;
  description: string;
  page: SourcePage | 1 | 2;
  items: MappingItem[];
};

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const STORAGE_KEY = "briefings_p2006_guided_mapper_v3";

const AFM_SOURCE_MANIFEST: Record<
  P2006TRegistration,
  Record<SourcePage, { image: string; text: string; pdfPage: number; printedPage: string }>
> = {
  "CS-EAQ": {
    takeoff: {
      image: "/p2006-performance-pages/CS-EAQ/page-171.png",
      text: "/p2006-performance-pages/CS-EAQ/page-171.txt",
      pdfPage: 171,
      printedPage: "5-7",
    },
    landing: {
      image: "/p2006-performance-pages/CS-EAQ/page-185.png",
      text: "/p2006-performance-pages/CS-EAQ/page-185.txt",
      pdfPage: 185,
      printedPage: "5-21",
    },
  },
  "CS-EBX": {
    takeoff: {
      image: "/p2006-performance-pages/CS-EBX/page-171.png",
      text: "/p2006-performance-pages/CS-EBX/page-171.txt",
      pdfPage: 171,
      printedPage: "5-7",
    },
    landing: {
      image: "/p2006-performance-pages/CS-EBX/page-185.png",
      text: "/p2006-performance-pages/CS-EBX/page-185.txt",
      pdfPage: 185,
      printedPage: "5-21",
    },
  },
  "D-GSEV": {
    takeoff: {
      image: "/p2006-performance-pages/D-GSEV/page-169.png",
      text: "/p2006-performance-pages/D-GSEV/page-169.txt",
      pdfPage: 169,
      printedPage: "5-7",
    },
    landing: {
      image: "/p2006-performance-pages/D-GSEV/page-183.png",
      text: "/p2006-performance-pages/D-GSEV/page-183.txt",
      pdfPage: 183,
      printedPage: "5-21",
    },
  },
};

const AFM_ITEMS: MappingItem[] = [
  {
    id: "full-performance-table",
    label: "Complete performance table",
    instruction:
      "Confirm the complete published table. Ground roll and distance over 50 ft remain together because they are read from this same source page.",
    suggested: { x: 0.105, y: 0.315, width: 0.79, height: 0.49 },
    kind: "source-region",
  },
  {
    id: "corrections-block",
    label: "Published corrections",
    instruction:
      "Confirm the block containing headwind, tailwind, paved-runway and runway-slope corrections.",
    suggested: { x: 0.52, y: 0.135, width: 0.365, height: 0.18 },
    kind: "source-region",
  },
  {
    id: "pressure-altitude-axis",
    label: "Pressure-altitude column",
    instruction:
      "Confirm the pressure-altitude labels used to select the lower and upper interpolation rows.",
    suggested: { x: 0.105, y: 0.35, width: 0.13, height: 0.445 },
    kind: "source-region",
  },
  {
    id: "temperature-axis",
    label: "Temperature columns",
    instruction:
      "Confirm the OAT headings used to select the lower and upper interpolation columns.",
    suggested: { x: 0.345, y: 0.315, width: 0.47, height: 0.07 },
    kind: "source-region",
  },
  {
    id: "ground-roll-values",
    label: "Ground-roll rows",
    instruction:
      "Confirm the rows containing the ground-roll values. These remain part of the same page as the 50 ft values.",
    suggested: { x: 0.235, y: 0.375, width: 0.655, height: 0.205 },
    kind: "source-region",
  },
  {
    id: "fifty-foot-values",
    label: "50 ft rows",
    instruction:
      "Confirm the rows containing distance over the 50 ft obstacle.",
    suggested: { x: 0.235, y: 0.565, width: 0.655, height: 0.225 },
    kind: "source-region",
  },
];

const FORM_PAGE_1_ITEMS: MappingItem[] = [
  {
    id: "registration",
    label: "Aircraft registration",
    instruction: "Confirm where the aircraft registration will be written.",
    suggested: { x: 0.73, y: 0.073, width: 0.17, height: 0.035 },
    kind: "text",
  },
  {
    id: "date",
    label: "Date",
    instruction: "Confirm where the flight date will be written.",
    suggested: { x: 0.73, y: 0.112, width: 0.17, height: 0.035 },
    kind: "text",
  },
  {
    id: "pilot-front-seat",
    label: "Pilot and front seat mass",
    instruction: "Confirm the writable rectangle for Pilot & Front Seat mass.",
    suggested: { x: 0.27, y: 0.198, width: 0.17, height: 0.035 },
    kind: "number",
  },
  {
    id: "rear-seats",
    label: "Rear seats mass",
    instruction: "Confirm the writable rectangle for rear-seat mass.",
    suggested: { x: 0.27, y: 0.239, width: 0.17, height: 0.035 },
    kind: "number",
  },
  {
    id: "fuel-mass",
    label: "Fuel mass",
    instruction: "Confirm the writable rectangle for fuel mass.",
    suggested: { x: 0.27, y: 0.28, width: 0.17, height: 0.035 },
    kind: "number",
  },
  {
    id: "baggage",
    label: "Baggage mass",
    instruction: "Confirm the writable rectangle for baggage mass.",
    suggested: { x: 0.27, y: 0.321, width: 0.17, height: 0.035 },
    kind: "number",
  },
  {
    id: "takeoff-mass",
    label: "Takeoff mass",
    instruction: "Confirm the final takeoff-mass result rectangle.",
    suggested: { x: 0.27, y: 0.405, width: 0.17, height: 0.035 },
    kind: "number",
  },
  {
    id: "landing-mass",
    label: "Landing mass",
    instruction: "Confirm the final landing-mass result rectangle.",
    suggested: { x: 0.27, y: 0.447, width: 0.17, height: 0.035 },
    kind: "number",
  },
  {
    id: "mass-balance-graph",
    label: "Mass and balance graph area",
    instruction:
      "Confirm the complete graph area. The final PDF will use this rectangle for points, lines and the CG path rather than a single text value.",
    suggested: { x: 0.095, y: 0.515, width: 0.81, height: 0.39 },
    kind: "graph",
  },
];

const FORM_PAGE_2_ITEMS: MappingItem[] = [
  {
    id: "departure-aerodrome",
    label: "Departure aerodrome",
    instruction: "Confirm the departure aerodrome field.",
    suggested: { x: 0.19, y: 0.145, width: 0.16, height: 0.032 },
    kind: "text",
  },
  {
    id: "departure-runway",
    label: "Departure runway",
    instruction: "Confirm the departure runway field.",
    suggested: { x: 0.39, y: 0.145, width: 0.09, height: 0.032 },
    kind: "text",
  },
  {
    id: "departure-oat",
    label: "Departure OAT",
    instruction: "Confirm the departure temperature field.",
    suggested: { x: 0.51, y: 0.145, width: 0.09, height: 0.032 },
    kind: "number",
  },
  {
    id: "departure-qnh",
    label: "Departure QNH",
    instruction: "Confirm the departure QNH field.",
    suggested: { x: 0.63, y: 0.145, width: 0.1, height: 0.032 },
    kind: "number",
  },
  {
    id: "departure-wind",
    label: "Departure wind",
    instruction: "Confirm the departure wind field.",
    suggested: { x: 0.76, y: 0.145, width: 0.14, height: 0.032 },
    kind: "text",
  },
  {
    id: "departure-toda",
    label: "Departure TODA",
    instruction: "Confirm the departure TODA field.",
    suggested: { x: 0.27, y: 0.225, width: 0.12, height: 0.032 },
    kind: "number",
  },
  {
    id: "departure-todr",
    label: "Departure TODR",
    instruction: "Confirm the calculated departure TODR field.",
    suggested: { x: 0.43, y: 0.225, width: 0.12, height: 0.032 },
    kind: "number",
  },
  {
    id: "departure-roc",
    label: "Departure ROC",
    instruction: "Confirm the departure rate-of-climb field.",
    suggested: { x: 0.59, y: 0.225, width: 0.12, height: 0.032 },
    kind: "number",
  },
  {
    id: "arrival-aerodrome",
    label: "Arrival aerodrome",
    instruction: "Confirm the arrival aerodrome field.",
    suggested: { x: 0.19, y: 0.335, width: 0.16, height: 0.032 },
    kind: "text",
  },
  {
    id: "arrival-runway",
    label: "Arrival runway",
    instruction: "Confirm the arrival runway field.",
    suggested: { x: 0.39, y: 0.335, width: 0.09, height: 0.032 },
    kind: "text",
  },
  {
    id: "arrival-lda",
    label: "Arrival LDA",
    instruction: "Confirm the arrival LDA field.",
    suggested: { x: 0.27, y: 0.414, width: 0.12, height: 0.032 },
    kind: "number",
  },
  {
    id: "arrival-ldr",
    label: "Arrival LDR",
    instruction: "Confirm the calculated arrival LDR field.",
    suggested: { x: 0.43, y: 0.414, width: 0.12, height: 0.032 },
    kind: "number",
  },
  {
    id: "alternate-aerodrome",
    label: "Alternate aerodrome",
    instruction: "Confirm the alternate aerodrome field.",
    suggested: { x: 0.19, y: 0.49, width: 0.16, height: 0.032 },
    kind: "text",
  },
  {
    id: "alternate-runway",
    label: "Alternate runway",
    instruction: "Confirm the alternate runway field.",
    suggested: { x: 0.39, y: 0.49, width: 0.09, height: 0.032 },
    kind: "text",
  },
  {
    id: "alternate-lda",
    label: "Alternate LDA",
    instruction: "Confirm the alternate LDA field.",
    suggested: { x: 0.27, y: 0.568, width: 0.12, height: 0.032 },
    kind: "number",
  },
  {
    id: "alternate-ldr",
    label: "Alternate LDR",
    instruction: "Confirm the calculated alternate LDR field.",
    suggested: { x: 0.43, y: 0.568, width: 0.12, height: 0.032 },
    kind: "number",
  },
  {
    id: "fuel-planning-table",
    label: "Fuel-planning table",
    instruction:
      "Confirm the complete fuel-planning area. Individual row rectangles can be generated from this master rectangle after its geometry is approved.",
    suggested: { x: 0.095, y: 0.66, width: 0.81, height: 0.255 },
    kind: "graph",
  },
];

const STAGES: Stage[] = [
  {
    id: "afm-takeoff",
    title: "Takeoff source page",
    shortTitle: "AFM Takeoff",
    description: "Ground roll and 50 ft stay together on the same AFM source page.",
    page: "takeoff",
    items: AFM_ITEMS,
  },
  {
    id: "afm-landing",
    title: "Landing source page",
    shortTitle: "AFM Landing",
    description: "Ground roll and 50 ft stay together on the same AFM source page.",
    page: "landing",
    items: AFM_ITEMS,
  },
  {
    id: "form-page-1",
    title: "Form page 1",
    shortTitle: "Form page 1",
    description: "Loading entries and graphical mass-and-balance output.",
    page: 1,
    items: FORM_PAGE_1_ITEMS,
  },
  {
    id: "form-page-2",
    title: "Form page 2",
    shortTitle: "Form page 2",
    description: "Airfield, performance and fuel-planning output fields.",
    page: 2,
    items: FORM_PAGE_2_ITEMS,
  },
];

const FORM_IMAGES = {
  1: `data:image/webp;base64,${P2006T_FORM_PAGE_1_WEBP_BASE64}`,
  2: `data:image/webp;base64,${P2006T_FORM_PAGE_2_WEBP_BASE64}`,
};

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
  return stage.id.startsWith("afm-")
    ? `${stage.id}:${registration}:${item.id}`
    : `${stage.id}:${item.id}`;
}

function TableGrid({ table }: { table: P2006TDistanceTable }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="w-full min-w-[520px] text-[11px]">
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
              <td className="bg-zinc-50 px-2 py-1.5 font-semibold">
                {altitude.toLocaleString()} ft
              </td>
              {table.valuesM[0][rowIndex].map((value, columnIndex) => (
                <td
                  key={`${altitude}-${table.axes.oatC[columnIndex]}`}
                  className="px-2 py-1.5 text-center font-mono"
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

function StoredPageTables({
  registration,
  page,
}: {
  registration: P2006TRegistration;
  page: SourcePage;
}) {
  if (registration !== "CS-EAQ") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        This aircraft has its real source page, but its independent data table has not
        yet been transcribed. The guided mapping can still be completed first.
      </div>
    );
  }

  const kinds: P2006TDistanceKind[] =
    page === "takeoff"
      ? ["takeoff-ground-roll", "takeoff-50ft"]
      : ["landing-ground-roll", "landing-50ft"];
  const tables = kinds
    .map((kind) =>
      (rawDataset.tables as P2006TDistanceTable[]).find(
        (candidate) => candidate.kind === kind
      )
    )
    .filter((table): table is P2006TDistanceTable => Boolean(table));

  return (
    <div className="space-y-4">
      {tables.map((table) => (
        <div key={table.kind} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {table.kind.includes("ground-roll") ? "Ground roll" : "Over 50 ft"}
          </p>
          <TableGrid table={table} />
        </div>
      ))}
    </div>
  );
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
      <span className="absolute -top-6 left-0 max-w-56 truncate rounded bg-zinc-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {label}
      </span>
    </div>
  );
}

export function P2006TSourceMapper() {
  const [registration, setRegistration] =
    useState<P2006TRegistration>("CS-EAQ");
  const [stageIndex, setStageIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [mappings, setMappings] = useState<MappingStore>({});
  const [redrawMode, setRedrawMode] = useState(false);
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
  const isAfm = stage.id.startsWith("afm-");
  const sourcePage = isAfm ? (stage.page as SourcePage) : null;
  const manifest = sourcePage
    ? AFM_SOURCE_MANIFEST[registration][sourcePage]
    : null;
  const imageSource = sourcePage
    ? manifest!.image
    : FORM_IMAGES[stage.page as 1 | 2];
  const currentKey = mappingKey(stage, registration, item);
  const currentMapping = mappings[currentKey] ?? {
    rect: item.suggested,
    confirmed: false,
  };

  const stageMappings = useMemo(
    () =>
      stage.items.map((candidate) => {
        const key = mappingKey(stage, registration, candidate);
        return {
          item: candidate,
          key,
          mapping: mappings[key] ?? {
            rect: candidate.suggested,
            confirmed: false,
          },
        };
      }),
    [mappings, registration, stage]
  );

  const stageConfirmed = stageMappings.filter(
    (entry) => entry.mapping.confirmed
  ).length;
  const totalItems = STAGES.reduce((sum, candidate) => sum + candidate.items.length, 0);
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

  function setCurrentMapping(patch: Partial<SavedMapping>) {
    setMappings((current) => ({
      ...current,
      [currentKey]: {
        ...currentMapping,
        ...patch,
      },
    }));
  }

  function goToStage(nextStageIndex: number) {
    setStageIndex(nextStageIndex);
    setItemIndex(0);
    setRedrawMode(false);
    setDrag(null);
    setImageReady(false);
    setSaveStatus("");
  }

  function goNext() {
    if (itemIndex < stage.items.length - 1) {
      setItemIndex((current) => current + 1);
    } else if (stageIndex < STAGES.length - 1) {
      goToStage(stageIndex + 1);
    }
    setRedrawMode(false);
    setDrag(null);
  }

  function goPrevious() {
    if (itemIndex > 0) {
      setItemIndex((current) => current - 1);
    } else if (stageIndex > 0) {
      const previousStageIndex = stageIndex - 1;
      setStageIndex(previousStageIndex);
      setItemIndex(STAGES[previousStageIndex].items.length - 1);
    }
    setRedrawMode(false);
    setDrag(null);
  }

  function confirmCurrent() {
    setCurrentMapping({ confirmed: true });
    window.setTimeout(goNext, 120);
  }

  function resetSuggestion() {
    setCurrentMapping({ rect: item.suggested, confirmed: false });
    setRedrawMode(false);
    setDrag(null);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!redrawMode || !imageReady) return;
    const point = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ startX: point.x, startY: point.y, x: point.x, y: point.y });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!redrawMode || !drag) return;
    const point = pointerPosition(event);
    setDrag({ ...drag, x: point.x, y: point.y });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!redrawMode || !drag) return;
    const point = pointerPosition(event);
    const rect = rectFromDrag({ ...drag, x: point.x, y: point.y });
    setDrag(null);
    setCurrentMapping({ rect, confirmed: false });
    setRedrawMode(false);
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
      version: 3,
      registration,
      sourceManifest: AFM_SOURCE_MANIFEST[registration],
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
            Guided source and form mapper
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Confirm one rectangle at a time
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            Each rectangle is suggested in advance. Confirm it, redraw it directly on
            the page, or restore the suggestion. Takeoff and landing each use one real
            AFM page containing both ground-roll and 50 ft values.
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
          const active = index === stageIndex;

          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => goToStage(index)}
              className={[
                "rounded-2xl border p-3 text-left transition",
                active
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
                {manifest
                  ? ` PDF page ${manifest.pdfPage} · printed AFM page ${manifest.printedPage}.`
                  : " Original two-page form rendered as the mapping background."}
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

          <div
            className="relative mx-auto max-w-[920px] select-none overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-100"
            style={{ cursor: redrawMode ? "crosshair" : "default" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${stage.id}-${registration}`}
              src={imageSource}
              alt={`${stage.title} source page`}
              draggable={false}
              onLoad={() => setImageReady(true)}
              onError={() => setImageReady(false)}
              className="block h-auto w-full object-contain"
            />

            {stageMappings.map((entry, index) => (
              <RectOverlay
                key={entry.key}
                rect={entry.mapping.rect}
                label={entry.item.label}
                status={
                  index === itemIndex
                    ? "current"
                    : entry.mapping.confirmed
                      ? "confirmed"
                      : "other"
                }
              />
            ))}

            {draftRect ? (
              <RectOverlay rect={draftRect} label="New rectangle" status="draft" />
            ) : null}
          </div>

          {isAfm ? (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">
                    Stored data from this same page
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Both outputs remain visible together for direct comparison with
                    the real page above.
                  </p>
                </div>
                {manifest ? (
                  <a
                    href={manifest.text}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-sky-700"
                  >
                    Open extracted text
                  </a>
                ) : null}
              </div>
              <StoredPageTables registration={registration} page={sourcePage!} />
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

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">
                {currentMapping.confirmed
                  ? "Confirmed"
                  : redrawMode
                    ? "Drag a new rectangle on the page"
                    : "Suggested rectangle ready for confirmation"}
              </p>
              <p className="mt-1 font-mono text-xs leading-5 text-amber-800">
                x {currentMapping.rect.x.toFixed(4)} · y{" "}
                {currentMapping.rect.y.toFixed(4)} · w{" "}
                {currentMapping.rect.width.toFixed(4)} · h{" "}
                {currentMapping.rect.height.toFixed(4)}
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={confirmCurrent}
                disabled={!imageReady}
                className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-zinc-300"
              >
                Confirm rectangle and continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setRedrawMode(true);
                  setCurrentMapping({ confirmed: false });
                }}
                disabled={!imageReady}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-300"
              >
                Redraw this rectangle
              </button>
              <button
                type="button"
                onClick={resetSuggestion}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
              >
                Restore suggested rectangle
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={goPrevious}
                disabled={stageIndex === 0 && itemIndex === 0}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600 disabled:text-zinc-300"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={
                  stageIndex === STAGES.length - 1 &&
                  itemIndex === stage.items.length - 1
                }
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600 disabled:text-zinc-300"
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

            <div className="mt-4 max-h-64 space-y-1 overflow-y-auto">
              {stageMappings.map((entry, index) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => {
                    setItemIndex(index);
                    setRedrawMode(false);
                  }}
                  className={[
                    "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs",
                    index === itemIndex ? "bg-zinc-950 text-white" : "hover:bg-zinc-50",
                  ].join(" ")}
                >
                  <span className="truncate pr-2">{entry.item.label}</span>
                  <span className="font-semibold">
                    {entry.mapping.confirmed ? "✓" : "—"}
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
              Form fields export with A4 PDF coordinates; AFM regions export with
              normalized image coordinates.
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
              {saveStatus ? (
                <p className="text-xs text-zinc-500">{saveStatus}</p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
