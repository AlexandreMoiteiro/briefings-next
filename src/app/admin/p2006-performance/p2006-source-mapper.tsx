"use client";

import { useEffect, useMemo, useState } from "react";
import {
  P2006T_REGISTRATIONS,
  type P2006TRegistration,
} from "@/lib/performance/p2006t-fleet";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type CaptureKind = "point" | "points" | "line" | "rect";
type Capture = {
  kind: CaptureKind;
  points: Point[];
  rect?: Rect;
  confirmed: boolean;
};
type CaptureStore = Record<string, Capture>;
type DragState = {
  startX: number;
  startY: number;
  x: number;
  y: number;
} | null;

type StepMetadata = Record<string, string | number | boolean | null>;

type GuidedStep = {
  id: string;
  group: string;
  title: string;
  instruction: string;
  kind: CaptureKind;
  requiredPoints?: number;
  minPoints?: number;
  maxPoints?: number;
  lineMode?: "segment" | "polyline";
  metadata?: StepMetadata;
};

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
  steps: GuidedStep[];
};

type Stage = {
  id: string;
  type: "performance" | "mass-balance" | "form";
  title: string;
  shortTitle: string;
  description: string;
  steps: GuidedStep[];
  source?: PerformanceSourceDefinition;
  page?: 1 | 2;
};

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const STORAGE_KEY = "briefings_p2006_guided_mapper_v5";

const PRESSURE_ALTITUDES = [
  { id: "sl", label: "S.L.", value: 0 },
  ...Array.from({ length: 10 }, (_, index) => {
    const value = (index + 1) * 1000;
    return { id: String(value), label: `${value.toLocaleString()} ft`, value };
  }),
];

const TEMPERATURE_COLUMNS = [
  { id: "minus-25", label: "-25 °C", value: -25 },
  { id: "0", label: "0 °C", value: 0 },
  { id: "25", label: "25 °C", value: 25 },
  { id: "50", label: "50 °C", value: 50 },
  { id: "isa", label: "ISA", value: "ISA" },
] as const;

function makePerformanceTableSteps(): GuidedStep[] {
  const steps: GuidedStep[] = [
    {
      id: "data-grid-corners",
      group: "Table frame",
      title: "Data grid corners",
      instruction:
        "Click four corners of the numeric data grid in this order: top-left, top-right, bottom-left, bottom-right. Do not include the notes or corrections block.",
      kind: "points",
      requiredPoints: 4,
      metadata: { role: "data-grid" },
    },
    {
      id: "pressure-altitude-column-x",
      group: "Column centres",
      title: "Pressure-altitude label column",
      instruction:
        "Click once in the horizontal centre of the Pressure Altitude label column. Only its X coordinate will be used.",
      kind: "point",
      metadata: { axis: "column", key: "pressure-altitude", dimension: "x" },
    },
    {
      id: "row-type-column-x",
      group: "Column centres",
      title: "Ground Roll / 50 ft label column",
      instruction:
        "Click once in the horizontal centre of the column containing Ground Roll and At 50 ft AGL. Only its X coordinate will be used.",
      kind: "point",
      metadata: { axis: "column", key: "row-type", dimension: "x" },
    },
  ];

  for (const column of TEMPERATURE_COLUMNS) {
    steps.push({
      id: `temperature-column-${column.id}`,
      group: "Column centres",
      title: `${column.label} column centre`,
      instruction: `Click once in the horizontal centre of the ${column.label} data column. Only its X coordinate will be used.`,
      kind: "point",
      metadata: {
        axis: "column",
        key: `temperature-${column.id}`,
        value: column.value,
        dimension: "x",
      },
    });
  }

  for (const altitude of PRESSURE_ALTITUDES) {
    for (const output of [
      { id: "ground-roll", label: "Ground Roll" },
      { id: "50ft", label: "At 50 ft AGL" },
    ]) {
      steps.push({
        id: `row-${altitude.id}-${output.id}`,
        group: "Row centres",
        title: `${altitude.label} · ${output.label}`,
        instruction: `Click once on the vertical centreline of the ${altitude.label} ${output.label} row, preferably inside the row-label column. Only its Y coordinate will be used.`,
        kind: "point",
        metadata: {
          axis: "row",
          altitudeFt: altitude.value,
          output: output.id,
          dimension: "y",
        },
      });
    }
  }

  for (const sourceLine of [
    {
      id: "reference-weight",
      title: "Reference weight",
      instruction: "Draw a tight rectangle around the published Weight value.",
      role: "condition-weight",
    },
    {
      id: "runway-condition",
      title: "Runway condition",
      instruction: "Draw a tight rectangle around the published Runway condition.",
      role: "condition-runway",
    },
    {
      id: "correction-headwind",
      title: "Headwind correction",
      instruction: "Draw a tight rectangle around the complete Headwind correction line.",
      role: "correction-headwind",
    },
    {
      id: "correction-tailwind",
      title: "Tailwind correction",
      instruction: "Draw a tight rectangle around the complete Tailwind correction line.",
      role: "correction-tailwind",
    },
    {
      id: "correction-paved",
      title: "Paved-runway correction",
      instruction: "Draw a tight rectangle around the complete Paved Runway correction line.",
      role: "correction-paved",
    },
    {
      id: "correction-slope",
      title: "Runway-slope correction",
      instruction: "Draw a tight rectangle around the complete Runway slope correction line.",
      role: "correction-slope",
    },
  ]) {
    steps.push({
      id: sourceLine.id,
      group: "Published conditions and corrections",
      title: sourceLine.title,
      instruction: sourceLine.instruction,
      kind: "rect",
      metadata: { role: sourceLine.role },
    });
  }

  return steps;
}

