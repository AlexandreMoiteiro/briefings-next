import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
import { getP2006TDownloadMode } from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV18,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v18";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

type Rect = { x: number; y: number; width: number; height: number };
type CoordinateMap = { formRects: Record<string, Rect> };

const COORDS = coordinatesJson as CoordinateMap;
const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const SOURCE_WIDTH = 595;
const SOURCE_HEIGHT = 842;
const SPREAD_GAP = 8;
const SPREAD_HALF = (A3_WIDTH - SPREAD_GAP) / 2;
const SPREAD_SCALE = Math.min(
  SPREAD_HALF / SOURCE_WIDTH,
  A3_HEIGHT / SOURCE_HEIGHT
);
const FORM_X = SPREAD_HALF + SPREAD_GAP;
const FORM_Y = (A3_HEIGHT - SOURCE_HEIGHT * SPREAD_SCALE) / 2;
const CACHE_LIMIT = 6;
const PDF_CACHE = new Map<string, Uint8Array>();

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function dateForPdf(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}

function roleLabel(role: P2006TPerformanceRow["role"]) {
  return role === "Alternate" ? "Alternate 1" : role;
}

function sourcePoint(x: number, y: number) {
  return {
    x: FORM_X + x * SPREAD_SCALE,
    y: FORM_Y + y * SPREAD_SCALE,
  };
}

function drawSourceLine(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness = 0.56
) {
  page.drawLine({
    start: sourcePoint(x1, y1),
    end: sourcePoint(x2, y2),
    thickness,
    color: rgb(0.15, 0.15, 0.15),
  });
}

function clustered(values: number[], tolerance = 2.6) {
  const ordered = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  ordered.forEach((value) => {
    const group = groups.at(-1);
    if (!group || Math.abs(value - group.at(-1)!) > tolerance) {
      groups.push([value]);
    } else {
      group.push(value);
    }
  });
  return groups.map(
    (group) => group.reduce((sum, value) => sum + value, 0) / group.length
  );
}

function repairCompleteFormGrid(page: PDFPage) {
  const left = 29.5;
  const label = 184.42;
  const departure = 298.5;
  const arrival = 420.3;
  const alternateSplit = 480.34;
  const right = 540.38;
  const bottom = 74.7;
  const fuelTop = 365.35;
  const performanceBottom = 386.72;
  const performanceTop = 499.02;
  const dataBottom = 519.59;
  const dataTop = 674.74;
  const airfieldBottom = 696.17;
  const top = 763.1;

  const horizontalEdges = clustered([
    bottom,
    top,
    ...Object.values(COORDS.formRects).flatMap((rect) => [
      rect.y,
      rect.y + rect.height,
    ]),
  ]).filter((y) => y >= bottom - 1 && y <= top + 1);

  horizontalEdges.forEach((y) => drawSourceLine(page, left, y, right, y, 0.5));
  drawSourceLine(page, left, bottom, left, top, 0.68);
  drawSourceLine(page, right, bottom, right, top, 0.68);

  const segments: Array<[number, number, number]> = [
    [label, performanceBottom, performanceTop],
    [label, dataBottom, dataTop],
    [label, airfieldBottom, 738.3],
    [departure, bottom, fuelTop],
    [departure, performanceBottom, performanceTop],
    [departure, dataBottom, dataTop],
    [departure, airfieldBottom, 738.3],
    [arrival, bottom, fuelTop],
    [arrival, performanceBottom, performanceTop],
    [arrival, dataBottom, 738.3],
    [alternateSplit, performanceBottom, performanceTop],
    [alternateSplit, dataBottom, 738.3],
  ];

  segments.forEach(([x, y1, y2]) => drawSourceLine(page, x, y1, x, y2));
}

async function finishFormGrid(bytes: Uint8Array) {
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() > 0) repairCompleteFormGrid(output.getPage(0));
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

function pageTitle(
  input: BuildP2006TPerformancePdfV3Input,
  index: number,
  pageCount: number
) {
  if (index < input.rows.length) {
    const row = input.rows[index];
    return `${roleLabel(row.role)} | ${row.icao} | RWY ${row.runway}`;
  }
  if (index === input.rows.length) return "Enroute climb";
  if (index === input.rows.length + 1) return "Cruise performance";
  if (index === pageCount - 1) return "OEI / VySE aerodrome summary";
  return "P2006T performance evidence";
}

