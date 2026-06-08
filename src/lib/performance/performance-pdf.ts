import { PDFDocument, StandardFonts, rgb, type PDFForm } from "pdf-lib";
import type {
  Pa28MbInput,
  Pa28MbResult,
  PerformanceAircraft,
  TecnamMbInput,
  TecnamMbResult,
} from "@/lib/performance/mb";
import {
  fuelLToPa28Lb,
  kgToLb,
  PA28,
  TECNAM,
} from "@/lib/performance/mb";
import type { PerformanceLegResult } from "@/lib/performance/aerodrome-performance";
import type { Pa28PerformanceRow } from "@/lib/performance/pa28-performance";
import type { TecnamPerformanceRow } from "@/lib/performance/tecnam-performance";

type BuildPerformancePdfInput = {
  aircraft: PerformanceAircraft;
  registration: string;
  mission: string;
  date: string;

  pa28Input: Pa28MbInput;
  pa28: Pa28MbResult;
  pa28PerformanceRows: Pa28PerformanceRow[];

  tecnamInput: TecnamMbInput;
  tecnam: TecnamMbResult;
  tecnamPerformanceRows: TecnamPerformanceRow[];

  performanceResults: PerformanceLegResult[];
  includePerformanceSummary: boolean;
};

const PA28_TEMPLATE_URL =
  "/legacy/templates/RVP.CFI.067.02PiperPA28MBandPerformanceSheet.pdf";

const TECNAM_TEMPLATE_URL =
  "/legacy/templates/TecnamP2008MBPerformanceSheet_MissionX.pdf";

function safe(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function fmt0(value: number) {
  if (!Number.isFinite(value)) return "";
  return Math.round(value).toString();
}

function fmt1(value: number) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(1);
}

function fmt2(value: number) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(2);
}

function fmt3(value: number) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(3);
}