const PERFORMANCE_TABLE_STEPS = makePerformanceTableSteps();

const PERFORMANCE_SOURCES: PerformanceSourceDefinition[] = [
  {
    id: "takeoff",
    title: "Takeoff table calibration",
    shortTitle: "AFM Takeoff",
    description:
      "Map the actual column and row centres required to locate every Ground Roll and 50 ft cell on the same takeoff page.",
    steps: PERFORMANCE_TABLE_STEPS,
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
    title: "Landing table calibration",
    shortTitle: "AFM Landing",
    description:
      "Map the actual column and row centres required to locate every Ground Roll and 50 ft cell on the same landing page.",
    steps: PERFORMANCE_TABLE_STEPS,
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

function pointStep(
  id: string,
  group: string,
  title: string,
  instruction: string,
  metadata: StepMetadata
): GuidedStep {
  return { id, group, title, instruction, kind: "point", metadata };
}

function lineStep(
  id: string,
  group: string,
  title: string,
  instruction: string,
  metadata: StepMetadata,
  lineMode: "segment" | "polyline" = "segment"
): GuidedStep {
  return {
    id,
    group,
    title,
    instruction,
    kind: "line",
    lineMode,
    minPoints: 2,
    maxPoints: lineMode === "segment" ? 2 : 8,
    metadata,
  };
}

function makeMassBalanceSteps(): GuidedStep[] {
  const steps: GuidedStep[] = [];

  for (const panel of [
    ["front-seats", "Occupants front seats"],
    ["rear-seats", "Occupants rear seats"],
    ["fuel", "Fuel mass"],
    ["baggage", "Baggage mass"],
    ["cg-limits", "Flight mass / C.G. limits"],
  ] as const) {
    steps.push({
      id: `panel-${panel[0]}`,
      group: "Panel geometry",
      title: `${panel[1]} panel corners`,
      instruction:
        "Click the four usable graph corners in this order: top-left, top-right, bottom-left, bottom-right.",
      kind: "points",
      requiredPoints: 4,
      metadata: { role: "panel", panel: panel[0] },
    });
  }

  for (let value = 140; value <= 500; value += 20) {
    steps.push(
      pointStep(
        `moment-tick-${value}`,
        "Moment axis ticks",
        `Empty-aircraft moment tick ${value} kg·m`,
        `Click the ${value} kg·m tick on the left vertical moment axis.`,
        { axis: "empty-aircraft-moment-kgm", value, dimension: "y" }
      )
    );
  }

  const xAxes = [
    {
      key: "front-seat-mass-kg",
      group: "Front-seat mass ticks",
      label: "front-seat mass",
      values: [0, 40, 80, 120, 160, 200],
    },
    {
      key: "rear-seat-mass-kg",
      group: "Rear-seat mass ticks",
      label: "rear-seat mass",
      values: [0, 40, 80, 120, 160, 200],
    },
    {
      key: "fuel-mass-kg",
      group: "Fuel mass ticks",
      label: "fuel mass",
      values: [0, 20, 40, 60, 80, 100],
    },
    {
      key: "baggage-mass-kg",
      group: "Baggage mass ticks",
      label: "baggage mass",
      values: [0, 10, 20, 30, 40],
    },
    {
      key: "flight-mass-kg",
      group: "Flight mass ticks",
      label: "flight mass",
      values: [900, 1000, 1100, 1200],
    },
  ];

  for (const axis of xAxes) {
    for (const value of axis.values) {
      steps.push(
        pointStep(
          `${axis.key}-tick-${value}`,
          axis.group,
          `${value} kg tick`,
          `Click the ${value} kg tick on the ${axis.label} axis.`,
          { axis: axis.key, value, dimension: "x" }
        )
      );
    }
  }

  for (const guide of [
    [
      "front-seat-max-guide",
      "Front-seat 200 kg guide line",
      "Trace the diagonal graph line that passes through the 200 kg front-seat tick. Click from top to bottom; add intermediate points only if needed.",
      "front-seats",
    ],
    [
      "rear-seat-max-guide",
      "Rear-seat 200 kg guide line",
      "Trace the sloping graph line that passes through the 200 kg rear-seat tick. Click from left to right; add intermediate points only if needed.",
      "rear-seats",
    ],
    [
      "fuel-max-guide",
      "Fuel 100 kg guide line",
      "Trace the diagonal graph line that passes through the 100 kg fuel tick.",
      "fuel",
    ],
    [
      "baggage-max-guide",
      "Baggage 40 kg guide line",
      "Trace the diagonal graph line that passes through the 40 kg baggage tick.",
      "baggage",
    ],
  ] as const) {
    steps.push(
      lineStep(
        guide[0],
        "Loading guide lines",
        guide[1],
        guide[2],
        { role: "loading-guide", panel: guide[3] },
        "polyline"
      )
    );
  }

  for (const limit of [
    ["cg-16-5-mac", "16.5% MAC limit", "16.5"],
    ["cg-23-mac", "23% MAC limit", "23"],
    ["cg-31-mac", "31% MAC limit", "31"],
  ] as const) {
    steps.push(
      lineStep(
        limit[0],
        "C.G. limit lines",
        limit[1],
        `Trace the complete ${limit[1]} line from its lower end to its upper end.`,
        { role: "cg-limit", macPercent: limit[2] },
        "polyline"
      )
    );
  }

  steps.push(
    lineStep(
      "mass-limit-1180",
      "Maximum mass lines",
      "1180 kg limit line",
      "Click the bottom and top of the vertical 1180 kg mass limit line.",
      { role: "mass-limit", valueKg: 1180 }
    ),
    lineStep(
      "mass-limit-1230",
      "Maximum mass lines",
      "1230 kg limit line",
      "Click the bottom and top of the vertical 1230 kg mass limit line.",
      { role: "mass-limit", valueKg: 1230 }
    )
  );

  return steps;
}

const MASS_BALANCE_STEPS = makeMassBalanceSteps();

const FORM_PAGE_1_FIELD_STEPS: GuidedStep[] = [
  {
    id: "pilot-front-seat-mass",
    group: "Loading fields",
    title: "Pilot and front-seat mass",
    instruction:
      "Draw the exact writable rectangle in the YOUR AIRPLANE column for Pilot & Front Seat.",
    kind: "rect",
    metadata: { field: "pilot-front-seat-mass", valueType: "number" },
  },
  {
    id: "rear-seats-mass",
    group: "Loading fields",
    title: "Rear-seats mass",
    instruction:
      "Draw the exact writable rectangle in the YOUR AIRPLANE column for Rear Seats.",
    kind: "rect",
    metadata: { field: "rear-seats-mass", valueType: "number" },
  },
  {
    id: "fuel-mass",
    group: "Loading fields",
    title: "Fuel mass",
    instruction:
      "Draw the exact writable rectangle in the YOUR AIRPLANE column for Fuel Mass.",
    kind: "rect",
    metadata: { field: "fuel-mass", valueType: "number" },
  },
  {
    id: "baggage-mass",
    group: "Loading fields",
    title: "Baggage mass",
    instruction:
      "Draw the exact writable rectangle in the YOUR AIRPLANE column for Baggage.",
    kind: "rect",
    metadata: { field: "baggage-mass", valueType: "number" },
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

const FORM_PAGE_2_FIELD_STEPS: GuidedStep[] = [
  {
    id: "date",
    group: "Header fields",
    title: "Date",
    instruction: "Draw the writable rectangle beside Date.",
    kind: "rect",
    metadata: { field: "date", valueType: "text" },
  },
  {
    id: "aircraft-registration",
    group: "Header fields",
    title: "Aircraft registration",
    instruction: "Draw the writable rectangle beside Aircraft Reg.",
    kind: "rect",
    metadata: { field: "aircraft-registration", valueType: "text" },
  },
  ...AIRFIELD_COLUMNS.map((column) => ({
    id: `${column}-airfield`,
    group: "Airfield names",
    title: `${column[0].toUpperCase()}${column.slice(1)} airfield`,
    instruction: `Draw the ${column} Airfield rectangle.`,
    kind: "rect" as const,
    metadata: { field: `${column}-airfield`, valueType: "text" },
  })),
  ...AIRFIELD_ROWS.flatMap(([rowId, rowLabel, valueType]) =>
    AIRFIELD_COLUMNS.map((column) => ({
      id: `${column}-${rowId}`,
      group: "Airfield conditions",
      title: `${column[0].toUpperCase()}${column.slice(1)} ${rowLabel}`,
      instruction: `Draw the ${rowLabel} rectangle in the ${column} column.`,
      kind: "rect" as const,
      metadata: { field: `${column}-${rowId}`, valueType },
    }))
  ),
  ...PERFORMANCE_ROWS.flatMap(([rowId, rowLabel]) =>
    AIRFIELD_COLUMNS.map((column) => ({
      id: `${column}-${rowId}`,
      group: "Performance results",
      title: `${column[0].toUpperCase()}${column.slice(1)} ${rowLabel}`,
      instruction: `Draw the ${rowLabel} rectangle in the ${column} performance column.`,
      kind: "rect" as const,
      metadata: { field: `${column}-${rowId}`, valueType: "number" },
    }))
  ),
  ...FUEL_ROWS.flatMap((rowLabel, index) =>
    (["time", "fuel"] as const).map((column) => ({
      id: `fuel-${index + 1}-${column}`,
      group: "Fuel planning",
      title: `${rowLabel} · ${column === "time" ? "Time" : "Fuel"}`,
      instruction: `Draw the ${column} rectangle for fuel-planning row ${index + 1}: ${rowLabel}.`,
      kind: "rect" as const,
      metadata: {
        field: `fuel-${index + 1}-${column}`,
        valueType: column === "time" ? "text" : "number",
      },
    }))
  ),
];

const STAGES: Stage[] = [
  ...PERFORMANCE_SOURCES.map((source) => ({
    id: `performance-${source.id}`,
    type: "performance" as const,
    title: source.title,
    shortTitle: source.shortTitle,
    description: source.description,
    source,
    steps: source.steps,
  })),
  {
    id: "mass-balance-graph",
    type: "mass-balance",
    title: "Mass & Balance graph calibration",
    shortTitle: "M&B graph",
    description:
      "Map panel corners, metric ticks, loading guide lines and the published C.G. and maximum-mass limit lines.",
    page: 1,
    steps: MASS_BALANCE_STEPS,
  },
  {
    id: "form-page-1-fields",
    type: "form",
    title: "Form page 1 writable fields",
    shortTitle: "Form page 1",
    description: "Map only the rectangles where loading values will be written.",
    page: 1,
    steps: FORM_PAGE_1_FIELD_STEPS,
  },
  {
    id: "form-page-2-fields",
    type: "form",
    title: "Form page 2 writable fields",
    shortTitle: "Form page 2",
    description:
      "Map the airfield, performance and fuel-planning rectangles where values will be written.",
    page: 2,
    steps: FORM_PAGE_2_FIELD_STEPS,
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
  step: GuidedStep
) {
  return stage.type === "performance"
    ? `${stage.id}:${registration}:${step.id}`
    : `${stage.id}:${step.id}`;
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
            vectorEffect="non-scaling-stroke"
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
        const viewport = pdfPage.getViewport({ scale: 1.8 });
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
  const [stepIndex, setStepIndex] = useState(0);
  const [captures, setCaptures] = useState<CaptureStore>({});
  const [captureMode, setCaptureMode] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);
  const [imageReady, setImageReady] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);
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
  const sourceAsset =
    stage.type === "performance" ? stage.source!.manifest[registration] : null;
  const currentKey = mappingKey(stage, registration, step);
  const currentCapture = captures[currentKey];

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
  const draftRect = drag ? rectFromDrag(drag) : null;
  const currentComplete = captureIsComplete(step, currentCapture);

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

  function beginCapture() {
    replaceCurrentCapture(undefined);
    setCaptureMode(true);
    setDrag(null);
  }

  function confirmCurrent() {
    if (!currentCapture || !currentComplete || captureMode) return;
    replaceCurrentCapture({ ...currentCapture, confirmed: true });
    goNext();
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
    if (step.kind !== "line" || !currentComplete) return;
    setCaptureMode(false);
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
    replaceCurrentCapture({
      kind: step.kind,
      points,
      confirmed: false,
    });

    if (step.kind === "point") {
      setCaptureMode(false);
    } else if (
      step.kind === "points" &&
      points.length >= (step.requiredPoints ?? 1)
    ) {
      setCaptureMode(false);
    } else if (
      step.kind === "line" &&
      step.lineMode === "segment" &&
      points.length >= (step.maxPoints ?? 2)
    ) {
      setCaptureMode(false);
    }
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
    replaceCurrentCapture({
      kind: "rect",
      points: [],
      rect,
      confirmed: false,
    });
    setDrag(null);
    setCaptureMode(false);
  }

  function saveCaptures() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(captures));
    setSaveStatus("Guided mapping saved in this browser.");
  }

  function exportCaptures() {
    const entries = Object.fromEntries(
      Object.entries(captures).map(([key, capture]) => {
        const isPdfGeometry =
          key.startsWith("mass-balance-graph:") ||
          key.startsWith("form-page-");
        return [
          key,
          {
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
          },
        ];
      })
    );

    downloadJson("p2006t-guided-coordinate-map.json", {
      version: 5,
      registration,
      performanceSources: PERFORMANCE_SOURCES.map((source) => ({
        id: source.id,
        asset: source.manifest[registration],
      })),
      stageDefinitions: STAGES.map((candidate) => ({
        id: candidate.id,
        type: candidate.type,
        page: candidate.page ?? null,
        steps: candidate.steps.map((candidateStep) => ({
          id: candidateStep.id,
          group: candidateStep.group,
          title: candidateStep.title,
          kind: candidateStep.kind,
          metadata: candidateStep.metadata ?? null,
        })),
      })),
      coordinateSystem: {
        normalized: "x/y 0..1 with top-left origin",
        pdf: "A4 points with bottom-left origin",
      },
      captures: entries,
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
            Ticks and lines for graphs, rows and columns for tables
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            Performance tables are calibrated from their column and row centres so any
            calculation cell can be highlighted later. The M&B graph is calibrated from
            panel corners, axis ticks, guide lines and C.G. limits, following the same
            principle as the Piper graph builder. Rectangles are used only for writable
            form fields and published text blocks.
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
                {confirmed}/{candidate.steps.length} confirmed
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
                Show confirmed geometry
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

          <div className="max-h-[78vh] overflow-auto rounded-2xl border border-zinc-300 bg-zinc-100 p-2">
            <div
              className="relative mx-auto w-full max-w-[980px] select-none bg-white"
              style={{ cursor: captureMode && imageReady ? "crosshair" : "default" }}
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Current task
                </p>
                <p className="mt-1 text-xs font-semibold text-sky-700">{step.group}</p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                {stepIndex + 1}/{stage.steps.length}
              </span>
            </div>
            <h3 className="mt-2 text-xl font-semibold text-zinc-950">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {step.instruction}
            </p>

            <div
              className={[
                "mt-4 rounded-2xl border p-4 text-sm",
                currentCapture
                  ? currentCapture.confirmed
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-amber-200 bg-amber-50 text-amber-950"
                  : "border-sky-200 bg-sky-50 text-sky-950",
              ].join(" ")}
            >
              {currentCapture ? (
                <>
                  <p className="font-semibold">
                    {currentCapture.confirmed
                      ? "Geometry confirmed"
                      : currentComplete
                        ? "Geometry captured — confirm it or recapture"
                        : `${currentCapture.points.length} point(s) captured`}
                  </p>
                  {currentCapture.rect ? (
                    <p className="mt-1 font-mono text-xs leading-5 opacity-80">
                      x {currentCapture.rect.x.toFixed(4)} · y{" "}
                      {currentCapture.rect.y.toFixed(4)} · w{" "}
                      {currentCapture.rect.width.toFixed(4)} · h{" "}
                      {currentCapture.rect.height.toFixed(4)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs leading-5 opacity-80">
                      Points: {currentCapture.points.length}
                      {step.requiredPoints ? ` / ${step.requiredPoints}` : ""}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold">Nothing captured yet</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">
                    Start capture and follow the instruction above on the page.
                  </p>
                </>
              )}
            </div>

            {captureMode ? (
              <div className="mt-4 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-sm font-semibold text-fuchsia-900">
                {step.kind === "rect"
                  ? "Drag over the exact area and release."
                  : step.kind === "point"
                    ? "Click the requested tick or centre once."
                    : step.kind === "points"
                      ? `Click the requested points in order (${currentCapture?.points.length ?? 0}/${step.requiredPoints}).`
                      : "Click points along the requested line. Finish the line when complete."}
              </div>
            ) : null}

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                disabled={!imageReady}
                onClick={beginCapture}
                className="rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:bg-zinc-300"
              >
                {currentCapture ? "Recapture geometry" : "Start capture"}
              </button>

              {step.kind === "line" && captureMode ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!currentCapture || currentCapture.points.length === 0}
                    onClick={undoLastPoint}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-600 disabled:text-zinc-300"
                  >
                    Undo point
                  </button>
                  <button
                    type="button"
                    disabled={!currentComplete}
                    onClick={finishPolyline}
                    className="rounded-xl border border-fuchsia-300 bg-fuchsia-50 px-3 py-2 text-sm font-semibold text-fuchsia-800 disabled:text-zinc-300"
                  >
                    Finish line
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                disabled={!currentComplete || captureMode}
                onClick={confirmCurrent}
                className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-zinc-300"
              >
                Confirm and continue
              </button>
              <button
                type="button"
                disabled={!currentCapture}
                onClick={() => replaceCurrentCapture(undefined)}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:text-zinc-300"
              >
                Clear current geometry
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={stageIndex === 0 && stepIndex === 0}
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
                {stage.steps.map((candidate, index) => {
                  const key = mappingKey(stage, registration, candidate);
                  const status = captures[key]?.confirmed
                    ? "✓"
                    : captures[key]
                      ? "•"
                      : "—";
                  return (
                    <option key={candidate.id} value={index}>
                      {status} {candidate.group} · {candidate.title}
                    </option>
                  );
                })}
              </select>
            </label>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Save and export
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              {totalConfirmed}/{totalItems} geometry items confirmed. Performance-page
              coordinates remain normalized to their PNG; graph and form coordinates also
              export in A4 PDF points.
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
