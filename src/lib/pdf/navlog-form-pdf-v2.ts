import {
  PDFDocument,
  PDFName,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";
import type {
  NavlogCalculationResult,
  NavlogDataBundle,
  NavlogRouteWaypoint,
  NavlogSetupForm,
} from "@/lib/navlog";
import { buildNavlogFormPdf as buildBaseNavlogFormPdf } from "./navlog-form-pdf";

const TEMPLATE_MAIN_URL = "/legacy/templates/NAVLOG_FORM.pdf";
const TEMPLATE_CONT_URL = "/legacy/templates/NAVLOG_FORM_1.pdf";
const MAIN_SINGLE_CAPACITY = 10;
const MAIN_FULL_CAPACITY = 21;
const CONTINUATION_CAPACITY = 11;
const FINAL_RESERVE_MIN = 45;
const LITERS_PER_US_GALLON = 3.785411784;

type BuildNavlogFormPdfInput = {
  setup: NavlogSetupForm;
  waypoints: NavlogRouteWaypoint[];
  calculation: NavlogCalculationResult;
  navlogData?: NavlogDataBundle | null;
};

type FieldRect = { x: number; y: number; width: number; height: number };
type AlternateInfo = {
  markerWaypointId: string;
  markerCode: string;
  alternateTripFuelL: number;
  finalReserveFuelL: number;
  minimumFuelAtMarkerL: number;
  holdAvailableFuelL: number;
  holdAvailableSec: number;
};

function roundFuel(value: number) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function isPiper(setup: NavlogSetupForm) {
  return (
    setup.aircraftType === "Piper PA-28" ||
    setup.registration.toUpperCase().startsWith("OE-")
  );
}

function fuelText(liters: number, setup: NavlogSetupForm, planned = false) {
  const roundedLiters = roundFuel(liters);
  if (!isPiper(setup)) return String(roundedLiters);

  const gallons = Math.max(
    0,
    Math.round(roundedLiters / LITERS_PER_US_GALLON)
  );
  return planned && gallons <= 0
    ? String(roundedLiters)
    : `${roundedLiters}(${gallons})`;
}

function pdfDuration(seconds: number) {
  const minutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  if (minutes < 60) return `${String(minutes).padStart(2, "0")}'`;

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0
    ? `${hours}h${String(remaining).padStart(2, "0")}`
    : `${hours}h`;
}

function legHoldSec(leg: NavlogCalculationResult["legs"][number]) {
  return Math.max(0, Number(leg.holdSec ?? 0) || 0);
}

function legHoldBurn(leg: NavlogCalculationResult["legs"][number]) {
  return Math.max(0, Number(leg.holdBurnL ?? 0) || 0);
}

function legTotalSec(leg: NavlogCalculationResult["legs"][number]) {
  return Number(leg.eteSec || 0) + legHoldSec(leg);
}

function legTotalBurn(leg: NavlogCalculationResult["legs"][number]) {
  return Number(leg.burnL || 0) + legHoldBurn(leg);
}

function taxiFuel(setup: NavlogSetupForm) {
  return (setup.taxiFuelFlowLh * setup.taxiMin) / 60;
}

function buildAlternateInfo(
  setup: NavlogSetupForm,
  waypoints: NavlogRouteWaypoint[],
  legs: NavlogCalculationResult["legs"]
): AlternateInfo | null {
  const marker = waypoints.find((waypoint) => waypoint.alternateMarker === true);
  if (!marker) return null;

  const markerLegIndex = legs.findIndex((leg) => leg.to.id === marker.id);
  if (markerLegIndex < 0) return null;

  const markerLeg = legs[markerLegIndex];
  const alternateLegs = legs.slice(markerLegIndex + 1);
  const alternateTripFuelL = alternateLegs.reduce(
    (sum, leg) => sum + legTotalBurn(leg),
    0
  );
  const finalReserveFuelL = (setup.fuelFlowLh * FINAL_RESERVE_MIN) / 60;
  const minimumFuelAtMarkerL = alternateTripFuelL + finalReserveFuelL;
  const holdAvailableFuelL =
    Number(markerLeg.efobAfterLegL || 0) - minimumFuelAtMarkerL;
  const holdAvailableSec =
    setup.fuelFlowLh > 0
      ? Math.max(0, (holdAvailableFuelL / setup.fuelFlowLh) * 3600)
      : 0;

  return {
    markerWaypointId: marker.id,
    markerCode: marker.point.code || marker.point.name || "Arrival",
    alternateTripFuelL,
    finalReserveFuelL,
    minimumFuelAtMarkerL,
    holdAvailableFuelL,
    holdAvailableSec,
  };
}

function legPrefix(index: number) {
  return `Leg${String(index).padStart(2, "0")}`;
}

function putDeparture(
  payload: Record<string, string>,
  setup: NavlogSetupForm,
  firstLeg: NavlogCalculationResult["legs"][number] | undefined
) {
  const prefix = legPrefix(1);
  const taxiSeconds = Math.max(0, setup.taxiMin * 60);
  const burn = taxiFuel(setup);
  const efob = firstLeg?.efobStartL ?? Math.max(0, setup.startEfob - burn);

  payload[`${prefix}_Leg_ETE`] = pdfDuration(taxiSeconds);
  payload[`${prefix}_Cumulative_ETE`] = pdfDuration(taxiSeconds);
  payload[`${prefix}_Planned_Burnoff`] = fuelText(burn, setup, true);
  payload[`${prefix}_Estimated_FOB`] = fuelText(efob, setup);
}

function putLeg(
  payload: Record<string, string>,
  rowIndex: number,
  leg: NavlogCalculationResult["legs"][number],
  cumulativeSec: number,
  setup: NavlogSetupForm,
  alternate: AlternateInfo | null
) {
  const prefix = legPrefix(rowIndex);
  const holdSec = legHoldSec(leg);
  const holdBurn = legHoldBurn(leg);
  const isMarker = alternate?.markerWaypointId === leg.to.id;

  payload[`${prefix}_Leg_ETE`] = isMarker
    ? [
        pdfDuration(leg.eteSec),
        holdSec > 0 ? `+${pdfDuration(holdSec)}` : "",
        `HM ${pdfDuration(alternate.holdAvailableSec)}`,
      ]
        .filter(Boolean)
        .join("\n")
    : holdSec > 0
      ? `${pdfDuration(leg.eteSec)}\n+${pdfDuration(holdSec)}`
      : pdfDuration(leg.eteSec);
  payload[`${prefix}_Cumulative_ETE`] = pdfDuration(cumulativeSec);
  payload[`${prefix}_Planned_Burnoff`] =
    holdBurn > 0
      ? `${fuelText(leg.burnL, setup, true)}\n+${fuelText(
          holdBurn,
          setup,
          true
        )}`
      : fuelText(leg.burnL, setup, true);
  payload[`${prefix}_Estimated_FOB`] = isMarker
    ? `${fuelText(leg.efobEndL, setup)}\nMIN ${fuelText(
        alternate.minimumFuelAtMarkerL,
        setup
      )}`
    : fuelText(leg.efobEndL, setup);
}

function putTotal(
  payload: Record<string, string>,
  rowIndex: number,
  setup: NavlogSetupForm,
  legs: NavlogCalculationResult["legs"]
) {
  const prefix = legPrefix(rowIndex);
  const totalSec =
    Math.max(0, setup.taxiMin * 60) +
    legs.reduce((sum, leg) => sum + legTotalSec(leg), 0);
  const totalBurn =
    taxiFuel(setup) + legs.reduce((sum, leg) => sum + legTotalBurn(leg), 0);
  const finalEfob = legs.at(-1)?.efobEndL ?? setup.startEfob;

  payload[`${prefix}_Leg_ETE`] = pdfDuration(totalSec);
  payload[`${prefix}_Cumulative_ETE`] = pdfDuration(totalSec);
  payload[`${prefix}_Planned_Burnoff`] = fuelText(totalBurn, setup, true);
  payload[`${prefix}_Estimated_FOB`] = fuelText(finalEfob, setup);
}

function headerPayload(
  setup: NavlogSetupForm,
  legs: NavlogCalculationResult["legs"],
  alternate: AlternateInfo | null
) {
  const climbFuel = legs
    .filter((leg) => leg.profile === "CLIMB")
    .reduce((sum, leg) => sum + legTotalBurn(leg), 0);
  const totalSec =
    Math.max(0, setup.taxiMin * 60) +
    legs.reduce((sum, leg) => sum + legTotalSec(leg), 0);

  return {
    "LEVEL F/F": fuelText(setup.fuelFlowLh, setup),
    "CLIMB FUEL": fuelText(climbFuel, setup),
    "FLT TIME": pdfDuration(totalSec),
    OBSERVATIONS: alternate
      ? [
          `ALT FROM ${alternate.markerCode}`,
          `HOLD MAX ${pdfDuration(alternate.holdAvailableSec)} / ${fuelText(
            alternate.holdAvailableFuelL,
            setup
          )}`,
          `ALT ${fuelText(alternate.alternateTripFuelL, setup)} + RES45 ${fuelText(
            alternate.finalReserveFuelL,
            setup
          )}`,
          `MIN FOB ${fuelText(alternate.minimumFuelAtMarkerL, setup)}`,
        ].join("\n")
      : "",
  };
}

function mainPayload(
  setup: NavlogSetupForm,
  waypoints: NavlogRouteWaypoint[],
  legs: NavlogCalculationResult["legs"]
) {
  const alternate = buildAlternateInfo(setup, waypoints, legs);
  const payload: Record<string, string> = headerPayload(setup, legs, alternate);
  const singlePage = legs.length <= MAIN_SINGLE_CAPACITY;
  const count = singlePage ? MAIN_SINGLE_CAPACITY : MAIN_FULL_CAPACITY;

  putDeparture(payload, setup, legs[0]);
  let cumulativeSec = Math.max(0, setup.taxiMin * 60);
  const chunk = legs.slice(0, count);
  chunk.forEach((leg, index) => {
    cumulativeSec += legTotalSec(leg);
    putLeg(payload, index + 2, leg, cumulativeSec, setup, alternate);
  });

  putTotal(payload, singlePage ? chunk.length + 2 : 23, setup, legs);
  return payload;
}

function continuationPayload(
  setup: NavlogSetupForm,
  waypoints: NavlogRouteWaypoint[],
  legs: NavlogCalculationResult["legs"],
  start: number
) {
  const alternate = buildAlternateInfo(setup, waypoints, legs);
  const payload: Record<string, string> = headerPayload(setup, legs, alternate);
  let cumulativeSec =
    Math.max(0, setup.taxiMin * 60) +
    legs.slice(0, start).reduce((sum, leg) => sum + legTotalSec(leg), 0);

  legs
    .slice(start, start + CONTINUATION_CAPACITY)
    .forEach((leg, index) => {
      cumulativeSec += legTotalSec(leg);
      putLeg(payload, index + 12, leg, cumulativeSec, setup, alternate);
    });
  putTotal(payload, 23, setup, legs);
  return payload;
}

function objectText(value: any) {
  if (!value) return "";
  if (typeof value.decodeText === "function") return value.decodeText();
  return String(value).replace(/^\(/, "").replace(/\)$/, "");
}

function objectNumber(value: any) {
  if (!value) return 0;
  if (typeof value.asNumber === "function") return value.asNumber();
  return Number(String(value));
}

function annotationFieldName(pdfDoc: PDFDocument, annotation: any) {
  let current = annotation;
  for (let guard = 0; guard < 8 && current; guard += 1) {
    const name = current.get(PDFName.of("T"));
    if (name) return objectText(name);
    const parent = current.get(PDFName.of("Parent"));
    if (!parent) break;
    current = pdfDoc.context.lookup(parent) as any;
  }
  return "";
}

function annotationRect(pdfDoc: PDFDocument, annotation: any): FieldRect | null {
  const rectRef = annotation.get(PDFName.of("Rect"));
  const rect = pdfDoc.context.lookup(rectRef) as any;
  if (!rect || typeof rect.get !== "function") return null;

  const x1 = objectNumber(rect.get(0));
  const y1 = objectNumber(rect.get(1));
  const x2 = objectNumber(rect.get(2));
  const y2 = objectNumber(rect.get(3));
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function pageFields(pdfDoc: PDFDocument, page: PDFPage) {
  const fields = new Map<string, FieldRect>();
  const annotationsRef = page.node.get(PDFName.of("Annots"));
  const annotations = annotationsRef
    ? (pdfDoc.context.lookup(annotationsRef) as any)
    : null;
  if (!annotations || typeof annotations.size !== "function") return fields;

  for (let index = 0; index < annotations.size(); index += 1) {
    const annotationRef = annotations.get(index) as PDFRef;
    const annotation = pdfDoc.context.lookup(annotationRef) as any;
    const name = annotationFieldName(pdfDoc, annotation);
    const rect = annotationRect(pdfDoc, annotation);
    if (name && rect) fields.set(name, rect);
  }
  return fields;
}

function fontSize(fieldName: string, value: string) {
  if (/OBSERVATIONS/i.test(fieldName)) return 4.2;
  if (/Planned_Burnoff|Estimated_FOB/i.test(fieldName)) {
    return value.includes("\n") ? 4 : 5;
  }
  if (/Leg_ETE|Cumulative_ETE/i.test(fieldName)) {
    return value.includes("\n") ? 4 : 5;
  }
  return 5.4;
}

function lineColor(fieldName: string, line: string) {
  if (/Leg_ETE/i.test(fieldName)) {
    if (/^HM\b/i.test(line)) return rgb(0.05, 0.45, 0.18);
    if (/^\+/.test(line)) return rgb(0.75, 0.08, 0.08);
    return rgb(0.88, 0.34, 0.04);
  }
  if (/Estimated_FOB/i.test(fieldName) && /^MIN\b/i.test(line)) {
    return rgb(0.05, 0.45, 0.18);
  }
  return rgb(0, 0, 0);
}

function redrawField(
  page: PDFPage,
  rect: FieldRect,
  fieldName: string,
  value: string,
  font: PDFFont
) {
  const inset = 0.7;
  page.drawRectangle({
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
    color: rgb(1, 1, 1),
  });

  const size = fontSize(fieldName, value);
  const lines = value.split("\n").slice(0, 4);
  const lineHeight = size + 0.9;
  const totalHeight = lines.length * lineHeight;
  let y = rect.y + rect.height / 2 + totalHeight / 2 - size;
  const leftAligned = /OBSERVATIONS/i.test(fieldName);

  lines.forEach((line) => {
    const width = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: leftAligned ? rect.x + 1.4 : rect.x + rect.width / 2 - width / 2,
      y,
      size,
      font,
      color: lineColor(fieldName, line),
    });
    y -= lineHeight;
  });
}

