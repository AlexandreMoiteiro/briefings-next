"use client";

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import coordinateMapJson from "@/lib/performance/c152-coordinate-map-v3.json";
import {
  c152MomentToNormalizedX,
  c152WeightToNormalizedY,
} from "@/lib/performance/c152-cg-calibration-v4";
import type { PerformanceLegResult } from "@/lib/performance/aerodrome-performance";
import {
  C152_CS_AVC,
  type C152PerformanceRow,
  type C152WeightBalanceResult,
} from "@/lib/performance/c152-performance";
import {
  formatFuelLiters,
  formatFuelTime,
  type FuelPlanningInput,
} from "@/lib/performance/fuel-planning";

const TEMPLATE_FILE_NAME = "RVP.CFI.066.02Cessna152MBandPerformanceSheet.pdf";
const LOCAL_TEMPLATE_URL = `/c152/${TEMPLATE_FILE_NAME}`;
const GITHUB_TEMPLATE_URL =
  `https://raw.githubusercontent.com/AlexandreMoiteiro/briefings-next/main/public/c152/${TEMPLATE_FILE_NAME}`;
const BLACK = rgb(0.04, 0.04, 0.04);

type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RectCapture = {
  rect: NormalizedRect;
  confirmed: boolean;
};

type CoordinateMap = {
  captures: Record<string, unknown>;
};

const coordinateMap = coordinateMapJson as unknown as CoordinateMap;

export type BuildC152OfficialPerformanceSheetPdfInput = {
  registration: string;
  date: string;
  weightBalance: C152WeightBalanceResult;
  performanceResults: PerformanceLegResult[];
  performanceRows: Array<C152PerformanceRow | null>;
  fuelPlan: FuelPlanningInput;
};

