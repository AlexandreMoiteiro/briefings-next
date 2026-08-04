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
import correctedOeiJson from "@/lib/performance/p2006t-oei-overlays.json";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import type {
  P2006TInterpolationTrace,
  P2006TPerformanceRow,
} from "@/lib/performance/p2006t-performance";
import { calculateP2006TOeiPerformance } from "@/lib/performance/p2006t-oei";
import { getP2006TOeiTraceCells } from "@/lib/performance/p2006t-oei-table";
import { getP2006TPerformanceSettings } from "@/lib/performance/p2006t-performance-settings";
import { p2006tClimbPerformance } from "@/lib/performance/p2006t-climb-cruise";
import { getP2006TDownloadMode } from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV16,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v16";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const OM_FACTOR = 1.25;
const FEET_PER_MINUTE_PER_KNOT = 101.268591;

type Rect = { x: number; y: number; width: number; height: number };
type ExactGrid = { columnCenters: number[]; rowCenters: number[] };
type OeiOverlayPayload = {
  mappings: Record<
    string,
    ExactGrid & {
      confirmed: boolean;
      confidence: number;
      method: string;
      savedAt: string;
    }
  >;
};

type OeiResult = ReturnType<typeof oeiForRow>;

const OEI_OVERLAYS = correctedOeiJson as OeiOverlayPayload;

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

function oneDecimal(value: number) {
  return Number(value || 0).toFixed(1);
}

function rounded(value: number, increment: number) {
  return Math.round(Number(value || 0) / increment) * increment;
}

function roleLabel(role: P2006TPerformanceRow["role"]) {
  return role === "Alternate" ? "Alternate 1" : role;
}

function roleTone(role: P2006TPerformanceRow["role"]) {
  if (role === "Departure") return rgb(0.08, 0.31, 0.76);
  if (role === "Arrival") return rgb(0.03, 0.48, 0.36);
  if (role === "Alternate") return rgb(0.5, 0.25, 0.72);
  return rgb(0.72, 0.36, 0.08);
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function drawFittedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  preferredSize: number,
  color = rgb(0.06, 0.07, 0.1)
) {
  const value = clean(text);
  let size = preferredSize;
  while (size > 4.4 && font.widthOfTextAtSize(value, size) > width) size -= 0.2;
  page.drawText(value, { x, y, size, font, color });
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  maximumLines = 3,
  color = rgb(0.06, 0.07, 0.1)
) {
  const lines = wrapText(text, font, size, width).slice(0, maximumLines);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color,
    });
  });
  return y - lines.length * lineHeight;
}

function traceBracket(trace: P2006TInterpolationTrace) {
  return `W ${whole(trace.lowerWeightKg)}-${whole(
    trace.upperWeightKg
  )} kg, PA ${whole(trace.lowerAltitudeFt)}-${whole(
    trace.upperAltitudeFt
  )} ft, OAT ${whole(trace.lowerTemperatureC)}-${whole(
    trace.upperTemperatureC
  )} C`;
}

function expectedWindLine(row: P2006TPerformanceRow) {
  const direction = String(whole(row.windFrom)).padStart(3, "0");
  const side = row.crosswindSide ? ` ${row.crosswindSide}` : "";
  return `Expected wind: ${direction}/${whole(row.windKt)} kt -> XWC ~${whole(
    Math.abs(row.crosswindKt)
  )} kt${side} | HW ~${whole(row.headwindKt)} kt.`;
}

function windCorrection(
  family: "takeoff" | "landing",
  headwindKt: number
) {
  const headwind = headwindKt >= 0;
  const rate =
    family === "takeoff"
      ? headwind
        ? 2.5
        : 10
      : headwind
        ? 5
        : 11;
  return `${headwind ? "-" : "+"} (${rate} x ${whole(
    Math.abs(headwindKt)
  )} kt)`;
}

function takeoffWindDelta(headwindKt: number) {
  return headwindKt >= 0 ? -2.5 * headwindKt : 10 * Math.abs(headwindKt);
}

function landingWindDelta(headwindKt: number) {
  return headwindKt >= 0 ? -5 * headwindKt : 11 * Math.abs(headwindKt);
}

