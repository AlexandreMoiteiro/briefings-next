import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type {
  PerformanceLegResult,
  PerformanceLegRole,
} from "@/lib/performance/aerodrome-performance";
import {
  formatFuelLiters,
  formatFuelTime,
  recalculateFuelPlan,
  type FuelPlanningInput,
} from "@/lib/performance/fuel-planning";
import type {
  TecnamMbInput,
  TecnamMbResult,
} from "@/lib/performance/mb";
import type { TecnamPerformanceRow } from "@/lib/performance/tecnam-performance";

const TEMPLATE_URL =
  "/legacy/templates/TecnamP2008MBPerformanceSheet_MissionX.pdf";

type Rect = { x: number; y: number; width: number; height: number };

export type BuildP2008PerformancePdfV2Input = {
  registration: string;
  date: string;
  mb: TecnamMbResult;
  mbInput: TecnamMbInput;
  fuelPlan: FuelPlanningInput;
  performanceResults: PerformanceLegResult[];
  rows: TecnamPerformanceRow[];
};

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function n(value: number, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : "";
}

function dateForPdf(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}

function resultForRole(
  results: PerformanceLegResult[],
  role: PerformanceLegRole
) {
  return results.find((result) => result.leg.role === role) ?? null;
}

function rowForRole(rows: TecnamPerformanceRow[], role: PerformanceLegRole) {
  return rows.find((row) => row.role === role) ?? null;
}

function runwayString(result: PerformanceLegResult) {
  return result.bestRunway
    ? `${result.bestRunway.id} / ${Math.round(result.bestRunway.qfu)}`
    : "";
}

function windString(result: PerformanceLegResult) {
  return `${String(Math.round(result.leg.windFrom)).padStart(3, "0")} / ${Math.round(
    result.leg.windKt
  )}`;
}

function roleValues(
  result: PerformanceLegResult | null,
  row: TecnamPerformanceRow | null
) {
  if (!result || !result.aerodrome || !result.bestRunway) {
    return {} as Record<string, unknown>;
  }
  return {
    Airfield: result.leg.icao,
    QFU: runwayString(result),
    Elev: Math.round(result.aerodrome.elev_ft),
    QNH: Math.round(result.leg.qnhHpa),
    Temp: Math.round(result.leg.tempC),
    Wind: windString(result),
    PA: Math.round(result.pressureAltitudeFt),
    DA: Math.round(result.densityAltitudeFt),
    TODA: row ? Math.round(row.todaM) : "",
    TODR: row ? Math.round(row.takeoff50M) : "",
    LDA: row ? Math.round(row.ldaM) : "",
    LDR: row ? Math.round(row.landing50M) : "",
    ROC: row ? Math.round(row.rocFpm) : "",
  };
}

function setText(form: ReturnType<PDFDocument["getForm"]>, name: string, value: unknown) {
  try {
    form.getTextField(name).setText(clean(value));
  } catch {
    // Template revisions do not always contain every legacy field.
  }
}

function fieldRect(
  form: ReturnType<PDFDocument["getForm"]>,
  name: string
): Rect | null {
  try {
    const field = form.getField(name) as unknown as {
      acroField: {
        getWidgets(): Array<{ getRectangle(): Rect }>;
      };
    };
    return field.acroField.getWidgets()[0]?.getRectangle() ?? null;
  } catch {
    return null;
  }
}

function splitRect(rect: Rect) {
  return [
    { ...rect, width: rect.width / 2 },
    { ...rect, x: rect.x + rect.width / 2, width: rect.width / 2 },
  ] as const;
}

