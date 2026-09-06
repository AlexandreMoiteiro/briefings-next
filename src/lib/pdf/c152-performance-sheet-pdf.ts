import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PerformanceLegResult } from "@/lib/performance/aerodrome-performance";
import {
  C152_CS_AVC,
  type C152PerformanceRow,
  type C152WeightBalanceResult,
} from "@/lib/performance/c152-performance";
import type { C152FuelPlanningResult } from "@/lib/performance/c152-fuel-planning";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const SOURCE_WIDTH = 827;
const SOURCE_HEIGHT = 1170;
const BLACK = rgb(0.04, 0.04, 0.04);
const GRID = rgb(0.62, 0.62, 0.62);
const LIGHT_GRID = rgb(0.84, 0.84, 0.84);
const GREY = rgb(0.78, 0.78, 0.78);
const ORANGE = rgb(0.95, 0.43, 0.14);
const RED = rgb(0.88, 0.08, 0.08);
const WHITE = rgb(1, 1, 1);

export type BuildC152PerformanceSheetPdfInput = {
  registration: string;
  date: string;
  weightBalance: C152WeightBalanceResult;
  performanceResults: PerformanceLegResult[];
  performanceRows: Array<C152PerformanceRow | null>;
  fuelPlan: C152FuelPlanningResult;
};

function xFromPx(px: number) {
  return (px / SOURCE_WIDTH) * PAGE_WIDTH;
}

function yFromTopPx(px: number) {
  return PAGE_HEIGHT - (px / SOURCE_HEIGHT) * PAGE_HEIGHT;
}

function widthFromPx(px: number) {
  return (px / SOURCE_WIDTH) * PAGE_WIDTH;
}

function heightFromPx(px: number) {
  return (px / SOURCE_HEIGHT) * PAGE_HEIGHT;
}

function drawRectPx(
  page: PDFPage,
  x: number,
  yTop: number,
  width: number,
  height: number,
  options: { fill?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb>; borderWidth?: number } = {}
) {
  page.drawRectangle({
    x: xFromPx(x),
    y: yFromTopPx(yTop + height),
    width: widthFromPx(width),
    height: heightFromPx(height),
    color: options.fill,
    borderColor: options.border ?? BLACK,
    borderWidth: options.borderWidth ?? 0.7,
  });
}

function drawLinePx(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness = 0.7,
  color = BLACK
) {
  page.drawLine({
    start: { x: xFromPx(x1), y: yFromTopPx(y1) },
    end: { x: xFromPx(x2), y: yFromTopPx(y2) },
    thickness,
    color,
  });
}

function textWidth(font: PDFFont, text: string, size: number) {
  return font.widthOfTextAtSize(text, size);
}

function drawCentered(
  page: PDFPage,
  font: PDFFont,
  text: string,
  centerXPx: number,
  centerYPx: number,
  size = 8.2,
  color = BLACK
) {
  if (!text) return;
  const width = textWidth(font, text, size);
  page.drawText(text, {
    x: xFromPx(centerXPx) - width / 2,
    y: yFromTopPx(centerYPx) - size * 0.34,
    size,
    font,
    color,
  });
}

function drawLeft(
  page: PDFPage,
  font: PDFFont,
  text: string,
  leftXPx: number,
  centerYPx: number,
  size = 8.2,
  color = BLACK
) {
  if (!text) return;
  page.drawText(text, {
    x: xFromPx(leftXPx),
    y: yFromTopPx(centerYPx) - size * 0.34,
    size,
    font,
    color,
  });
}