function calculationLines(row: P2006TPerformanceRow) {
  const takeoffDelta = takeoffWindDelta(row.headwindKt);
  const landingDelta = landingWindDelta(row.headwindKt);
  const takeoffSlopeFactor = 1 + 0.05 * row.uphillSlopePct;
  const landingSlopeFactor = 1 - 0.025 * row.uphillSlopePct;

  const takeoffAfterPaved = row.takeoffGroundRollM / takeoffSlopeFactor;
  const takeoffAfterWind = takeoffAfterPaved / 0.94;
  const takeoffGroundBase = takeoffAfterWind - takeoffDelta;
  const takeoff50Base = row.takeoff50M - takeoffDelta;

  const landingAfterPaved = row.landingGroundRollM / landingSlopeFactor;
  const landingAfterWind = landingAfterPaved / 0.98;
  const landingGroundBase = landingAfterWind - landingDelta;
  const landing50Base = row.landing50M - landingDelta;

  const takeoffSlope =
    row.uphillSlopePct > 0.05
      ? `; x ${takeoffSlopeFactor.toFixed(2)} slope = ~${whole(
          row.takeoffGroundRollM
        )} m`
      : "";
  const landingSlope =
    row.uphillSlopePct > 0.05
      ? `; x ${landingSlopeFactor.toFixed(2)} slope = ~${whole(
          row.landingGroundRollM
        )} m`
      : "";
  const asdrM = row.takeoffGroundRollM + row.landingGroundRollM;

  return [
    `${roleLabel(row.role)} ${row.icao} RWY ${row.runway} | ${traceBracket(
      row.takeoffTrace
    )}.`,
    expectedWindLine(row),
    `T/O ground roll ~${whole(takeoffGroundBase)} m ${windCorrection(
      "takeoff",
      row.headwindKt
    )} = ~${whole(takeoffAfterWind)} m; x 0.940 paved = ~${whole(
      takeoffAfterPaved
    )} m${takeoffSlope}.`,
    `T/O to 50 ft ~${whole(takeoff50Base)} m ${windCorrection(
      "takeoff",
      row.headwindKt
    )} = ~${whole(row.takeoff50M)} m; x 1.25 OM = ${whole(
      row.takeoff50M * OM_FACTOR
    )} m (${whole((row.takeoff50M * OM_FACTOR * 100) / Math.max(1, row.todaM))}% TODA).`,
    `ASDR = T/O GR ${whole(row.takeoffGroundRollM)} + landing GR ${whole(
      row.landingGroundRollM
    )} = ${whole(asdrM)} m.`,
    `Landing ground roll ~${whole(landingGroundBase)} m ${windCorrection(
      "landing",
      row.headwindKt
    )} = ~${whole(landingAfterWind)} m; x 0.980 paved = ~${whole(
      landingAfterPaved
    )} m${landingSlope}.`,
    `Landing from 50 ft ~${whole(landing50Base)} m ${windCorrection(
      "landing",
      row.headwindKt
    )} = ~${whole(row.landing50M)} m; x 1.25 OM = ${whole(
      row.landing50M * OM_FACTOR
    )} m (${whole((row.landing50M * OM_FACTOR * 100) / Math.max(1, row.ldaM))}% LDA).`,
  ];
}

function redrawAerodromeCalculationNotes(
  page: PDFPage,
  row: P2006TPerformanceRow,
  font: PDFFont,
  bold: PDFFont
) {
  const size = page.getSize();
  const rect = { x: 28, y: 18, width: size.width - 56, height: 178 };
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.28, 0.31, 0.37),
    borderWidth: 0.65,
  });

  let y = rect.y + rect.height - 17;
  calculationLines(row).forEach((line, index) => {
    const selected = index <= 1 ? bold : font;
    const textSize = index === 0 ? 7.5 : index === 1 ? 7.1 : 6.85;
    const wrapped = wrapText(line, selected, textSize, rect.width - 20).slice(0, 2);
    wrapped.forEach((part) => {
      page.drawText(part, {
        x: rect.x + 10,
        y,
        size: textSize,
        font: selected,
        color: rgb(0.05, 0.06, 0.09),
      });
      y -= 11.2;
    });
    y -= 1.2;
  });
}

