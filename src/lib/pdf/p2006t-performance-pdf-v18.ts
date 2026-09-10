import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
import { calculateP2006TOeiPerformance } from "@/lib/performance/p2006t-oei";
import { getP2006TPerformanceSettings } from "@/lib/performance/p2006t-performance-settings";
import { p2006tCruisePerformance } from "@/lib/performance/p2006t-climb-cruise";
import { getP2006TDownloadMode } from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV17,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v17";

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
const OM_FACTOR = 1.25;
const FEET_PER_MINUTE_PER_KNOT = 6076.12 / 60;

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

function dateForPdf(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}

function roleLabel(role: P2006TPerformanceRow["role"]) {
  return role === "Alternate" ? "Alternate 1" : role;
}

function rowForRole(
  rows: BuildP2006TPerformancePdfV3Input["rows"],
  role: P2006TPerformanceRow["role"]
) {
  return rows.find((row) => row.role === role) ?? null;
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

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  maximumLines = 2
) {
  const lines = wrapText(text, font, size, width).slice(0, maximumLines);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color: rgb(0.05, 0.06, 0.09),
    });
  });
  return y - lines.length * lineHeight;
}

function expectedWindLine(row: P2006TPerformanceRow) {
  const direction = String(whole(row.windFrom)).padStart(3, "0");
  const side = row.crosswindSide ? ` ${row.crosswindSide}` : "";
  const headwindLabel = row.headwindKt >= 0 ? "HW" : "TW";
  return `Expected wind: ${direction}/${whole(row.windKt)} kt -> XWC ~${whole(
    Math.abs(row.crosswindKt)
  )} kt${side} | ${headwindLabel} ~${whole(Math.abs(row.headwindKt))} kt.`;
}

function formRect(rect: Rect): Rect {
  return {
    x: FORM_X + rect.x * SPREAD_SCALE,
    y: FORM_Y + rect.y * SPREAD_SCALE,
    width: rect.width * SPREAD_SCALE,
    height: rect.height * SPREAD_SCALE,
  };
}

function splitRect(rect: Rect) {
  const width = rect.width / 2;
  return [
    { ...rect, width },
    { ...rect, x: rect.x + width, width },
  ] as const;
}