function drawCentered(
  page: PDFPage,
  rect: Rect,
  value: unknown,
  font: PDFFont,
  size = 6.3
) {
  const text = clean(value);
  if (!text) return;
  let selected = size;
  while (selected > 4.5 && font.widthOfTextAtSize(text, selected) > rect.width - 3) {
    selected -= 0.2;
  }
  const width = font.widthOfTextAtSize(text, selected);
  page.drawText(text, {
    x: rect.x + Math.max(1.5, (rect.width - width) / 2),
    y: rect.y + rect.height / 2 - selected * 0.34,
    size: selected,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawSplitField(
  page: PDFPage,
  rect: Rect,
  leftValue: unknown,
  rightValue: unknown,
  font: PDFFont
) {
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 0.45,
  });
  const [left, right] = splitRect(rect);
  page.drawLine({
    start: { x: right.x, y: rect.y },
    end: { x: right.x, y: rect.y + rect.height },
    thickness: 0.45,
    color: rgb(0.15, 0.15, 0.15),
  });
  drawCentered(page, left, leftValue, font);
  drawCentered(page, right, rightValue, font);
}

export async function buildP2008PerformancePdfV2(
  input: BuildP2008PerformancePdfV2Input
) {
  const response = await fetch(TEMPLATE_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("P2008 performance template is unavailable.");
  const pdf = await PDFDocument.load(await response.arrayBuffer());
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const plan = recalculateFuelPlan(input.fuelPlan);
  const crewKg =
    Number(input.mbInput.studentKg ?? 0) + Number(input.mbInput.instructorKg ?? 0);
  const values: Record<string, unknown> = {
    Aircraf_Reg: input.registration,
    Date: dateForPdf(input.date),
    EmptyWeight_W: n(input.mb.empty.weightKg, 0),
    EmptyWeight_A: n(input.mb.empty.armM, 3),
    EmptyWeight_M: n(input.mb.empty.momentKgM, 0),
    "Pilot&Passenger_W": `${Math.round(
      Number(input.mbInput.studentKg ?? 0)
    )}+${Math.round(Number(input.mbInput.instructorKg ?? 0))}=${Math.round(
      crewKg
    )}`,
    "Pilot&Passenger_M": n(input.mb.pilotPassenger.momentKgM, 0),
    Baggage_W: n(input.mb.baggage.weightKg, 0),
    Baggage_M: n(input.mb.baggage.momentKgM, 0),
    Fuel_W: n(input.mb.fuel.weightKg, 0),
    Fuel_M: n(input.mb.fuel.momentKgM, 0),
    TOTAL_W: n(input.mb.total.weightKg, 0),
    TOTAL_M: n(input.mb.total.momentKgM, 0),
    CG: n(input.mb.total.cgM ?? 0, 3),
    Taxi_T: formatFuelTime(plan.taxiMin),
    Taxi_F: formatFuelLiters(Math.round(plan.taxiFuelL)),
    Climb_T: formatFuelTime(plan.climbMin),
    Climb_F: formatFuelLiters(Math.round(plan.climbFuelL)),
    Enroute_T: formatFuelTime(plan.enrouteMin),
    Enroute_F: formatFuelLiters(Math.round(plan.enrouteFuelL)),
    Descent_T: formatFuelTime(plan.descentMin),
    Descent_F: formatFuelLiters(Math.round(plan.descentFuelL)),
    Trip_T: formatFuelTime(plan.tripMin),
    Trip_F: formatFuelLiters(Math.round(plan.tripFuelL)),
    Contingency_T: formatFuelTime(plan.contingencyMin),
    Contingency_F: formatFuelLiters(Math.round(plan.contingencyFuelL)),
    Alternate_T: formatFuelTime(plan.alternateMin),
    Alternate_F: formatFuelLiters(Math.round(plan.alternateFuelL)),
    Reserve_T: formatFuelTime(plan.reserveMin),
    Reserve_F: formatFuelLiters(Math.round(plan.reserveFuelL)),
    Ramp_T: formatFuelTime(plan.requiredRampMin),
    Ramp_F: formatFuelLiters(Math.round(plan.requiredRampFuelL)),
    Extra_T: formatFuelTime(plan.extraMin),
    Extra_F: formatFuelLiters(Math.round(plan.extraFuelL)),
    Total_T: formatFuelTime(plan.totalRampMin),
    Total_F: formatFuelLiters(Math.round(plan.totalRampFuelL)),
  };

  const regularRoles: Array<["Dep" | "Arr", PerformanceLegRole]> = [
    ["Dep", "Departure"],
    ["Arr", "Arrival"],
  ];
  for (const [suffix, role] of regularRoles) {
    const roleData = roleValues(
      resultForRole(input.performanceResults, role),
      rowForRole(input.rows, role)
    );
    Object.entries(roleData).forEach(([key, value]) => {
      values[`${key}_${suffix}`] = value;
    });
  }

  const alternateFieldNames = [
    "Airfield_Alt",
    "QFU_Alt",
    "Elev_Alt",
    "QNH_Alt",
    "Temp_Alt",
    "Wind_Alt",
    "PA_Alt",
    "DA_Alt",
    "TODA_Alt",
    "TODR_Alt",
    "LDA_Alt",
    "LDR_Alt",
    "ROC_Alt",
  ];
  const alternateRects = new Map(
    alternateFieldNames.map((name) => [name, fieldRect(form, name)] as const)
  );
  alternateFieldNames.forEach((name) => {
    values[name] = "";
  });
  Object.entries(values).forEach(([name, value]) => setText(form, name, value));
  try {
    form.updateFieldAppearances(font);
  } catch {
    // Keep generated appearances when the template rejects an update.
  }
  form.flatten();

  const page = pdf.getPages()[0];
  const alternate1 = roleValues(
    resultForRole(input.performanceResults, "Alternate"),
    rowForRole(input.rows, "Alternate")
  );
  const alternate2 = roleValues(
    resultForRole(input.performanceResults, "Alternate 2"),
    rowForRole(input.rows, "Alternate 2")
  );
  const fieldKey: Record<string, string> = {
    Airfield_Alt: "Airfield",
    QFU_Alt: "QFU",
    Elev_Alt: "Elev",
    QNH_Alt: "QNH",
    Temp_Alt: "Temp",
    Wind_Alt: "Wind",
    PA_Alt: "PA",
    DA_Alt: "DA",
    TODA_Alt: "TODA",
    TODR_Alt: "TODR",
    LDA_Alt: "LDA",
    LDR_Alt: "LDR",
    ROC_Alt: "ROC",
  };
  alternateFieldNames.forEach((name) => {
    const rect = alternateRects.get(name);
    if (!rect) return;
    const key = fieldKey[name];
    drawSplitField(page, rect, alternate1[key], alternate2[key], font);
  });

  const airfieldRect = alternateRects.get("Airfield_Alt");
  if (airfieldRect) {
    const headerRect = {
      x: airfieldRect.x,
      y: airfieldRect.y + airfieldRect.height + 2,
      width: airfieldRect.width,
      height: 11,
    };
    page.drawRectangle({ ...headerRect, color: rgb(1, 1, 1) });
    const [left, right] = splitRect(headerRect);
    drawCentered(page, left, "Alternate 1", bold, 5.5);
    drawCentered(page, right, "Alternate 2", bold, 5.5);
  }

  pdf.setTitle(`P2008 ${input.registration} M&B and Performance`);
  pdf.setCreator("Briefings");
  pdf.setProducer("Briefings");
  return pdf.save();
}

export function downloadP2008PerformancePdfV2(
  bytes: Uint8Array,
  registration: string,
  date: string
) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `P2008_${registration}_Performance_${date || "flight"}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
