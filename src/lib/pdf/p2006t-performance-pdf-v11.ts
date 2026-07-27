import {
  PDFDocument,
  PDFName,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
import { formatOperationalMinutes } from "@/lib/operational-duration";
import { getP2006TTaxiMinutes } from "@/lib/performance/p2006t-taxi-time-store";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV8,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v8";

export const DEFAULT_P2006T_PDF_OPTIONS: P2006TPdfOptions = {
  includePerformanceTables: false,
  includeEnroutePage: false,
  includeCruisePage: false,
  includeKneeboard: false,
};

export { downloadP2006TPerformancePdfV3 };
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

function dateForPdf(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}

function rowForRole(
  rows: BuildP2006TPerformancePdfV3Input["rows"],
  role: string
) {
  return rows.find((row) => row.role === role) ?? null;
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
  value: unknown,
  font: PDFFont,
  preferredSize = 6.6
) {
  const text = clean(value);
  maskExistingText(page, rect, preferredSize);
  if (!text) return;

  let size = preferredSize;
  while (size > 4.5 && font.widthOfTextAtSize(text, size) > rect.width - 6) {
    size -= 0.2;
  }
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - size) / 2 + 0.7,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function columnValues(
  row: BuildP2006TPerformancePdfV3Input["rows"][number] | null
) {
  if (!row) return {} as Record<string, unknown>;

  return {
    airfield: row.icao,
    "runway-qfu": `${row.runway} / ${String(whole(row.qfu)).padStart(3, "0")}`,
    elevation: whole(row.elevationFt),
    qnh: whole(row.qnhHpa),
    temperature: whole(row.oatC),
    wind: `${String(whole(row.windFrom)).padStart(3, "0")} / ${whole(
      row.windKt
    )}`,
    "pressure-altitude": whole(row.paFt),
    "density-altitude": whole(row.daFt),
    toda: whole(row.todaM),
    todr: whole(row.takeoff50M),
    lda: whole(row.ldaM),
    ldr: whole(row.landing50M),
    roc: whole(row.rocFpm),
  };
}

function redrawRegularColumn(
  page: PDFPage,
  prefix: "departure" | "arrival",
  row: BuildP2006TPerformancePdfV3Input["rows"][number] | null,
  font: PDFFont
) {
  Object.entries(columnValues(row)).forEach(([suffix, value]) => {
    const rect = COORDS.formRects[`${prefix}-${suffix}`];
    if (rect) drawCentered(page, spreadRect(rect), value, font, 7.2);
  });
}

function redrawAlternates(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  const alternate1 = columnValues(rowForRole(input.rows, "Alternate"));
  const alternate2 = columnValues(rowForRole(input.rows, "Alternate 2"));
  const header = spreadRect({ x: 419.8, y: 716.7, width: 120.5, height: 21.5 });
  const [leftHeader, rightHeader] = splitRect(header);

  drawCentered(page, leftHeader, "Alternate 1", bold, 5.8);
  drawCentered(page, rightHeader, "Alternate 2", bold, 5.8);
  page.drawLine({
    start: { x: rightHeader.x, y: header.y + 0.7 },
    end: { x: rightHeader.x, y: header.y + header.height - 0.7 },
    thickness: 0.42,
    color: rgb(0.12, 0.12, 0.12),
  });

  const suffixes = new Set([
    ...Object.keys(alternate1),
    ...Object.keys(alternate2),
  ]);

  suffixes.forEach((suffix) => {
    const sourceRect = COORDS.formRects[`alternate-${suffix}`];
    if (!sourceRect) return;

    const rect = spreadRect(sourceRect);
    const [left, right] = splitRect(rect);
    drawCentered(page, left, alternate1[suffix], font, 5.9);
    drawCentered(page, right, alternate2[suffix], font, 5.9);
    page.drawLine({
      start: { x: right.x, y: rect.y + 0.7 },
      end: { x: right.x, y: rect.y + rect.height - 0.7 },
      thickness: 0.42,
      color: rgb(0.12, 0.12, 0.12),
    });
  });
}

function minutesFromFuel(liters: number, rateLh: number) {
  return rateLh > 0 ? whole((Math.max(0, liters) / rateLh) * 60) : 0;
}

function redrawFuelPlan(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  const taxiMin = getP2006TTaxiMinutes();
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
    taxiMin +
    tripMin +
    contingencyMin +
    alternateMin +
    input.fuelTimes.reserveMin;
  const extraMin = minutesFromFuel(
    input.mission.fuel.extraUsableFuelL,
    input.mission.fuel.cruiseLh
  );

  const rows: Array<[number, number]> = [
    [taxiMin, input.mission.fuel.taxiFuelL],
    [input.fuelTimes.climbMin, input.mission.fuel.climbFuelL],
    [input.fuelTimes.enrouteMin, input.mission.fuel.enrouteFuelL],
    [input.fuelTimes.descentMin, input.mission.fuel.descentFuelL],
    [tripMin, input.mission.fuel.tripFuelL],
    [contingencyMin, input.mission.fuel.contingencyFuelL],
    [
      alternateMin,
      Math.max(
        input.mission.fuel.alternate1FuelL,
        input.mission.fuel.alternate2FuelL
      ),
    ],
    [input.fuelTimes.reserveMin, input.mission.fuel.reserveFuelL],
    [requiredMin, input.mission.fuel.requiredUsableFuelL],
    [extraMin, input.mission.fuel.extraUsableFuelL],
    [requiredMin + extraMin, input.mission.fuel.usableLoadedL],
  ];

  rows.forEach(([minutes, liters], index) => {
    const row = index + 1;
    const timeRect = COORDS.formRects[`fuel-${row}-time`];
    const fuelRect = COORDS.formRects[`fuel-${row}-fuel`];

    if (timeRect) {
      drawCentered(
        page,
        spreadRect(timeRect),
        formatOperationalMinutes(minutes),
        font,
        6.6
      );
    }
    if (fuelRect) {
      drawCentered(page, spreadRect(fuelRect), `${whole(liters)} L`, bold, 6.8);
    }
  });
}

function redrawPerformanceForm(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  const dateRect = COORDS.formRects.date;
  const registrationRect = COORDS.formRects["aircraft-registration"];

  if (dateRect) {
    drawCentered(page, spreadRect(dateRect), dateForPdf(input.date), font, 7.2);
  }
  if (registrationRect) {
    drawCentered(page, spreadRect(registrationRect), input.registration, bold, 7.3);
  }

  redrawRegularColumn(
    page,
    "departure",
    rowForRole(input.rows, "Departure"),
    font
  );
  redrawRegularColumn(
    page,
    "arrival",
    rowForRole(input.rows, "Arrival"),
    font
  );
  redrawAlternates(page, input, font, bold);
  redrawFuelPlan(page, input, font, bold);
}

function removeInteractiveFormLayer(output: PDFDocument) {
  output.catalog.delete(PDFName.of("AcroForm"));
  output.getPages().forEach((page) => {
    page.node.delete(PDFName.of("Annots"));
  });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV8(input);
  const output = await PDFDocument.load(bytes);

  if (output.getPageCount() > 0) {
    const font = await output.embedFont(StandardFonts.Helvetica);
    const bold = await output.embedFont(StandardFonts.HelveticaBold);
    redrawPerformanceForm(output.getPage(0), input, font, bold);
  }

  removeInteractiveFormLayer(output);

  return output.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
}
