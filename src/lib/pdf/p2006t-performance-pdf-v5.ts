import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
import {
  P2006T_FUEL,
  P2006T_LOADING_ARMS,
  type P2006TMassPoint,
} from "@/lib/performance/p2006t-mission";
import { getP2006TPerformanceSettings } from "@/lib/performance/p2006t-performance-settings";
import {
  p2006tClimbPerformance,
  p2006tCruisePerformance,
} from "@/lib/performance/p2006t-climb-cruise";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
import { buildP2006TPerformancePdfV2 } from "./p2006t-performance-pdf-v2";
import {
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v3";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const A2_WIDTH = 1191;
const A2_HEIGHT = 1684;
const A5_WIDTH = 420;
const A5_HEIGHT = 595;
const OM_FACTOR = 1.25;
const TAXI_TIME_MIN = 10;

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type CoordinateMap = {
  formRects: Record<string, Rect>;
  massBalanceRects: Record<string, Rect>;
  massBalancePoints: Record<string, Point[]>;
};
type CropBox = { left: number; bottom: number; right: number; top: number };

const COORDS = coordinatesJson as CoordinateMap;

const TABLE_CROPS = {
  takeoffLower: { left: 48, bottom: 452, right: 365, top: 808 },
  takeoffUpper: { left: 735, bottom: 452, right: 1070, top: 808 },
  landingLower: { left: 48, bottom: 88, right: 365, top: 442 },
  landingUpper: { left: 735, bottom: 88, right: 1070, top: 442 },
} satisfies Record<string, CropBox>;

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

function dateForPdf(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}

function roleLabel(role: P2006TPerformanceRow["role"]) {
  return role === "Alternate" ? "Alternate 1" : role;
}

function rowForRole(rows: P2006TPerformanceRow[], role: string) {
  return rows.find((row) => row.role === role) ?? null;
}

function drawCentered(
  page: PDFPage,
  rect: Rect,
  value: unknown,
  font: PDFFont,
  preferredSize = 7.8
) {
  const text = clean(value);
  if (!text) return;
  let size = preferredSize;
  while (size > 4.8 && font.widthOfTextAtSize(text, size) > rect.width - 5) {
    size -= 0.2;
  }
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: rect.x + Math.max(2, (rect.width - width) / 2),
    y: rect.y + (rect.height - size) / 2 + 0.8,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function paintInterior(page: PDFPage, rect: Rect, inset = 0.9) {
  page.drawRectangle({
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
    color: rgb(1, 1, 1),
  });
}

function splitRect(rect: Rect) {
  const half = rect.width / 2;
  return [
    { ...rect, width: half },
    { ...rect, x: rect.x + half, width: half },
  ] as const;
}

function fitAxis(
  values: readonly number[],
  points: readonly Point[],
  dimension: "x" | "y"
) {
  const count = Math.min(values.length, points.length);
  const valueMean =
    values.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
  const pointMean =
    points.slice(0, count).reduce((sum, point) => sum + point[dimension], 0) /
    count;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    numerator +=
      (values[index] - valueMean) *
      (points[index][dimension] - pointMean);
    denominator += (values[index] - valueMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = pointMean - slope * valueMean;
  return (value: number) => intercept + slope * value;
}

function axisX(key: string, value: number, maximum: number) {
  const points = COORDS.massBalancePoints[key] ?? [];
  if (points.length < 2) return 0;
  const first = points[0].x;
  const last = points[points.length - 1].x;
  return first + (last - first) * Math.min(1, Math.max(0, value / maximum));
}

function drawPolyline(
  page: PDFPage,
  points: Point[],
  color: ReturnType<typeof rgb>,
  thickness = 1
) {
  for (let index = 1; index < points.length; index += 1) {
    page.drawLine({
      start: points[index - 1],
      end: points[index],
      thickness,
      color,
      opacity: 0.88,
    });
  }
  points.forEach((point) => {
    page.drawCircle({
      x: point.x,
      y: point.y,
      size: 2.25,
      color: rgb(1, 1, 1),
      borderColor: color,
      borderWidth: 0.9,
    });
  });
}

function drawFinalPoint(
  page: PDFPage,
  point: P2006TMassPoint,
  label: string,
  massX: (value: number) => number,
  momentY: (value: number) => number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  offsetY: number
) {
  const x = massX(point.massKg);
  const y = momentY(point.momentKgm);
  page.drawCircle({
    x,
    y,
    size: 4.7,
    color,
    borderColor: rgb(1, 1, 1),
    borderWidth: 0.7,
  });
  page.drawText(label, {
    x: x + 5.5,
    y: y + offsetY,
    size: 6.4,
    font,
    color,
  });
  return { x, y };
}

function fillMassBalancePage(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
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
    if (rect) drawCentered(page, rect, value, bold, 8.2);
  });

  if (input.loading.emptyMassKg <= 0 || input.loading.emptyMomentKgm <= 0) {
    page.drawText("Empty mass and moment required to plot M&B.", {
      x: 68,
      y: 510,
      size: 8,
      font: bold,
      color: rgb(0.65, 0.12, 0.05),
    });
    return;
  }

  const momentY = fitAxis(
    [140, 200, 260, 320, 380, 440, 500],
    COORDS.massBalancePoints["axis-empty-aircraft-moment"],
    "y"
  );
  const massX = fitAxis(
    [800, 900, 1000, 1100, 1200],
    COORDS.massBalancePoints["axis-flight-mass"],
    "x"
  );

  const emptyMoment = input.loading.emptyMomentKgm;
  const frontMoment =
    emptyMoment + frontKg * P2006T_LOADING_ARMS.frontSeatsM;
  const rearMoment =
    frontMoment + input.loading.rearSeatsKg * P2006T_LOADING_ARMS.rearSeatsM;
  const baggageKg = input.loading.baggageKg;
  const emptyAxis = COORDS.massBalancePoints["axis-empty-aircraft-moment"] ?? [];
  const sharedPath: Point[] = [
    {
      x:
        emptyAxis[0]?.x ??
        COORDS.massBalancePoints["axis-front-seat-mass"]?.[0]?.x ??
        0,
      y: momentY(emptyMoment),
    },
    {
      x: axisX("axis-front-seat-mass", frontKg, 200),
      y: momentY(frontMoment),
    },
    {
      x: axisX("axis-rear-seat-mass", input.loading.rearSeatsKg, 200),
      y: momentY(rearMoment),
    },
  ];

  drawPolyline(page, sharedPath, rgb(0.18, 0.24, 0.34), 1.05);
  page.drawText("EMPTY", {
    x: sharedPath[0].x + 4,
    y: sharedPath[0].y + 4,
    size: 5.4,
    font,
    color: rgb(0.28, 0.31, 0.37),
  });

  const branch = (
    point: P2006TMassPoint,
    label: string,
    color: ReturnType<typeof rgb>,
    offsetY: number
  ) => {
    const fuelMassKg = point.usableFuelL * P2006T_FUEL.densityKgL;
    const fuelMoment = rearMoment + fuelMassKg * P2006T_FUEL.armM;
    const baggageMoment =
      fuelMoment + baggageKg * P2006T_LOADING_ARMS.baggageM;
    const fuelPoint = {
      x: axisX("axis-fuel-mass", fuelMassKg, 140),
      y: momentY(fuelMoment),
    };
    const baggagePoint = {
      x: axisX("axis-baggage-mass", baggageKg, 40),
      y: momentY(baggageMoment),
    };
    const finalPoint = {
      x: massX(point.massKg),
      y: momentY(point.momentKgm),
    };
    drawPolyline(
      page,
      [sharedPath[sharedPath.length - 1], fuelPoint, baggagePoint, finalPoint],
      color,
      1
    );
    drawFinalPoint(page, point, label, massX, momentY, bold, color, offsetY);
  };

  branch(input.mission.takeoff, "TO", rgb(0.04, 0.31, 0.88), 3);
  branch(input.mission.arrival, "LDG", rgb(0.86, 0.1, 0.1), 3);
  branch(input.mission.alternate1, "ALT", rgb(0.38, 0.16, 0.68), -9);
}

function columnValues(row: P2006TPerformanceRow | null) {
  if (!row) return {} as Record<string, unknown>;
  return {
    airfield: row.icao,
    "runway-qfu": `${row.runway} / ${whole(row.qfu)}`,
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

function fillRegularColumn(
  page: PDFPage,
  prefix: "departure" | "arrival",
  row: P2006TPerformanceRow | null,
  font: PDFFont
) {
  Object.entries(columnValues(row)).forEach(([suffix, value]) => {
    const rect = COORDS.formRects[`${prefix}-${suffix}`];
    if (rect) drawCentered(page, rect, value, font, 7.5);
  });
}

function fillSplitAlternates(
  page: PDFPage,
  rows: P2006TPerformanceRow[],
  font: PDFFont,
  bold: PDFFont
) {
  const alternate1 = columnValues(rowForRole(rows, "Alternate"));
  const alternate2 = columnValues(rowForRole(rows, "Alternate 2"));
  const header = { x: 419.8, y: 716.7, width: 120.5, height: 21.5 };
  paintInterior(page, header, 0.9);
  const [leftHeader, rightHeader] = splitRect(header);
  drawCentered(page, leftHeader, "Alternate 1", bold, 5.9);
  drawCentered(page, rightHeader, "Alternate 2", bold, 5.9);

  const dividerX = rightHeader.x;
  const bottom = COORDS.formRects["alternate-roc"]?.y ?? 386.7;
  page.drawLine({
    start: { x: dividerX, y: bottom + 0.7 },
    end: { x: dividerX, y: header.y + header.height - 0.7 },
    thickness: 0.42,
    color: rgb(0.12, 0.12, 0.12),
  });

  const suffixes = new Set([
    ...Object.keys(alternate1),
    ...Object.keys(alternate2),
  ]);
  suffixes.forEach((suffix) => {
    const rect = COORDS.formRects[`alternate-${suffix}`];
    if (!rect) return;
    const [left, right] = splitRect(rect);
    drawCentered(page, left, alternate1[suffix], font, 6.2);
    drawCentered(page, right, alternate2[suffix], font, 6.2);
  });
}

function minutesFromFuel(liters: number, rateLh: number) {
  return rateLh > 0 ? whole((Math.max(0, liters) / rateLh) * 60) : 0;
}

function fillFuelPlan(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
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
  const totalMin = requiredMin + extraMin;

  const rows: Array<[number, number]> = [
    [TAXI_TIME_MIN, input.mission.fuel.taxiFuelL],
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
    [totalMin, input.mission.fuel.usableLoadedL],
  ];

  rows.forEach(([minutes, liters], index) => {
    const row = index + 1;
    const timeRect = COORDS.formRects[`fuel-${row}-time`];
    const fuelRect = COORDS.formRects[`fuel-${row}-fuel`];
    if (timeRect) {
      drawCentered(page, timeRect, `${whole(minutes)} min`, font, 6.9);
    }
    if (fuelRect) {
      drawCentered(page, fuelRect, `${whole(liters)} L`, bold, 7.1);
    }
  });
}

function fillPerformanceForm(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  drawCentered(page, COORDS.formRects.date, dateForPdf(input.date), font, 7.5);
  drawCentered(
    page,
    COORDS.formRects["aircraft-registration"],
    input.registration,
    bold,
    7.5
  );
  fillRegularColumn(page, "departure", rowForRole(input.rows, "Departure"), font);
  fillRegularColumn(page, "arrival", rowForRole(input.rows, "Arrival"), font);
  fillSplitAlternates(page, input.rows, font, bold);
  fillFuelPlan(page, input, font, bold);
}

async function createFormsSpread(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input
) {
  const templateResponse = await fetch("/api/p2006-form", { cache: "no-store" });
  if (!templateResponse.ok) {
    throw new Error("Official P2006T PDF is unavailable.");
  }
  const source = await PDFDocument.load(await templateResponse.arrayBuffer());
  const formDoc = await PDFDocument.create();
  const [pageOne, pageTwo] = await formDoc.copyPages(source, [0, 1]);
  formDoc.addPage(pageOne);
  formDoc.addPage(pageTwo);
  const font = await formDoc.embedFont(StandardFonts.Helvetica);
  const bold = await formDoc.embedFont(StandardFonts.HelveticaBold);
  fillMassBalancePage(pageOne, input, font, bold);
  fillPerformanceForm(pageTwo, input, font, bold);

  const spread = output.addPage([A3_WIDTH, A3_HEIGHT]);
  const [embeddedOne, embeddedTwo] = await Promise.all([
    output.embedPage(pageOne),
    output.embedPage(pageTwo),
  ]);
  const gap = 8;
  const half = (A3_WIDTH - gap) / 2;
  const scale = Math.min(half / PAGE_WIDTH, A3_HEIGHT / PAGE_HEIGHT);
  const width = PAGE_WIDTH * scale;
  const height = PAGE_HEIGHT * scale;
  const y = (A3_HEIGHT - height) / 2;
  spread.drawPage(embeddedOne, { x: half - width, y, width, height });
  spread.drawPage(embeddedTwo, { x: half + gap, y, width, height });
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrappedLines(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  bold: PDFFont,
  rect: Rect
) {
  let y = rect.y + rect.height - 18;
  lines.forEach((line, index) => {
    const selectedFont = index === 0 ? bold : font;
    const size = index === 0 ? 9 : 8;
    const wrapped = wrapText(line, selectedFont, size, rect.width - 22);
    wrapped.slice(0, index === 0 ? 1 : 2).forEach((part) => {
      page.drawText(part, {
        x: rect.x + 11,
        y,
        size,
        font: selectedFont,
        color: rgb(0.06, 0.07, 0.09),
      });
      y -= 15;
    });
  });
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

function performanceNote(row: P2006TPerformanceRow) {
  const om = omValues(row);
  const slope =
    row.uphillSlopePct > 0.05
      ? ` The published correction for about ${row.uphillSlopePct.toFixed(
          1
        )}% upslope is also included.`
      : "";
  return [
    `${roleLabel(row.role)} ${row.icao} RWY ${row.runway}`,
    `Let's consider about ${rounded(row.takeoffWeightKg, 10)} kg, ${rounded(
      row.paFt,
      100
    )} ft pressure altitude and ${rounded(row.oatC, 5)} C.`,
    `The surrounding AFM cells are interpolated for weight, altitude and temperature. The paved-runway correction is applied to ground roll, followed by the published wind correction.${slope}`,
    `Take-off to 50 ft is about ${whole(
      row.takeoff50M
    )} m, or about ${om.takeoff} m with the OM buffer (x1.25), roughly ${
      om.takeoffPct
    }% of ${whole(row.todaM)} m TODA. Landing from 50 ft is about ${whole(
      row.landing50M
    )} m, or about ${om.landing} m with the OM buffer, roughly ${
      om.landingPct
    }% of ${whole(row.ldaM)} m LDA.`,
  ];
}

async function drawTightTable(
  output: PDFDocument,
  sourcePage: PDFPage,
  page: PDFPage,
  crop: CropBox,
  rect: Rect,
  label: string,
  bold: PDFFont
) {
  const embedded = await output.embedPage(sourcePage, crop);
  const scale = Math.min(rect.width / embedded.width, rect.height / embedded.height);
  const width = embedded.width * scale;
  const height = embedded.height * scale;
  page.drawText(label, {
    x: rect.x,
    y: rect.y + rect.height + 12,
    size: 10,
    font: bold,
    color: rgb(0.08, 0.09, 0.12),
  });
  page.drawPage(embedded, {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  });
}

async function drawAerodromePage(
  output: PDFDocument,
  sourcePage: PDFPage,
  row: P2006TPerformanceRow
) {
  const page = output.addPage([A2_WIDTH, A2_HEIGHT]);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: A2_WIDTH,
    height: A2_HEIGHT,
    color: rgb(1, 1, 1),
  });
  page.drawText(`${roleLabel(row.role)} ${row.icao} RWY ${row.runway}`, {
    x: 36,
    y: A2_HEIGHT - 48,
    size: 22,
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
      x: 36,
      y: A2_HEIGHT - 70,
      size: 10,
      font,
      color: rgb(0.3, 0.33, 0.38),
    }
  );

  const margin = 36;
  const gap = 28;
  const cellWidth = (A2_WIDTH - margin * 2 - gap) / 2;
  const cellHeight = 535;
  const topY = 955;
  const bottomY = 370;
  await Promise.all([
    drawTightTable(
      output,
      sourcePage,
      page,
      TABLE_CROPS.takeoffLower,
      { x: margin, y: topY, width: cellWidth, height: cellHeight },
      "Take-off - lower weight table",
      bold
    ),
    drawTightTable(
      output,
      sourcePage,
      page,
      TABLE_CROPS.takeoffUpper,
      { x: margin + cellWidth + gap, y: topY, width: cellWidth, height: cellHeight },
      "Take-off - upper weight table",
      bold
    ),
    drawTightTable(
      output,
      sourcePage,
      page,
      TABLE_CROPS.landingLower,
      { x: margin, y: bottomY, width: cellWidth, height: cellHeight },
      "Landing - lower weight table",
      bold
    ),
    drawTightTable(
      output,
      sourcePage,
      page,
      TABLE_CROPS.landingUpper,
      { x: margin + cellWidth + gap, y: bottomY, width: cellWidth, height: cellHeight },
      "Landing - upper weight table",
      bold
    ),
  ]);

  const noteRect = { x: 36, y: 40, width: A2_WIDTH - 72, height: 250 };
  page.drawRectangle({
    ...noteRect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.28, 0.28, 0.3),
    borderWidth: 0.6,
  });
  drawWrappedLines(page, performanceNote(row), font, bold, noteRect);
}

function interpolateByWeight(weightKg: number, maximum: number, values: number[]) {
  const weights = [930, 1080, maximum];
  if (weightKg <= weights[0]) return values[0];
  if (weightKg >= weights[2]) return values[2];
  const upperIndex = weightKg <= weights[1] ? 1 : 2;
  const lowerIndex = upperIndex - 1;
  const ratio =
    (weightKg - weights[lowerIndex]) /
    (weights[upperIndex] - weights[lowerIndex]);
  return values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * ratio;
}

function altitudeSpeed(altitudeFt: number, altitudes: number[], speeds: number[]) {
  const limited = Math.max(
    altitudes[0],
    Math.min(altitudes[altitudes.length - 1], altitudeFt)
  );
  let upper = 1;
  while (upper < altitudes.length && altitudes[upper] < limited) upper += 1;
  const lower = Math.max(0, upper - 1);
  if (upper >= altitudes.length) return speeds[speeds.length - 1];
  const ratio =
    altitudes[upper] === altitudes[lower]
      ? 0
      : (limited - altitudes[lower]) /
        (altitudes[upper] - altitudes[lower]);
  return speeds[lower] + (speeds[upper] - speeds[lower]) * ratio;
}

function vyKiasApprox(
  registration: BuildP2006TPerformancePdfV3Input["registration"],
  weightKg: number,
  altitudeFt: number
) {
  const altitudes = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000];
  const speed930 = [82, 81, 79, 77, 75, 73, 71, 69];
  const speed1080 = [83, 82, 80, 78, 76, 74, 72, 70];
  const speedMax = [84, 83, 81, 80, 78, 77, 75, 73];
  const maximum = registration === "CS-EAQ" ? 1180 : 1230;
  return whole(
    interpolateByWeight(weightKg, maximum, [
      altitudeSpeed(altitudeFt, altitudes, speed930),
      altitudeSpeed(altitudeFt, altitudes, speed1080),
      altitudeSpeed(altitudeFt, altitudes, speedMax),
    ])
  );
}

function vxKiasApprox(
  registration: BuildP2006TPerformancePdfV3Input["registration"],
  weightKg: number,
  altitudeFt: number
) {
  const altitudes = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000];
  const speed930 = [72, 72, 71, 71, 71, 71, 71, 70];
  const speed1080 = [72, 72, 72, 72, 71, 71, 71, 71];
  const speedMax = [72, 72, 72, 72, 72, 72, 71, 71];
  const maximum = registration === "CS-EAQ" ? 1180 : 1230;
  return whole(
    interpolateByWeight(weightKg, maximum, [
      altitudeSpeed(altitudeFt, altitudes, speed930),
      altitudeSpeed(altitudeFt, altitudes, speed1080),
      altitudeSpeed(altitudeFt, altitudes, speedMax),
    ])
  );
}

