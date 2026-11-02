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
import correctedOeiJson from "@/lib/performance/p2006t-oei-overlays.json";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import type {
  P2006TInterpolationTrace,
  P2006TPerformanceRow,
} from "@/lib/performance/p2006t-performance";
import { calculateP2006TOeiPerformance } from "@/lib/performance/p2006t-oei";
import {
  getP2006TOeiSourcePage,
  getP2006TOeiTraceCells,
} from "@/lib/performance/p2006t-oei-table";
import { getP2006TPerformanceSettings } from "@/lib/performance/p2006t-performance-settings";
import {
  p2006tClimbPerformance,
  p2006tCruisePerformance,
} from "@/lib/performance/p2006t-climb-cruise";
import { getP2006TDownloadMode } from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV15,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v15";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A5_WIDTH = 420;
const A5_HEIGHT = 595;
const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const OM_FACTOR = 1.25;
const FEET_PER_MINUTE_PER_KNOT = 101.268591;
const TEMPERATURES = [-25, 0, 25, 50] as const;

type Rect = { x: number; y: number; width: number; height: number };
type TableOverlay = { columns: number[]; rows: number[] };
type SourcePage = { image: string; weightKg: number };
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

const DISTANCE_OVERLAYS = distanceOverlaysJson as Record<string, TableOverlay>;
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

function twoDecimals(value: number) {
  return Number(value || 0).toFixed(2);
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
  maximumLines = 2,
  color = rgb(0.08, 0.09, 0.12)
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

function drawRule(page: PDFPage, x: number, y: number, width: number) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 0.45,
    color: rgb(0.78, 0.8, 0.84),
  });
}

function interpolate(value: number, lower: number, upper: number, a: number, b: number) {
  if (upper === lower) return a;
  const ratio = Math.min(1, Math.max(0, (value - lower) / (upper - lower)));
  return a + (b - a) * ratio;
}

function altitudeSpeed(altitudeFt: number, altitudes: number[], speeds: number[]) {
  const value = Math.min(
    altitudes[altitudes.length - 1],
    Math.max(altitudes[0], altitudeFt)
  );
  let upperIndex = altitudes.findIndex((altitude) => altitude >= value);
  if (upperIndex < 0) upperIndex = altitudes.length - 1;
  const lowerIndex = Math.max(0, upperIndex - 1);
  return interpolate(
    value,
    altitudes[lowerIndex],
    altitudes[upperIndex],
    speeds[lowerIndex],
    speeds[upperIndex]
  );
}

function interpolateByWeight(
  weightKg: number,
  maximumWeightKg: number,
  values: [number, number, number]
) {
  if (weightKg <= 1080) {
    return interpolate(weightKg, 930, 1080, values[0], values[1]);
  }
  return interpolate(weightKg, 1080, maximumWeightKg, values[1], values[2]);
}

function vyKiasApprox(
  registration: P2006TRegistration,
  weightKg: number,
  altitudeFt: number
) {
  const altitudes = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000];
  const speed930 = [82, 81, 79, 77, 75, 73, 71, 69];
  const speed1080 = [83, 82, 80, 78, 76, 74, 72, 70];
  const speedMax =
    registration === "CS-EAQ"
      ? [84, 83, 81, 79, 77, 75, 73, 71]
      : [84, 83, 81, 80, 78, 77, 75, 73];
  return whole(
    interpolateByWeight(
      weightKg,
      registration === "CS-EAQ" ? 1180 : 1230,
      [
        altitudeSpeed(altitudeFt, altitudes, speed930),
        altitudeSpeed(altitudeFt, altitudes, speed1080),
        altitudeSpeed(altitudeFt, altitudes, speedMax),
      ]
    )
  );
}