function drawHeader(page: PDFPage, font: PDFFont, bold: PDFFont) {
  drawRectPx(page, 55, 20, 717, 72, { fill: WHITE, border: BLACK, borderWidth: 0.7 });
  drawRectPx(page, 245, 20, 355, 72, { fill: ORANGE, border: BLACK, borderWidth: 0.7 });
  drawLinePx(page, 600, 20, 600, 92);
  drawLinePx(page, 600, 55, 772, 55);

  drawRectPx(page, 69, 38, 26, 36, { fill: RED, border: RED, borderWidth: 0 });
  drawCentered(page, bold, "S", 82, 56, 17, WHITE);
  drawLeft(page, bold, "SEVENAIR", 105, 48, 11.5);
  drawLeft(page, font, "Academy", 105, 67, 8.8);

  drawCentered(page, bold, "M&B and Performance Data Sheet", 423, 41, 9.3);
  drawCentered(page, bold, "Cessna C152", 423, 69, 10.6);
  drawLeft(page, font, "Effective: 19/01/2024", 610, 38, 7.5);
  drawLeft(page, font, "Revision: 02", 610, 73, 7.5);
}

function drawFooter(page: PDFPage, font: PDFFont, pageNumber: 1 | 2) {
  drawLeft(page, font, "RVP.CFI.066.02", 56, 1138, 5.8);
  drawCentered(page, font, `Page ${pageNumber} of 2`, 414, 1138, 5.8);
}