function enrouteValues(input: BuildP2006TPerformancePdfV3Input) {
  const settings = getP2006TPerformanceSettings();
  const departure = rowForRole(input.rows, "Departure");
  const temperatureC =
    input.cruiseTemperatureC ??
    (departure
      ? departure.oatC -
        1.9812 * ((settings.cruiseAltitudeFt - departure.paFt) / 1000)
      : 15);
  const isaDeviationC =
    temperatureC - (15 - 1.9812 * (settings.cruiseAltitudeFt / 1000));
  const climb = p2006tClimbPerformance(
    input.registration,
    settings.cruiseAltitudeFt,
    {
      weightKg: input.mission.takeoff.massKg,
      isaDeviationC,
      cruiseRpm: settings.cruiseRpm,
      cruisePowerPercent: settings.cruisePowerPercent,
    }
  );
  const cruise = p2006tCruisePerformance(
    input.registration,
    settings.cruiseAltitudeFt,
    {
      weightKg: 1150,
      isaDeviationC,
      cruiseRpm: settings.cruiseRpm,
      cruisePowerPercent: settings.cruisePowerPercent,
    }
  );
  return {
    settings,
    isaDeviationC,
    climb,
    cruise,
    vyKias: vyKiasApprox(
      input.registration,
      input.mission.takeoff.massKg,
      settings.cruiseAltitudeFt
    ),
    vxKias: vxKiasApprox(
      input.registration,
      input.mission.takeoff.massKg,
      settings.cruiseAltitudeFt
    ),
  };
}