function vxKiasApprox(
  registration: P2006TRegistration,
  weightKg: number,
  altitudeFt: number
) {
  const altitudes = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000];
  const speed930 = [72, 72, 71, 71, 71, 71, 71, 70];
  const speed1080 = [72, 72, 72, 72, 71, 71, 71, 71];
  const speedMax = [72, 72, 72, 72, 72, 72, 71, 71];
  return whole(
    interpolateByWeight(
      weightKg,
      registration === "CS-EAQ" ? 1180 : 1230,
      [
        altitudeSpeed(altitudeFt, altitudes, speed930),
        altitudeSpeed(altitudeFt, altitudes, speed1080),
        altitudeSpeed(altitudeFt, altitudes, speedMax),
      ]
    )
  );
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

function oeiForRow(input: BuildP2006TPerformancePdfV3Input, row: P2006TPerformanceRow) {
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

function drawSummaryBox(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  const rect = { x: 18, y: 468, width: A5_WIDTH - 36, height: 72 };
  page.drawRectangle({
    ...rect,
    color: rgb(0.965, 0.972, 0.985),
    borderColor: rgb(0.72, 0.75, 0.81),
    borderWidth: 0.6,
  });
  const enroute = enrouteValues(input);
  const middle = rect.x + rect.width / 2;
  page.drawLine({
    start: { x: middle, y: rect.y + 8 },
    end: { x: middle, y: rect.y + rect.height - 8 },
    thickness: 0.45,
    color: rgb(0.76, 0.78, 0.83),
  });

  page.drawText("WEIGHTS / FUEL", {
    x: rect.x + 10,
    y: rect.y + rect.height - 17,
    size: 7.5,
    font: bold,
    color: rgb(0.2, 0.23, 0.3),
  });
  drawFittedText(
    page,
    `TO ${whole(input.mission.takeoff.massKg)} kg | LDG ${whole(
      input.mission.arrival.massKg
    )} kg | ALT ${whole(input.mission.alternate1.massKg)} kg`,
    rect.x + 10,
    rect.y + 35,
    rect.width / 2 - 20,
    font,
    6.8
  );
  drawFittedText(
    page,
    `Usable ${whole(input.mission.fuel.usableLoadedL)} L | Trip ${whole(
      input.mission.fuel.tripFuelL
    )} L | Reserve ${whole(input.mission.fuel.reserveFuelL)} L`,
    rect.x + 10,
    rect.y + 20,
    rect.width / 2 - 20,
    font,
    6.8
  );

  page.drawText("ENROUTE / CRUISE", {
    x: middle + 10,
    y: rect.y + rect.height - 17,
    size: 7.5,
    font: bold,
    color: rgb(0.2, 0.23, 0.3),
  });
  drawFittedText(
    page,
    `Vy ${enroute.vyKias} | Vx ${enroute.vxKias} KIAS | ROC ${
      enroute.climb ? rounded(enroute.climb.rateFpm ?? 0, 50) : "-"
    } fpm`,
    middle + 10,
    rect.y + 35,
    rect.width / 2 - 20,
    font,
    6.8
  );
  drawFittedText(
    page,
    `${rounded(enroute.settings.cruiseAltitudeFt, 500)} ft | ${
      enroute.settings.cruiseRpm
    } RPM | ${enroute.cruise ? whole(enroute.cruise.tasKt) : "-"} KTAS | ${
      enroute.cruise ? whole(enroute.cruise.fuelFlowLh) : "-"
    } L/h`,
    middle + 10,
    rect.y + 20,
    rect.width / 2 - 20,
    font,
    6.8
  );
}

function roleTone(role: P2006TPerformanceRow["role"]) {
  if (role === "Departure") return rgb(0.08, 0.31, 0.76);
  if (role === "Arrival") return rgb(0.03, 0.48, 0.36);
  if (role === "Alternate") return rgb(0.5, 0.25, 0.72);
  return rgb(0.72, 0.36, 0.08);
}

function drawAerodromeCard(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow,
  rect: Rect,
  font: PDFFont,
  bold: PDFFont
) {
  const tone = roleTone(row.role);
  const oei = oeiForRow(input, row);
  const asdrM = row.takeoffGroundRollM + row.landingGroundRollM;
  const takeoffOm = whole(row.takeoff50M * OM_FACTOR);
  const landingOm = whole(row.landing50M * OM_FACTOR);
  const ceiling = `${whole(oei.serviceCeilingFt)} ft${
    oei.serviceCeilingExtrapolated ? " EST" : ""
  }`;

  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.72, 0.75, 0.8),
    borderWidth: 0.65,
  });
  page.drawRectangle({
    x: rect.x,
    y: rect.y + rect.height - 25,
    width: rect.width,
    height: 25,
    color: tone,
  });
  drawFittedText(
    page,
    `${roleLabel(row.role)} | ${row.icao} | RWY ${row.runway}`,
    rect.x + 9,
    rect.y + rect.height - 17,
    rect.width - 18,
    bold,
    7.5,
    rgb(1, 1, 1)
  );

  let y = rect.y + rect.height - 40;
  drawFittedText(
    page,
    `W ${whole(row.takeoffWeightKg)} kg | PA ${whole(row.paFt)} ft | OAT ${whole(
      row.oatC
    )} C`,
    rect.x + 9,
    y,
    rect.width - 18,
    font,
    6.5
  );
  y -= 13;
  drawFittedText(
    page,
    `Wind ${String(whole(row.windFrom)).padStart(3, "0")}/${whole(
      row.windKt
    )} kt | HWC ${row.headwindKt >= 0 ? "+" : ""}${oneDecimal(
      row.headwindKt
    )} kt`,
    rect.x + 9,
    y,
    rect.width - 18,
    font,
    6.5
  );
  y -= 13;
  drawFittedText(
    page,
    `TO ${takeoffOm}/${whole(row.todaM)} m | LDG ${landingOm}/${whole(
      row.ldaM
    )} m`,
    rect.x + 9,
    y,
    rect.width - 18,
    font,
    6.5
  );

  drawRule(page, rect.x + 8, rect.y + 126, rect.width - 16);
  page.drawText("ACCELERATE-STOP DISTANCE REQUIRED (ESTIMATE)", {
    x: rect.x + 9,
    y: rect.y + 112,
    size: 5.25,
    font: bold,
    color: rgb(0.34, 0.37, 0.43),
  });
  page.drawText(`ASDR = ${whole(asdrM)} m`, {
    x: rect.x + 9,
    y: rect.y + 91,
    size: 13,
    font: bold,
    color: rgb(0.03, 0.05, 0.09),
  });

  drawRule(page, rect.x + 8, rect.y + 79, rect.width - 16);
  drawFittedText(
    page,
    `VySE ${whole(oei.vyseKias)} KIAS | OEI ROC ${whole(oei.rocFpm)} fpm`,
    rect.x + 9,
    rect.y + 64,
    rect.width - 18,
    bold,
    6.7
  );
  drawFittedText(
    page,
    `TAS ${oneDecimal(oei.tasKt)} kt | GS ${oneDecimal(oei.groundSpeedKt)} kt`,
    rect.x + 9,
    rect.y + 49,
    rect.width - 18,
    font,
    6.6
  );
  drawFittedText(
    page,
    `OEI GRADIENT ${twoDecimals(oei.gradientPct)}%`,
    rect.x + 9,
    rect.y + 34,
    rect.width - 18,
    bold,
    7.1,
    tone
  );
  drawFittedText(
    page,
    `OEI SERVICE CEILING ${ceiling}`,
    rect.x + 9,
    rect.y + 18,
    rect.width - 18,
    bold,
    6.7
  );
}