function drawPage1Template(page: PDFPage, font: PDFFont, bold: PDFFont) {
  drawHeader(page, font, bold);

  const x = [55, 341, 485, 629, 772];
  const rowBounds = [110, 141, 185, 227, 274, 317, 359, 401, 444, 486, 544, 587, 630];
  drawRectPx(page, 55, 110, 717, 520, { fill: WHITE });
  drawRectPx(page, 55, 110, 286, 75, { fill: GREY });
  drawRectPx(page, 341, 110, 431, 31, { fill: GREY });
  drawRectPx(page, 341, 141, 431, 44, { fill: GREY });

  const greyRows = [185, 227, 274, 317, 359, 401, 444, 486];
  greyRows.forEach((top, index) => {
    const bottom = rowBounds[rowBounds.indexOf(top) + 1] ?? (index === greyRows.length - 1 ? 544 : top + 42);
    drawRectPx(page, 55, top, 286, bottom - top, { fill: GREY });
  });
  drawRectPx(page, 55, 486, 286, 58, { fill: GREY });
  drawRectPx(page, 485, 544, 144, 43, { fill: GREY });
  drawRectPx(page, 485, 587, 144, 43, { fill: GREY });

  x.forEach((value) => drawLinePx(page, value, 110, value, 630));
  rowBounds.forEach((value) => {
    if (value === 141) drawLinePx(page, 341, value, 772, value);
    else if (value === 587) drawLinePx(page, 485, value, 772, value);
    else drawLinePx(page, 55, value, 772, value);
  });

  drawCentered(page, bold, "LOADING DATA", 198, 149, 12);
  drawCentered(page, bold, "YOUR AIRPLANE", 556, 126, 9.2);
  drawCentered(page, bold, "Weight (lbs)", 413, 164, 8.3);
  drawCentered(page, bold, "Arm (Inches)", 556, 164, 8.3);
  drawCentered(page, bold, "Moment (lbs x", 700, 157, 7.7);
  drawCentered(page, bold, "inchs/1000)", 700, 173, 7.7);

  const labels = [
    ["1. Basic Empty Weight", 207, false],
    ["2. Usable Fuel (At 6 Lbs./Gallon)", 247, false],
    ["Standard Tanks (24.5 Gal. Maximum)", 266, false],
    ["3. Pilot & Passenger", 300, false],
    ["4. Baggage Area - Area 1", 342, false],
    ["5. Baggage Area 2", 384, false],
    ["6. RAMP WEIGHT & MOMENT", 425, true],
    ["7. Fuel Allowance for engine start,", 463, false],
    ["taxi & runup", 481, false],
    ["8. TAKEOFF WEIGHT & MOMENT", 514, true],
    ["(subtract step 7 from step 6)", 533, true],
  ] as const;
  labels.forEach(([text, y, isBold]) => drawLeft(page, isBold ? bold : font, text, 61, y, isBold ? 8.5 : 8.2));
  drawLeft(page, font, "MTOW:", 492, 566, 8.2);
  drawLeft(page, font, "MLW:", 492, 608, 8.2);

  const graphLeft = 148;
  const graphRight = 685;
  const graphTop = 680;
  const graphBottom = 1059;
  drawRectPx(page, graphLeft, graphTop, graphRight - graphLeft, graphBottom - graphTop, {
    fill: WHITE,
    border: BLACK,
    borderWidth: 0.7,
  });

  for (let moment = 30; moment <= 65; moment += 1) {
    const px = graphLeft + ((moment - 30) / 35) * (graphRight - graphLeft);
    const major = moment % 5 === 0;
    drawLinePx(page, px, graphTop, px, graphBottom, major ? 0.45 : 0.2, major ? GRID : LIGHT_GRID);
    if (major) drawCentered(page, font, String(moment), px, 1074, 5.8);
  }
  for (let weight = 1000; weight <= 1700; weight += 20) {
    const py = graphBottom - ((weight - 1000) / 700) * (graphBottom - 728);
    const major = weight % 100 === 0;
    drawLinePx(page, graphLeft, py, graphRight, py, major ? 0.45 : 0.2, major ? GRID : LIGHT_GRID);
    if (major) drawLeft(page, font, String(weight), 112, py, 5.8);
  }

  const momentToX = (momentThousands: number) =>
    graphLeft + ((momentThousands - 30) / 35) * (graphRight - graphLeft);
  const weightToY = (weightLb: number) =>
    graphBottom - ((weightLb - 1000) / 700) * (graphBottom - 728);
  const forwardAt1000 = 31;
  const forwardAt1670 = (1670 * 32.6) / 1000;
  const aftAt1000 = (1000 * 36.5) / 1000;
  const aftAt1670 = (1670 * 36.5) / 1000;
  const envelope = [
    [momentToX(forwardAt1000), weightToY(1000)],
    [momentToX(forwardAt1670), weightToY(1670)],
    [momentToX(aftAt1670), weightToY(1670)],
    [momentToX(aftAt1000), weightToY(1000)],
  ] as const;
  for (let index = 0; index < envelope.length; index += 1) {
    const a = envelope[index];
    const b = envelope[(index + 1) % envelope.length];
    drawLinePx(page, a[0], a[1], b[0], b[1], 1.1, BLACK);
  }

  drawRectPx(page, 185, 737, 207, 58, { fill: WHITE, border: BLACK, borderWidth: 0.8 });
  drawCentered(page, bold, "CENTER OF GRAVITY", 288, 756, 9.3);
  drawCentered(page, bold, "MOMENT ENVELOPE", 288, 778, 9.3);
  drawCentered(page, font, "LOADED AIRPLANE MOMENT/1000 (POUND-INCHES)", 416, 1092, 6.6);
  page.drawText("LOADED AIRPLANE WEIGHT (POUNDS)", {
    x: xFromPx(74),
    y: yFromTopPx(1004),
    size: 6.6,
    font,
    rotate: degrees(90),
    color: BLACK,
  });

  drawFooter(page, font, 1);
}

