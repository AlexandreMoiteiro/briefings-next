import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import type {
  NavlogCalculationResult,
  NavlogDataBundle,
  NavlogRouteNode,
  NavlogRouteWaypoint,
  NavlogSetupForm,
  NavlogVor,
} from "@/lib/navlog";
import { formatClock } from "@/lib/navlog-engine";

type NavlogLeg = NavlogCalculationResult["legs"][number];

type BuildNavlogFormPdfInput = {
  setup: NavlogSetupForm;
  waypoints: NavlogRouteWaypoint[];
  calculation: NavlogCalculationResult;
  navlogData?: NavlogDataBundle | null;
};

const TEMPLATE_MAIN_URL = "/legacy/templates/NAVLOG_FORM.pdf";
const TEMPLATE_CONT_URL = "/legacy/templates/NAVLOG_FORM_1.pdf";

const PDF_SINGLE_PAGE_LEG_ROWS = 11;
const PDF_FULL_TEMPLATE_LEG_ROWS = 22;
const PDF_TOTAL_ROW_INDEX = 23;
const PDF_CONTINUATION_ROWS = 11;
const PDF_CONTINUATION_FIRST_ROW = 12;

const EARTH_NM = 3440.065;
const LITERS_PER_US_GALLON = 3.785411784;

function safe(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function roundToStep(value: number, step: number) {
  if (!Number.isFinite(value) || step <= 0) return 0;
  return Math.round(value / step) * step;
}

function rd(value: number) {
  return roundToStep(value, 0.5);
}

function rf(value: number) {
  return roundToStep(value, 1);
}

function fmtUnit(value: number) {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value));
}

function litersToUsg(liters: number) {
  return liters / LITERS_PER_US_GALLON;
}

function fmtEfobPdf(liters: number) {
  const roundedLiters = Math.max(0, Math.round(liters || 0));
  const roundedGallons = Math.max(0, Math.round(litersToUsg(roundedLiters)));

  return `${roundedLiters}(${roundedGallons})`;
}

function fmtPlannedBurnPdf(liters: number) {
  const roundedLiters = Math.max(0, Math.round(liters || 0));
  const roundedGallons = Math.max(0, Math.round(litersToUsg(roundedLiters)));

  if (roundedGallons <= 0) {
    return `${roundedLiters}`;
  }

  return `${roundedLiters}(${roundedGallons})`;
}

function pdfTime(seconds: number) {
  const mins = Math.max(0, Math.round((seconds || 0) / 60));

  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}`;
  }

  return `${String(mins).padStart(2, "0")}'`;
}

function pad3(value: number | string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return String(Math.round(number)).padStart(3, "0");
}

function fmtDistance(value: number) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(1);
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function toDeg(value: number) {
  return (value * 180) / Math.PI;
}

function wrap360(value: number) {
  return ((value % 360) + 360) % 360;
}

function gcDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const phi1 = toRad(lat1);
  const lambda1 = toRad(lon1);
  const phi2 = toRad(lat2);
  const lambda2 = toRad(lon2);

  const dPhi = phi2 - phi1;
  const dLambda = lambda2 - lambda1;

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;

  return EARTH_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function gcCourseTc(lat1: number, lon1: number, lat2: number, lon2: number) {
  const phi1 = toRad(lat1);
  const lambda1 = toRad(lon1);
  const phi2 = toRad(lat2);
  const lambda2 = toRad(lon2);

  const dLambda = lambda2 - lambda1;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  return wrap360(toDeg(Math.atan2(y, x)));
}

function compactNavToken(value: unknown, maxLen = 10) {
  let text = safe(value).replace(/\n/g, " ").trim().toUpperCase();

  if (!text) return "";

  text = text.replace("TURNTRK", " T");
  text = text.replace("TURN TRK", " T");
  text = text.replace("TRK", "T");
  text = text.replace("INTNSA", "I NSA");
  text = text.replace("INT NSA", "I NSA");

  if (text.length > maxLen) {
    text = text.replace(/\s+/g, "");
  }

  return text.slice(0, maxLen);
}