function getRect(id: string) {
  const value = coordinateMap.captures[id] as Partial<RectCapture> | undefined;
  if (!value?.rect || value.confirmed !== true) {
    throw new Error(`C152 PDF field map is missing ${id}.`);
  }
  return value.rect;
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return digits === 0 ? String(Math.round(value)) : value.toFixed(digits);
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function fitTextSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  maxHeight: number,
  preferred = 9
) {
  let size = Math.min(preferred, Math.max(5.5, maxHeight * 0.58));
  while (size > 5.5 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
  return size;
}

function drawMappedText(
  page: PDFPage,
  font: PDFFont,
  id: string,
  text: string,
  preferredSize = 9
) {
  if (!text) return;
  const rect = getRect(id);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const x = rect.x * pageWidth;
  const y = pageHeight - (rect.y + rect.height) * pageHeight;
  const width = rect.width * pageWidth;
  const height = rect.height * pageHeight;
  const horizontalPadding = Math.min(4, width * 0.04);
  const size = fitTextSize(
    font,
    text,
    Math.max(1, width - horizontalPadding * 2),
    height,
    preferredSize
  );
  const textWidth = font.widthOfTextAtSize(text, size);
  const textHeight = font.heightAtSize(size, { descender: false });

  page.drawText(text, {
    x: x + Math.max(horizontalPadding, (width - textWidth) / 2),
    y: y + Math.max(1, (height - textHeight) / 2),
    size,
    font,
    color: BLACK,
  });
}

function drawLoadingRow(
  page: PDFPage,
  font: PDFFont,
  prefix: string,
  values: { weightLb: number; armIn: number; momentLbIn: number },
  emphasized = false
) {
  drawMappedText(
    page,
    font,
    `${prefix}-weight`,
    formatNumber(values.weightLb, 1),
    emphasized ? 9.3 : 9
  );
  drawMappedText(
    page,
    font,
    `${prefix}-arm`,
    formatNumber(values.armIn, 2),
    emphasized ? 9.3 : 9
  );
  drawMappedText(
    page,
    font,
    `${prefix}-moment`,
    formatNumber(values.momentLbIn / 1000, 2),
    emphasized ? 9.3 : 9
  );
}

function drawCgPoint(
  page: PDFPage,
  font: PDFFont,
  label: "R" | "TO",
  momentLbIn: number,
  weightLb: number
) {
  const { width, height } = page.getSize();
  const x = c152MomentToNormalizedX(momentLbIn / 1000) * width;
  const y = height - c152WeightToNormalizedY(weightLb) * height;
  const radius = label === "R" ? 3.2 : 3.1;

  if (label === "R") {
    page.drawCircle({
      x,
      y,
      size: radius,
      borderColor: BLACK,
      borderWidth: 1.15,
    });
    page.drawText("R", {
      x: x - font.widthOfTextAtSize("R", 5.5) / 2,
      y: y + radius + 1.2,
      size: 5.5,
      font,
      color: BLACK,
    });
  } else {
    page.drawCircle({
      x,
      y,
      size: radius,
      color: BLACK,
      borderColor: BLACK,
      borderWidth: 0.8,
    });
    page.drawText("TO", {
      x: x + radius + 1.4,
      y: y - 2,
      size: 5.5,
      font,
      color: BLACK,
    });
  }
}

function rolePrefix(role: string) {
  if (role === "Departure") return "departure";
  if (role === "Arrival") return "arrival";
  return "alternate";
}

function drawAirfieldColumn(
  page: PDFPage,
  font: PDFFont,
  result: PerformanceLegResult,
  row: C152PerformanceRow | null
) {
  const prefix = `p2-${rolePrefix(result.leg.role)}`;
  drawMappedText(page, font, `${prefix}-airfield`, result.leg.icao || "", 8.8);

  if (!row || !result.aerodrome) return;

  const qfu = String(Math.round(row.qfu)).padStart(3, "0");
  const windDirection = String(Math.round(result.leg.windFrom)).padStart(3, "0");
  const windSpeed = String(Math.round(result.leg.windKt)).padStart(2, "0");

  drawMappedText(page, font, `${prefix}-rwy-qfu`, `${row.runway} / ${qfu}°`, 8.2);
  drawMappedText(page, font, `${prefix}-elevation`, formatNumber(result.aerodrome.elev_ft), 8.5);
  drawMappedText(page, font, `${prefix}-qnh`, formatNumber(result.leg.qnhHpa), 8.5);
  drawMappedText(page, font, `${prefix}-temperature`, formatNumber(result.leg.tempC), 8.5);
  drawMappedText(page, font, `${prefix}-wind`, `${windDirection} / ${windSpeed}`, 8.2);
  drawMappedText(
    page,
    font,
    `${prefix}-pressure-altitude`,
    formatNumber(result.pressureAltitudeFt),
    8.2
  );
  drawMappedText(
    page,
    font,
    `${prefix}-density-altitude`,
    formatNumber(result.densityAltitudeFt),
    8.2
  );
  drawMappedText(page, font, `${prefix}-toda`, formatNumber(row.todaM), 8.5);
  drawMappedText(page, font, `${prefix}-todr`, formatNumber(row.takeoff50FtM), 8.5);
  drawMappedText(page, font, `${prefix}-lda`, formatNumber(row.ldaM), 8.5);
  drawMappedText(page, font, `${prefix}-ldr`, formatNumber(row.landing50FtM), 8.5);
  drawMappedText(page, font, `${prefix}-roc`, formatNumber(row.rocFpm), 8.5);
}

function fuelValue(value: number) {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) < 0.05) return "0";
  return formatFuelLiters(value);
}

function drawFuelRow(
  page: PDFPage,
  font: PDFFont,
  row: string,
  minutes: number,
  liters: number
) {
  drawMappedText(page, font, `p2-fuel-${row}-time`, formatFuelTime(minutes), 8.6);
  drawMappedText(page, font, `p2-fuel-${row}-fuel`, fuelValue(liters), 8.6);
}

async function fetchOfficialTemplate() {
  let lastError: unknown = null;
  for (const url of [LOCAL_TEMPLATE_URL, GITHUB_TEMPLATE_URL]) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`C152 template fetch failed (${response.status}).`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 1000) {
        throw new Error("C152 template response is not a valid PDF.");
      }
      return bytes;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not load the official C152 performance sheet.");
}