function drawPage2Template(page: PDFPage, font: PDFFont, bold: PDFFont) {
  drawHeader(page, font, bold);

  const left = 80;
  const x = [80, 258, 413, 583, 750];
  const rows = [110, 140, 171, 202, 233, 264, 294, 325, 355, 386, 416, 447, 478, 508, 539, 569, 600, 630, 662, 693, 724, 754, 785, 836, 867, 897, 929, 981, 1012, 1063];
  drawRectPx(page, left, 110, 670, 953, { fill: WHITE });

  const greyRanges = [
    [80, 110, 178, 30],
    [413, 110, 170, 30],
    [80, 140, 178, 31],
    [413, 140, 170, 31],
    [583, 140, 167, 31],
    [80, 171, 178, 31],
    [80, 202, 670, 31],
    [80, 233, 178, 214],
    [80, 447, 670, 31],
    [80, 478, 178, 152],
    [80, 630, 333, 32],
    [413, 630, 170, 32],
    [583, 630, 167, 32],
    [80, 662, 333, 401],
  ] as const;
  greyRanges.forEach(([gx, gy, gw, gh]) => drawRectPx(page, gx, gy, gw, gh, { fill: GREY }));

  x.forEach((value) => drawLinePx(page, value, 110, value, 1063));
  rows.forEach((value) => {
    if (value === 202 || value === 447 || value === 630) drawLinePx(page, 80, value, 750, value);
    else drawLinePx(page, 80, value, 750, value);
  });

  drawLeft(page, font, "Date:", 208, 125, 8.5);
  drawLeft(page, font, "Aircraft Reg.:", 472, 125, 8.5);
  drawCentered(page, font, "Departure", 335, 155, 8.7);
  drawCentered(page, font, "Arrival", 498, 155, 8.7);
  drawCentered(page, font, "Alternate", 666, 155, 8.7);
  drawLeft(page, font, "Airfield:", 187, 186, 8.3);
  drawCentered(page, bold, "Airfield Data", 504, 218, 9.5);

  const airLabels = [
    ["RWY QFU:", 248],
    ["Elevation (ft):", 279],
    ["QNH (hPa):", 309],
    ["Temperature (°C):", 340],
    ["Wind (° / kts):", 370],
    ["Pressure Alt. (ft):", 401],
    ["Density Alt. (ft):", 431],
  ] as const;
  airLabels.forEach(([label, y]) => drawLeft(page, font, label, 145, y, 8.1));

  drawCentered(page, bold, "Aircraft Performance Data", 504, 463, 9.4);
  const perfLabels = [
    ["TODA (m)", 493],
    ["TODR (m)", 523],
    ["LDA (m)", 554],
    ["LDR (m)", 584],
    ["ROC (ft/min)", 615],
  ] as const;
  perfLabels.forEach(([label, y]) => drawLeft(page, font, label, 87, y, 8.3));

  drawCentered(page, bold, "Fuel Planning", 246, 646, 9.3);
  drawCentered(page, font, "Time", 498, 646, 9.1);
  drawCentered(page, font, "Fuel", 666, 646, 9.1);
  const fuelLabels = [
    ["(1)   Start-up and Taxi:", 677],
    ["(2)   Climb:", 708],
    ["(3)   Enroute:", 739],
    ["(4)   Descent:", 769],
    ["(5)   Trip Fuel", 801],
    ["       ( 2 + 3 + 4 ):", 822],
    ["(6)   Contingency 5% ( 5 )", 851],
    ["(7)   Alternate:", 882],
    ["(8)   Reserve 45 min.:", 913],
    ["(9)   Required Ramp Fuel", 945],
    ["       ( 1 + 5 + 6 + 7 + 8 ):", 967],
    ["(10) Extra", 996],
    ["(11) Total Ramp Fuel", 1027],
    ["       ( 9 + 10 ):", 1049],
  ] as const;
  fuelLabels.forEach(([label, y]) => drawLeft(page, font, label, 96, y, 8.0));

  drawFooter(page, font, 2);
}

function fmt(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return value.toFixed(digits);
}

function whole(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return String(Math.round(value));
}

function formatDate(dateIso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : dateIso;
}