function prettyPdfWaypointText(value: unknown) {
  const lines = safe(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  const output = [lines[0].slice(0, 14)];

  for (const line of lines.slice(1, 3)) {
    output.push(line.slice(0, 14));
  }

  return output.join("\n");
}

function formatCalcWaypoint(node: NavlogRouteNode) {
  const detail = safe(node.calcDetail);

  const match = detail.match(
    /([0-9]+(?:\.[0-9]+)?)\s*NM\s*from\s*(.*?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)\s*NM\s*to\s*(.*)/i
  );

  if (match) {
    const fromDist = Number(match[1]);
    const fromCode = compactNavToken(match[2]);
    const toDist = Number(match[3]);
    const toCode = compactNavToken(match[4]);

    return prettyPdfWaypointText(
      `${node.code}\n+${fromDist.toFixed(1)} ${fromCode}\n-${toDist.toFixed(
        1
      )} ${toCode}`
    );
  }

  if (node.note) {
    return prettyPdfWaypointText(`${node.code}\n${node.note}`);
  }

  return prettyPdfWaypointText(node.code);
}

function compactPdfWaypoint(node: NavlogRouteNode) {
  if (node.src === "CALC") {
    return formatCalcWaypoint(node);
  }

  return prettyPdfWaypointText(node.code || node.name);
}

function legHoldSec(leg: NavlogLeg) {
  return Math.max(0, Number((leg as any).holdSec ?? 0) || 0);
}

function legHoldDist(leg: NavlogLeg) {
  return Math.max(0, Number((leg as any).holdDistNm ?? 0) || 0);
}

function legHoldBurn(leg: NavlogLeg) {
  return Math.max(0, Number((leg as any).holdBurnL ?? 0) || 0);
}

function legTotalTimeSec(leg: NavlogLeg) {
  return Number(leg.eteSec || 0) + legHoldSec(leg);
}

function legTotalDistance(leg: NavlogLeg) {
  return Number(leg.distNm || 0) + legHoldDist(leg);
}

function legTotalBurn(leg: NavlogLeg) {
  return Number(leg.burnL || 0) + legHoldBurn(leg);
}

function fmtWithPlus(base: string, plus: string, hasPlus: boolean) {
  return hasPlus ? `${base}\n+${plus}` : base;
}

function findVor(data: NavlogDataBundle | null | undefined, ident: string) {
  const clean = ident.trim().toUpperCase();

  if (!data || !clean) return null;

  return data.vors.find((vor) => vor.ident.toUpperCase() === clean) ?? null;
}

function nearestVor(
  data: NavlogDataBundle | null | undefined,
  lat: number,
  lon: number
) {
  if (!data || data.vors.length === 0) return null;

  let best: NavlogVor | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const vor of data.vors) {
    const distance = gcDistanceNm(lat, lon, vor.lat, vor.lon);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = vor;
    }
  }

  return best;
}

function chooseVorForPoint(
  data: NavlogDataBundle | null | undefined,
  point: NavlogRouteNode
) {
  const name = safe(point.name).toUpperCase();

  if (name.startsWith("TOC") || name.startsWith("TOD")) return null;

  if ((point as any).vorPref === "NONE") return null;

  if ((point as any).vorPref === "FIXED" && (point as any).vorIdent) {
    return findVor(data, String((point as any).vorIdent));
  }

  if (point.src === "VOR") {
    return findVor(data, point.code || point.name);
  }

  return nearestVor(data, point.lat, point.lon);
}

function formatVorId(vor: NavlogVor | null) {
  if (!vor) return "";
  return `${vor.freqMhz.toFixed(2)} ${vor.ident}`;
}

function formatRadialDist(vor: NavlogVor | null, lat: number, lon: number) {
  if (!vor) return "";

  const radial = Math.round(gcCourseTc(vor.lat, vor.lon, lat, lon)) % 360;
  const distance = gcDistanceNm(vor.lat, vor.lon, lat, lon);

  if (distance < 0.3) return "";

  return `R${String(radial).padStart(3, "0")}/D${String(
    Math.round(distance)
  ).padStart(2, "0")}`;
}

function legPrefix(index: number) {
  return `Leg${String(index).padStart(2, "0")}`;
}