export async function buildC152OfficialPerformanceSheetPdf(
  input: BuildC152OfficialPerformanceSheetPdfInput
) {
  const templateBytes = await fetchOfficialTemplate();
  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();
  if (pages.length !== 2) {
    throw new Error("The official RVP.CFI.066.02 template must contain exactly two pages.");
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [page1, page2] = pages;
  const wb = input.weightBalance;

  const loadingPrefixes = [
    "p1-basic-empty-weight",
    "p1-usable-fuel",
    "p1-pilot-passenger",
    "p1-baggage-area-1",
    "p1-baggage-area-2",
  ] as const;

  wb.rows.slice(0, loadingPrefixes.length).forEach((row, index) => {
    drawLoadingRow(page1, font, loadingPrefixes[index], row);
  });

  drawLoadingRow(
    page1,
    bold,
    "p1-ramp",
    {
      weightLb: wb.ramp.weightLb,
      armIn: wb.ramp.cgIn,
      momentLbIn: wb.ramp.momentLbIn,
    },
    true
  );

  const allowanceWeightLb = Math.max(0, wb.ramp.weightLb - wb.takeoff.weightLb);
  const allowanceMomentLbIn = Math.max(0, wb.ramp.momentLbIn - wb.takeoff.momentLbIn);
  const allowanceArmIn =
    allowanceWeightLb > 0.01
      ? allowanceMomentLbIn / allowanceWeightLb
      : C152_CS_AVC.fuelArmIn;
  drawLoadingRow(page1, font, "p1-start-taxi-runup", {
    weightLb: allowanceWeightLb,
    armIn: allowanceArmIn,
    momentLbIn: allowanceMomentLbIn,
  });

  drawLoadingRow(
    page1,
    bold,
    "p1-takeoff",
    {
      weightLb: wb.takeoff.weightLb,
      armIn: wb.takeoff.cgIn,
      momentLbIn: wb.takeoff.momentLbIn,
    },
    true
  );
  drawMappedText(
    page1,
    bold,
    "p1-mtow",
    formatNumber(C152_CS_AVC.maxTakeoffWeightLb),
    9.2
  );
  drawMappedText(
    page1,
    bold,
    "p1-mlw",
    formatNumber(C152_CS_AVC.maxLandingWeightLb),
    9.2
  );

  drawCgPoint(page1, font, "R", wb.ramp.momentLbIn, wb.ramp.weightLb);
  drawCgPoint(page1, font, "TO", wb.takeoff.momentLbIn, wb.takeoff.weightLb);

  drawMappedText(page2, bold, "p2-date", formatDate(input.date), 8.8);
  drawMappedText(page2, bold, "p2-registration", input.registration, 8.8);

  input.performanceResults.slice(0, 3).forEach((result, index) => {
    drawAirfieldColumn(page2, font, result, input.performanceRows[index] ?? null);
  });

  const fuel = input.fuelPlan;
  drawFuelRow(page2, font, "startup-taxi", fuel.taxiMin, fuel.taxiFuelL);
  drawFuelRow(page2, font, "climb", fuel.climbMin, fuel.climbFuelL);
  drawFuelRow(page2, font, "enroute", fuel.enrouteMin, fuel.enrouteFuelL);
  drawFuelRow(page2, font, "descent", fuel.descentMin, fuel.descentFuelL);
  drawFuelRow(page2, bold, "trip-fuel", fuel.tripMin, fuel.tripFuelL);
  drawFuelRow(page2, font, "contingency", fuel.contingencyMin, fuel.contingencyFuelL);
  drawFuelRow(page2, font, "alternate", fuel.alternateMin, fuel.alternateFuelL);
  drawFuelRow(page2, font, "reserve", fuel.reserveMin, fuel.reserveFuelL);
  drawFuelRow(page2, bold, "required-ramp", fuel.requiredRampMin, fuel.requiredRampFuelL);
  drawFuelRow(page2, font, "extra", fuel.extraMin, fuel.extraFuelL);
  drawFuelRow(page2, bold, "total-ramp", fuel.totalRampMin, fuel.totalRampFuelL);

  return pdf.save();
}

export function downloadC152OfficialPerformanceSheetPdf(
  bytes: Uint8Array,
  registration: string,
  date: string
) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `RVP.CFI.066.02_${registration}_${date || "flight"}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
