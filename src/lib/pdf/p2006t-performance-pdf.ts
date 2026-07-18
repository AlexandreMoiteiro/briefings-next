import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
import overlaysJson from "@/lib/performance/p2006t-table-overlays.json";
import {
  formatFuelLiters,
  formatFuelTime,
  recalculateFuelPlan,
  type FuelPlanningInput,
} from "@/lib/performance/fuel-planning";
import type {
  P2006TInterpolationTrace,
  P2006TPerformanceRow,
} from "@/lib/performance/p2006t-performance";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";

type PdfRect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type CoordinateMap = {
  formRects: Record<string, PdfRect>;
  massBalanceRects: Record<string, PdfRect>;
  massBalancePoints: Record<string, Point[]>;
};
type TableOverlay = {
  columns: number[];
  rows: number[];
  notesRect: { x: number; y: number; width: number; height: number };
};

const COORDINATES = coordinatesJson as CoordinateMap;
const TABLE_OVERLAYS = overlaysJson as Record<string, TableOverlay>;
const FORM_URL = "/api/p2006-form";
const TEMPERATURES = [-25, 0, 25, 50] as const;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const FUEL_DENSITY_KG_L = 0.72;

export type P2006TLoadingInput = {
  emptyMassKg: number;
  emptyMomentKgm: number;
  pilotFrontKg: number;
  rearSeatsKg: number;
  fuelLoadedL: number;
  baggageKg: number;
};

export type BuildP2006TPerformancePdfInput = {
  registration: P2006TRegistration;
  date: string;
  loading: P2006TLoadingInput;
  fuelPlan: FuelPlanningInput;
  rows: P2006TPerformanceRow[];
};

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function dateForPdf(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}

function n(value: number, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : "";
}

function fitTextSize(font: PDFFont, text: string, width: number, preferred = 8.2) {
  let size = preferred;
  while (size > 5.4 && font.widthOfTextAtSize(text, size) > width - 5) {
    size -= 0.25;
  }
  return size;
}