function putDeparturePayload(
  data: Record<string, unknown>,
  index: number,
  setup: NavlogSetupForm,
  waypoints: NavlogRouteWaypoint[],
  firstLeg?: NavlogLeg
) {
  const prefix = legPrefix(index);
  const first = waypoints[0];

  if (!first) return;

  const taxiBurn = taxiFuel(setup);
  const efobAfterTaxi =
    firstLeg?.efobStartL ?? Math.max(0, setup.startEfob - taxiBurn);

  data[`${prefix}_Waypoint`] = safe(first.point.code || first.point.name).slice(0, 14);
  data[`${prefix}_Navaid_Identifier`] = "";
  data[`${prefix}_Navaid_Frequency`] = "";
  data[`${prefix}_Altitude_FL`] = fmtUnit(first.altitudeFt);

  data[`${prefix}_True_Course`] = "";
  data[`${prefix}_True_Heading`] = "";
  data[`${prefix}_Magnetic_Heading`] = "";
  data[`${prefix}_True_Airspeed`] = "";
  data[`${prefix}_Ground_Speed`] = "";

  const taxiSeconds = Math.max(0, setup.taxiMin * 60);

  data[`${prefix}_Leg_Distance`] = "";
  data[`${prefix}_Cumulative_Distance`] = "";
  data[`${prefix}_Leg_ETE`] = pdfTime(taxiSeconds);
  data[`${prefix}_Cumulative_ETE`] = pdfTime(taxiSeconds);
  data[`${prefix}_ETO`] = "";

  data[`${prefix}_Planned_Burnoff`] = fmtPlannedBurnPdf(taxiBurn);
  data[`${prefix}_Estimated_FOB`] = fmtEfobPdf(efobAfterTaxi);
}

function putLegPayload(
  data: Record<string, unknown>,
  index: number,
  leg: NavlogLeg,
  accDistance: number,
  accTime: number,
  navlogData?: NavlogDataBundle | null
) {
  const prefix = legPrefix(index);
  const point = leg.to;
  const hasHold = legHoldSec(leg) > 0;
  const navaid = chooseVorForPoint(navlogData, point);

  data[`${prefix}_Waypoint`] = compactPdfWaypoint(point);
  data[`${prefix}_Altitude_FL`] = fmtUnit(Number(point.alt || 0));

  data[`${prefix}_True_Course`] = pad3(leg.tc);
  data[`${prefix}_True_Heading`] = pad3(leg.th);
  data[`${prefix}_Magnetic_Heading`] = pad3(leg.mh);

  data[`${prefix}_True_Airspeed`] = fmtUnit(leg.tas);
  data[`${prefix}_Ground_Speed`] = fmtUnit(leg.gs);

  data[`${prefix}_Leg_Distance`] = fmtWithPlus(
    fmtDistance(Number(leg.distNm || 0)),
    fmtDistance(legHoldDist(leg)),
    hasHold
  );
  data[`${prefix}_Cumulative_Distance`] = fmtDistance(accDistance);

  data[`${prefix}_Leg_ETE`] = fmtWithPlus(
    pdfTime(leg.eteSec),
    pdfTime(legHoldSec(leg)),
    hasHold
  );
  data[`${prefix}_Cumulative_ETE`] = pdfTime(accTime);
  data[`${prefix}_ETO`] = "";

  data[`${prefix}_Planned_Burnoff`] = fmtWithPlus(
    fmtPlannedBurnPdf(Number(leg.burnL || 0)),
    fmtPlannedBurnPdf(legHoldBurn(leg)),
    hasHold
  );
  data[`${prefix}_Estimated_FOB`] = fmtEfobPdf(Number(leg.efobEndL || 0));

  data[`${prefix}_Navaid_Identifier`] = formatVorId(navaid);
  data[`${prefix}_Navaid_Frequency`] = formatRadialDist(
    navaid,
    point.lat,
    point.lon
  );
}

function putTotalPayload(
  data: Record<string, unknown>,
  index: number,
  totalDist: number,
  totalSec: number,
  totalBurn: number,
  finalEfob: number
) {
  const prefix = legPrefix(index);

  data[`${prefix}_Waypoint`] = "TOTAL";
  data[`${prefix}_Navaid_Identifier`] = "";
  data[`${prefix}_Navaid_Frequency`] = "";
  data[`${prefix}_Altitude_FL`] = "";

  for (const field of [
    "True_Course",
    "True_Heading",
    "Magnetic_Heading",
    "True_Airspeed",
    "Ground_Speed",
  ]) {
    data[`${prefix}_${field}`] = "";
  }

  data[`${prefix}_Leg_Distance`] = fmtDistance(totalDist);
  data[`${prefix}_Cumulative_Distance`] = fmtDistance(totalDist);
  data[`${prefix}_Leg_ETE`] = pdfTime(totalSec);
  data[`${prefix}_Cumulative_ETE`] = pdfTime(totalSec);
  data[`${prefix}_ETO`] = "";
  data[`${prefix}_Planned_Burnoff`] = fmtPlannedBurnPdf(totalBurn);
  data[`${prefix}_Estimated_FOB`] = fmtEfobPdf(finalEfob);
}