function drawPage1Data(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  input: BuildC152PerformanceSheetPdfInput
) {
  const wb = input.weightBalance;
  const rows = wb.rows;
  const weightX = 413;
  const armX = 556;
  const momentX = 700;
  const rowY = [207, 254, 300, 342, 384];

  rows.slice(0, 5).forEach((row, index) => {
    drawCentered(page, font, fmt(row.weightLb, 1), weightX, rowY[index], 8.4);
    drawCentered(page, font, fmt(row.armIn, 2), armX, rowY[index], 8.4);
    drawCentered(page, font, fmt(row.momentLbIn / 1000, 2), momentX, rowY[index], 8.4);
  });

  drawCentered(page, bold, fmt(wb.ramp.weightLb, 1), weightX, 425, 8.4);
  drawCentered(page, bold, fmt(wb.ramp.cgIn, 2), armX, 425, 8.4);
  drawCentered(page, bold, fmt(wb.ramp.momentLbIn / 1000, 2), momentX, 425, 8.4);

  const taxiWeightLb = input.fuelPlan.startupTaxiGal * C152_CS_AVC.fuelDensityLbGal;
  const taxiMomentLbIn = taxiWeightLb * C152_CS_AVC.fuelArmIn;
  drawCentered(page, font, fmt(taxiWeightLb, 1), weightX, 472, 8.4);
  drawCentered(page, font, fmt(C152_CS_AVC.fuelArmIn, 1), armX, 472, 8.4);
  drawCentered(page, font, fmt(taxiMomentLbIn / 1000, 2), momentX, 472, 8.4);

  drawCentered(page, bold, fmt(wb.takeoff.weightLb, 1), weightX, 521, 8.4);
  drawCentered(page, bold, fmt(wb.takeoff.cgIn, 2), armX, 521, 8.4);
  drawCentered(page, bold, fmt(wb.takeoff.momentLbIn / 1000, 2), momentX, 521, 8.4);
  drawCentered(page, bold, whole(C152_CS_AVC.maxTakeoffWeightLb), momentX, 566, 8.7);
  drawCentered(page, bold, whole(C152_CS_AVC.maxLandingWeightLb), momentX, 608, 8.7);

  const graphLeft = 148;
  const graphRight = 685;
  const graphBottom = 1059;
  const graphWeight1700Y = 728;
  const plotPoint = (momentThousands: number, weightLb: number, label: string, filled: boolean) => {
    if (momentThousands < 30 || momentThousands > 65 || weightLb < 1000 || weightLb > 1700) return;
    const xPx = graphLeft + ((momentThousands - 30) / 35) * (graphRight - graphLeft);
    const yPx = graphBottom - ((weightLb - 1000) / 700) * (graphBottom - graphWeight1700Y);
    const x = xFromPx(xPx);
    const y = yFromTopPx(yPx);
    page.drawCircle({
      x,
      y,
      size: 3.2,
      color: filled ? BLACK : WHITE,
      borderColor: BLACK,
      borderWidth: 1.1,
    });
    drawLeft(page, bold, label, xPx + 7, yPx - 4, 6.5);
  };
  plotPoint(wb.ramp.momentLbIn / 1000, wb.ramp.weightLb, "R", false);
  plotPoint(wb.takeoff.momentLbIn / 1000, wb.takeoff.weightLb, "TO", true);
}