async function buildSinglePageKneeboard(
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.create();
  const page = output.addPage([A5_WIDTH, A5_HEIGHT]);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: A5_WIDTH,
    height: A5_HEIGHT,
    color: rgb(0.985, 0.987, 0.992),
  });
  page.drawText("P2006T OPERATIONAL KNEEBOARD", {
    x: 18,
    y: A5_HEIGHT - 28,
    size: 14.5,
    font: bold,
    color: rgb(0.03, 0.05, 0.09),
  });
  page.drawText(`${input.registration} | ${dateForPdf(input.date)}`, {
    x: 18,
    y: A5_HEIGHT - 44,
    size: 7.8,
    font,
    color: rgb(0.32, 0.35, 0.41),
  });

  drawSummaryBox(page, input, font, bold);

  const margin = 18;
  const gap = 10;
  const cardWidth = (A5_WIDTH - margin * 2 - gap) / 2;
  const cardHeight = 210;
  const positions: Rect[] = [
    { x: margin, y: 244, width: cardWidth, height: cardHeight },
    { x: margin + cardWidth + gap, y: 244, width: cardWidth, height: cardHeight },
    { x: margin, y: 24, width: cardWidth, height: cardHeight },
    { x: margin + cardWidth + gap, y: 24, width: cardWidth, height: cardHeight },
  ];

  input.rows.slice(0, 4).forEach((row, index) => {
    drawAerodromeCard(page, input, row, positions[index], font, bold);
  });

  output.setTitle(`P2006T ${input.registration} kneeboard`);
  output.setSubject("Single-page P2006T operational kneeboard");
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