function aircraftPdfCode(setup: NavlogSetupForm) {
  const reg = setup.registration.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (reg.startsWith("OE") || setup.aircraftType.includes("PA-28")) return "PA28";
  if (reg.startsWith("CS") || setup.aircraftType.includes("Tecnam")) return "P208";

  return setup.aircraftType;
}

function routeStartCode(waypoints: NavlogRouteWaypoint[]) {
  return waypoints[0]?.point.code || waypoints[0]?.point.name || "";
}

function routeEndCode(waypoints: NavlogRouteWaypoint[]) {
  const last = waypoints.at(-1);
  return last?.point.code || last?.point.name || "";
}

function firstTakeoffClock(legs: NavlogLeg[], setup: NavlogSetupForm) {
  return legs[0]?.clockStart ?? formatClock(setup.taxiMin * 60, setup.startClock);
}

function landingClock(legs: NavlogLeg[]) {
  return legs.at(-1)?.clockArrive ?? "";
}

function shutdownClock(legs: NavlogLeg[]) {
  return legs.at(-1)?.clockEnd ?? "";
}

function startupClock(setup: NavlogSetupForm) {
  return formatClock(0, setup.startClock);
}

function clockMinutes(value: string) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
}

function flightLoggerSeconds(setup: NavlogSetupForm) {
  const off = clockMinutes(setup.startClock);
  const on = clockMinutes(setup.onBlockClock);

  if (off === null || on === null) return null;

  let diff = on - off;

  if (diff < 0) {
    diff += 24 * 60;
  }

  return diff * 60;
}

function flightLoggerEtdEta(setup: NavlogSetupForm) {
  if (!setup.startClock || !setup.onBlockClock) return "";

  return `${setup.startClock}/${setup.onBlockClock}`;
}

function taxiFuel(setup: NavlogSetupForm) {
  return (setup.taxiFuelFlowLh * setup.taxiMin) / 60;
}

function buildHeaderPayload(
  setup: NavlogSetupForm,
  waypoints: NavlogRouteWaypoint[],
  legs: NavlogLeg[]
) {
  const totalSec = legs.reduce((sum, leg) => sum + legTotalTimeSec(leg), 0);
  const climbBurn = rf(
    legs
      .filter((leg) => leg.profile === "CLIMB")
      .reduce((sum, leg) => sum + legTotalBurn(leg), 0)
  );

  const takeoff = firstTakeoffClock(legs, setup);
  const landing = landingClock(legs);

  return {
    AIRCRAFT: aircraftPdfCode(setup),
    REGISTRATION: setup.registration,
    CALLSIGN: setup.registration,
    STUDENT: setup.student,
    LESSON: setup.lesson,
    INSTRUTOR: setup.instructor,
    INSTRUCTOR: setup.instructor,

    "ETD/ETA": flightLoggerEtdEta(setup),
    STARTUP: "",
    TAKEOFF: "",
    LANDING: "",
    SHUTDOWN: "",
    "FLT TIME":
      flightLoggerSeconds(setup) === null
        ? ""
        : pdfTime(flightLoggerSeconds(setup) ?? 0),

    DEPT: "119.805",
    ENROUTE: "123.755",
    ARRIVAL: "131.675",

    "LEVEL F/F": fmtEfobPdf(setup.fuelFlowLh),
    "CLIMB FUEL": fmtEfobPdf(climbBurn),
    WIND: `${String(Math.round(setup.windFrom)).padStart(3, "0")}/${String(
      Math.round(setup.windKt)
    ).padStart(2, "0")}`,
    MAG_VAR: `${Math.round(Math.abs(setup.magVar))}°${setup.magDirection}`,
    FLIGHT_LEVEL_ALTITUDE: `${setup.defaultAltitude}`,
    "FLIGHT_LEVEL/ALTITUDE": `${setup.defaultAltitude}`,
    TEMP_ISA_DEV: "",

    Departure_Airfield: routeStartCode(waypoints),
    Arrival_Airfield: routeEndCode(waypoints),
    Leg_Number: String(legs.length),

    OBSERVATIONS: "",
  };
}

function pdfObjectToString(value: any) {
  if (!value) return "";

  if (typeof value.decodeText === "function") {
    return value.decodeText();
  }

  return String(value).replace(/^\(/, "").replace(/\)$/, "");
}

function pdfNumber(value: any) {
  if (!value) return 0;

  if (typeof value.asNumber === "function") {
    return value.asNumber();
  }

  return Number(String(value));
}