function drawCenteredValue(
  page: PDFPage,
  rect: Rect,
  value: string,
  font: PDFFont,
  preferredSize: number
) {
  page.drawRectangle({
    x: rect.x + 1.3,
    y: rect.y + 3,
    width: Math.max(0, rect.width - 2.6),
    height: Math.max(0, rect.height - 6),
    color: rgb(1, 1, 1),
  });

  let size = preferredSize;
  while (size > 4.4 && font.widthOfTextAtSize(value, size) > rect.width - 6) {
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

function drawSourceLine(
  page: PDFPage,
  x: number,
  lowerY: number,
  upperY: number
) {
  page.drawLine({
    start: { x: FORM_X + x * SPREAD_SCALE, y: FORM_Y + lowerY * SPREAD_SCALE },
    end: { x: FORM_X + x * SPREAD_SCALE, y: FORM_Y + upperY * SPREAD_SCALE },
    thickness: 0.48,
    color: rgb(0.18, 0.18, 0.18),
  });
}

function repairFormGrid(page: PDFPage) {
  const mainColumns = [184.42, 298.5, 420.3, 480.34, 540.38];
  const columnSections: Array<[number, number]> = [
    [696.17, 738.2],
    [519.59, 674.74],
    [386.72, 499.02],
  ];
  mainColumns.forEach((x) => {
    columnSections.forEach(([lowerY, upperY]) =>
      drawSourceLine(page, x, lowerY, upperY)
    );
  });

  [297.64, 420.3, 540.38].forEach((x) =>
    drawSourceLine(page, x, 74.7, 365.3)
  );
}

function percentageValue(distanceM: number, percentage: number) {
  return `${whole(distanceM)} (${whole(percentage)}%)`;
}

function redrawFormPercentages(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont
) {
  const regular: Array<{
    prefix: "departure" | "arrival";
    row: P2006TPerformanceRow | null;
  }> = [
    { prefix: "departure", row: rowForRole(input.rows, "Departure") },
    { prefix: "arrival", row: rowForRole(input.rows, "Arrival") },
  ];

  regular.forEach(({ prefix, row }) => {
    if (!row) return;
    const todr = COORDS.formRects[`${prefix}-todr`];
    const ldr = COORDS.formRects[`${prefix}-ldr`];
    if (todr) {
      drawCenteredValue(
        page,
        formRect(todr),
        percentageValue(row.takeoff50M, row.takeoffPct),
        font,
        6.8
      );
    }
    if (ldr) {
      drawCenteredValue(
        page,
        formRect(ldr),
        percentageValue(row.landing50M, row.landingPct),
        font,
        6.8
      );
    }
  });

  const alternate1 = rowForRole(input.rows, "Alternate");
  const alternate2 = rowForRole(input.rows, "Alternate 2");
  const alternateTodr = COORDS.formRects["alternate-todr"];
  const alternateLdr = COORDS.formRects["alternate-ldr"];

  if (alternateTodr) {
    const [left, right] = splitRect(formRect(alternateTodr));
    if (alternate1) {
      drawCenteredValue(
        page,
        left,
        percentageValue(alternate1.takeoff50M, alternate1.takeoffPct),
        font,
        5.3
      );
    }
    if (alternate2) {
      drawCenteredValue(
        page,
        right,
        percentageValue(alternate2.takeoff50M, alternate2.takeoffPct),
        font,
        5.3
      );
    }
  }

  if (alternateLdr) {
    const [left, right] = splitRect(formRect(alternateLdr));
    if (alternate1) {
      drawCenteredValue(
        page,
        left,
        percentageValue(alternate1.landing50M, alternate1.landingPct),
        font,
        5.3
      );
    }
    if (alternate2) {
      drawCenteredValue(
        page,
        right,
        percentageValue(alternate2.landing50M, alternate2.landingPct),
        font,
        5.3
      );
    }
  }

  repairFormGrid(page);
}

async function enhanceFormPdf(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() > 0) {
    const font = await output.embedFont(StandardFonts.HelveticaBold);
    redrawFormPercentages(output.getPage(0), input, font);
  }
  output.setTitle(`P2006T ${input.registration} performance form`);
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

function takeoffWindDelta(headwindKt: number) {
  return headwindKt >= 0 ? -2.5 * headwindKt : 10 * Math.abs(headwindKt);
}

function landingWindDelta(headwindKt: number) {
  return headwindKt >= 0 ? -5 * headwindKt : 11 * Math.abs(headwindKt);
}

function windCorrectionText(
  family: "takeoff" | "landing",
  headwindKt: number
) {
  const headwind = headwindKt >= 0;
  const rate =
    family === "takeoff" ? (headwind ? 2.5 : 10) : headwind ? 5 : 11;
  const delta = rate * Math.abs(headwindKt);
  return `${headwind ? "headwind" : "tailwind"} ${
    headwind ? "-" : "+"
  }~${whole(delta)} m (${rate} m/kt x ~${whole(Math.abs(headwindKt))} kt)`;
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
      ? `; uphill ${oneDecimal(row.uphillSlopePct)}%: +${oneDecimal(
          row.uphillSlopePct * 5
        )}% -> ~${whole(row.takeoffGroundRollM)} m`
      : "";
  const landingSlope =
    row.uphillSlopePct > 0.05
      ? `; uphill ${oneDecimal(row.uphillSlopePct)}%: -${oneDecimal(
          row.uphillSlopePct * 2.5
        )}% -> ~${whole(row.landingGroundRollM)} m`
      : "";
  const asdr = row.takeoffGroundRollM + row.landingGroundRollM;

  return [
    `${roleLabel(row.role)} ${row.icao} RWY ${row.runway} | W ~${whole(
      row.takeoffWeightKg
    )} kg | PA ~${whole(row.paFt)} ft | OAT ~${whole(row.oatC)} C.`,
    expectedWindLine(row),
    `T/O ground roll: table ~${whole(takeoffGroundBase)} m; ${windCorrectionText(
      "takeoff",
      row.headwindKt
    )} -> ~${whole(takeoffAfterWind)} m; paved runway -6% -> ~${whole(
      takeoffAfterPaved
    )} m${takeoffSlope}.`,
    `T/O to 50 ft: table ~${whole(takeoff50Base)} m; ${windCorrectionText(
      "takeoff",
      row.headwindKt
    )} -> ~${whole(row.takeoff50M)} m; OM x 1.25 -> ${whole(
      row.takeoff50M * OM_FACTOR
    )} m (${whole(row.takeoffPct * OM_FACTOR)}% TODA).`,
    `ASDR = T/O ground roll ${whole(
      row.takeoffGroundRollM
    )} m + landing ground roll ${whole(row.landingGroundRollM)} m = ${whole(
      asdr
    )} m.`,
    `Landing ground roll: table ~${whole(
      landingGroundBase
    )} m; ${windCorrectionText("landing", row.headwindKt)} -> ~${whole(
      landingAfterWind
    )} m; paved runway -2% -> ~${whole(
      landingAfterPaved
    )} m${landingSlope}.`,
    `Landing from 50 ft: table ~${whole(
      landing50Base
    )} m; ${windCorrectionText("landing", row.headwindKt)} -> ~${whole(
      row.landing50M
    )} m; OM x 1.25 -> ${whole(row.landing50M * OM_FACTOR)} m (${whole(
      row.landingPct * OM_FACTOR
    )}% LDA).`,
  ];
}

function redrawAerodromeNotes(
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
    borderColor: rgb(0.24, 0.27, 0.33),
    borderWidth: 0.65,
  });

  let y = rect.y + rect.height - 17;
  calculationLines(row).forEach((line, index) => {
    const selectedFont = index <= 1 || index === 4 ? bold : font;
    const textSize = index === 0 ? 7.5 : index === 1 ? 7.1 : 6.75;
    const wrapped = wrapText(
      line,
      selectedFont,
      textSize,
      rect.width - 20
    ).slice(0, 2);
    wrapped.forEach((part) => {
      page.drawText(part, {
        x: rect.x + 10,
        y,
        size: textSize,
        font: selectedFont,
        color: rgb(0.05, 0.06, 0.09),
      });
      y -= 11.2;
    });
    y -= 1.2;
  });
}