function replaceBottomNote(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  bold: PDFFont
) {
  const rect = { x: 34, y: 20, width: A3_WIDTH - 68, height: 92 };
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.28, 0.28, 0.3),
    borderWidth: 0.5,
  });
  drawWrappedLines(page, lines, font, bold, rect);
}

async function appendSelectedPages(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input
) {
  const sourceBytes = await buildP2006TPerformancePdfV2(input);
  const source = await PDFDocument.load(sourceBytes);

  if (input.options.includePerformanceTables) {
    for (let index = 0; index < input.rows.length; index += 1) {
      await drawAerodromePage(output, source.getPage(2 + index), input.rows[index]);
    }
  }

  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const enroute = enrouteValues(input);
  if (input.options.includeEnroutePage) {
    const sourceIndex = 2 + input.rows.length;
    const [page] = await output.copyPages(source, [sourceIndex]);
    output.addPage(page);
    replaceBottomNote(
      page,
      [
        "Enroute climb",
        `Let's consider the take-off weight, about ${rounded(
          input.mission.takeoff.massKg,
          10
        )} kg, and the forecast conditions near ${rounded(
          enroute.settings.cruiseAltitudeFt,
          500
        )} ft.`,
        `For the briefing, use Vy about ${enroute.vyKias} KIAS and Vx about ${enroute.vxKias} KIAS.`,
        enroute.climb
          ? `Expected rate of climb is about ${rounded(
              enroute.climb.rateFpm ?? 0,
              50
            )} ft/min in those conditions.`
          : "The selected condition is outside the available climb table.",
      ],
      font,
      bold
    );
  }

  if (input.options.includeCruisePage) {
    const sourceIndex = 3 + input.rows.length;
    const [page] = await output.copyPages(source, [sourceIndex]);
    output.addPage(page);
    replaceBottomNote(
      page,
      [
        "Cruise",
        `Let's consider about ${rounded(
          enroute.settings.cruiseAltitudeFt,
          500
        )} ft and ISA ${enroute.isaDeviationC >= 0 ? "+" : ""}${rounded(
          enroute.isaDeviationC,
          5
        )} C at ${enroute.settings.cruiseRpm} RPM and ${whole(
          enroute.settings.cruisePowerPercent
        )}% power.`,
        enroute.cruise
          ? `Plan about ${whole(enroute.cruise.tasKt)} KTAS and ${whole(
              enroute.cruise.fuelFlowLh
            )} L/h for both engines.`
          : "The selected condition is outside the available cruise rows.",
        "The published cruise tables are referenced at 1150 kg; no artificial weight correction is added.",
      ],
      font,
      bold
    );
  }
}