function annotFieldName(pdfDoc: PDFDocument, annot: any) {
  let current = annot;

  for (let guard = 0; guard < 8 && current; guard += 1) {
    const directName = current.get(PDFName.of("T"));

    if (directName) {
      return pdfObjectToString(directName);
    }

    const parent = current.get(PDFName.of("Parent"));
    if (!parent) break;

    current = pdfDoc.context.lookup(parent) as any;
  }

  return "";
}

function annotRect(pdfDoc: PDFDocument, annot: any) {
  const rectRef = annot.get(PDFName.of("Rect"));
  const rect = pdfDoc.context.lookup(rectRef) as any;

  if (!rect || typeof rect.get !== "function") return null;

  const x1 = pdfNumber(rect.get(0));
  const y1 = pdfNumber(rect.get(1));
  const x2 = pdfNumber(rect.get(2));
  const y2 = pdfNumber(rect.get(3));

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function fieldFontSize(fieldName: string, value: string) {
  if (/Waypoint/i.test(fieldName)) return value.includes("\n") ? 4.0 : 5.0;
  if (/Navaid|Identifier|Frequency/i.test(fieldName)) return 4.2;
  if (/Planned_Burnoff|Estimated_FOB/i.test(fieldName)) return value.includes("\n") ? 4.0 : 5.0;
  if (/ETD\/ETA/i.test(fieldName)) return 5.0;
  if (value.includes("\n")) return 4.1;
  return 5.6;
}

function fieldTextColor(fieldName: string) {
  if (/_Leg_ETE$/i.test(fieldName)) {
    return rgb(0.88, 0.34, 0.04);
  }

  return rgb(0, 0, 0);
}

function drawStampedField({
  page,
  font,
  fieldName,
  value,
  rect,
}: {
  page: any;
  font: any;
  fieldName: string;
  value: string;
  rect: { x: number; y: number; width: number; height: number };
}) {
  if (!value) return;

  const size = fieldFontSize(fieldName, value);
  const lines = value.split("\n").slice(0, 3);
  const lineHeight = size + 0.9;

  const isCentered =
    !/Waypoint|Navaid|Identifier|Frequency|OBSERVATIONS/i.test(fieldName);

  const totalTextHeight = lines.length * lineHeight;
  let y = rect.y + rect.height / 2 + totalTextHeight / 2 - size;

  for (const line of lines) {
    const textWidth = font.widthOfTextAtSize(line, size);
    const x = isCentered
      ? rect.x + rect.width / 2 - textWidth / 2
      : rect.x + 1.2;

    page.drawText(line, {
      x,
      y,
      size,
      font,
      color: fieldTextColor(fieldName),
    });

    y -= lineHeight;
  }
}

function stampPdfValuesAndRemoveWidgets(
  pdfDoc: PDFDocument,
  data: Record<string, unknown>,
  font: any
) {
  for (const page of pdfDoc.getPages()) {
    const annotsRef = page.node.get(PDFName.of("Annots"));
    const annots = annotsRef ? (pdfDoc.context.lookup(annotsRef) as any) : null;

    if (!annots || typeof annots.size !== "function") continue;

    for (let index = 0; index < annots.size(); index += 1) {
      const annotRef = annots.get(index);
      const annot = pdfDoc.context.lookup(annotRef) as any;
      const fieldName = annotFieldName(pdfDoc, annot);

      if (!fieldName) continue;

      const value = data[fieldName];

      if (value === undefined || value === null || String(value) === "") continue;

      const rect = annotRect(pdfDoc, annot);
      if (!rect) continue;

      drawStampedField({
        page,
        font,
        fieldName,
        value: String(value),
        rect,
      });
    }

    page.node.set(PDFName.of("Annots"), pdfDoc.context.obj([]));
  }
}

async function loadTemplate(url: string, pagesToKeep?: number) {
  const bytes = await fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Could not load ${url}.`);
    return response.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.load(bytes);

  if (pagesToKeep !== undefined) {
    while (pdfDoc.getPageCount() > pagesToKeep) {
      pdfDoc.removePage(pdfDoc.getPageCount() - 1);
    }
  }

  return pdfDoc;
}

async function fillTemplate({
  url,
  header,
  legs,
  setup,
  waypoints,
  navlogData,
  includeDepartureRow = false,
  start,
  count,
  firstRowIndex,
  totalOnNextRow,
  fillContinuationTotal,
  pagesToKeep,
}: {
  url: string;
  header: Record<string, unknown>;
  legs: NavlogLeg[];
  setup: NavlogSetupForm;
  navlogData?: NavlogDataBundle | null;
  waypoints: NavlogRouteWaypoint[];
  includeDepartureRow?: boolean;
  start: number;
  count: number;
  firstRowIndex: number;
  totalOnNextRow: boolean;
  fillContinuationTotal: boolean;
  pagesToKeep?: number;
}) {
  const pdfDoc = await loadTemplate(url, pagesToKeep);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const payload: Record<string, unknown> = { ...header };

  const chunk = legs.slice(start, start + count);

  const taxiSeconds = Math.max(0, setup.taxiMin * 60);
  const totalSec = legs.reduce(
    (sum, leg) => sum + legTotalTimeSec(leg),
    taxiSeconds
  );
  const totalBurn = rf(
    legs.reduce((sum, leg) => sum + legTotalBurn(leg), taxiFuel(setup))
  );
  const totalDist = rd(legs.reduce((sum, leg) => sum + legTotalDistance(leg), 0));
  const finalEfob = legs.at(-1)?.efobEndL ?? setup.startEfob;

  let accDistance = rd(
    legs.slice(0, start).reduce((sum, leg) => sum + legTotalDistance(leg), 0)
  );
  let accTime =
    Math.max(0, setup.taxiMin * 60) +
    legs.slice(0, start).reduce((sum, leg) => sum + legTotalTimeSec(leg), 0);
  let rowIndex = firstRowIndex;

  if (includeDepartureRow) {
    putDeparturePayload(payload, rowIndex, setup, waypoints, legs[0]);
    rowIndex += 1;
  }

  for (const [offset, leg] of chunk.entries()) {
    accDistance = rd(accDistance + legTotalDistance(leg));
    accTime += legTotalTimeSec(leg);

    putLegPayload(
      payload,
      rowIndex + offset,
      leg,
      accDistance,
      accTime,
      navlogData
    );
  }

  if (totalOnNextRow) {
    putTotalPayload(
      payload,
      rowIndex + chunk.length,
      totalDist,
      totalSec,
      totalBurn,
      finalEfob
    );
  }

  if (fillContinuationTotal) {
    putTotalPayload(
      payload,
      PDF_TOTAL_ROW_INDEX,
      totalDist,
      totalSec,
      totalBurn,
      finalEfob
    );
  }

  stampPdfValuesAndRemoveWidgets(pdfDoc, payload, font);

  return pdfDoc;
}

async function appendPdf(target: PDFDocument, source: PDFDocument) {
  const copiedPages = await target.copyPages(source, source.getPageIndices());
  copiedPages.forEach((page) => target.addPage(page));
}

export async function buildNavlogFormPdf({
  setup,
  waypoints,
  calculation,
  navlogData,
}: BuildNavlogFormPdfInput) {
  const legs = calculation.legs;
  const outputPdf = await PDFDocument.create();
  const header = buildHeaderPayload(setup, waypoints, legs);

  const singlePageLegCapacity = PDF_SINGLE_PAGE_LEG_ROWS - 1;
  const fullTemplateLegCapacity = PDF_FULL_TEMPLATE_LEG_ROWS - 1;
  const singlePage = legs.length <= singlePageLegCapacity;

  const mainDoc = await fillTemplate({
    url: TEMPLATE_MAIN_URL,
    header,
    legs,
    setup,
    waypoints,
    navlogData,
    includeDepartureRow: true,
    start: 0,
    count: singlePage ? singlePageLegCapacity : fullTemplateLegCapacity,
    firstRowIndex: 1,
    totalOnNextRow: singlePage,
    fillContinuationTotal: !singlePage,
    pagesToKeep: singlePage ? 1 : undefined,
  });

  await appendPdf(outputPdf, mainDoc);

  if (legs.length > fullTemplateLegCapacity) {
    for (
      let start = fullTemplateLegCapacity;
      start < legs.length;
      start += PDF_CONTINUATION_ROWS
    ) {
      const continuationDoc = await fillTemplate({
        url: TEMPLATE_CONT_URL,
        header,
        legs,
        setup,
        waypoints,
        navlogData,
        start,
        count: PDF_CONTINUATION_ROWS,
        firstRowIndex: PDF_CONTINUATION_FIRST_ROW,
        totalOnNextRow: false,
        fillContinuationTotal: true,
      });

      await appendPdf(outputPdf, continuationDoc);
    }
  }

  return outputPdf.save();
}