function enrouteValues(input: BuildP2006TPerformancePdfV3Input) {
  const settings = getP2006TPerformanceSettings();
  const departure =
    input.rows.find((row) => row.role === "Departure") ?? input.rows[0];
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

  const maximum = input.registration === "CS-EAQ" ? 1180 : 1230;
  const interpolate = (value: number, lower: number, upper: number, a: number, b: number) =>
    upper === lower ? a : a + ((value - lower) / (upper - lower)) * (b - a);
  const byWeight = (values: [number, number, number]) =>
    input.mission.takeoff.massKg <= 1080
      ? interpolate(input.mission.takeoff.massKg, 930, 1080, values[0], values[1])
      : interpolate(input.mission.takeoff.massKg, 1080, maximum, values[1], values[2]);
  const altitudeValue = (
    altitudeFt: number,
    altitudes: number[],
    values: number[]
  ) => {
    const limited = Math.max(altitudes[0], Math.min(altitudes.at(-1)!, altitudeFt));
    let upperIndex = altitudes.findIndex((altitude) => altitude >= limited);
    if (upperIndex < 0) upperIndex = altitudes.length - 1;
    const lowerIndex = Math.max(0, upperIndex - 1);
    return interpolate(
      limited,
      altitudes[lowerIndex],
      altitudes[upperIndex],
      values[lowerIndex],
      values[upperIndex]
    );
  };

  const vyAltitudes = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000];
  const vy = whole(
    byWeight([
      altitudeValue(settings.cruiseAltitudeFt, vyAltitudes, [82, 81, 79, 77, 75, 73, 71, 69]),
      altitudeValue(settings.cruiseAltitudeFt, vyAltitudes, [83, 82, 80, 78, 76, 74, 72, 70]),
      altitudeValue(
        settings.cruiseAltitudeFt,
        vyAltitudes,
        input.registration === "CS-EAQ"
          ? [84, 83, 81, 79, 77, 75, 73, 71]
          : [84, 83, 81, 80, 78, 77, 75, 73]
      ),
    ])
  );
  const vxAltitudes = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000];
  const vx = whole(
    byWeight([
      altitudeValue(settings.cruiseAltitudeFt, vxAltitudes, [72, 72, 71, 71, 71, 71, 71, 70]),
      altitudeValue(settings.cruiseAltitudeFt, vxAltitudes, [72, 72, 72, 72, 71, 71, 71, 71]),
      altitudeValue(settings.cruiseAltitudeFt, vxAltitudes, [72, 72, 72, 72, 72, 72, 71, 71]),
    ])
  );

  return { settings, climb, vy, vx };
}

function redrawEnrouteNote(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  const enroute = enrouteValues(input);
  const size = page.getSize();
  const rect = { x: 34, y: 20, width: size.width - 68, height: 92 };
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.28, 0.31, 0.37),
    borderWidth: 0.55,
  });

  page.drawText("Enroute climb", {
    x: rect.x + 11,
    y: rect.y + rect.height - 19,
    size: 8.2,
    font: bold,
    color: rgb(0.05, 0.06, 0.09),
  });
  drawWrapped(
    page,
    `Take-off weight ~${rounded(
      input.mission.takeoff.massKg,
      10
    )} kg | forecast conditions near ${rounded(
      enroute.settings.cruiseAltitudeFt,
      500
    )} ft.`,
    rect.x + 11,
    rect.y + 47,
    rect.width - 22,
    font,
    7.4,
    12,
    2
  );
  drawWrapped(
    page,
    enroute.climb
      ? `We expect Vy about ${enroute.vy} KIAS, Vx about ${
          enroute.vx
        } KIAS and a rate of climb of about ${rounded(
          enroute.climb.rateFpm ?? 0,
          50
        )} ft/min in those conditions.`
      : `We expect Vy about ${enroute.vy} KIAS and Vx about ${
          enroute.vx
        } KIAS. The selected conditions are outside the available climb rows.`,
    rect.x + 11,
    rect.y + 25,
    rect.width - 22,
    bold,
    7.5,
    12,
    2
  );
}