function drawHeader(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  index: number,
  pageCount: number,
  regular: PDFFont,
  bold: PDFFont
) {
  page.drawRectangle({
    x: 18,
    y: A3_HEIGHT - 47,
    width: A3_WIDTH - 36,
    height: 29,
    color: rgb(0.075, 0.12, 0.22),
  });
  page.drawText(pageTitle(input, index, pageCount), {
    x: 30,
    y: A3_HEIGHT - 37,
    size: 10.5,
    font: bold,
    color: rgb(1, 1, 1),
  });
  const right = `${input.registration} | ${dateForPdf(input.date)} | ${
    index + 1
  }/${pageCount}`;
  const width = regular.widthOfTextAtSize(right, 8.1);
  page.drawText(right, {
    x: A3_WIDTH - 30 - width,
    y: A3_HEIGHT - 36.5,
    size: 8.1,
    font: regular,
    color: rgb(0.9, 0.93, 0.98),
  });
}

function normalizedContentRect(index: number, aerodromeCount: number) {
  const sourceWidth = index < aerodromeCount ? 595 : 1191;
  const sourceHeight = 842;
  const target = { x: 22, y: 20, width: A3_WIDTH - 44, height: A3_HEIGHT - 82 };
  const scale = Math.min(
    target.width / sourceWidth,
    target.height / sourceHeight
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: target.x + (target.width - width) / 2,
    y: target.y + (target.height - height) / 2,
    width,
    height,
  };
}

async function removeOuterFrames(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const source = await PDFDocument.load(bytes);
  const output = await PDFDocument.create();
  const regular = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const pageCount = source.getPageCount();
  const aerodromeCount = Math.min(input.rows.length, pageCount);

  for (let index = 0; index < pageCount; index += 1) {
    const sourcePage = source.getPage(index);
    const content = normalizedContentRect(index, aerodromeCount);
    const crop = await output.embedPage(sourcePage, {
      left: content.x,
      bottom: content.y,
      right: content.x + content.width,
      top: content.y + content.height,
    });
    const page = output.addPage([A3_WIDTH, A3_HEIGHT]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: A3_WIDTH,
      height: A3_HEIGHT,
      color: rgb(1, 1, 1),
    });

    const target = { x: 18, y: 10, width: A3_WIDTH - 36, height: A3_HEIGHT - 65 };
    const scale = Math.min(target.width / crop.width, target.height / crop.height);
    const width = crop.width * scale;
    const height = crop.height * scale;
    page.drawPage(crop, {
      x: target.x + (target.width - width) / 2,
      y: target.y + (target.height - height) / 2,
      width,
      height,
    });
    drawHeader(page, input, index, pageCount, regular, bold);
  }

  output.setTitle(`P2006T ${input.registration} performance tables`);
  output.setSubject("P2006T performance tables and calculation evidence");
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

function cacheKey(
  input: BuildP2006TPerformancePdfV3Input,
  mode: ReturnType<typeof getP2006TDownloadMode>
) {
  return JSON.stringify({
    mode,
    registration: input.registration,
    date: input.date,
    loading: input.loading,
    fuelTimes: input.fuelTimes,
    mission: input.mission,
    rows: input.rows,
    cruiseTemperatureC: input.cruiseTemperatureC,
    options: input.options,
  });
}

function remember(key: string, bytes: Uint8Array) {
  if (PDF_CACHE.size >= CACHE_LIMIT) {
    const oldest = PDF_CACHE.keys().next().value as string | undefined;
    if (oldest) PDF_CACHE.delete(oldest);
  }
  PDF_CACHE.set(key, Uint8Array.from(bytes));
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const mode = getP2006TDownloadMode();
  const key = cacheKey(input, mode);
  const cached = PDF_CACHE.get(key);
  if (cached) return Uint8Array.from(cached);

  // Let the browser paint the busy state before pdf-lib starts processing.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  const bytes = await buildP2006TPerformancePdfV18(input);
  const output =
    mode === "form"
      ? await finishFormGrid(bytes)
      : mode === "tables"
        ? await removeOuterFrames(bytes, input)
        : bytes;

  remember(key, output);
  return Uint8Array.from(output);
}
