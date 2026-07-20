import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
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

function shouldRestoreBorder(key: string) {
  return (
    key === "date" ||
    key === "aircraft-registration" ||
    key.startsWith("departure-") ||
    key.startsWith("arrival-") ||
    key.startsWith("alternate-") ||
    /^fuel-\d+-(time|fuel)$/.test(key)
  );
}

function redrawCellBorder(page: PDFPage, key: string, rect: Rect) {
  const target = spreadRect(rect);
  page.drawRectangle({
    ...target,
    borderColor: rgb(0.12, 0.12, 0.12),
    borderWidth: 0.34,
  });

  if (key.startsWith("alternate-")) {
    const dividerX = target.x + target.width / 2;
    page.drawLine({
      start: { x: dividerX, y: target.y },
      end: { x: dividerX, y: target.y + target.height },
      thickness: 0.34,
      color: rgb(0.12, 0.12, 0.12),
    });
  }
}

function restorePerformanceGrid(page: PDFPage) {
  Object.entries(COORDS.formRects).forEach(([key, rect]) => {
    if (shouldRestoreBorder(key)) redrawCellBorder(page, key, rect);
  });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV8(input);
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() > 0) {
    restorePerformanceGrid(output.getPage(0));
  }
  return output.save({ useObjectStreams: true, addDefaultPage: false });
}