function oeiForRow(
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow
) {
  const calculation = calculateP2006TOeiPerformance({
    registration: input.registration,
    weightKg: row.takeoffWeightKg,
    pressureAltitudeFt: row.paFt,
    oatC: row.oatC,
  });
  const groundSpeedKt = Math.max(1, calculation.tasKt - row.headwindKt);
  const gradientPct =
    (calculation.rocFpm /
      Math.max(1, groundSpeedKt * FEET_PER_MINUTE_PER_KNOT)) *
    100;
  return { ...calculation, groundSpeedKt, gradientPct };
}

function exactOeiGrid(registration: P2006TRegistration): ExactGrid {
  const mapping = OEI_OVERLAYS.mappings[`oei-vyse:${registration}`];
  return {
    columnCenters: [...mapping.columnCenters],
    rowCenters: [...mapping.rowCenters],
  };
}

function axisEdges(centers: readonly number[]) {
  if (centers.length === 1) return [centers[0] - 0.01, centers[0] + 0.01];
  return [
    Math.max(0, centers[0] - (centers[1] - centers[0]) / 2),
    ...centers.slice(0, -1).map((center, index) => (center + centers[index + 1]) / 2),
    Math.min(
      1,
      centers.at(-1)! + (centers.at(-1)! - centers.at(-2)!) / 2
    ),
  ];
}

function exactOeiCellRect(
  imageRect: Rect,
  grid: ExactGrid,
  rowIndex: number,
  columnIndex: number
) {
  const columns = axisEdges(grid.columnCenters);
  const rows = axisEdges(grid.rowCenters);
  const left = columns[columnIndex];
  const right = columns[columnIndex + 1];
  const top = rows[rowIndex];
  const bottom = rows[rowIndex + 1];
  return {
    x: imageRect.x + left * imageRect.width,
    y: imageRect.y + (1 - bottom) * imageRect.height,
    width: (right - left) * imageRect.width,
    height: (bottom - top) * imageRect.height,
  };
}

function zoomGridIntoRect(image: PDFImage, grid: ExactGrid, target: Rect) {
  const columns = axisEdges(grid.columnCenters);
  const rows = axisEdges(grid.rowCenters);
  const left = Math.max(0, columns[0] - 0.018);
  const right = Math.min(1, columns.at(-1)! + 0.018);
  const top = Math.max(0, rows[0] - 0.018);
  const bottom = Math.min(1, rows.at(-1)! + 0.018);
  const cropWidth = (right - left) * image.width;
  const cropHeight = (bottom - top) * image.height;
  const scale = Math.min(target.width / cropWidth, target.height / cropHeight);
  const width = image.width * scale;
  const height = image.height * scale;
  const visibleWidth = (right - left) * width;
  const visibleHeight = (bottom - top) * height;
  const offsetX = (target.width - visibleWidth) / 2;
  const offsetY = (target.height - visibleHeight) / 2;
  return {
    x: target.x + offsetX - left * width,
    y: target.y + offsetY - (1 - bottom) * height,
    width,
    height,
  };
}

function drawExactOeiGrid(page: PDFPage, imageRect: Rect, grid: ExactGrid) {
  const columns = axisEdges(grid.columnCenters);
  const rows = axisEdges(grid.rowCenters);
  const left = imageRect.x + columns[0] * imageRect.width;
  const right = imageRect.x + columns.at(-1)! * imageRect.width;
  const top = imageRect.y + (1 - rows[0]) * imageRect.height;
  const bottom = imageRect.y + (1 - rows.at(-1)!) * imageRect.height;

  page.drawRectangle({
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
    borderColor: rgb(0.02, 0.45, 0.3),
    borderWidth: 0.75,
  });
  columns.slice(1, -1).forEach((position) => {
    const x = imageRect.x + position * imageRect.width;
    page.drawLine({
      start: { x, y: bottom },
      end: { x, y: top },
      thickness: 0.16,
      color: rgb(0.02, 0.45, 0.3),
      opacity: 0.3,
    });
  });
  rows.slice(1, -1).forEach((position) => {
    const y = imageRect.y + (1 - position) * imageRect.height;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.16,
      color: rgb(0.02, 0.45, 0.3),
      opacity: 0.26,
    });
  });
}

