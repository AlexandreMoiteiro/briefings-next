import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
import { P2006T_FUEL } from "@/lib/performance/p2006t-mission";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV11,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v11";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

type Rect = { x: number; y: number; width: number; height: number };
type CoordinateMap = { massBalanceRects: Record<string, Rect> };

const COORDS = coordinatesJson as CoordinateMap;
const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const SOURCE_WIDTH = 595;
const SOURCE_HEIGHT = 842;
const GAP = 8;
const HALF = (A3_WIDTH - GAP) / 2;
const SCALE = Math.min(HALF / SOURCE_WIDTH, A3_HEIGHT / SOURCE_HEIGHT);
const LEFT_PAGE_X = HALF - SOURCE_WIDTH * SCALE;
const LEFT_PAGE_Y = (A3_HEIGHT - SOURCE_HEIGHT * SCALE) / 2;

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

function spreadRect(rect: Rect): Rect {
  return {
    x: LEFT_PAGE_X + rect.x * SCALE,
    y: LEFT_PAGE_Y + rect.y * SCALE,
    width: rect.width * SCALE,
    height: rect.height * SCALE,
  };
}

function maskExistingText(page: PDFPage, rect: Rect, preferredSize: number) {
  const horizontalInset = 1.2;
  const availableHeight = Math.max(0, rect.height - 4);
  const maskHeight = Math.min(availableHeight, preferredSize + 6);
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
  value: unknown,
  font: PDFFont,
  preferredSize = 8.2
) {
  const text = clean(value);
  maskExistingText(page, rect, preferredSize);
  if (!text) return;

  let size = preferredSize;
  while (size > 5 && font.widthOfTextAtSize(text, size) > rect.width - 8) {
    size -= 0.2;
  }

  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - size) / 2 + 0.8,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function redrawMassBalanceFields(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont
) {
  const frontKg = input.loading.studentKg + input.loading.instructorKg;
  const values: Record<string, string> = {
    "pilot-front-seat-mass": `${whole(input.loading.studentKg)} + ${whole(
      input.loading.instructorKg
    )} = ${whole(frontKg)} kg`,
    "rear-seats-mass": `${whole(input.loading.rearSeatsKg)} kg`,
    "fuel-mass": `${whole(
      input.mission.fuel.usableLoadedL * P2006T_FUEL.densityKgL
    )} kg`,
    "baggage-mass": `${whole(input.loading.baggageKg)} kg`,
  };

  Object.entries(values).forEach(([key, value]) => {
    const rect = COORDS.massBalanceRects[key];
    if (rect) drawCentered(page, spreadRect(rect), value, font);
  });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV11(input);
  const output = await PDFDocument.load(bytes);

  if (output.getPageCount() > 0) {
    const bold = await output.embedFont(StandardFonts.HelveticaBold);
    redrawMassBalanceFields(output.getPage(0), input, bold);
  }

  return output.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
}