function takeoffWindDelta(headwindKt: number) {
  return headwindKt >= 0 ? -2.5 * headwindKt : 10 * Math.abs(headwindKt);
}

function landingWindDelta(headwindKt: number) {
  return headwindKt >= 0 ? -5 * headwindKt : 11 * Math.abs(headwindKt);
}

function windOperation(
  family: "takeoff" | "landing",
  headwindKt: number
) {
  const rate =
    family === "takeoff"
      ? headwindKt >= 0
        ? 2.5
        : 10
      : headwindKt >= 0
        ? 5
        : 11;
  const sign = headwindKt >= 0 ? "-" : "+";
  return `${sign} (${oneDecimal(rate)} x ${oneDecimal(Math.abs(headwindKt))} kt)`;
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
      ? `; x ${takeoffSlopeFactor.toFixed(3)} slope = ${whole(
          row.takeoffGroundRollM
        )} m`
      : ` = ${whole(row.takeoffGroundRollM)} m`;
  const landingSlope =
    row.uphillSlopePct > 0.05
      ? `; x ${landingSlopeFactor.toFixed(3)} slope = ${whole(
          row.landingGroundRollM
        )} m`
      : ` = ${whole(row.landingGroundRollM)} m`;

  return [
    `${roleLabel(row.role)} ${row.icao} RWY ${row.runway} | ${traceBracket(
      row.takeoffTrace
    )} | Wind component ${row.headwindKt >= 0 ? "+" : ""}${oneDecimal(
      row.headwindKt
    )} kt.`,
    `T/O ground roll: ${whole(takeoffGroundBase)} m ${windOperation(
      "takeoff",
      row.headwindKt
    )} = ${whole(takeoffAfterWind)} m; x 0.940 paved = ${whole(
      takeoffAfterPaved
    )} m${takeoffSlope}.`,
    `T/O to 50 ft: ${whole(takeoff50Base)} m ${windOperation(
      "takeoff",
      row.headwindKt
    )} = ${whole(row.takeoff50M)} m; x 1.25 OM = ${whole(
      row.takeoff50M * OM_FACTOR
    )} m (${whole((row.takeoff50M * OM_FACTOR * 100) / Math.max(1, row.todaM))}% TODA).`,
    `Landing ground roll: ${whole(landingGroundBase)} m ${windOperation(
      "landing",
      row.headwindKt
    )} = ${whole(landingAfterWind)} m; x 0.980 paved = ${whole(
      landingAfterPaved
    )} m${landingSlope}.`,
    `Landing from 50 ft: ${whole(landing50Base)} m ${windOperation(
      "landing",
      row.headwindKt
    )} = ${whole(row.landing50M)} m; x 1.25 OM = ${whole(
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
  const rect = { x: 30, y: 24, width: size.width - 60, height: 150 };
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.28, 0.31, 0.37),
    borderWidth: 0.65,
  });
  let y = rect.y + rect.height - 18;
  calculationLines(row).forEach((line, index) => {
    const selected = index === 0 ? bold : font;
    const textSize = index === 0 ? 7.8 : 7.15;
    const wrapped = wrapText(line, selected, textSize, rect.width - 22).slice(0, 2);
    wrapped.forEach((part) => {
      page.drawText(part, {
        x: rect.x + 11,
        y,
        size: textSize,
        font: selected,
        color: rgb(0.05, 0.06, 0.09),
      });
      y -= 12.5;
    });
    y -= 1.5;
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

function drawDistanceCell(
  page: PDFPage,
  overlay: TableOverlay,
  imageRect: Rect,
  rowIndex: number,
  columnIndex: number
) {
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
    color: rgb(0.05, 0.42, 0.84),
    opacity: 0.2,
    borderColor: rgb(0.02, 0.24, 0.68),
    borderWidth: 0.9,
  });
}

function highlightTakeoffGroundTrace(
  page: PDFPage,
  overlay: TableOverlay,
  imageRect: Rect,
  trace: P2006TInterpolationTrace
) {
  const rows = Array.from(
    new Set(
      [trace.lowerAltitudeFt, trace.upperAltitudeFt].map(
        (altitude) => Math.max(0, Math.min(10, Math.round(altitude / 1000))) * 2
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
      drawDistanceCell(page, overlay, imageRect, rowIndex, columnIndex)
    )
  );
}

async function addTakeoffGroundHighlights(
  output: PDFDocument,
  page: PDFPage,
  row: P2006TPerformanceRow,
  registration: P2006TRegistration,
  imageCache: Map<string, Promise<PDFImage>>
) {
  const margin = 30;
  const gapX = 22;
  const cellWidth = (842 - margin * 2 - gapX) / 2;
  const cellHeight = 405;
  const targets: Rect[] = [
    { x: margin, y: 665, width: cellWidth, height: cellHeight },
    { x: margin + cellWidth + gapX, y: 665, width: cellWidth, height: cellHeight },
  ];
  const sources = [...(row.takeoffTrace.sourcePages as SourcePage[])].sort(
    (a, b) => a.weightKg - b.weightKg
  );

  for (let index = 0; index < Math.min(2, sources.length); index += 1) {
    const source = sources[index];
    let pending = imageCache.get(source.image);
    if (!pending) {
      pending = fetch(source.image, { cache: "force-cache" }).then(async (response) => {
        if (!response.ok) throw new Error(`Cannot load AFM page ${source.image}.`);
        return output.embedPng(await response.arrayBuffer());
      });
      imageCache.set(source.image, pending);
    }
    const image = await pending;
    const imageRect = zoomedImageRect(image, targets[index]);
    const overlay = DISTANCE_OVERLAYS[
      overlayKey(registration, "takeoff", source.weightKg)
    ];
    if (!overlay) continue;

    page.pushOperators(
      pushGraphicsState(),
      rectangle(
        targets[index].x,
        targets[index].y,
        targets[index].width,
        targets[index].height
      ),
      clip(),
      endPath()
    );
    highlightTakeoffGroundTrace(page, overlay, imageRect, row.takeoffTrace);
    page.pushOperators(popGraphicsState());
  }
}

function redrawCruiseNote(
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
  const lines = [
    `Cruise | ${rounded(enroute.settings.cruiseAltitudeFt, 500)} ft | ISA ${
      enroute.isaDeviationC >= 0 ? "+" : ""
    }${rounded(enroute.isaDeviationC, 5)} C | ${enroute.settings.cruiseRpm} RPM | ${whole(
      enroute.settings.cruisePowerPercent
    )}% power.`,
    enroute.cruise
      ? `From the surrounding AFM cruise rows, we can expect about ${whole(
          enroute.cruise.tasKt
        )} KTAS and ${whole(enroute.cruise.fuelFlowLh)} L/h for both engines.`
      : "The selected condition is outside the available published cruise rows.",
    "The published cruise tables are referenced at 1150 kg; no artificial weight correction is applied.",
  ];
  let y = rect.y + rect.height - 19;
  lines.forEach((line, index) => {
    const selected = index === 0 ? bold : font;
    const textSize = index === 0 ? 8 : 7.4;
    wrapText(line, selected, textSize, rect.width - 22)
      .slice(0, 2)
      .forEach((part) => {
        page.drawText(part, {
          x: rect.x + 11,
          y,
          size: textSize,
          font: selected,
          color: rgb(0.06, 0.07, 0.1),
        });
        y -= 13;
      });
    y -= 2;
  });
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
      centers[centers.length - 1] +
        (centers[centers.length - 1] - centers[centers.length - 2]) / 2
    ),
  ];
}

function fitImageInRect(image: PDFImage, target: Rect) {
  const scale = Math.min(target.width / image.width, target.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: target.x + (target.width - width) / 2,
    y: target.y + (target.height - height) / 2,
    width,
    height,
  };
}

function drawExactOeiGrid(page: PDFPage, imageRect: Rect, grid: ExactGrid) {
  const columns = axisEdges(grid.columnCenters);
  const rows = axisEdges(grid.rowCenters);
  const left = imageRect.x + columns[0] * imageRect.width;
  const right = imageRect.x + columns[columns.length - 1] * imageRect.width;
  const top = imageRect.y + (1 - rows[0]) * imageRect.height;
  const bottom = imageRect.y + (1 - rows[rows.length - 1]) * imageRect.height;

  page.drawRectangle({
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
    borderColor: rgb(0.02, 0.45, 0.3),
    borderWidth: 0.8,
  });
  columns.slice(1, -1).forEach((position) => {
    const x = imageRect.x + position * imageRect.width;
    page.drawLine({
      start: { x, y: bottom },
      end: { x, y: top },
      thickness: 0.18,
      color: rgb(0.02, 0.45, 0.3),
      opacity: 0.32,
    });
  });
  rows.slice(1, -1).forEach((position) => {
    const y = imageRect.y + (1 - position) * imageRect.height;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.18,
      color: rgb(0.02, 0.45, 0.3),
      opacity: 0.28,
    });
  });
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

function oeiExplanationLines(
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow,
  calculation: ReturnType<typeof oeiForRow>
) {
  const headwindOperation =
    row.headwindKt >= 0
      ? `${oneDecimal(calculation.tasKt)} - ${oneDecimal(row.headwindKt)}`
      : `${oneDecimal(calculation.tasKt)} + ${oneDecimal(Math.abs(row.headwindKt))}`;
  const ceilingOperation = `${whole(
    calculation.serviceCeilingLowerAltitudeFt
  )} + (50 - ${whole(calculation.serviceCeilingLowerRocFpm)}) / (${whole(
    calculation.serviceCeilingUpperRocFpm
  )} - ${whole(calculation.serviceCeilingLowerRocFpm)}) x ${whole(
    calculation.serviceCeilingUpperAltitudeFt -
      calculation.serviceCeilingLowerAltitudeFt
  )}`;
  return [
    `${roleLabel(row.role)} ${row.icao} RWY ${row.runway} | ${input.registration} | AFM ${getP2006TOeiSourcePage(
      input.registration
    )} | W ${whole(row.takeoffWeightKg)} kg | PA ${whole(row.paFt)} ft | OAT ${whole(
      row.oatC
    )} C.`,
    `Interpolating the surrounding weight, altitude and temperature cells gives VySE ${whole(
      calculation.vyseKias
    )} KIAS and OEI ROC ${whole(calculation.rocFpm)} ft/min.`,
    `TAS ${oneDecimal(calculation.tasKt)} kt; GS = ${headwindOperation} = ${oneDecimal(
      calculation.groundSpeedKt
    )} kt. OEI gradient = ${whole(calculation.rocFpm)} / (${oneDecimal(
      calculation.groundSpeedKt
    )} x 101.27) x 100 = ${twoDecimals(calculation.gradientPct)}%.`,
    `OEI service ceiling (50 ft/min): H = ${ceilingOperation} = ${whole(
      calculation.serviceCeilingFt
    )} ft${calculation.serviceCeilingExtrapolated ? " (linear extrapolation)" : ""}.`,
    "Orange: current OEI calculation cells. Blue: 50 ft/min ceiling cells. Purple: a source cell used by both calculations.",
  ];
}

async function appendDetailedOeiPage(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow
) {
  const calculation = oeiForRow(input, row);
  const cells = getP2006TOeiTraceCells({
    registration: input.registration,
    weightKg: row.takeoffWeightKg,
    pressureAltitudeFt: row.paFt,
    oatC: row.oatC,
    calculation,
  });
  const response = await fetch(
    `/api/p2006-oei-source?registration=${encodeURIComponent(input.registration)}`,
    { cache: "force-cache" }
  );
  if (!response.ok) throw new Error("Could not load the mapped AFM OEI source page.");

  const image = await output.embedPng(await response.arrayBuffer());
  const page = output.addPage([A4_WIDTH, A4_HEIGHT]);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const imageRect = fitImageInRect(image, {
    x: 12,
    y: 150,
    width: A4_WIDTH - 24,
    height: A4_HEIGHT - 162,
  });
  const grid = exactOeiGrid(input.registration);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: A4_WIDTH,
    height: A4_HEIGHT,
    color: rgb(1, 1, 1),
  });
  page.drawImage(image, imageRect);
  drawExactOeiGrid(page, imageRect, grid);

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
      borderWidth: 0.9,
    });
  });

  const noteRect = { x: 18, y: 18, width: A4_WIDTH - 36, height: 120 };
  page.drawRectangle({
    ...noteRect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.38, 0.41, 0.47),
    borderWidth: 0.65,
  });
  let y = noteRect.y + noteRect.height - 17;
  oeiExplanationLines(input, row, calculation).forEach((line, index) => {
    const selected = index === 0 ? bold : font;
    const textSize = index === 0 ? 7.2 : 6.55;
    const wrapped = wrapText(line, selected, textSize, noteRect.width - 20).slice(0, 2);
    wrapped.forEach((part) => {
      page.drawText(part, {
        x: noteRect.x + 10,
        y,
        size: textSize,
        font: selected,
        color: rgb(0.05, 0.06, 0.09),
      });
      y -= 10.5;
    });
    y -= 1.5;
  });
}

async function enhanceTablesPdf(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.load(bytes);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const imageCache = new Map<string, Promise<PDFImage>>();

  for (let index = 0; index < input.rows.length; index += 1) {
    const page = output.getPage(index);
    redrawAerodromeCalculationNotes(page, input.rows[index], font, bold);
    await addTakeoffGroundHighlights(
      output,
      page,
      input.rows[index],
      input.registration,
      imageCache
    );
  }

  const cruisePageIndex = input.rows.length + 1;
  if (cruisePageIndex < output.getPageCount()) {
    redrawCruiseNote(output.getPage(cruisePageIndex), input, font, bold);
  }

  const expectedBeforeOei = input.rows.length + 2;
  if (output.getPageCount() > expectedBeforeOei) {
    output.removePage(output.getPageCount() - 1);
  }

  for (const row of input.rows) {
    await appendDetailedOeiPage(output, input, row);
  }

  output.setTitle(`P2006T ${input.registration} performance tables`);
  output.setSubject(
    "P2006T AFM source tables with explicit interpolation, corrections and OEI calculations"
  );
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const mode = getP2006TDownloadMode();
  if (mode === "kneeboard") return buildSinglePageKneeboard(input);

  const bytes = await buildP2006TPerformancePdfV15(input);
  if (mode === "tables") return enhanceTablesPdf(bytes, input);
  return bytes;
}