function highlightOeiCells(
  page: PDFPage,
  imageRect: Rect,
  grid: ExactGrid,
  cells: ReturnType<typeof getP2006TOeiTraceCells>
) {
  const purposesByCell = new Map<string, Set<string>>();
  cells.forEach((cell) => {
    const key = `${cell.rowIndex}:${cell.columnIndex}`;
    const purposes = purposesByCell.get(key) ?? new Set<string>();
    purposes.add(cell.purpose);
    purposesByCell.set(key, purposes);
  });

  purposesByCell.forEach((purposes, key) => {
    const [rowIndex, columnIndex] = key.split(":").map(Number);
    const rect = exactOeiCellRect(imageRect, grid, rowIndex, columnIndex);
    const both = purposes.size > 1;
    const ceiling = purposes.has("ceiling") && !purposes.has("gradient");
    page.drawRectangle({
      ...rect,
      color: both
        ? rgb(0.55, 0.2, 0.75)
        : ceiling
          ? rgb(0.05, 0.42, 0.82)
          : rgb(1, 0.62, 0.02),
      opacity: 0.24,
      borderColor: both
        ? rgb(0.4, 0.08, 0.62)
        : ceiling
          ? rgb(0.02, 0.26, 0.68)
          : rgb(0.86, 0.25, 0.01),
      borderWidth: 0.75,
    });
  });
}

function drawOeiExplanation(
  page: PDFPage,
  row: P2006TPerformanceRow,
  calculation: OeiResult,
  rect: Rect,
  font: PDFFont,
  bold: PDFFont
) {
  let y = rect.y + rect.height - 15;
  const line = (
    text: string,
    selectedFont: PDFFont = font,
    size = 7.1,
    maximumLines = 2
  ) => {
    y = drawWrapped(
      page,
      text,
      rect.x,
      y,
      rect.width,
      selectedFont,
      size,
      10.5,
      maximumLines
    );
    y -= 3;
  };

  line(
    `${roleLabel(row.role)} ${row.icao} RWY ${row.runway}`,
    bold,
    9,
    1
  );
  line(
    `W ${whole(row.takeoffWeightKg)} kg | PA ${whole(row.paFt)} ft | OAT ${whole(
      row.oatC
    )} C`,
    font,
    7.2,
    1
  );
  line(expectedWindLine(row), bold, 7.15, 2);
  line(
    `VySE ~${whole(calculation.vyseKias)} KIAS | OEI ROC ~${whole(
      calculation.rocFpm
    )} ft/min`,
    bold,
    7.4,
    1
  );
  line(
    `TAS ~${whole(calculation.tasKt)} kt | GS ~${whole(
      calculation.groundSpeedKt
    )} kt`,
    font,
    7.2,
    1
  );
  line(
    `Gradient ~${whole(calculation.rocFpm)} / (${whole(
      calculation.groundSpeedKt
    )} x 101.27) x 100 = ${oneDecimal(calculation.gradientPct)}%.`,
    font,
    7.05,
    2
  );
  line(
    `OEI service ceiling ~${rounded(
      calculation.serviceCeilingFt,
      50
    )} ft${calculation.serviceCeilingExtrapolated ? " (est.)" : ""}.`,
    bold,
    7.35,
    2
  );
}

