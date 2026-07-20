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

const COORDS = coordinatesJson as CoordinateMap;
const TABLE_OVERLAYS = overlaysJson as Record<string, TableOverlay>;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const TEMPERATURES = [-25, 0, 25, 50] as const;
const FUEL_DENSITY = 0.72;

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
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}

function numberText(value: number, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : "";
}

function drawCentered(
  page: PDFPage,
  rect: PdfRect,
  value: unknown,
  font: PDFFont,
  preferredSize = 8.2
) {
  const text = clean(value);
  if (!text || !rect) return;
  let size = preferredSize;
  while (size > 5.2 && font.widthOfTextAtSize(text, size) > rect.width - 5) {
    size -= 0.25;
  }
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: rect.x + Math.max(2, (rect.width - width) / 2),
    y: rect.y + rect.height / 2 - size * 0.34,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function rowForRole(rows: P2006TPerformanceRow[], role: string) {
  return rows.find((row) => row.role === role) ?? null;
}

function windText(row: P2006TPerformanceRow) {
  return `${String(Math.round(row.windFrom)).padStart(3, "0")} / ${Math.round(
    row.windKt
  )}`;
}

function fillColumn(
  page: PDFPage,
  prefix: "departure" | "arrival" | "alternate",
  row: P2006TPerformanceRow | null,
  font: PDFFont
) {
  if (!row) return;
  const values: Record<string, unknown> = {
    [`${prefix}-airfield`]: row.icao,
    [`${prefix}-runway-qfu`]: `${row.runway} / ${Math.round(row.qfu)}`,
    [`${prefix}-elevation`]: Math.round(row.elevationFt),
    [`${prefix}-qnh`]: Math.round(row.qnhHpa),
    [`${prefix}-temperature`]: Math.round(row.oatC),
    [`${prefix}-wind`]: windText(row),
    [`${prefix}-pressure-altitude`]: Math.round(row.paFt),
    [`${prefix}-density-altitude`]: Math.round(row.daFt),
    [`${prefix}-toda`]: Math.round(row.todaM),
    [`${prefix}-todr`]: Math.round(row.takeoff50M),
    [`${prefix}-lda`]: Math.round(row.ldaM),
    [`${prefix}-ldr`]: Math.round(row.landing50M),
    [`${prefix}-roc`]: Math.round(row.rocFpm),
  };

  Object.entries(values).forEach(([key, value]) => {
    const rect = COORDS.formRects[key];
    if (rect) drawCentered(page, rect, value, font);
  });
}

function fillFuelPlan(page: PDFPage, input: FuelPlanningInput, font: PDFFont) {
  const plan = recalculateFuelPlan(input);
  const values = [
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

  values.forEach(([minutes, fuel], index) => {
    const row = index + 1;
    drawCentered(
      page,
      COORDS.formRects[`fuel-${row}-time`],
      formatFuelTime(minutes),
      font
    );
    drawCentered(
      page,
      COORDS.formRects[`fuel-${row}-fuel`],
      formatFuelLiters(fuel),
      font
    );
  });
}

function fillPerformancePage({
  page,
  registration,
  date,
  departure,
  arrival,
  alternate,
  alternateNumber,
  fuelPlan,
  font,
  bold,
}: {
  page: PDFPage;
  registration: P2006TRegistration;
  date: string;
  departure: P2006TPerformanceRow | null;
  arrival: P2006TPerformanceRow | null;
  alternate: P2006TPerformanceRow | null;
  alternateNumber: 1 | 2;
  fuelPlan: FuelPlanningInput;
  font: PDFFont;
  bold: PDFFont;
}) {
  drawCentered(page, COORDS.formRects.date, dateForPdf(date), font);
  drawCentered(
    page,
    COORDS.formRects["aircraft-registration"],
    registration,
    bold
  );

  const alternateHeader = { x: 420, y: 717, width: 120, height: 21 };
  page.drawRectangle({
    ...alternateHeader,
    color: rgb(0.78, 0.78, 0.78),
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.45,
  });
  drawCentered(
    page,
    alternateHeader,
    `Alternate ${alternateNumber}`,
    bold,
    8.1
  );

  fillColumn(page, "departure", departure, font);
  fillColumn(page, "arrival", arrival, font);
  fillColumn(page, "alternate", alternate, font);
  fillFuelPlan(page, fuelPlan, font);
}

function fitAxis(
  values: readonly number[],
  points: readonly Point[],
  dimension: "x" | "y"
) {
  const count = Math.min(values.length, points.length);
  const xMean = values.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
  const yMean =
    points.slice(0, count).reduce((sum, point) => sum + point[dimension], 0) /
    count;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    numerator += (values[index] - xMean) * (points[index][dimension] - yMean);
    denominator += (values[index] - xMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  return (value: number) => intercept + slope * value;
}

function fillMassBalancePage(
  page: PDFPage,
  registration: P2006TRegistration,
  loading: P2006TLoadingInput,
  fuelPlan: FuelPlanningInput,
  font: PDFFont,
  bold: PDFFont
) {
  const fuelMass = loading.fuelLoadedL * FUEL_DENSITY;
  const masses: Record<string, number> = {
    "pilot-front-seat-mass": loading.pilotFrontKg,
    "rear-seats-mass": loading.rearSeatsKg,
    "fuel-mass": fuelMass,
    "baggage-mass": loading.baggageKg,
  };

  Object.entries(masses).forEach(([key, value]) => {
    const rect = COORDS.massBalanceRects[key];
    if (rect) drawCentered(page, rect, numberText(value, 1), bold, 10);
  });

  const summary = { x: 55, y: 486, width: 485, height: 72 };
  page.drawRectangle({
    ...summary,
    color: rgb(1, 1, 1),
    opacity: 0.95,
    borderColor: rgb(0.4, 0.4, 0.4),
    borderWidth: 0.5,
  });

  if (loading.emptyMassKg <= 0 || loading.emptyMomentKgm <= 0) {
    page.drawText(
      "Enter aircraft empty mass and moment to plot takeoff and landing M&B points.",
      { x: 69, y: 524, size: 8, font: bold, color: rgb(0.55, 0.12, 0.04) }
    );
    page.drawText(
      "Loading masses are filled above; no aircraft-specific empty data is invented.",
      { x: 69, y: 505, size: 7.2, font, color: rgb(0.25, 0.25, 0.25) }
    );
    return;
  }

  const plan = recalculateFuelPlan(fuelPlan);
  const tripFuelMass = Math.min(fuelMass, plan.tripFuelL * FUEL_DENSITY);
  const takeoffMass =
    loading.emptyMassKg +
    loading.pilotFrontKg +
    loading.rearSeatsKg +
    fuelMass +
    loading.baggageKg;
  const takeoffMoment =
    loading.emptyMomentKgm -
    loading.pilotFrontKg * 0.893 +
    loading.rearSeatsKg * 0.226 +
    fuelMass * 0.755 +
    loading.baggageKg * 1.215;
  const landingMass = takeoffMass - tripFuelMass;
  const landingMoment = takeoffMoment - tripFuelMass * 0.755;
  const takeoffMac = (takeoffMoment / takeoffMass / 1.339) * 100;
  const landingMac = (landingMoment / landingMass / 1.339) * 100;
  const maximumMass = registration === "CS-EAQ" ? 1180 : 1230;

  const massX = fitAxis(
    [800, 900, 1000, 1100, 1200],
    COORDS.massBalancePoints["axis-flight-mass"],
    "x"
  );
  const momentY = fitAxis(
    [140, 200, 260, 320, 380, 440, 500],
    COORDS.massBalancePoints["axis-empty-aircraft-moment"],
    "y"
  );

  const points = [
    {
      label: "TO",
      mass: takeoffMass,
      moment: takeoffMoment,
      mac: takeoffMac,
      color: rgb(0.05, 0.3, 0.85),
    },
    {
      label: "LDG",
      mass: landingMass,
      moment: landingMoment,
      mac: landingMac,
      color: rgb(0.85, 0.12, 0.12),
    },
  ];

  points.forEach((item) => {
    const x = massX(item.mass);
    const y = momentY(item.moment);
    page.drawLine({
      start: { x: COORDS.massBalancePoints["axis-flight-mass"][0].x, y },
      end: { x, y },
      thickness: 1,
      color: item.color,
      opacity: 0.8,
    });
    page.drawCircle({ x, y, size: 4.8, color: item.color });
    page.drawText(item.label, {
      x: x + 6,
      y: y + 3,
      size: 6.5,
      font: bold,
      color: item.color,
    });
  });

  const takeoffOk =
    takeoffMass <= maximumMass && takeoffMac >= 16.5 && takeoffMac <= 31;
  const landingOk =
    landingMass <= maximumMass && landingMac >= 16.5 && landingMac <= 31;
  const lines = [
    `Empty ${numberText(loading.emptyMassKg, 1)} kg / ${numberText(
      loading.emptyMomentKgm,
      1
    )} kgm`,
    `TO ${numberText(takeoffMass, 1)} kg / ${numberText(
      takeoffMoment,
      1
    )} kgm / ${numberText(takeoffMac, 1)}% MAC - ${takeoffOk ? "OK" : "NOK"}`,
    `LDG ${numberText(landingMass, 1)} kg / ${numberText(
      landingMoment,
      1
    )} kgm / ${numberText(landingMac, 1)}% MAC - ${landingOk ? "OK" : "NOK"}`,
  ];
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: 69,
      y: 535 - index * 17,
      size: index === 0 ? 7.3 : 8,
      font: index === 0 ? font : bold,
      color: rgb(0.05, 0.05, 0.05),
    });
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

function highlightTrace(
  page: PDFPage,
  overlay: TableOverlay,
  trace: P2006TInterpolationTrace
) {
  const rows = [trace.lowerAltitudeFt, trace.upperAltitudeFt].map(
    (altitude) =>
      Math.max(0, Math.min(10, Math.round(altitude / 1000))) * 2 +
      (trace.profile === "50ft" ? 1 : 0)
  );
  const columns = [trace.lowerTemperatureC, trace.upperTemperatureC]
    .map((temperature) =>
      TEMPERATURES.indexOf(temperature as (typeof TEMPERATURES)[number])
    )
    .filter((index) => index >= 0);

  new Set(rows).forEach((rowIndex) => {
    if (overlay.rows[rowIndex] === undefined) return;
    const [top, bottom] = cellBounds(overlay.rows, rowIndex);
    new Set(columns).forEach((columnIndex) => {
      if (overlay.columns[columnIndex] === undefined) return;
      const [left, right] = cellBounds(overlay.columns, columnIndex);
      page.drawRectangle({
        x: left * PAGE_WIDTH,
        y: (1 - bottom) * PAGE_HEIGHT,
        width: (right - left) * PAGE_WIDTH,
        height: (bottom - top) * PAGE_HEIGHT,
        color: rgb(1, 0.75, 0.02),
        opacity: 0.25,
        borderColor: rgb(0.95, 0.3, 0.02),
        borderWidth: 1.4,
      });
    });
  });
}

function drawTraceNotes({
  page,
  overlay,
  row,
  trace,
  family,
  sourceWeight,
  finalDistance,
  font,
  bold,
}: {
  page: PDFPage;
  overlay: TableOverlay;
  row: P2006TPerformanceRow;
  trace: P2006TInterpolationTrace;
  family: "takeoff" | "landing";
  sourceWeight: number;
  finalDistance: number;
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
  const lines = [
    `${row.role === "Alternate" ? "Alternate 1" : row.role} ${row.icao} - ${
      family === "takeoff" ? "TAKEOFF 50 FT" : "LANDING 50 FT"
    } - source ${sourceWeight} kg`,
    `Requested W ${numberText(trace.requestedWeightKg)} kg / PA ${numberText(
      trace.requestedAltitudeFt
    )} ft / OAT ${numberText(trace.requestedTemperatureC)} C`,
    `W ${trace.lowerWeightKg}-${trace.upperWeightKg} kg (${numberText(
      trace.weightRatio * 100
    )}%) / PA ${trace.lowerAltitudeFt}-${trace.upperAltitudeFt} ft (${numberText(
      trace.altitudeRatio * 100
    )}%)`,
    `OAT ${trace.lowerTemperatureC}-${trace.upperTemperatureC} C (${numberText(
      trace.temperatureRatio * 100
    )}%) / Wind ${windText(row)} / Slope ${numberText(
      row.uphillSlopePct,
      1
    )}%`,
    `Final corrected distance: ${numberText(finalDistance)} m`,
  ];
  const lineHeight = Math.min(10, rect.height / 6);
  lines.forEach((line, index) => {
    page.drawText(clean(line), {
      x: rect.x + 7,
      y: rect.y + rect.height - 12 - index * lineHeight,
      size: index === 0 ? 7.2 : 6.5,
      font: index === 0 ? bold : font,
      color: rgb(0.05, 0.05, 0.05),
    });
  });
}

async function appendAfmPages(
  pdf: PDFDocument,
  registration: P2006TRegistration,
  rows: P2006TPerformanceRow[],
  font: PDFFont,
  bold: PDFFont
) {
  for (const row of rows) {
    const traces = [
      { family: "takeoff" as const, trace: row.takeoffTrace, distance: row.takeoff50M },
      { family: "landing" as const, trace: row.landingTrace, distance: row.landing50M },
    ];
    for (const item of traces) {
      for (const source of item.trace.sourcePages) {
        const response = await fetch(source.image, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Cannot load AFM table ${source.image}.`);
        const image = await pdf.embedPng(await response.arrayBuffer());
        const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        page.drawImage(image, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
        const overlay = TABLE_OVERLAYS[
          overlayKey(registration, item.family, source.weightKg)
        ];
        if (overlay) {
          highlightTrace(page, overlay, item.trace);
          drawTraceNotes({
            page,
            overlay,
            row,
            trace: item.trace,
            family: item.family,
            sourceWeight: source.weightKg,
            finalDistance: item.distance,
            font,
            bold,
          });
        }
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
  const templateResponse = await fetch("/api/p2006-form", { cache: "no-store" });
  if (!templateResponse.ok) throw new Error("Official P2006T PDF is unavailable.");
  const source = await PDFDocument.load(await templateResponse.arrayBuffer());
  const pdf = await PDFDocument.create();
  const [pageOne, pageTwoAltOne, pageTwoAltTwo] = await pdf.copyPages(source, [0, 1, 1]);
  pdf.addPage(pageOne);
  pdf.addPage(pageTwoAltOne);
  pdf.addPage(pageTwoAltTwo);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  fillMassBalancePage(pageOne, registration, loading, fuelPlan, font, bold);
  const departure = rowForRole(rows, "Departure");
  const arrival = rowForRole(rows, "Arrival");
  fillPerformancePage({
    page: pageTwoAltOne,
    registration,
    date,
    departure,
    arrival,
    alternate: rowForRole(rows, "Alternate"),
    alternateNumber: 1,
    fuelPlan,
    font,
    bold,
  });
  fillPerformancePage({
    page: pageTwoAltTwo,
    registration,
    date,
    departure,
    arrival,
    alternate: rowForRole(rows, "Alternate 2"),
    alternateNumber: 2,
    fuelPlan,
    font,
    bold,
  });
  await appendAfmPages(pdf, registration, rows, font, bold);
  pdf.setTitle(`P2006T ${registration} M&B and Performance`);
  pdf.setSubject("Sevenair P2006T M&B and Performance Data Sheet");
  pdf.setCreator("Briefings");
  pdf.setProducer("Briefings");
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
