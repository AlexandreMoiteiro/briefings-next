import {
  PDFDocument,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import distanceOverlaysJson from "@/lib/performance/p2006t-table-overlays.json";
import type {
  P2006TInterpolationTrace,
  P2006TPerformanceRow,
} from "@/lib/performance/p2006t-performance";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV5,
  DEFAULT_P2006T_PDF_OPTIONS,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v5";
import { downloadP2006TPerformancePdfV3 } from "./p2006t-performance-pdf-v3";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A3_WIDTH = 842;
const A3_HEIGHT = 1191;
const OM_FACTOR = 1.25;
const TEMPERATURES = [-25, 0, 25, 50] as const;

type Rect = { x: number; y: number; width: number; height: number };
type TableOverlay = {
  columns: number[];
  rows: number[];
  notesRect?: { x: number; y: number; width: number; height: number };
};
type SourcePage = {
  image: string;
  weightKg: number;
};

const DISTANCE_OVERLAYS = distanceOverlaysJson as Record<string, TableOverlay>;

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function whole(value: number) {
  return Math.round(Number(value || 0));
}

function rounded(value: number, increment: number) {
  return Math.round(Number(value || 0) / increment) * increment;
}

function roleLabel(role: P2006TPerformanceRow["role"]) {
  return role === "Alternate" ? "Alternate 1" : role;
}

function omValues(row: P2006TPerformanceRow) {
  const takeoff = whole(row.takeoff50M * OM_FACTOR);
  const landing = whole(row.landing50M * OM_FACTOR);
  return {
    takeoff,
    landing,
    takeoffPct: whole((takeoff / Math.max(1, row.todaM)) * 100),
    landingPct: whole((landing / Math.max(1, row.ldaM)) * 100),
  };
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawNotes(
  page: PDFPage,
  row: P2006TPerformanceRow,
  font: PDFFont,
  bold: PDFFont,
  rect: Rect
) {
  const om = omValues(row);
  const corrections = ["paved runway", "wind"];
  if (row.uphillSlopePct > 0.05) {
    corrections.push(`about ${row.uphillSlopePct.toFixed(1)}% upslope`);
  }
  const lines = [
    `Let's consider about ${rounded(row.takeoffWeightKg, 10)} kg, ${rounded(
      row.paFt,
      100
    )} ft pressure altitude and ${rounded(row.oatC, 5)} C.`,
    `The surrounding AFM cells are interpolated and the ${corrections.join(
      ", "
    )} corrections are applied.`,
    `Take-off to 50 ft is about ${whole(row.takeoff50M)} m; with the OM buffer (x1.25), use ${om.takeoff} m, about ${om.takeoffPct}% of the ${whole(
      row.todaM
    )} m TODA.`,
    `Landing from 50 ft is about ${whole(row.landing50M)} m; with the OM buffer, use ${om.landing} m, about ${om.landingPct}% of the ${whole(
      row.ldaM
    )} m LDA.`,
  ];

  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.34, 0.35, 0.38),
    borderWidth: 0.55,
  });

  let y = rect.y + rect.height - 18;
  lines.forEach((line, index) => {
    const selectedFont = index === 0 ? bold : font;
    const size = index === 0 ? 8.4 : 7.7;
    wrapText(line, selectedFont, size, rect.width - 22)
      .slice(0, 2)
      .forEach((part) => {
        page.drawText(part, {
          x: rect.x + 11,
          y,
          size,
          font: selectedFont,
          color: rgb(0.06, 0.07, 0.09),
        });
        y -= 13;
      });
    y -= 2;
  });
}

function cellBounds(centers: readonly number[], index: number) {
  const center = centers[index];
  const previous = centers[index - 1];
  const next = centers[index + 1];
  const start =
    previous === undefined ? center - (next - center) / 2 : (previous + center) / 2;
  const end =
    next === undefined ? center + (center - previous) / 2 : (center + next) / 2;
  return [start, end] as const;
}