function cruiseValues(input: BuildP2006TPerformancePdfV3Input) {
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
  return { settings, isaDeviationC, cruise };
}

function redrawCruiseNote(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  const data = cruiseValues(input);
  const size = page.getSize();
  const rect = { x: 34, y: 20, width: size.width - 68, height: 92 };
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.24, 0.27, 0.33),
    borderWidth: 0.6,
  });
  page.drawText("Cruise performance", {
    x: rect.x + 11,
    y: rect.y + rect.height - 19,
    size: 8.2,
    font: bold,
    color: rgb(0.05, 0.06, 0.09),
  });
  drawWrapped(
    page,
    `${rounded(data.settings.cruiseAltitudeFt, 500)} ft | ISA ${
      data.isaDeviationC >= 0 ? "+" : ""
    }${rounded(data.isaDeviationC, 5)} C | ${data.settings.cruiseRpm} RPM | ${whole(
      data.settings.cruisePowerPercent
    )}% power.`,
    rect.x + 11,
    rect.y + 48,
    rect.width - 22,
    font,
    7.4,
    12,
    2
  );
  drawWrapped(
    page,
    data.cruise
      ? `In these conditions, we expect about ${whole(
          data.cruise.tasKt
        )} KTAS and ${whole(data.cruise.fuelFlowLh)} L/h for both engines.`
      : "The selected conditions are outside the available cruise rows.",
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
  const horizontalSpeedFpm = groundSpeedKt * FEET_PER_MINUTE_PER_KNOT;
  const gradientPct =
    (calculation.rocFpm / Math.max(1, horizontalSpeedFpm)) * 100;
  return { ...calculation, groundSpeedKt, horizontalSpeedFpm, gradientPct };
}

function redrawOeiExplanation(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow,
  rect: Rect,
  font: PDFFont,
  bold: PDFFont
) {
  const calculation = oeiForRow(input, row);
  page.drawRectangle({
    x: rect.x - 3,
    y: rect.y - 2,
    width: rect.width + 6,
    height: rect.height + 4,
    color: rgb(1, 1, 1),
  });

  let y = rect.y + rect.height - 15;
  const line = (
    text: string,
    selectedFont: PDFFont = font,
    size = 7.05,
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
      10.4,
      maximumLines
    );
    y -= 3;
  };

  line(
    `W ~${whole(row.takeoffWeightKg)} kg | PA ~${whole(
      row.paFt
    )} ft | OAT ~${whole(row.oatC)} C`,
    font,
    7.15,
    1
  );
  line(expectedWindLine(row), bold, 7.05, 2);
  line(
    `VySE ~${whole(calculation.vyseKias)} KIAS | OEI ROC ~${whole(
      calculation.rocFpm
    )} ft/min`,
    bold,
    7.25,
    1
  );
  line(
    `TAS ~${whole(calculation.tasKt)} kt | GS ~${whole(
      calculation.groundSpeedKt
    )} kt`,
    font,
    7.1,
    1
  );
  line(
    `Horizontal speed: ${whole(
      calculation.groundSpeedKt
    )} kt x 101.27 = ~${whole(
      calculation.horizontalSpeedFpm
    )} ft/min (1 kt = 101.27 ft/min).`,
    font,
    6.9,
    3
  );
  line(
    `OEI gradient: ${whole(calculation.rocFpm)} / ${whole(
      calculation.horizontalSpeedFpm
    )} x 100 = ~${oneDecimal(calculation.gradientPct)}%.`,
    bold,
    7.05,
    2
  );
  line(
    `OEI service ceiling ~${rounded(
      calculation.serviceCeilingFt,
      50
    )} ft${calculation.serviceCeilingExtrapolated ? " (est.)" : ""}.`,
    bold,
    7.2,
    2
  );
}