function drawOeiPanel(
  page: PDFPage,
  image: PDFImage,
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow,
  panel: Rect,
  font: PDFFont,
  bold: PDFFont
) {
  const calculation = oeiForRow(input, row);
  const cells = getP2006TOeiTraceCells({
    registration: input.registration,
    weightKg: row.takeoffWeightKg,
    pressureAltitudeFt: row.paFt,
    oatC: row.oatC,
    calculation,
  });
  const grid = exactOeiGrid(input.registration);
  const tone = roleTone(row.role);

  page.drawRectangle({
    ...panel,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.68, 0.71, 0.77),
    borderWidth: 0.7,
  });
  page.drawRectangle({
    x: panel.x,
    y: panel.y + panel.height - 25,
    width: panel.width,
    height: 25,
    color: tone,
  });
  drawFittedText(
    page,
    `${roleLabel(row.role)} | ${row.icao} | RWY ${row.runway}`,
    panel.x + 10,
    panel.y + panel.height - 17,
    panel.width - 20,
    bold,
    8.4,
    rgb(1, 1, 1)
  );

  const imageTarget = {
    x: panel.x + 10,
    y: panel.y + 10,
    width: panel.width * 0.55,
    height: panel.height - 45,
  };
  const imageRect = zoomGridIntoRect(image, grid, imageTarget);
  page.pushOperators(
    pushGraphicsState(),
    rectangle(imageTarget.x, imageTarget.y, imageTarget.width, imageTarget.height),
    clip(),
    endPath()
  );
  page.drawImage(image, imageRect);
  drawExactOeiGrid(page, imageRect, grid);
  highlightOeiCells(page, imageRect, grid, cells);
  page.pushOperators(popGraphicsState());
  page.drawRectangle({
    ...imageTarget,
    borderColor: rgb(0.75, 0.77, 0.81),
    borderWidth: 0.45,
  });

  drawOeiExplanation(
    page,
    row,
    calculation,
    {
      x: imageTarget.x + imageTarget.width + 12,
      y: panel.y + 12,
      width: panel.x + panel.width - (imageTarget.x + imageTarget.width + 22),
      height: panel.height - 48,
    },
    font,
    bold
  );
}

async function appendCombinedOeiPage(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input
) {
  const response = await fetch(
    `/api/p2006-oei-source?registration=${encodeURIComponent(input.registration)}`,
    { cache: "force-cache" }
  );
  if (!response.ok) throw new Error("Could not load the mapped OEI source page.");

  const image = await output.embedPng(await response.arrayBuffer());
  const page = output.addPage([A3_WIDTH, A3_HEIGHT]);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: A3_WIDTH,
    height: A3_HEIGHT,
    color: rgb(0.982, 0.985, 0.991),
  });
  page.drawText("P2006T OEI / VySE - aerodrome summary", {
    x: 24,
    y: A3_HEIGHT - 28,
    size: 14,
    font: bold,
    color: rgb(0.03, 0.05, 0.09),
  });
  page.drawText(input.registration, {
    x: A3_WIDTH - 95,
    y: A3_HEIGHT - 27,
    size: 10,
    font: bold,
    color: rgb(0.24, 0.27, 0.33),
  });

  const margin = 24;
  const gap = 16;
  const titleSpace = 42;
  const panelWidth = (A3_WIDTH - margin * 2 - gap) / 2;
  const panelHeight = (A3_HEIGHT - margin * 2 - titleSpace - gap) / 2;
  const positions: Rect[] = [
    {
      x: margin,
      y: margin + panelHeight + gap,
      width: panelWidth,
      height: panelHeight,
    },
    {
      x: margin + panelWidth + gap,
      y: margin + panelHeight + gap,
      width: panelWidth,
      height: panelHeight,
    },
    { x: margin, y: margin, width: panelWidth, height: panelHeight },
    {
      x: margin + panelWidth + gap,
      y: margin,
      width: panelWidth,
      height: panelHeight,
    },
  ];

  input.rows.slice(0, 4).forEach((row, index) => {
    drawOeiPanel(page, image, input, row, positions[index], font, bold);
  });
}

async function simplifyTablesPdf(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.load(bytes);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);

  input.rows.forEach((row, index) => {
    if (index < output.getPageCount()) {
      redrawAerodromeCalculationNotes(output.getPage(index), row, font, bold);
    }
  });

  const enroutePageIndex = input.rows.length;
  if (enroutePageIndex < output.getPageCount()) {
    redrawEnrouteNote(output.getPage(enroutePageIndex), input, font, bold);
  }

  for (let index = 0; index < input.rows.length; index += 1) {
    if (output.getPageCount() > 0) output.removePage(output.getPageCount() - 1);
  }
  await appendCombinedOeiPage(output, input);

  output.setTitle(`P2006T ${input.registration} performance tables`);
  output.setSubject(
    "P2006T source tables with concise operational calculations and combined OEI evidence"
  );
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV16(input);
  return getP2006TDownloadMode() === "tables"
    ? simplifyTablesPdf(bytes, input)
    : bytes;
}