function drawCentered(
  page: PDFPage,
  rect: PdfRect,
  value: unknown,
  font: PDFFont,
  preferredSize = 8.2
) {
  const text = clean(value);
  if (!text) return;
  const size = fitTextSize(font, text, rect.width, preferredSize);
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: rect.x + Math.max(2, (rect.width - width) / 2),
    y: rect.y + rect.height / 2 - size * 0.34,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawHeaderLabel(
  page: PDFPage,
  text: string,
  font: PDFFont,
  alternateNumber: 1 | 2
) {
  const rect = { x: 420, y: 717, width: 120, height: 21 };
  page.drawRectangle({
    ...rect,
    color: rgb(0.78, 0.78, 0.78),
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.45,
  });
  drawCentered(page, rect, `${text} ${alternateNumber}`, font, 8.3);
}

function windText(row: P2006TPerformanceRow) {
  return `${String(Math.round(row.windFrom)).padStart(3, "0")} / ${Math.round(
    row.windKt
  )}`;
}

function runwayText(row: P2006TPerformanceRow) {
  return `${row.runway} / ${Math.round(row.qfu)}`;
}

function rowForRole(rows: P2006TPerformanceRow[], role: string) {
  return rows.find((row) => row.role === role) ?? null;
}

function fillPerformanceColumn(
  page: PDFPage,
  prefix: "departure" | "arrival" | "alternate",
  row: P2006TPerformanceRow | null,
  font: PDFFont
) {
  if (!row) return;
  const fields: Record<string, unknown> = {
    [`${prefix}-airfield`]: row.icao,
    [`${prefix}-runway-qfu`]: runwayText(row),
    [`${prefix}-elevation`]: `${Math.round(row.elevationFt)}`,
    [`${prefix}-qnh`]: `${Math.round(row.qnhHpa)}`,
    [`${prefix}-temperature`]: `${Math.round(row.oatC)}`,
    [`${prefix}-wind`]: windText(row),
    [`${prefix}-pressure-altitude`]: `${Math.round(row.paFt)}`,
    [`${prefix}-density-altitude`]: `${Math.round(row.daFt)}`,
    [`${prefix}-toda`]: `${Math.round(row.todaM)}`,
    [`${prefix}-todr`]: `${Math.round(row.takeoff50M)}`,
    [`${prefix}-lda`]: `${Math.round(row.ldaM)}`,
    [`${prefix}-ldr`]: `${Math.round(row.landing50M)}`,
    [`${prefix}-roc`]: `${Math.round(row.rocFpm)}`,
  };

  for (const [name, value] of Object.entries(fields)) {
    const rect = COORDINATES.formRects[name];
    if (rect) drawCentered(page, rect, value, font);
  }
}

function fillFuelPlanning(page: PDFPage, input: FuelPlanningInput, font: PDFFont) {
  const plan = recalculateFuelPlan(input);
  const rows = [
    [plan.taxiMin, plan.taxiFuelL],
    [plan.climbMin, plan.climbFuelL],
    [plan.enrouteMin, plan.enrouteFuelL],
    [plan.descentMin, plan.descentFuelL],
    [plan.tripMin, plan.tripFuelL],
    [plan.contingencyMin, plan.contingencyFuelL],
    [plan.alternateMin, plan.alternateFuelL],
    [plan.reserveMin, plan.reserveFuelL],
    [plan.requiredRampMin, plan.requiredRampFuelL],
    [plan.extraMin, plan.extraFuelL],
    [plan.totalRampMin, plan.totalRampFuelL],
  ] as const;

  rows.forEach(([minutes, fuel], index) => {
    const number = index + 1;
    drawCentered(
      page,
      COORDINATES.formRects[`fuel-${number}-time`],
      formatFuelTime(minutes),
      font
    );
    drawCentered(
      page,
      COORDINATES.formRects[`fuel-${number}-fuel`],
      formatFuelLiters(fuel),
      font
    );
  });
}

function fillPerformancePage({
  page,
  date,
  registration,
  departure,
  arrival,
  alternate,
  alternateNumber,
  fuelPlan,
  font,
  bold,
}: {
  page: PDFPage;
  date: string;
  registration: P2006TRegistration;
  departure: P2006TPerformanceRow | null;
  arrival: P2006TPerformanceRow | null;
  alternate: P2006TPerformanceRow | null;
  alternateNumber: 1 | 2;
  fuelPlan: FuelPlanningInput;
  font: PDFFont;
  bold: PDFFont;
}) {
  drawCentered(page, COORDINATES.formRects.date, dateForPdf(date), font);
  drawCentered(
    page,
    COORDINATES.formRects["aircraft-registration"],
    registration,
    bold
  );
  drawHeaderLabel(page, "Alternate", bold, alternateNumber);
  fillPerformanceColumn(page, "departure", departure, font);
  fillPerformanceColumn(page, "arrival", arrival, font);
  fillPerformanceColumn(page, "alternate", alternate, font);
  fillFuelPlanning(page, fuelPlan, font);
}

function linearFit(values: number[], points: Point[], dimension: "x" | "y") {
  const usable = Math.min(values.length, points.length);
  const xs = values.slice(0, usable);
  const ys = points.slice(0, usable).map((point) => point[dimension]);
  const xMean = xs.reduce((sum, value) => sum + value, 0) / usable;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / usable;
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < usable; index += 1) {
    numerator += (xs[index] - xMean) * (ys[index] - yMean);
    denominator += (xs[index] - xMean) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  return (value: number) => intercept + slope * value;
}

function loadingPath(
  page: PDFPage,
  loading: P2006TLoadingInput,
  fuelMassKg: number,
  lineColor: ReturnType<typeof rgb>,
  label: string,
  font: PDFFont
) {
  const points = COORDINATES.massBalancePoints;
  const emptyY = linearFit(
    [140, 200, 260, 320, 380, 440, 500],
    points["axis-empty-aircraft-moment"],
    "y"
  )(loading.emptyMomentKgm);

  const panelDefinitions = [
    {
      axis: "axis-front-seat-mass",
      values: [0, 40, 80, 120, 160, 200],
      mass: loading.pilotFrontKg,
      guide: "front-seat-max-guide",
    },
    {
      axis: "axis-rear-seat-mass",
      values: [0, 40, 80, 120, 160, 200],
      mass: loading.rearSeatsKg,
      guide: "rear-seat-max-guide",
    },
    {
      axis: "axis-fuel-mass",
      values: [0, 20, 40, 60, 80, 100],
      mass: fuelMassKg,
      guide: "fuel-max-guide",
    },
    {
      axis: "axis-baggage-mass",
      values: [0, 10, 20, 30, 40],
      mass: loading.baggageKg,
      guide: "baggage-max-guide",
    },
  ] as const;

  let currentY = emptyY;
  let lastPoint = { x: points["axis-empty-aircraft-moment"][0].x, y: currentY };
  const pathPoints: Point[] = [lastPoint];

  panelDefinitions.forEach((panel, index) => {
    const axisPoints = points[panel.axis];
    const mapMass = linearFit(panel.values, axisPoints, "x");
    const x0 = mapMass(0);
    const maxMass = panel.values[panel.values.length - 1];
    const xSelected = mapMass(Math.max(0, Math.min(maxMass, panel.mass)));
    const guide = points[panel.guide];
    const slope =
      guide.length >= 2 && guide[1].x !== guide[0].x
        ? (guide[1].y - guide[0].y) / (guide[1].x - guide[0].x)
        : 0;

    if (lastPoint.x !== x0) {
      pathPoints.push({ x: x0, y: currentY });
    }
    currentY += slope * (xSelected - x0);
    pathPoints.push({ x: xSelected, y: currentY });

    const nextAxis = panelDefinitions[index + 1]?.axis;
    const nextX = nextAxis
      ? points[nextAxis][0].x
      : points["axis-flight-mass"][0].x;
    pathPoints.push({ x: nextX, y: currentY });
    lastPoint = { x: nextX, y: currentY };
  });

  for (let index = 1; index < pathPoints.length; index += 1) {
    page.drawLine({
      start: pathPoints[index - 1],
      end: pathPoints[index],
      thickness: 1.35,
      color: lineColor,
      opacity: 0.9,
    });
  }

  const totalMassKg =
    loading.emptyMassKg +
    loading.pilotFrontKg +
    loading.rearSeatsKg +
    fuelMassKg +
    loading.baggageKg;
  const flightMassX = linearFit(
    [800, 900, 1000, 1100, 1200],
    points["axis-flight-mass"],
    "x"
  )(totalMassKg);
  const finalPoint = { x: flightMassX, y: currentY };

  page.drawLine({
    start: pathPoints[pathPoints.length - 1],
    end: finalPoint,
    thickness: 1.35,
    color: lineColor,
    opacity: 0.9,
  });
  page.drawCircle({
    x: finalPoint.x,
    y: finalPoint.y,
    size: 4.5,
    color: lineColor,
  });
  page.drawText(label, {
    x: finalPoint.x + 5,
    y: finalPoint.y + 3,
    size: 6.5,
    font,
    color: lineColor,
  });

  return { totalMassKg, finalPoint };
}

function fillMassAndBalancePage(
  page: PDFPage,
  loading: P2006TLoadingInput,
  fuelPlan: FuelPlanningInput,
  registration: P2006TRegistration,
  font: PDFFont,
  bold: PDFFont
) {
  const fuelMassKg = loading.fuelLoadedL * FUEL_DENSITY_KG_L;
  const values: Record<string, number> = {
    "pilot-front-seat-mass": loading.pilotFrontKg,
    "rear-seats-mass": loading.rearSeatsKg,
    "fuel-mass": fuelMassKg,
    "baggage-mass": loading.baggageKg,
  };

  for (const [name, value] of Object.entries(values)) {
    const rect = COORDINATES.massBalanceRects[name];
    if (rect) drawCentered(page, rect, n(value, 1), bold, 10);
  }

  const plan = recalculateFuelPlan(fuelPlan);
  const tripFuelMassKg = Math.min(fuelMassKg, plan.tripFuelL * FUEL_DENSITY_KG_L);
  const hasEmptyData = loading.emptyMassKg > 0 && loading.emptyMomentKgm > 0;
  const summaryRect = { x: 55, y: 485, width: 485, height: 74 };

  page.drawRectangle({
    ...summaryRect,
    color: rgb(1, 1, 1),
    opacity: 0.94,
    borderColor: rgb(0.45, 0.45, 0.45),
    borderWidth: 0.5,
  });

  if (!hasEmptyData) {
    page.drawText(
      "Enter the aircraft empty mass and empty moment to draw the M&B loading trace.",
      { x: 70, y: 520, size: 8, font: bold, color: rgb(0.5, 0.12, 0.05) }
    );
    page.drawText(
      "The four loading cells above are filled; no empty-aircraft data is invented.",
      { x: 70, y: 502, size: 7.2, font, color: rgb(0.25, 0.25, 0.25) }
    );
    return;
  }

  const takeoffMoment =
    loading.emptyMomentKgm -
    loading.pilotFrontKg * 0.893 +
    loading.rearSeatsKg * 0.226 +
    fuelMassKg * 0.755 +
    loading.baggageKg * 1.215;
  const takeoffMass =
    loading.emptyMassKg +
    loading.pilotFrontKg +
    loading.rearSeatsKg +
    fuelMassKg +
    loading.baggageKg;
  const landingMass = takeoffMass - tripFuelMassKg;
  const landingMoment = takeoffMoment - tripFuelMassKg * 0.755;
  const takeoffMac = (takeoffMoment / takeoffMass / 1.339) * 100;
  const landingMac = (landingMoment / landingMass / 1.339) * 100;
  const maxMass = registration === "CS-EAQ" ? 1180 : 1230;
  const takeoffOk =
    takeoffMass <= maxMass && takeoffMac >= 16.5 && takeoffMac <= 31;
  const landingOk =
    landingMass <= maxMass && landingMac >= 16.5 && landingMac <= 31;

  loadingPath(page, loading, fuelMassKg, rgb(0.06, 0.28, 0.8), "TO", bold);
  loadingPath(
    page,
    loading,
    Math.max(0, fuelMassKg - tripFuelMassKg),
    rgb(0.82, 0.12, 0.12),
    "LDG",
    bold
  );

  const lines = [
    `Empty: ${n(loading.emptyMassKg, 1)} kg / ${n(loading.emptyMomentKgm, 1)} kgm`,
    `Takeoff: ${n(takeoffMass, 1)} kg / ${n(takeoffMoment, 1)} kgm / ${n(
      takeoffMac,
      1
    )}% MAC - ${takeoffOk ? "OK" : "NOK"}`,
    `Landing: ${n(landingMass, 1)} kg / ${n(landingMoment, 1)} kgm / ${n(
      landingMac,
      1
    )}% MAC - ${landingOk ? "OK" : "NOK"}`,
  ];

  lines.forEach((line, index) => {
    page.drawText(line, {
      x: 70,
      y: 535 - index * 17,
      size: index === 0 ? 7.4 : 8,
      font: index === 0 ? font : bold,
      color: rgb(0.05, 0.05, 0.05),
    });
  });
}

function uniqueTracePages(rows: P2006TPerformanceRow[]) {
  const entries: Array<{
    row: P2006TPerformanceRow;
    trace: P2006TInterpolationTrace;
    family: "takeoff" | "landing";
    finalDistanceM: number;
  }> = [];

  for (const row of rows) {
    entries.push({
      row,
      trace: row.takeoffTrace,
      family: "takeoff",
      finalDistanceM: row.takeoff50M,
    });
    entries.push({
      row,
      trace: row.landingTrace,
      family: "landing",
      finalDistanceM: row.landing50M,
    });
  }

  return entries;
}

function cellBounds(centers: number[], index: number) {
  const center = centers[index];
  const previous = centers[index - 1];
  const next = centers[index + 1];
  const left =
    previous === undefined
      ? center - (next - center) / 2
      : (previous + center) / 2;
  const right =
    next === undefined ? center + (center - previous) / 2 : (center + next) / 2;
  return [left, right] as const;
}

function tableOverlayKey(
  registration: P2006TRegistration,
  family: "takeoff" | "landing",
  weightKg: number
) {
  const weightKey = weightKg === 930 ? 930 : weightKg === 1080 ? 1080 : 1180;
  return `${registration}:${family}:${weightKey}`;
}

function drawTableHighlights(
  page: PDFPage,
  overlay: TableOverlay,
  trace: P2006TInterpolationTrace
) {
  const altitudeRows = [trace.lowerAltitudeFt, trace.upperAltitudeFt].map(
    (altitude) =>
      Math.max(0, Math.min(10, Math.round(altitude / 1000))) * 2 +
      (trace.profile === "50ft" ? 1 : 0)
  );
  const temperatureColumns = [
    TEMPERATURES.indexOf(
      trace.lowerTemperatureC as (typeof TEMPERATURES)[number]
    ),
    TEMPERATURES.indexOf(
      trace.upperTemperatureC as (typeof TEMPERATURES)[number]
    ),
  ].filter((index) => index >= 0);

  for (const rowIndex of new Set(altitudeRows)) {
    if (!overlay.rows[rowIndex]) continue;
    const [top, bottom] = cellBounds(overlay.rows, rowIndex);

    for (const columnIndex of new Set(temperatureColumns)) {
      if (!overlay.columns[columnIndex]) continue;
      const [left, right] = cellBounds(overlay.columns, columnIndex);
      page.drawRectangle({
        x: left * PAGE_WIDTH,
        y: (1 - bottom) * PAGE_HEIGHT,
        width: (right - left) * PAGE_WIDTH,
        height: (bottom - top) * PAGE_HEIGHT,
        color: rgb(1, 0.74, 0.05),
        opacity: 0.24,
        borderColor: rgb(0.95, 0.35, 0.02),
        borderWidth: 1.4,
      });
    }
  }
}

function drawCalculationNotes({
  page,
  overlay,
  row,
  trace,
  family,
  sourceWeightKg,
  finalDistanceM,
  font,
  bold,
}: {
  page: PDFPage;
  overlay: TableOverlay;
  row: P2006TPerformanceRow;
  trace: P2006TInterpolationTrace;
  family: "takeoff" | "landing";
  sourceWeightKg: number;
  finalDistanceM: number;
  font: PDFFont;
  bold: PDFFont;
}) {
  const rect = {
    x: overlay.notesRect.x * PAGE_WIDTH,
    y: (1 - overlay.notesRect.y - overlay.notesRect.height) * PAGE_HEIGHT,
    width: overlay.notesRect.width * PAGE_WIDTH,
    height: overlay.notesRect.height * PAGE_HEIGHT,
  };
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    opacity: 0.96,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 0.6,
  });

  const familyLabel = family === "takeoff" ? "TAKEOFF 50 FT" : "LANDING 50 FT";
  const lines = [
    `${row.role} ${row.icao} - ${familyLabel} - source weight ${sourceWeightKg} kg`,
    `Requested: W ${n(trace.requestedWeightKg)} kg / PA ${n(
      trace.requestedAltitudeFt
    )} ft / OAT ${n(trace.requestedTemperatureC)} C`,
    `Weight interpolation: ${trace.lowerWeightKg} to ${trace.upperWeightKg} kg (${n(
      trace.weightRatio * 100
    )}%)`,
    `Altitude interpolation: ${trace.lowerAltitudeFt} to ${trace.upperAltitudeFt} ft (${n(
      trace.altitudeRatio * 100
    )}%)`,
    `Temperature interpolation: ${trace.lowerTemperatureC} to ${trace.upperTemperatureC} C (${n(
      trace.temperatureRatio * 100
    )}%)`,
    `Wind ${windText(row)} / slope ${n(row.uphillSlopePct, 1)}% / final ${n(
      finalDistanceM
    )} m`,
  ];

  const lineHeight = Math.min(10, rect.height / 7);
  lines.forEach((line, index) => {
    page.drawText(clean(line), {
      x: rect.x + 8,
      y: rect.y + rect.height - 12 - index * lineHeight,
      size: index === 0 ? 7.6 : 6.7,
      font: index === 0 ? bold : font,
      color: rgb(0.05, 0.05, 0.05),
    });
  });
}