function drawNormalizedCell({
  page,
  overlay,
  imageRect,
  rowIndex,
  columnIndex,
}: {
  page: PDFPage;
  overlay: TableOverlay;
  imageRect: Rect;
  rowIndex: number;
  columnIndex: number;
}) {
  if (
    overlay.rows[rowIndex] === undefined ||
    overlay.columns[columnIndex] === undefined
  ) {
    return;
  }
  const [top, bottom] = cellBounds(overlay.rows, rowIndex);
  const [left, right] = cellBounds(overlay.columns, columnIndex);
  page.drawRectangle({
    x: imageRect.x + left * imageRect.width,
    y: imageRect.y + (1 - bottom) * imageRect.height,
    width: (right - left) * imageRect.width,
    height: (bottom - top) * imageRect.height,
    color: rgb(1, 0.72, 0.02),
    opacity: 0.23,
    borderColor: rgb(0.9, 0.25, 0.02),
    borderWidth: 0.9,
  });
}

function highlightTrace(
  page: PDFPage,
  overlay: TableOverlay,
  imageRect: Rect,
  trace: P2006TInterpolationTrace
) {
  const rows = Array.from(
    new Set(
      [trace.lowerAltitudeFt, trace.upperAltitudeFt].map(
        (altitude) =>
          Math.max(0, Math.min(10, Math.round(altitude / 1000))) * 2 +
          (trace.profile === "50ft" ? 1 : 0)
      )
    )
  );
  const columns = Array.from(
    new Set(
      [trace.lowerTemperatureC, trace.upperTemperatureC]
        .map((temperature) =>
          TEMPERATURES.indexOf(temperature as (typeof TEMPERATURES)[number])
        )
        .filter((index) => index >= 0)
    )
  );
  rows.forEach((rowIndex) =>
    columns.forEach((columnIndex) =>
      drawNormalizedCell({ page, overlay, imageRect, rowIndex, columnIndex })
    )
  );
}

function overlayKey(
  registration: P2006TRegistration,
  family: "takeoff" | "landing",
  weightKg: number
) {
  const weight = weightKg === 930 ? 930 : weightKg === 1080 ? 1080 : 1180;
  return `${registration}:${family}:${weight}`;
}

function zoomedImageRect(image: PDFImage, target: Rect, zoom = 1.15) {
  const baseScale = Math.min(target.width / image.width, target.height / image.height);
  const scale = baseScale * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: target.x + (target.width - width) / 2,
    y: target.y + (target.height - height) / 2,
    width,
    height,
  };
}

async function imageFor(
  output: PDFDocument,
  cache: Map<string, Promise<PDFImage>>,
  path: string
) {
  let pending = cache.get(path);
  if (!pending) {
    pending = fetch(path, { cache: "force-cache" }).then(async (response) => {
      if (!response.ok) throw new Error(`Cannot load AFM page ${path}.`);
      return output.embedPng(await response.arrayBuffer());
    });
    cache.set(path, pending);
  }
  return pending;
}

async function drawSourceTable({
  output,
  page,
  cache,
  source,
  family,
  trace,
  target,
  label,
  registration,
  bold,
}: {
  output: PDFDocument;
  page: PDFPage;
  cache: Map<string, Promise<PDFImage>>;
  source: SourcePage;
  family: "takeoff" | "landing";
  trace: P2006TInterpolationTrace;
  target: Rect;
  label: string;
  registration: P2006TRegistration;
  bold: PDFFont;
}) {
  const image = await imageFor(output, cache, source.image);
  const imageRect = zoomedImageRect(image, target);
  const overlay = DISTANCE_OVERLAYS[
    overlayKey(registration, family, source.weightKg)
  ];

  page.drawText(label, {
    x: target.x,
    y: target.y + target.height + 8,
    size: 8.8,
    font: bold,
    color: rgb(0.07, 0.08, 0.11),
  });
  page.drawRectangle({
    ...target,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.78, 0.79, 0.82),
    borderWidth: 0.45,
  });
  page.pushOperators(
    pushGraphicsState(),
    rectangle(target.x, target.y, target.width, target.height),
    clip(),
    endPath()
  );
  page.drawImage(image, imageRect);
  if (overlay) highlightTrace(page, overlay, imageRect, trace);
  page.pushOperators(popGraphicsState());
}

function orderedSources(trace: P2006TInterpolationTrace) {
  return [...(trace.sourcePages as SourcePage[])].sort(
    (a, b) => a.weightKg - b.weightKg
  );
}