function drawPage2Data(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  input: BuildC152PerformanceSheetPdfInput
) {
  const colX = [335, 498, 666];
  drawCentered(page, bold, formatDate(input.date), 335, 125, 8.2);
  drawCentered(page, bold, input.registration, 666, 125, 8.2);

  input.performanceResults.slice(0, 3).forEach((result, index) => {
    const row = input.performanceRows[index] ?? null;
    const x = colX[index];
    const leg = result.leg;
    drawCentered(page, bold, leg.icao || "-", x, 186, 8.0);

    if (!row || !result.aerodrome) {
      [248, 279, 309, 340, 370, 401, 431, 493, 523, 554, 584, 615].forEach((y) =>
        drawCentered(page, font, "N/A", x, y, 7.4)
      );
      return;
    }

    const qfu = String(Math.round(row.qfu)).padStart(3, "0");
    drawCentered(page, font, `${row.runway} / ${qfu}°`, x, 248, 7.6);
    drawCentered(page, font, whole(result.aerodrome.elev_ft), x, 279, 7.8);
    drawCentered(page, font, whole(leg.qnhHpa), x, 309, 7.8);
    drawCentered(page, font, whole(leg.tempC), x, 340, 7.8);
    drawCentered(
      page,
      font,
      `${String(Math.round(leg.windFrom)).padStart(3, "0")}° / ${whole(leg.windKt)} kt`,
      x,
      370,
      7.2
    );
    drawCentered(page, font, whole(result.pressureAltitudeFt), x, 401, 7.8);
    drawCentered(page, font, whole(result.densityAltitudeFt), x, 431, 7.8);
    drawCentered(page, font, whole(row.todaM), x, 493, 7.8);
    drawCentered(page, bold, whole(row.takeoff50FtM), x, 523, 7.8);
    drawCentered(page, font, whole(row.ldaM), x, 554, 7.8);
    drawCentered(page, bold, whole(row.landing50FtM), x, 584, 7.8);
    drawCentered(page, bold, whole(row.rocFpm), x, 615, 7.8);
  });

  const timeX = 498;
  const fuelX = 666;
  const fuel = input.fuelPlan;
  const time = (value: number) => (value > 0 ? `${whole(value)} min` : "-");
  const gallons = (value: number) => `${fmt(value, 1)} gal`;

  drawCentered(page, font, time(fuel.startupTaxiMin), timeX, 677, 7.8);
  drawCentered(page, font, gallons(fuel.startupTaxiGal), fuelX, 677, 7.8);
  drawCentered(page, font, time(fuel.climbMin), timeX, 708, 7.8);
  drawCentered(page, font, gallons(fuel.climbFuelGal), fuelX, 708, 7.8);
  drawCentered(page, font, time(fuel.enrouteMin), timeX, 739, 7.8);
  drawCentered(page, font, gallons(fuel.enrouteFuelGal), fuelX, 739, 7.8);
  drawCentered(page, font, time(fuel.descentMin), timeX, 769, 7.8);
  drawCentered(page, font, gallons(fuel.descentFuelGal), fuelX, 769, 7.8);
  drawCentered(page, bold, time(fuel.tripMin), timeX, 810, 7.8);
  drawCentered(page, bold, gallons(fuel.tripFuelGal), fuelX, 810, 7.8);
  drawCentered(page, font, "-", timeX, 851, 7.8);
  drawCentered(page, font, gallons(fuel.contingencyFuelGal), fuelX, 851, 7.8);
  drawCentered(page, font, time(fuel.alternateMin), timeX, 882, 7.8);
  drawCentered(page, font, gallons(fuel.alternateFuelGal), fuelX, 882, 7.8);
  drawCentered(page, font, "45 min", timeX, 913, 7.8);
  drawCentered(page, font, gallons(fuel.reserveFuelGal), fuelX, 913, 7.8);
  drawCentered(page, bold, "-", timeX, 955, 7.8);
  drawCentered(page, bold, gallons(fuel.requiredRampFuelGal), fuelX, 955, 7.8);
  drawCentered(page, font, "-", timeX, 996, 7.8);
  drawCentered(page, font, gallons(fuel.extraFuelGal), fuelX, 996, 7.8);
  drawCentered(page, bold, "-", timeX, 1037, 7.8);
  drawCentered(page, bold, gallons(fuel.loadedRampFuelGal), fuelX, 1037, 7.8);
}

export async function buildC152PerformanceSheetPdf(
  input: BuildC152PerformanceSheetPdfInput
) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page1 = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPage1Template(page1, font, bold);
  drawPage1Data(page1, font, bold, input);

  const page2 = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPage2Template(page2, font, bold);
  drawPage2Data(page2, font, bold, input);

  doc.setTitle(`RVP.CFI.066.02 Cessna 152 ${input.registration}`);
  doc.setSubject("Cessna C152 M&B and Performance Data Sheet");
  doc.setCreator("Briefings Next");
  doc.setProducer("Briefings Next / pdf-lib");
  return doc.save();
}

export function downloadC152PerformanceSheetPdf(
  bytes: Uint8Array,
  registration: string,
  date: string
) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `C152_${registration}_RVP.CFI.066.02_${date}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