function redrawCombinedOeiPage(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
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
    const panel = positions[index];
    const imageTarget = {
      x: panel.x + 10,
      y: panel.y + 10,
      width: panel.width * 0.55,
      height: panel.height - 45,
    };
    redrawOeiExplanation(
      page,
      input,
      row,
      {
        x: imageTarget.x + imageTarget.width + 12,
        y: panel.y + 12,
        width:
          panel.x + panel.width - (imageTarget.x + imageTarget.width + 22),
        height: panel.height - 48,
      },
      font,
      bold
    );
  });
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

async function normalizeTablesPdf(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const source = await PDFDocument.load(bytes);
  const output = await PDFDocument.create();
  const regular = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const indexes = Array.from({ length: source.getPageCount() }, (_, index) => index);
  const embedded = await output.embedPdf(bytes, indexes);

  embedded.forEach((sourcePage, index) => {
    const page = output.addPage([A3_WIDTH, A3_HEIGHT]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: A3_WIDTH,
      height: A3_HEIGHT,
      color: rgb(0.965, 0.972, 0.985),
    });
    page.drawRectangle({
      x: 18,
      y: A3_HEIGHT - 48,
      width: A3_WIDTH - 36,
      height: 30,
      color: rgb(0.075, 0.12, 0.22),
    });
    page.drawText(pageTitle(input, index, embedded.length), {
      x: 30,
      y: A3_HEIGHT - 38,
      size: 11,
      font: bold,
      color: rgb(1, 1, 1),
    });
    const right = `${input.registration} | ${dateForPdf(input.date)} | ${
      index + 1
    }/${embedded.length}`;
    const rightWidth = regular.widthOfTextAtSize(right, 8.2);
    page.drawText(right, {
      x: A3_WIDTH - 30 - rightWidth,
      y: A3_HEIGHT - 37,
      size: 8.2,
      font: regular,
      color: rgb(0.9, 0.93, 0.98),
    });

    const target = {
      x: 22,
      y: 20,
      width: A3_WIDTH - 44,
      height: A3_HEIGHT - 82,
    };
    const scale = Math.min(
      target.width / sourcePage.width,
      target.height / sourcePage.height
    );
    const width = sourcePage.width * scale;
    const height = sourcePage.height * scale;
    const x = target.x + (target.width - width) / 2;
    const y = target.y + (target.height - height) / 2;

    page.drawRectangle({
      x: x - 2,
      y: y - 2,
      width: width + 4,
      height: height + 4,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.7, 0.73, 0.79),
      borderWidth: 0.5,
    });
    page.drawPage(sourcePage, { x, y, width, height });
  });

  output.setTitle(`P2006T ${input.registration} performance tables`);
  output.setSubject("P2006T performance tables and calculation evidence");
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

async function enhanceTablesPdf(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.load(bytes);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);

  input.rows.forEach((row, index) => {
    if (index < output.getPageCount()) {
      redrawAerodromeNotes(output.getPage(index), row, font, bold);
    }
  });

  const cruisePageIndex = input.rows.length + 1;
  if (cruisePageIndex < output.getPageCount()) {
    redrawCruiseNote(output.getPage(cruisePageIndex), input, font, bold);
  }

  if (output.getPageCount() > 0) {
    redrawCombinedOeiPage(
      output.getPage(output.getPageCount() - 1),
      input,
      font,
      bold
    );
  }

  const revised = await output.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
  return normalizeTablesPdf(revised, input);
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV17(input);
  const mode = getP2006TDownloadMode();
  if (mode === "form") return enhanceFormPdf(bytes, input);
  if (mode === "tables") return enhanceTablesPdf(bytes, input);
  return bytes;
}