async function appendAfmTablePages(
  pdf: PDFDocument,
  rows: P2006TPerformanceRow[],
  registration: P2006TRegistration,
  font: PDFFont,
  bold: PDFFont
) {
  for (const entry of uniqueTracePages(rows)) {
    for (const source of entry.trace.sourcePages) {
      const response = await fetch(source.image, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Cannot load AFM table image ${source.image}.`);
      }
      const image = await pdf.embedPng(await response.arrayBuffer());
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
      });
      const overlay =
        TABLE_OVERLAYS[
          tableOverlayKey(registration, entry.family, source.weightKg)
        ];
      if (overlay) {
        drawTableHighlights(page, overlay, entry.trace);
        drawCalculationNotes({
          page,
          overlay,
          row: entry.row,
          trace: entry.trace,
          family: entry.family,
          sourceWeightKg: source.weightKg,
          finalDistanceM: entry.finalDistanceM,
          font,
          bold,
        });
      }
    }
  }
}

export async function buildP2006TPerformancePdf({
  registration,
  date,
  loading,
  fuelPlan,
  rows,
}: BuildP2006TPerformancePdfInput) {
  const response = await fetch(FORM_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("The official P2006T PDF template is unavailable.");
  }

  const sourcePdf = await PDFDocument.load(await response.arrayBuffer());
  const pdf = await PDFDocument.create();
  const [pageOne, pageTwoAltOne, pageTwoAltTwo] = await pdf.copyPages(
    sourcePdf,
    [0, 1, 1]
  );
  pdf.addPage(pageOne);
  pdf.addPage(pageTwoAltOne);
  pdf.addPage(pageTwoAltTwo);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  fillMassAndBalancePage(pageOne, loading, fuelPlan, registration, font, bold);

  const departure = rowForRole(rows, "Departure");
  const arrival = rowForRole(rows, "Arrival");
  const alternateOne = rowForRole(rows, "Alternate");
  const alternateTwo = rowForRole(rows, "Alternate 2");

  fillPerformancePage({
    page: pageTwoAltOne,
    date,
    registration,
    departure,
    arrival,
    alternate: alternateOne,
    alternateNumber: 1,
    fuelPlan,
    font,
    bold,
  });
  fillPerformancePage({
    page: pageTwoAltTwo,
    date,
    registration,
    departure,
    arrival,
    alternate: alternateTwo,
    alternateNumber: 2,
    fuelPlan,
    font,
    bold,
  });

  await appendAfmTablePages(pdf, rows, registration, font, bold);
  pdf.setTitle(`P2006T ${registration} M&B and Performance`);
  pdf.setSubject("Sevenair P2006T M&B and Performance Data Sheet");
  pdf.setProducer("Briefings");
  pdf.setCreator("Briefings");
  return pdf.save();
}

export function downloadP2006TPerformancePdf(
  bytes: Uint8Array,
  registration: P2006TRegistration,
  date: string
) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `P2006T_${registration}_Performance_${date || "flight"}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
