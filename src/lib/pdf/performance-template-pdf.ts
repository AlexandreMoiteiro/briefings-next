import { PDFDocument, PDFName, StandardFonts, rgb, type PDFForm } from "pdf-lib";
import {
  fuelLToPa28Lb,
  KG_TO_LB,
  PA28,
  type Pa28MbInput,
  type Pa28MbResult,
  type PerformanceAircraft,
  type TecnamMbInput,
  type TecnamMbResult,
} from "@/lib/performance/mb";
import {
  formatFuelLiters,
  formatFuelTime,
  recalculateFuelPlan,
  type FuelPlanningInput,
} from "@/lib/performance/fuel-planning";
import type { PerformanceLegResult } from "@/lib/performance/aerodrome-performance";
import type { Pa28PerformanceRow } from "@/lib/performance/pa28-performance";
import type { TecnamPerformanceRow } from "@/lib/performance/tecnam-performance";

type BuildPerformancePdfInput = {
  aircraft: PerformanceAircraft;
  registration: string;
  mission: string;
  date: string;
  pa28?: Pa28MbResult;
  tecnam?: TecnamMbResult;
  pa28Input?: Pa28MbInput;
  tecnamInput?: TecnamMbInput;
  fuelPlan?: FuelPlanningInput;
  performanceResults: PerformanceLegResult[];
  pa28PerformanceRows?: Pa28PerformanceRow[];
  tecnamPerformanceRows?: TecnamPerformanceRow[];
};

const PA28_TEMPLATE_URL =
  "/legacy/templates/RVP.CFI.067.02PiperPA28MBandPerformanceSheet.pdf";
