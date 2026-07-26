import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV6,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v6";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

type Rect = { x: number; y: number; width: number; height: number };
type CoordinateMap = { formRects: Record<string, Rect> };

const COORDS = coordinatesJson as CoordinateMap;
const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const SOURCE_WIDTH = 595;
const SOURCE_HEIGHT = 842;
const GAP = 8;
const HALF = (A3_WIDTH - GAP) / 2;
const SCALE = Math.min(HALF / SOURCE_WIDTH, A3_HEIGHT / SOURCE_HEIGHT);
const RIGHT_PAGE_X = HALF + GAP;
const RIGHT_PAGE_Y = (A3_HEIGHT - SOURCE_HEIGHT * SCALE) / 2;

function rowForRole(rows: P2006TPerformanceRow[], role: string) {
  return rows.find((row) => row.role === role) ?? null;
}

function qfuText(row: P2006TPerformanceRow | null) {
  if (!row) return "";
  const qfu = String(Math.round(row.qfu)).padStart(3, "0");
  return `${row.runway} / ${qfu}`;
}

function spreadRect(rect: Rect): Rect {
  return {
    x: RIGHT_PAGE_X + rect.x * SCALE,
    y: RIGHT_PAGE_Y + rect.y * SCALE,
    width: rect.width * SCALE,
    height: rect.height * SCALE,
  };
}

function splitRect(rect: Rect) {
  const half = rect.width / 2;
  return [
    { ...rect, width: half },
    { ...rect, x: rect.x + half, width: half },
  ] as const;
}

function maskExistingText(
  page: PDFPage,
  rect: Rect,
  preferredSize: number
) {
  const horizontalInset = 1.2;
  const availableHeight = Math.max(0, rect.height - 4);
  const maskHeight = Math.min(availableHeight, preferredSize + 5);
  page.drawRectangle({
    x: rect.x + horizontalInset,
    y: rect.y + (rect.height - maskHeight) / 2,
    width: Math.max(0, rect.width - horizontalInset * 2),
    height: maskHeight,
    color: rgb(1, 1, 1),
  });
}

function drawCentered(
  page: PDFPage,
  rect: Rect,
  value: string,
  font: PDFFont,
  preferredSize: number
) {
  maskExistingText(page, rect, preferredSize);

  let size = preferredSize;
  while (size > 4.5 && font.widthOfTextAtSize(value, size) > rect.width - 5) {
    size -= 0.2;
  }
  const width = font.widthOfTextAtSize(value, size);
  page.drawText(value, {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - size) / 2 + 0.7,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function redrawQfuFields(
  page: PDFPage,
  rows: P2006TPerformanceRow[],
  font: PDFFont
) {
  const departureRect = COORDS.formRects["departure-runway-qfu"];
  const arrivalRect = COORDS.formRects["arrival-runway-qfu"];
  const alternateRect = COORDS.formRects["alternate-runway-qfu"];

  if (departureRect) {
    drawCentered(
      page,
      spreadRect(departureRect),
      qfuText(rowForRole(rows, "Departure")),
      font,
      7.2
    );
  }
  if (arrivalRect) {
    drawCentered(
      page,
      spreadRect(arrivalRect),
      qfuText(rowForRole(rows, "Arrival")),
      font,
      7.2
    );
  }
  if (alternateRect) {
    const [left, right] = splitRect(spreadRect(alternateRect));
    drawCentered(
      page,
      left,
      qfuText(rowForRole(rows, "Alternate")),
      font,
      5.9
    );
    drawCentered(
      page,
      right,
      qfuText(rowForRole(rows, "Alternate 2")),
      font,
      5.9
    );
  }
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV6(input);
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() > 0) {
    const font = await output.embedFont(StandardFonts.Helvetica);
    redrawQfuFields(output.getPage(0), input.rows, font);
  }
  return output.save({ useObjectStreams: true, addDefaultPage: false });
}