function formatDateForPdf(dateIso: string) {
  const match = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return dateIso;

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function sanitizeFilenamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function textFieldNames(form: PDFForm) {
  return new Set(form.getFields().map((field) => field.getName()));
}

function setText(
  form: PDFForm,
  existingNames: Set<string>,
  names: string | string[],
  value: unknown,
  fontSize = 8
) {
  const candidates = Array.isArray(names) ? names : [names];

  for (const name of candidates) {
    if (!existingNames.has(name)) continue;

    try {
      const field = form.getTextField(name);
      field.setText(safe(value));

      try {
        field.setFontSize(fontSize);
      } catch {
        // Field-level font size may fail on some templates.
      }
    } catch {
      // Ignore unsupported field types.
    }
  }
}

async function loadTemplate(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not load template ${url}.`);
  }

  const bytes = await response.arrayBuffer();

  return PDFDocument.load(bytes);
}

function pa28WeightString(lb: number) {
  if (!Number.isFinite(lb) || lb <= 0) return "0";

  return `${fmt0(lb)} (${fmt0(lb / 2.2046226218)}kg)`;
}

function pa28FuelWeightString(fuelL: number) {
  const fuel = fuelLToPa28Lb(fuelL);

  if (fuel.fuelLb <= 0) return "0";

  return `${fmt0(fuel.fuelLb)} (${fmt0(fuel.fuelUsg)}USG/${fmt0(fuelL)}L)`;
}

function fillPa28Pdf({
  form,
  names,
  registration,
  date,
  pa28Input,
  pa28,
}: {
  form: PDFForm;
  names: Set<string>;
  registration: string;
  date: string;
  pa28Input: Pa28MbInput;
  pa28: Pa28MbResult;
}) {
  const frontLb = kgToLb(pa28Input.frontKg);
  const rearLb = kgToLb(pa28Input.rearKg);
  const baggageLb = kgToLb(pa28Input.baggageKg);
  const fuel = fuelLToPa28Lb(pa28Input.fuelL);

  const emptyCg =
    pa28Input.emptyWeightLb > 0
      ? pa28Input.emptyMomentInLb / pa28Input.emptyWeightLb
      : 0;

  setText(form, names, "Date", formatDateForPdf(date));
  setText(
    form,
    names,
    [
      "Aircraft_Reg",
      "Aircraft_Reg.",
      "Aircraft Reg.",
      "Aircraft_Reg__",
      "Aircraft_Reg_",
    ],
    registration
  );

  setText(
    form,
    names,
    [
      "MTOW",
      "MTOW_LB",
      "Max_Takeoff_Weight",
      "Maximum_Takeoff_Weight",
      "MaxTakeoffWeight",
      "Max_Takeoff_Wt",
    ],
    fmt0(PA28.mtowLb)
  );

  setText(
    form,
    names,
    [
      "MLW",
      "MLW_LB",
      "Max_Landing_Weight",
      "Maximum_Landing_Weight",
      "MaxLandingWeight",
      "Max_Landing_Wt",
    ],
    fmt0(PA28.mlwLb)
  );

  setText(form, names, "Weight_EMPTY", pa28WeightString(pa28Input.emptyWeightLb));
  setText(form, names, "Moment_EMPTY", fmt0(pa28Input.emptyMomentInLb));
  setText(form, names, "Datum_EMPTY", fmt1(emptyCg));

  setText(form, names, "Weight_FRONT", pa28WeightString(frontLb));
  setText(form, names, "Moment_FRONT", fmt0(frontLb * PA28.armFront));

  setText(form, names, "Weight_REAR", pa28WeightString(rearLb));
  setText(form, names, "Moment_REAR", fmt0(rearLb * PA28.armRear));

  setText(form, names, "Weight_FUEL", pa28FuelWeightString(pa28Input.fuelL));
  setText(form, names, "Moment_FUEL", fmt0(fuel.fuelLb * PA28.armFuel));

  setText(form, names, "Weight_BAGGAGE", pa28WeightString(baggageLb));
  setText(form, names, "Moment_BAGGAGE", fmt0(baggageLb * PA28.armBaggage));

  setText(form, names, "Weight_RAMP", pa28WeightString(pa28.ramp.weightLb));
  setText(form, names, "Moment_RAMP", fmt0(pa28.ramp.momentInLb));
  setText(form, names, "Datum_RAMP", fmt1(pa28.ramp.cgIn));

  setText(form, names, "Weight_TAKEOFF", pa28WeightString(pa28.takeoff.weightLb));
  setText(form, names, "Moment_TAKEOFF", fmt0(pa28.takeoff.momentInLb));
  setText(form, names, "Datum_TAKEOFF", fmt1(pa28.takeoff.cgIn));

  setText(form, names, "Weight_LANDING", pa28WeightString(pa28.landing.weightLb));
  setText(form, names, "Moment_LANDING", fmt0(pa28.landing.momentInLb));
  setText(form, names, "Datum_LANDING", fmt1(pa28.landing.cgIn));
}

function performanceResultByRole(
  performanceResults: PerformanceLegResult[],
  role: string
) {
  return performanceResults.find((result) => result.leg.role === role) ?? null;
}

function fillTecnamPdf({
  form,
  names,
  registration,
  date,
  tecnamInput,
  tecnam,
  tecnamPerformanceRows,
  performanceResults,
}: {
  form: PDFForm;
  names: Set<string>;
  registration: string;
  date: string;
  tecnamInput: TecnamMbInput;
  tecnam: TecnamMbResult;
  tecnamPerformanceRows: TecnamPerformanceRow[];
  performanceResults: PerformanceLegResult[];
}) {
  setText(form, names, "Aircraf_Reg", registration);
  setText(form, names, "Date", formatDateForPdf(date));

  setText(form, names, "EmptyWeight_W", fmt0(tecnamInput.emptyWeightKg));
  setText(
    form,
    names,
    "EmptyWeight_A",
    fmt3(tecnamInput.emptyMomentKgM / tecnamInput.emptyWeightKg)
  );
  setText(form, names, "EmptyWeight_M", fmt2(tecnamInput.emptyMomentKgM));

  setText(form, names, "Fuel_W", fmt0(tecnam.fuelKg));
  setText(form, names, "Fuel_M", fmt2(tecnam.fuel.momentKgM));

  setText(form, names, "Pilot&Passenger_W", fmt0(tecnamInput.pilotPassengerKg));
  setText(
    form,
    names,
    "Pilot&Passenger_M",
    fmt2(tecnamInput.pilotPassengerKg * TECNAM.pilotArm)
  );

  setText(form, names, "Baggage_W", fmt0(tecnamInput.baggageKg));
  setText(
    form,
    names,
    "Baggage_M",
    fmt2(tecnamInput.baggageKg * TECNAM.baggageArm)
  );

  setText(form, names, "TOTAL_W", fmt0(tecnam.total.weightKg));
  setText(form, names, "TOTAL_M", fmt2(tecnam.total.momentKgM));
  setText(form, names, "CG", fmt3(tecnam.total.cgM ?? 0));

  const roleSuffixes: Record<string, string> = {
    Departure: "Dep",
    Arrival: "Arr",
    Alternate: "Alt",
  };

  for (const [role, suffix] of Object.entries(roleSuffixes)) {
    const row =
      tecnamPerformanceRows.find((item) => item.role === role) ?? null;
    const result = performanceResultByRole(performanceResults, role);

    if (!row || !result?.aerodrome) continue;

    setText(form, names, `Airfield_${suffix}`, row.icao);
    setText(form, names, `QFU_${suffix}`, String(Math.round(row.qfu)).padStart(3, "0"));
    setText(form, names, `Elev_${suffix}`, fmt0(result.aerodrome.elev_ft));
    setText(form, names, `QNH_${suffix}`, fmt0(result.leg.qnhHpa));
    setText(form, names, `Temp_${suffix}`, fmt0(result.leg.tempC));
    setText(
      form,
      names,
      `Wind_${suffix}`,
      `${String(Math.round(result.leg.windFrom)).padStart(3, "0")}/${String(
        Math.round(result.leg.windKt)
      ).padStart(2, "0")}`
    );
    setText(form, names, `PA_${suffix}`, fmt0(row.paFt));
    setText(form, names, `DA_${suffix}`, fmt0(row.daFt));
    setText(form, names, `TODA_${suffix}`, fmt0(row.todaM));
    setText(
      form,
      names,
      `TODR_${suffix}`,
      `${fmt0(row.takeoff50M)} (${fmt0(row.takeoffPct)}%)`
    );
    setText(form, names, `LDA_${suffix}`, fmt0(row.ldaM));
    setText(
      form,
      names,
      `LDR_${suffix}`,
      `${fmt0(row.landing50M)} (${fmt0(row.landingPct)}%)`
    );
    setText(form, names, `ROC_${suffix}`, fmt0(row.rocFpm));
    setText(form, names, `Vy_${suffix}`, fmt0(row.vyKt));
  }
}

function addPerformanceSummaryPage(
  pdfDoc: PDFDocument,
  input: BuildPerformancePdfInput
) {
  const page = pdfDoc.addPage([842, 595]);
  const { width, height } = page.getSize();

  return pdfDoc.embedFont(StandardFonts.Helvetica).then((font) => {
    const titleFontSize = 18;
    const textFontSize = 9;
    const x = 44;
    let y = height - 42;

    page.drawText("Performance summary", {
      x,
      y,
      size: titleFontSize,
      font,
      color: rgb(0.05, 0.05, 0.05),
    });

    y -= 24;

    page.drawText(
      `${input.registration} · ${input.aircraft} · ${formatDateForPdf(
        input.date
      )}`,
      {
        x,
        y,
        size: 10,
        font,
        color: rgb(0.35, 0.35, 0.35),
      }
    );

    y -= 32;

    const rows =
      input.aircraft === "Piper PA-28"
        ? input.pa28PerformanceRows.map((row) => [
            row.label,
            `${row.toFt.toFixed(0)} ft`,
            `${row.rocFpm.toFixed(0)} fpm`,
            `${row.ldgFt.toFixed(0)} ft`,
            row.toMWithPct,
            row.ldgMWithPct,
          ])
        : input.tecnamPerformanceRows.map((row) => [
            `${row.role} ${row.icao}`,
            `${row.takeoff50M.toFixed(0)} m`,
            `${row.rocFpm.toFixed(0)} fpm`,
            `${row.landing50M.toFixed(0)} m`,
            `${row.takeoffMarginM.toFixed(0)} m`,
            `${row.landingMarginM.toFixed(0)} m`,
          ]);

    const headers =
      input.aircraft === "Piper PA-28"
        ? ["Leg", "Takeoff", "Climb", "Landing", "TODR PDF", "LDR PDF"]
        : ["Leg", "TODR", "ROC", "LDR", "TO margin", "LDG margin"];

    const colX = [44, 220, 330, 430, 540, 660];

    headers.forEach((header, index) => {
      page.drawText(header, {
        x: colX[index],
        y,
        size: textFontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    });

    y -= 14;

    page.drawLine({
      start: { x: 44, y },
      end: { x: width - 44, y },
      thickness: 0.7,
      color: rgb(0.75, 0.75, 0.75),
    });

    y -= 18;

    rows.forEach((row) => {
      row.forEach((cell, index) => {
        page.drawText(String(cell), {
          x: colX[index],
          y,
          size: textFontSize,
          font,
          color: rgb(0.15, 0.15, 0.15),
        });
      });

      y -= 18;
    });
  });
}

export async function buildPerformancePdf(input: BuildPerformancePdfInput) {
  const templateUrl =
    input.aircraft === "Piper PA-28" ? PA28_TEMPLATE_URL : TECNAM_TEMPLATE_URL;

  const pdfDoc = await loadTemplate(templateUrl);
  const form = pdfDoc.getForm();
  const names = textFieldNames(form);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  if (input.aircraft === "Piper PA-28") {
    fillPa28Pdf({
      form,
      names,
      registration: input.registration,
      date: input.date,
      pa28Input: input.pa28Input,
      pa28: input.pa28,
    });
  } else {
    fillTecnamPdf({
      form,
      names,
      registration: input.registration,
      date: input.date,
      tecnamInput: input.tecnamInput,
      tecnam: input.tecnam,
      tecnamPerformanceRows: input.tecnamPerformanceRows,
      performanceResults: input.performanceResults,
    });
  }

  form.updateFieldAppearances(font);

  if (input.includePerformanceSummary) {
    await addPerformanceSummaryPage(pdfDoc, input);
  }

  const bytes = await pdfDoc.save();

  const missionPart = sanitizeFilenamePart(input.mission);
  const aircraftPart = input.aircraft === "Piper PA-28" ? "PA28" : "P2008";

  return {
    bytes,
    filename: `${missionPart ? `${missionPart}_` : ""}${
      input.registration
    }_${aircraftPart}_MB_Perf.pdf`,
  };
}