const TECNAM_TEMPLATE_URL =
  "/legacy/templates/TecnamP2008MBPerformanceSheet_MissionX.pdf";

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function normalizePdfFieldName(name: string) {
  return clean(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function lookupPdfFieldValue(
  fields: Record<string, unknown>,
  pdfFieldName: string
) {
  if (fields[pdfFieldName] !== undefined) {
    return fields[pdfFieldName];
  }

  const target = normalizePdfFieldName(pdfFieldName);

  for (const [key, value] of Object.entries(fields)) {
    if (normalizePdfFieldName(key) === target) {
      return value;
    }
  }

  return undefined;
}

function setFieldAliases(
  fields: Record<string, unknown>,
  names: string[],
  value: unknown
) {
  for (const name of names) {
    fields[name] = value;
  }
}

function n(value: number, digits = 0) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(digits);
}

function dateForPdf(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return clean(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function kgFromLb(lb: number) {
  return lb / KG_TO_LB;
}

function weightStringLb(lb: number) {
  if (!Number.isFinite(lb) || lb <= 0) return "";
  return `${lb.toFixed(0)} (${kgFromLb(lb).toFixed(0)}kg)`;
}

function pa28RearPassengerString(input: Pa28MbInput, rearLb: number) {
  const rearKg = Number(input.rearKg ?? 0);

  if (rearKg <= 0 || rearLb <= 0) {
    return "0";
  }

  return `${rearLb.toFixed(0)} (${rearKg.toFixed(0)}kg)`;
}

function frontCrewString(input: Pa28MbInput) {
  const student = Number(input.studentKg ?? 0);
  const instructor = Number(input.instructorKg ?? 0);

  if (student > 0 || instructor > 0) {
    return `${student.toFixed(0)}+${instructor.toFixed(0)}kg`;
  }

  return weightStringLb(input.frontKg * KG_TO_LB);
}

function tecnamCrewString(input: TecnamMbInput) {
  const student = Number(input.studentKg ?? 0);
  const instructor = Number(input.instructorKg ?? 0);

  if (student > 0 || instructor > 0) {
    return `${student.toFixed(0)}+${instructor.toFixed(0)}`;
  }

  return n(input.pilotPassengerKg, 0);
}

function formatPdfFuelTime(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes || 0));

  if (rounded <= 0) return "";

  if (rounded < 60) {
    return `${rounded}min`;
  }

  const h = Math.floor(rounded / 60);
  const m = rounded % 60;

  if (m === 0) return `${h}h`;

  return `${h}h${String(m).padStart(2, "0")}min`;
}

function formatPa28PdfFuel(liters: number) {
  const value = Number(liters || 0);

  if (value <= 0) return "";

  const usg = value / 3.785411784;
  return `${usg.toFixed(1)}USG/${Math.round(value)}L`;
}

function fuelStringPa28(fuelL: number) {
  const { fuelLb, fuelUsg } = fuelLToPa28Lb(fuelL);
  if (fuelLb <= 0) return "";
  return `${fuelLb.toFixed(0)} (${fuelUsg.toFixed(0)}USG/${fuelL.toFixed(0)}L)`;
}

function windString(result: PerformanceLegResult) {
  return `${String(Math.round(result.leg.windFrom)).padStart(3, "0")}/${Math.round(
    result.leg.windKt
  )}`;
}

function runwayString(result: PerformanceLegResult) {
  if (!result.bestRunway) return "";
  return `${result.bestRunway.id} / ${Math.round(result.bestRunway.qfu)}`;
}

function resultForRole(performanceResults: PerformanceLegResult[], role: string) {
  return performanceResults.find((result) => result.leg.role === role) ?? null;
}

function pa28RowForRole(rows: Pa28PerformanceRow[], role: string) {
  return rows.find((row) => row.role === role) ?? null;
}

function tecnamRowForRole(rows: TecnamPerformanceRow[], role: string) {
  return rows.find((row) => row.role === role) ?? null;
}

function setText(form: PDFForm, name: string, value: unknown, fontSize = 8) {
  try {
    const field = form.getTextField(name);
    field.setText(clean(value));
    try {
      field.setFontSize(fontSize);
    } catch {
      // ignore
    }
  } catch {
    // ignore missing fields
  }
}

function pdfObjectToString(value: any) {
  if (!value) return "";
  if (typeof value.decodeText === "function") return value.decodeText();
  return String(value).replace(/^\(/, "").replace(/\)$/, "");
}

function pdfNumber(value: any) {
  if (!value) return 0;
  if (typeof value.asNumber === "function") return value.asNumber();
  return Number(String(value));
}

function annotFieldName(pdfDoc: PDFDocument, annot: any) {
  let current = annot;

  for (let guard = 0; guard < 8 && current; guard += 1) {
    const directName = current.get(PDFName.of("T"));

    if (directName) return pdfObjectToString(directName);

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

function fieldFontSize(name: string, value: string) {
  const v = String(value ?? "").trim();

  // valores curtos: ICAO, QFU, QNH, vento, TODA/LDA, ROC, datas
  if (v.length <= 8) return 8.6;

  // valores médios: 421 (23%), 3.3USG/13L, 01:40, etc.
  if (v.length <= 14) return 8.0;

  // valores mais compridos: pesos com kg, fuel USG/L
  if (v.length <= 22) return 7.1;

  return 6.3;
}

function stampPdfValues(
  pdfDoc: PDFDocument,
  fields: Record<string, unknown>,
  font: any,
  bold: any
) {
  for (const page of pdfDoc.getPages()) {
    const annotsRef = page.node.get(PDFName.of("Annots"));
    const annots = annotsRef ? (pdfDoc.context.lookup(annotsRef) as any) : null;

    if (!annots || typeof annots.size !== "function") continue;

    for (let index = 0; index < annots.size(); index += 1) {
      const annotRef = annots.get(index);
      const annot = pdfDoc.context.lookup(annotRef) as any;
      const fieldName = annotFieldName(pdfDoc, annot);
      const value = lookupPdfFieldValue(fields, fieldName);

      if (!fieldName || value === undefined || value === null || String(value) === "") {
        continue;
      }

      const rect = annotRect(pdfDoc, annot);
      if (!rect) continue;

      const text = clean(value);
      const size = fieldFontSize(fieldName, text);
      const textWidth = font.widthOfTextAtSize(text, size);
      const center = true;

      const x = center
        ? rect.x + rect.width / 2 - textWidth / 2
        : rect.x + 1.4;
      const y = rect.y + rect.height / 2 - size * 0.32;

      page.drawText(text, {
        x,
        y,
        size,
        font: /TOTAL|TAKEOFF|RAMP/i.test(fieldName) ? bold : font,
        color: rgb(0, 0, 0),
      });
    }

    page.node.set(PDFName.of("Annots"), pdfDoc.context.obj([]));
  }

  try {
    (pdfDoc.catalog as any).dict.delete(PDFName.of("AcroForm"));
  } catch {
    // ignore
  }
}

async function loadPdf(url: string) {
  const bytes = await fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Cannot load template: ${url}`);
    return response.arrayBuffer();
  });

  return PDFDocument.load(bytes);
}

const CG_ANCHORS: Record<
  number,
  { w0: number; x0: number; y0: number; w1: number; x1: number; y1: number }
> = {
  82: { w0: 1200, x0: 182, y0: 72, w1: 2050, x1: 134, y1: 245 },
  83: { w0: 1200, x0: 199, y0: 72, w1: 2138, x1: 155, y1: 260 },
  84: { w0: 1200, x0: 213, y0: 71, w1: 2200, x1: 178, y1: 276 },
  85: { w0: 1200, x0: 229, y0: 72, w1: 2295, x1: 202, y1: 294 },
  86: { w0: 1200, x0: 245, y0: 72, w1: 2355, x1: 228, y1: 307 },
  87: { w0: 1200, x0: 262, y0: 72, w1: 2440, x1: 255, y1: 322 },
  88: { w0: 1200, x0: 277, y0: 73, w1: 2515, x1: 285, y1: 338 },
  89: { w0: 1200, x0: 293, y0: 73, w1: 2550, x1: 315, y1: 343 },
  90: { w0: 1200, x0: 308, y0: 72, w1: 2550, x1: 345, y1: 343 },
  91: { w0: 1200, x0: 323, y0: 72, w1: 2550, x1: 374, y1: 343 },
  92: { w0: 1200, x0: 340, y0: 73, w1: 2550, x1: 404, y1: 343 },
  93: { w0: 1200, x0: 355, y0: 72, w1: 2550, x1: 435, y1: 344 },
};

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function xyOnCgLine(cgInt: number, weightLb: number) {
  const anchor = CG_ANCHORS[cgInt];
  const w = clampNumber(
    weightLb,
    Math.min(anchor.w0, anchor.w1),
    Math.max(anchor.w0, anchor.w1)
  );

  if (anchor.w1 === anchor.w0) {
    return { x: anchor.x0, y: anchor.y0 };
  }

  const t = (w - anchor.w0) / (anchor.w1 - anchor.w0);

  return {
    x: anchor.x0 + t * (anchor.x1 - anchor.x0),
    y: anchor.y0 + t * (anchor.y1 - anchor.y0),
  };
}

function xyFromCgWeight(cgIn: number, weightLb: number) {
  const cg = clampNumber(cgIn, 82, 93);
  const lo = Math.floor(clampNumber(Math.floor(cg), 82, 93));
  const hi = Math.floor(clampNumber(lo + 1, 82, 93));

  if (hi === lo) {
    return xyOnCgLine(lo, weightLb);
  }

  const a = xyOnCgLine(lo, weightLb);
  const b = xyOnCgLine(hi, weightLb);
  const frac = (cg - lo) / (hi - lo);

  return {
    x: a.x + frac * (b.x - a.x),
    y: a.y + frac * (b.y - a.y),
  };
}

function drawPa28AlternateSplit(pdfDoc: PDFDocument) {
  // Sem separador visual entre Alternate 1 e Alternate 2.
  // O template original fica mais limpo sem esta linha extra.
  void pdfDoc;
}

function drawPa28CgOverlay(pdfDoc: PDFDocument, pa28?: Pa28MbResult) {
  if (!pa28) return;

  const page = pdfDoc.getPage(0);

  const points = [
    {
      label: "E",
      cg: pa28.empty.cgIn,
      weight: pa28.empty.weightLb,
      color: rgb(0.1, 0.6, 0.15),
    },
    {
      label: "TO",
      cg: pa28.takeoff.cgIn,
      weight: pa28.takeoff.weightLb,
      color: rgb(0.1, 0.3, 0.85),
    },
    {
      label: "LDG",
      cg: pa28.landing.cgIn,
      weight: pa28.landing.weightLb,
      color: rgb(0.85, 0.15, 0.15),
    },
  ];

  for (const point of points) {
    const dot = xyFromCgWeight(point.cg, point.weight);
    const base = xyFromCgWeight(point.cg, 1200);

    page.drawLine({
      start: base,
      end: dot,
      thickness: 1.5,
      color: point.color,
    });

    page.drawCircle({
      x: dot.x,
      y: dot.y,
      size: 5.5,
      color: point.color,
    });

    page.drawText(point.label, {
      x: dot.x + 6,
      y: dot.y + 4,
      size: 6,
      color: point.color,
    });
  }
}

async function saveStampedPdf(
  url: string,
  fields: Record<string, unknown>,
  afterStamp?: (pdfDoc: PDFDocument) => void
) {
  const pdf = await loadPdf(url);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const [name, value] of Object.entries(fields)) {
    setText(form, name, value);
  }

  try {
    form.updateFieldAppearances(font);
  } catch {
    // ignore
  }

  stampPdfValues(pdf, fields, font, bold);

  if (afterStamp) {
    afterStamp(pdf);
  }

  return pdf.save();
}

function putPa28FuelPlanning(
  fields: Record<string, unknown>,
  plan: FuelPlanningInput
) {
  const calculated = recalculateFuelPlan(plan);

  fields["Start-up_and_Taxi_TIME"] = formatPdfFuelTime(calculated.taxiMin);
  fields["Start-up_and_Taxi_FUEL"] = formatPa28PdfFuel(calculated.taxiFuelL);

  fields.CLIMB_TIME = formatPdfFuelTime(calculated.climbMin);
  fields.CLIMB_FUEL = formatPa28PdfFuel(calculated.climbFuelL);

  fields.ENROUTE_TIME = formatPdfFuelTime(calculated.enrouteMin);
  fields.ENROUTE_FUEL = formatPa28PdfFuel(calculated.enrouteFuelL);

  fields.DESCENT_TIME = formatPdfFuelTime(calculated.descentMin);
  fields.DESCENT_FUEL = formatPa28PdfFuel(calculated.descentFuelL);

  fields.TRIP_TIME = formatPdfFuelTime(calculated.tripMin);
  fields.TRIP_FUEL = formatPa28PdfFuel(calculated.tripFuelL);

  fields.Contingency_TIME = formatPdfFuelTime(calculated.contingencyMin);
  fields.Contingency_FUEL = formatPa28PdfFuel(calculated.contingencyFuelL);

  fields.ALTERNATE_TIME = formatPdfFuelTime(calculated.alternateMin);
  fields.ALTERNATE_FUEL = formatPa28PdfFuel(calculated.alternateFuelL);

  fields.RESERVE_TIME = formatPdfFuelTime(calculated.reserveMin);
  fields.RESERVE_FUEL = formatPa28PdfFuel(calculated.reserveFuelL);

  fields.REQUIRED_TIME = formatPdfFuelTime(calculated.requiredRampMin);
  fields.REQUIRED_FUEL = formatPa28PdfFuel(calculated.requiredRampFuelL);

  fields.EXTRA_TIME = formatPdfFuelTime(calculated.extraMin);
  fields.EXTRA_FUEL = formatPa28PdfFuel(calculated.extraFuelL);

  fields.Total_TIME = formatPdfFuelTime(calculated.totalRampMin);
  fields.Total_FUEL = formatPa28PdfFuel(calculated.totalRampFuelL);
}

function putTecnamFuelPlanning(
  fields: Record<string, unknown>,
  plan: FuelPlanningInput
) {
  const calculated = recalculateFuelPlan(plan);

  fields.Taxi_T = formatFuelTime(calculated.taxiMin);
  fields.Taxi_F = formatFuelLiters(calculated.taxiFuelL);

  fields.Climb_T = formatFuelTime(calculated.climbMin);
  fields.Climb_F = formatFuelLiters(calculated.climbFuelL);

  fields.Enroute_T = formatFuelTime(calculated.enrouteMin);
  fields.Enroute_F = formatFuelLiters(calculated.enrouteFuelL);

  fields.Descent_T = formatFuelTime(calculated.descentMin);
  fields.Descent_F = formatFuelLiters(calculated.descentFuelL);

  fields.Trip_T = formatFuelTime(calculated.tripMin);
  fields.Trip_F = formatFuelLiters(calculated.tripFuelL);

  fields.Contingency_T = formatFuelTime(calculated.contingencyMin);
  fields.Contingency_F = formatFuelLiters(calculated.contingencyFuelL);

  fields.Alternate_T = formatFuelTime(calculated.alternateMin);
  fields.Alternate_F = formatFuelLiters(calculated.alternateFuelL);

  fields.Reserve_T = formatFuelTime(calculated.reserveMin);
  fields.Reserve_F = formatFuelLiters(calculated.reserveFuelL);

  fields.Ramp_T = formatFuelTime(calculated.requiredRampMin);
  fields.Ramp_F = formatFuelLiters(calculated.requiredRampFuelL);

  fields.Extra_T = formatFuelTime(calculated.extraMin);
  fields.Extra_F = formatFuelLiters(calculated.extraFuelL);

  fields.Total_T = formatFuelTime(calculated.totalRampMin);
  fields.Total_F = formatFuelLiters(calculated.totalRampFuelL);
}

function putPa28PerformanceRole(
  fields: Record<string, unknown>,
  suffix: "DEPARTURE" | "ARRIVAL" | "ALTERNATE_1" | "ALTERNATE_2",
  result: PerformanceLegResult | null,
  row: Pa28PerformanceRow | null
) {
  if (!result || result.leg.icao === "-") {
    fields[`Airfield_${suffix}`] = "";
    return;
  }

  fields[`Airfield_${suffix}`] = result.leg.icao;
  fields[`RWY_QFU_${suffix}`] = runwayString(result);
  fields[`Elevation_${suffix}`] = result.aerodrome ? n(result.aerodrome.elev_ft, 0) : "";
  fields[`QNH_${suffix}`] = n(result.leg.qnhHpa, 0);
  fields[`Temperature_${suffix}`] = n(result.leg.tempC, 0);
  fields[`Wind_${suffix}`] = windString(result);
  fields[`Density_Alt_${suffix}`] = n(result.densityAltitudeFt, 0);

  if (suffix === "DEPARTURE") {
    fields["Pressure_Alt _DEPARTURE"] = n(result.pressureAltitudeFt, 0);
  } else {
    fields[`Pressure_Alt_${suffix}`] = n(result.pressureAltitudeFt, 0);
  }

  if (!row) return;

  fields[`TODA_${suffix}`] = n(row.todaM, 0);
  fields[`TODR_${suffix}`] = row.toMWithPct;
  fields[`LDA_${suffix}`] = n(row.ldaM, 0);
  fields[`LDR_${suffix}`] = row.ldgMWithPct;
  fields[`ROC_${suffix}`] = n(row.rocFpm, 0);
}

function putTecnamPerformanceRole(
  fields: Record<string, unknown>,
  suffix: "Dep" | "Arr" | "Alt",
  result: PerformanceLegResult | null,
  row: TecnamPerformanceRow | null
) {
  if (!result || !result.aerodrome || result.leg.icao === "-") return;

  fields[`Airfield_${suffix}`] = result.leg.icao;
  fields[`QFU_${suffix}`] = runwayString(result);
  fields[`Elev_${suffix}`] = n(result.aerodrome.elev_ft, 0);
  fields[`QNH_${suffix}`] = n(result.leg.qnhHpa, 0);
  fields[`Temp_${suffix}`] = n(result.leg.tempC, 0);
  fields[`Wind_${suffix}`] = windString(result);
  fields[`PA_${suffix}`] = n(result.pressureAltitudeFt, 0);
  fields[`DA_${suffix}`] = n(result.densityAltitudeFt, 0);

  if (!row) return;

  fields[`TODA_${suffix}`] = n(row.todaM, 0);
  fields[`TODR_${suffix}`] = n(row.takeoff50M, 0);
  fields[`LDA_${suffix}`] = n(row.ldaM, 0);
  fields[`LDR_${suffix}`] = n(row.landing50M, 0);
  fields[`ROC_${suffix}`] = n(row.rocFpm, 0);
}

function buildPa28Fields(input: BuildPerformancePdfInput) {
  if (!input.pa28 || !input.pa28Input) throw new Error("Missing PA-28 data.");

  const pa28 = input.pa28;
  const pa28Input = input.pa28Input;
  const plan = recalculateFuelPlan(
    input.fuelPlan ?? {
      rateLh: input.aircraft === "Piper PA-28" ? 38 : 20,
      fuelLoadedL: input.pa28Input?.fuelL ?? input.tecnamInput?.fuelL ?? 0,
      taxiMin: 15,
      taxiFuelL: 5,
      climbMin: 10,
      enrouteMin: 60,
      descentMin: 10,
      alternateMin: input.aircraft === "Piper PA-28" ? 60 : 45,
      reserveMin: 45,
    }
  );
  const frontKg =
    pa28Input.studentKg !== undefined || pa28Input.instructorKg !== undefined
      ? Number(pa28Input.studentKg ?? 0) + Number(pa28Input.instructorKg ?? 0)
      : pa28Input.frontKg;
  const frontLb = frontKg * KG_TO_LB;
  const rearLb = pa28Input.rearKg * KG_TO_LB;
  const baggageLb = pa28Input.baggageKg * KG_TO_LB;
  const fuel = fuelLToPa28Lb(pa28Input.fuelL);
  const emptyCg = pa28.empty.weightLb > 0 ? pa28.empty.momentInLb / pa28.empty.weightLb : 0;

  const fields: Record<string, unknown> = {
    Date: dateForPdf(input.date),
    Aircraft_Reg: input.registration,
    MTOW: n(PA28.mtowLb, 0),
    MLW: n(PA28.mlwLb, 0),

    Weight_EMPTY: weightStringLb(pa28.empty.weightLb),
    Moment_EMPTY: n(pa28.empty.momentInLb, 0),
    Datum_EMPTY: n(emptyCg, 1),

    Weight_FRONT: frontCrewString(pa28Input),
    Moment_FRONT: n(frontLb * PA28.armFront, 0),

    Weight_REAR: weightStringLb(rearLb),
    Moment_REAR: n(rearLb * PA28.armRear, 0),

    Weight_FUEL: fuelStringPa28(pa28Input.fuelL),
    Moment_FUEL: n(fuel.fuelLb * PA28.armFuel, 0),

    Weight_BAGGAGE: weightStringLb(baggageLb),
    Moment_BAGGAGE: n(baggageLb * PA28.armBaggage, 0),

    Weight_RAMP: weightStringLb(pa28.ramp.weightLb),
    Moment_RAMP: n(pa28.ramp.momentInLb, 0),
    Datum_RAMP: n(pa28.ramp.cgIn, 1),

    Weight_TAKEOFF: weightStringLb(pa28.takeoff.weightLb),
    Moment_TAKEOFF: n(pa28.takeoff.momentInLb, 0),
    Datum_TAKEOFF: n(pa28.takeoff.cgIn, 1),
  };

  const rearPassengerText = pa28RearPassengerString(pa28Input, rearLb);
  const rearMomentText = n(rearLb * PA28.armRear, 0);

  setFieldAliases(
    fields,
    [
      "Weight_REAR",
      "Weight_REAR_SEATS",
      "Weight_REAR_PASSENGERS",
      "Weight_PASSENGERS_REAR",
      "Passengers_REAR",
      "Passengers_rear_seats",
      "Weight_PASSENGERS",
    ],
    rearPassengerText
  );

  setFieldAliases(
    fields,
    [
      "Moment_REAR",
      "Moment_REAR_SEATS",
      "Moment_REAR_PASSENGERS",
      "Moment_PASSENGERS_REAR",
      "Moment_PASSENGERS",
    ],
    rearMomentText
  );

  putPa28FuelPlanning(fields, plan);

  const rows = input.pa28PerformanceRows ?? [];

  putPa28PerformanceRole(fields, "DEPARTURE", resultForRole(input.performanceResults, "Departure"), pa28RowForRole(rows, "Departure"));
  putPa28PerformanceRole(fields, "ARRIVAL", resultForRole(input.performanceResults, "Arrival"), pa28RowForRole(rows, "Arrival"));
  putPa28PerformanceRole(fields, "ALTERNATE_1", resultForRole(input.performanceResults, "Alternate"), pa28RowForRole(rows, "Alternate"));
  putPa28PerformanceRole(fields, "ALTERNATE_2", resultForRole(input.performanceResults, "Alternate 2"), pa28RowForRole(rows, "Alternate 2"));

  return fields;
}

function buildTecnamFields(input: BuildPerformancePdfInput) {
  if (!input.tecnam || !input.tecnamInput) throw new Error("Missing Tecnam data.");

  const tecnam = input.tecnam;
  const tecnamInput = input.tecnamInput;
  const plan = recalculateFuelPlan(
    input.fuelPlan ?? {
      rateLh: input.aircraft === "Piper PA-28" ? 38 : 20,
      fuelLoadedL: input.pa28Input?.fuelL ?? input.tecnamInput?.fuelL ?? 0,
      taxiMin: 15,
      taxiFuelL: 5,
      climbMin: 10,
      enrouteMin: 60,
      descentMin: 10,
      alternateMin: input.aircraft === "Piper PA-28" ? 60 : 45,
      reserveMin: 45,
    }
  );

  const fields: Record<string, unknown> = {
    Aircraf_Reg: input.registration,
    Date: dateForPdf(input.date),

    EmptyWeight_W: n(tecnam.empty.weightKg, 0),
    EmptyWeight_A: n(tecnam.empty.armM, 3),
    EmptyWeight_M: n(tecnam.empty.momentKgM, 2),

    "Pilot&Passenger_W": tecnamCrewString(tecnamInput),
    "Pilot&Passenger_M": n(tecnam.pilotPassenger.momentKgM, 2),

    Baggage_W: n(tecnam.baggage.weightKg, 0),
    Baggage_M: n(tecnam.baggage.momentKgM, 2),

    Fuel_W: n(tecnam.fuel.weightKg, 0),
    Fuel_M: n(tecnam.fuel.momentKgM, 2),

    TOTAL_W: n(tecnam.total.weightKg, 0),
    TOTAL_M: n(tecnam.total.momentKgM, 2),
    CG: n(tecnam.total.cgM ?? 0, 3),
  };

  putTecnamFuelPlanning(fields, plan);

  const rows = input.tecnamPerformanceRows ?? [];

  putTecnamPerformanceRole(fields, "Dep", resultForRole(input.performanceResults, "Departure"), tecnamRowForRole(rows, "Departure"));
  putTecnamPerformanceRole(fields, "Arr", resultForRole(input.performanceResults, "Arrival"), tecnamRowForRole(rows, "Arrival"));
  putTecnamPerformanceRole(fields, "Alt", resultForRole(input.performanceResults, "Alternate"), tecnamRowForRole(rows, "Alternate"));

  return fields;
}

export async function buildPerformancePdf(input: BuildPerformancePdfInput) {
  if (input.aircraft === "Piper PA-28") {
    return saveStampedPdf(PA28_TEMPLATE_URL, buildPa28Fields(input), (pdfDoc) => {
      drawPa28CgOverlay(pdfDoc, input.pa28);

    });
  }

  return saveStampedPdf(TECNAM_TEMPLATE_URL, buildTecnamFields(input));
}
