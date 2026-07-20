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
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV7,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v7";

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
const TAXI_TIME_MIN = 10;

function whole(value: number) {
  return Math.round(Number(value || 0));
}

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
  const inset = 0.9;
  page.drawRectangle({
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
    color: rgb(1, 1, 1),
  });

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

function minutesFromFuel(liters: number, rateLh: number) {
  return rateLh > 0 ? whole((Math.max(0, liters) / rateLh) * 60) : 0;
}

function performanceFormTimes(input: BuildP2006TPerformancePdfV3Input) {
  const tripMin =
    input.fuelTimes.climbMin +
    input.fuelTimes.enrouteMin +
    input.fuelTimes.descentMin;
  const contingencyMin = minutesFromFuel(
    input.mission.fuel.contingencyFuelL,
    input.mission.fuel.cruiseLh
  );
  const alternateMin = Math.max(
    input.fuelTimes.alternate1Min,
    input.fuelTimes.alternate2Min
  );
  const requiredMin =
    TAXI_TIME_MIN +
    tripMin +
    contingencyMin +
    alternateMin +
    input.fuelTimes.reserveMin;
  const extraMin = minutesFromFuel(
    input.mission.fuel.extraUsableFuelL,
    input.mission.fuel.cruiseLh
  );

  return [
    TAXI_TIME_MIN,
    input.fuelTimes.climbMin,
    input.fuelTimes.enrouteMin,
    input.fuelTimes.descentMin,
    tripMin,
    contingencyMin,
    alternateMin,
    input.fuelTimes.reserveMin,
    requiredMin,
    extraMin,
    requiredMin + extraMin,
  ];
}

function redrawFuelTimes(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont
) {
  performanceFormTimes(input).forEach((minutes, index) => {
    const rect = COORDS.formRects[`fuel-${index + 1}-time`];
    if (!rect) return;
    drawCentered(
      page,
      spreadRect(rect),
      formatOperationalMinutes(minutes),
      font
    );
  });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV7(input);
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() > 0) {
    const font = await output.embedFont(StandardFonts.Helvetica);
    redrawFuelTimes(output.getPage(0), input, font);
  }
  return output.save({ useObjectStreams: true, addDefaultPage: false });
}