async function loadTemplate(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}.`);
  return PDFDocument.load(await response.arrayBuffer());
}

function applyPayload(
  outputPage: PDFPage,
  templateDoc: PDFDocument,
  templatePageIndex: number,
  payload: Record<string, string>,
  font: PDFFont
) {
  const templatePage = templateDoc.getPage(templatePageIndex);
  const fields = pageFields(templateDoc, templatePage);
  payload &&
    Object.entries(payload).forEach(([name, value]) => {
      const rect = fields.get(name);
      if (rect && value !== "") redrawField(outputPage, rect, name, value, font);
    });
}

export async function buildNavlogFormPdf(input: BuildNavlogFormPdfInput) {
  const baseBytes = await buildBaseNavlogFormPdf(input);
  const output = await PDFDocument.load(baseBytes);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const mainTemplate = await loadTemplate(TEMPLATE_MAIN_URL);
  const continuationTemplate = await loadTemplate(TEMPLATE_CONT_URL);
  const legs = input.calculation.legs;
  const main = mainPayload(input.setup, input.waypoints, legs);

  const mainPagesUsed = legs.length <= MAIN_SINGLE_CAPACITY ? 1 : 2;
  for (let pageIndex = 0; pageIndex < Math.min(mainPagesUsed, output.getPageCount()); pageIndex += 1) {
    applyPayload(output.getPage(pageIndex), mainTemplate, pageIndex, main, font);
  }

  let outputPageIndex = mainPagesUsed;
  for (
    let start = MAIN_FULL_CAPACITY;
    start < legs.length && outputPageIndex < output.getPageCount();
    start += CONTINUATION_CAPACITY
  ) {
    applyPayload(
      output.getPage(outputPageIndex),
      continuationTemplate,
      0,
      continuationPayload(input.setup, input.waypoints, legs, start),
      font
    );
    outputPageIndex += 1;
  }

  return output.save({ useObjectStreams: true, addDefaultPage: false });
}