async function drawAerodromePage(
  output: PDFDocument,
  row: P2006TPerformanceRow,
  registration: P2006TRegistration,
  cache: Map<string, Promise<PDFImage>>
) {
  const page = output.addPage([A3_WIDTH, A3_HEIGHT]);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);

  page.drawText(`${roleLabel(row.role)} ${row.icao} RWY ${row.runway}`, {
    x: 30,
    y: A3_HEIGHT - 39,
    size: 18,
    font: bold,
    color: rgb(0.04, 0.06, 0.1),
  });
  page.drawText(
    `Weight about ${rounded(row.takeoffWeightKg, 10)} kg | PA about ${rounded(
      row.paFt,
      100
    )} ft | OAT about ${rounded(row.oatC, 5)} C | Wind ${whole(
      row.windFrom
    )}/${whole(row.windKt)} kt`,
    {
      x: 30,
      y: A3_HEIGHT - 57,
      size: 8.7,
      font,
      color: rgb(0.3, 0.33, 0.38),
    }
  );

  const margin = 30;
  const gapX = 22;
  const gapY = 34;
  const cellWidth = (A3_WIDTH - margin * 2 - gapX) / 2;
  const cellHeight = 405;
  const topY = 665;
  const bottomY = topY - cellHeight - gapY;
  const cells: Rect[] = [
    { x: margin, y: topY, width: cellWidth, height: cellHeight },
    { x: margin + cellWidth + gapX, y: topY, width: cellWidth, height: cellHeight },
    { x: margin, y: bottomY, width: cellWidth, height: cellHeight },
    { x: margin + cellWidth + gapX, y: bottomY, width: cellWidth, height: cellHeight },
  ];

  const takeoff = orderedSources(row.takeoffTrace);
  const landing = orderedSources(row.landingTrace);
  const tables = [
    takeoff[0]
      ? {
          source: takeoff[0],
          family: "takeoff" as const,
          trace: row.takeoffTrace,
          label: `Take-off ${whole(takeoff[0].weightKg)} kg`,
        }
      : null,
    takeoff[1]
      ? {
          source: takeoff[1],
          family: "takeoff" as const,
          trace: row.takeoffTrace,
          label: `Take-off ${whole(takeoff[1].weightKg)} kg`,
        }
      : null,
    landing[0]
      ? {
          source: landing[0],
          family: "landing" as const,
          trace: row.landingTrace,
          label: `Landing ${whole(landing[0].weightKg)} kg`,
        }
      : null,
    landing[1]
      ? {
          source: landing[1],
          family: "landing" as const,
          trace: row.landingTrace,
          label: `Landing ${whole(landing[1].weightKg)} kg`,
        }
      : null,
  ];

  await Promise.all(
    tables.map((table, index) =>
      table
        ? drawSourceTable({
            output,
            page,
            cache,
            target: cells[index],
            registration,
            bold,
            ...table,
          })
        : Promise.resolve()
    )
  );

  drawNotes(page, row, font, bold, {
    x: margin,
    y: 24,
    width: A3_WIDTH - margin * 2,
    height: 150,
  });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const baseBytes = await buildP2006TPerformancePdfV5({
    ...input,
    options: {
      ...input.options,
      includePerformanceTables: false,
    },
  });

  if (!input.options.includePerformanceTables) return baseBytes;

  const base = await PDFDocument.load(baseBytes);
  const output = await PDFDocument.create();
  const [formPage] = await output.copyPages(base, [0]);
  output.addPage(formPage);

  const cache = new Map<string, Promise<PDFImage>>();
  for (const row of input.rows) {
    await drawAerodromePage(output, row, input.registration, cache);
  }

  if (base.getPageCount() > 1) {
    const remaining = await output.copyPages(
      base,
      Array.from({ length: base.getPageCount() - 1 }, (_, index) => index + 1)
    );
    remaining.forEach((page) => output.addPage(page));
  }

  output.setTitle(`P2006T ${input.registration} M&B and Performance`);
  output.setSubject("P2006T forms, performance tables and kneeboard data");
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save({ useObjectStreams: true, addDefaultPage: false });
}