function drawRule(page: PDFPage, y: number) {
  page.drawLine({
    start: { x: 24, y },
    end: { x: A5_WIDTH - 24, y },
    thickness: 0.5,
    color: rgb(0.78, 0.8, 0.84),
  });
}

async function drawKneeboard(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input
) {
  const page = output.addPage([A5_WIDTH, A5_HEIGHT]);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const enroute = enrouteValues(input);
  const cruise = enroute.cruise;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: A5_WIDTH,
    height: A5_HEIGHT,
    color: rgb(1, 1, 1),
  });
  page.drawText("P2006T KNEEBOARD", {
    x: 24,
    y: A5_HEIGHT - 34,
    size: 16,
    font: bold,
    color: rgb(0.04, 0.06, 0.1),
  });
  page.drawText(`${input.registration}  |  ${dateForPdf(input.date)}`, {
    x: 24,
    y: A5_HEIGHT - 51,
    size: 8.5,
    font,
    color: rgb(0.3, 0.33, 0.38),
  });

  let y = A5_HEIGHT - 76;
  const line = (text: string, strong = false, size = 8.2) => {
    page.drawText(clean(text), {
      x: 24,
      y,
      size,
      font: strong ? bold : font,
      color: rgb(0.06, 0.07, 0.09),
    });
    y -= 13;
  };

  line("WEIGHTS / FUEL", true, 9.2);
  line(
    `TO ${whole(input.mission.takeoff.massKg)} kg  |  LDG ${whole(
      input.mission.arrival.massKg
    )} kg  |  ALT ${whole(input.mission.alternate1.massKg)} kg`
  );
  line(
    `Usable ${whole(input.mission.fuel.usableLoadedL)} L  |  Trip ${whole(
      input.mission.fuel.tripFuelL
    )} L  |  Reserve ${whole(input.mission.fuel.reserveFuelL)} L`
  );
  y -= 3;
  drawRule(page, y);
  y -= 15;

  line("ENROUTE", true, 9.2);
  line(
    `Vy ~${enroute.vyKias} KIAS  |  Vx ~${enroute.vxKias} KIAS  |  ROC ~${
      enroute.climb ? rounded(enroute.climb.rateFpm ?? 0, 50) : "-"
    } ft/min`
  );
  line(
    `Cruise ${rounded(
      enroute.settings.cruiseAltitudeFt,
      500
    )} ft  |  ${enroute.settings.cruiseRpm} RPM  |  ${whole(
      enroute.settings.cruisePowerPercent
    )}%`
  );
  line(
    `Expect ${cruise ? whole(cruise.tasKt) : "-"} KTAS / ${
      cruise ? whole(cruise.fuelFlowLh) : "-"
    } L/h`
  );
  y -= 3;
  drawRule(page, y);
  y -= 15;

  line("AERODROMES", true, 9.2);
  input.rows.forEach((row) => {
    const om = omValues(row);
    line(`${roleLabel(row.role)}  ${row.icao}  RWY ${row.runway}`, true, 8.1);
    line(
      `W ${whole(row.takeoffWeightKg)} kg  |  ${whole(
        row.windFrom
      )}/${whole(row.windKt)} kt  |  PA ~${rounded(row.paFt, 100)} ft`
    );
    line(
      `TO ${om.takeoff}/${whole(row.todaM)} m (~${om.takeoffPct}%)  |  LDG ${
        om.landing
      }/${whole(row.ldaM)} m (~${om.landingPct}%)`
    );
    y -= 5;
  });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.create();
  await createFormsSpread(output, input);
  await appendSelectedPages(output, input);
  if (input.options.includeKneeboard) await drawKneeboard(output, input);

  output.setTitle(`P2006T ${input.registration} M&B and Performance`);
  output.setSubject("P2006T forms, performance tables and kneeboard data");
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save();
}
