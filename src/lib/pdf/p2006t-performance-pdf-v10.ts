import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
import { formatOperationalMinutes } from "@/lib/operational-duration";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV8,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v8";

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

function spreadRect(rect: Rect): Rect {
  return {
    x: RIGHT_PAGE_X + rect.x * SCALE,
    y: RIGHT_PAGE_Y + rect.y * SCALE,
    width: rect.width * SCALE,
    height: rect.height * SCALE,
  };
}

function drawCentered(
  page: PDFPage,
  rect: Rect,
  value: string,
  font: PDFFont,
  preferredSize = 6.6
) {
  const inset = 1.5;
  page.drawRectangle({
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
    color: rgb(1, 1, 1),
  });

  let size = preferredSize;
  while (size > 4.5 && font.widthOfTextAtSize(value, size) > rect.width - 6) {
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

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV8(input);
  const output = await PDFDocument.load(bytes);

  if (output.getPageCount() > 0) {
    const taxiRect = COORDS.formRects["fuel-1-time"];
    if (taxiRect) {
      const font = await output.embedFont(StandardFonts.Helvetica);
      drawCentered(
        output.getPage(0),
        spreadRect(taxiRect),
        formatOperationalMinutes(Math.max(0, Math.round(input.fuelTimes.taxiFuelL))),
        font
      );
    }
  }

  return output.save({ useObjectStreams: true, addDefaultPage: false });
}
