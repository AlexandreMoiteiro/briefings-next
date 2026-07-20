import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import overlaysJson from "@/lib/performance/p2006t-climb-cruise-overlays.json";
import {
  p2006tClimbPerformance,
  p2006tCruisePerformance,
} from "@/lib/performance/p2006t-climb-cruise";
import { getP2006TPerformanceSettings } from "@/lib/performance/p2006t-performance-settings";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import {
  buildP2006TPerformancePdf as buildBasePdf,
  downloadP2006TPerformancePdf,
  type BuildP2006TPerformancePdfInput,
  type P2006TLoadingInput,
} from "./p2006t-performance-pdf";

export { downloadP2006TPerformancePdf };
export type { BuildP2006TPerformancePdfInput, P2006TLoadingInput };

type GridOverlay = {
  image: string;
  columns: number[];
  rows: number[];
};
type OverlayData = {
  climb: Record<P2006TRegistration, GridOverlay>;
  cruise: Record<
    P2006TRegistration,
    Record<"0" | "3000" | "6000" | "9000", GridOverlay>
  >;
};
type Bracket = {
  lower: number;
  upper: number;
  ratio: number;
  limited: boolean;
};
type CruiseRow = {
  sourceIndex: number;
  rpm: number;
  mapInHg: number;
  values: Array<{ powerPercent: number; ktas: number; fuelLph: number }>;
};

const OVERLAYS = overlaysJson as OverlayData;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const CLIMB_ALTITUDES = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000];
const CLIMB_TEMPERATURES = [-25, 0, 25, 50];
const CRUISE_ALTITUDES = [0, 3000, 6000, 9000];
const CRUISE_DEVIATIONS = [-30, 0, 30];

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function bracket(value: number, values: readonly number[]): Bracket {
  const ordered = [...values].sort((a, b) => a - b);
  const limitedValue = clamp(value, ordered[0], ordered[ordered.length - 1]);
  let lower = ordered[0];
  let upper = ordered[ordered.length - 1];
  for (const candidate of ordered) {
    if (candidate <= limitedValue) lower = candidate;
    if (candidate >= limitedValue) {
      upper = candidate;
      break;
    }
  }
  return {
    lower,
    upper,
    ratio: upper === lower ? 0 : (limitedValue - lower) / (upper - lower),
    limited: limitedValue !== value,
  };
}

function isaTemperatureC(altitudeFt: number) {
  return 15 - 1.9812 * (altitudeFt / 1000);
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

function drawNormalizedCell(
  page: PDFPage,
  overlay: GridOverlay,
  rowIndex: number,
  columnIndex: number,
  color = rgb(1, 0.69, 0)
) {
  if (
    rowIndex < 0 ||
    columnIndex < 0 ||
    overlay.rows[rowIndex] === undefined ||
    overlay.columns[columnIndex] === undefined
  ) {
    return;
  }
  const [top, bottom] = cellBounds(overlay.rows, rowIndex);
  const [left, right] = cellBounds(overlay.columns, columnIndex);
  page.drawRectangle({
    x: left * PAGE_WIDTH,
    y: (1 - bottom) * PAGE_HEIGHT,
    width: (right - left) * PAGE_WIDTH,
    height: (bottom - top) * PAGE_HEIGHT,
    color,
    opacity: 0.25,
    borderColor: rgb(0.9, 0.25, 0.02),
    borderWidth: 1.15,
  });
}

function drawNormalizedRow(
  page: PDFPage,
  overlay: GridOverlay,
  rowIndex: number,
  color = rgb(1, 0.76, 0.05)
) {
  if (overlay.rows[rowIndex] === undefined || overlay.columns.length < 2) return;
  const [top, bottom] = cellBounds(overlay.rows, rowIndex);
  const [left] = cellBounds(overlay.columns, 0);
  const [, right] = cellBounds(overlay.columns, overlay.columns.length - 1);
  page.drawRectangle({
    x: left * PAGE_WIDTH,
    y: (1 - bottom) * PAGE_HEIGHT,
    width: (right - left) * PAGE_WIDTH,
    height: (bottom - top) * PAGE_HEIGHT,
    color,
    opacity: 0.16,
    borderColor: rgb(0.92, 0.32, 0.02),
    borderWidth: 1.0,
  });
}

function drawNotes(
  page: PDFPage,
  title: string,
  lines: string[],
  font: PDFFont,
  bold: PDFFont
) {
  const rect = { x: 48, y: 18, width: 499, height: 82 };
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    opacity: 0.96,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 0.65,
  });
  page.drawText(clean(title), {
    x: rect.x + 8,
    y: rect.y + rect.height - 14,
    size: 7.5,
    font: bold,
    color: rgb(0.04, 0.04, 0.04),
  });
  lines.slice(0, 5).forEach((line, index) => {
    page.drawText(clean(line), {
      x: rect.x + 8,
      y: rect.y + rect.height - 27 - index * 10.5,
      size: 6.6,
      font,
      color: rgb(0.08, 0.08, 0.08),
    });
  });
}

function maximumWeight(registration: P2006TRegistration) {
  return registration === "CS-EAQ" ? 1180 : 1230;
}

function roleWeight(row: P2006TPerformanceRow) {
  return row.role === "Departure" ? row.takeoffWeightKg : row.landingWeightKg;
}

function roleName(row: P2006TPerformanceRow) {
  return row.role === "Alternate" ? "Alternate 1" : row.role;
}

function climbSelection(
  registration: P2006TRegistration,
  row: P2006TPerformanceRow
) {
  const requestedWeight = roleWeight(row);
  const weightBracket = bracket(requestedWeight, [930, 1080, maximumWeight(registration)]);
  const altitudeBracket = bracket(row.paFt, CLIMB_ALTITUDES);
  const temperatureBracket = bracket(row.oatC, CLIMB_TEMPERATURES);
  const tableWeightOrder = [maximumWeight(registration), 1080, 930];
  const weightValues = Array.from(
    new Set([weightBracket.lower, weightBracket.upper])
  );
  const altitudeValues = Array.from(
    new Set([altitudeBracket.lower, altitudeBracket.upper])
  );
  const temperatureValues = Array.from(
    new Set([temperatureBracket.lower, temperatureBracket.upper])
  );

  return {
    requestedWeight,
    weightBracket,
    altitudeBracket,
    temperatureBracket,
    cells: weightValues.flatMap((weight) => {
      const block = tableWeightOrder.indexOf(weight);
      return altitudeValues.flatMap((altitude) => {
        const altitudeIndex = CLIMB_ALTITUDES.indexOf(altitude);
        const rowIndex = block * CLIMB_ALTITUDES.length + altitudeIndex;
        return temperatureValues.map((temperature) => ({
          rowIndex,
          speedColumn: 1,
          rateColumn: 2 + CLIMB_TEMPERATURES.indexOf(temperature),
        }));
      });
    }),
  };
}

async function appendClimbPages(
  pdf: PDFDocument,
  registration: P2006TRegistration,
  rows: P2006TPerformanceRow[],
  font: PDFFont,
  bold: PDFFont
) {
  const overlay = OVERLAYS.climb[registration];
  for (const row of rows) {
    const response = await fetch(overlay.image, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Cannot load ${overlay.image}.`);
    const image = await pdf.embedPng(await response.arrayBuffer());
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawImage(image, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });

    const selection = climbSelection(registration, row);
    selection.cells.forEach((cell) => {
      drawNormalizedCell(page, overlay, cell.rowIndex, cell.speedColumn, rgb(0.2, 0.55, 1));
      drawNormalizedCell(page, overlay, cell.rowIndex, cell.rateColumn);
    });

    const isaDeviation = row.oatC - isaTemperatureC(row.paFt);
    const settings = getP2006TPerformanceSettings();
    const result = p2006tClimbPerformance(registration, row.paFt, {
      weightKg: selection.requestedWeight,
      isaDeviationC: isaDeviation,
      cruiseRpm: settings.cruiseRpm,
      cruisePowerPercent: settings.cruisePowerPercent,
    });
    drawNotes(
      page,
      `${roleName(row)} ${row.icao} - ENROUTE RATE OF CLIMB AT Vy`,
      [
        `Requested: W ${selection.requestedWeight.toFixed(0)} kg / PA ${row.paFt.toFixed(
          0
        )} ft / OAT ${row.oatC.toFixed(0)} C`,
        `Weight ${selection.weightBracket.lower}-${selection.weightBracket.upper} kg (${(
          selection.weightBracket.ratio * 100
        ).toFixed(0)}%)`,
        `Altitude ${selection.altitudeBracket.lower}-${selection.altitudeBracket.upper} ft (${(
          selection.altitudeBracket.ratio * 100
        ).toFixed(0)}%)`,
        `Temperature ${selection.temperatureBracket.lower}-${selection.temperatureBracket.upper} C (${(
          selection.temperatureBracket.ratio * 100
        ).toFixed(0)}%)`,
        result
          ? `Vy ${result.tasKt.toFixed(0)} KTAS / ROC ${result.rateFpm?.toFixed(0) ?? "-"} fpm`
          : "No valid climb result",
      ],
      font,
      bold
    );
  }
}

function parseCruiseRows(text: string, altitudeFt: number): CruiseRow[] {
  const lines = text.replace(/\u00a0/g, " ").split(/\r?\n/);
  const marker = new RegExp(`Pressure\\s+Altitude:\\s*${altitudeFt}\\s*ft`, "i");
  const start = lines.findIndex((line) => marker.test(line));
  if (start < 0) return [];
  const next = lines.findIndex(
    (line, index) => index > start && /Pressure\s+Altitude:\s*\d+\s*ft/i.test(line)
  );
  const block = lines.slice(start + 1, next > start ? next : undefined);
  return block
    .map((line) => line.trim())
    .filter((line) => /^(?:1900|2100|2250|2388)\s+/.test(line))
    .map((line, sourceIndex) => ({
      sourceIndex,
      numbers: line.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [],
    }))
    .filter((item) => item.numbers.length >= 11)
    .map(({ sourceIndex, numbers }) => ({
      sourceIndex,
      rpm: numbers[0],
      mapInHg: numbers[1],
      values: [
        { powerPercent: numbers[2], ktas: numbers[3], fuelLph: numbers[4] },
        { powerPercent: numbers[5], ktas: numbers[6], fuelLph: numbers[7] },
        { powerPercent: numbers[8], ktas: numbers[9], fuelLph: numbers[10] },
      ],
    }));
}

function cruisePowerAtDeviation(row: CruiseRow, deviationC: number) {
  const temperature = bracket(deviationC, CRUISE_DEVIATIONS);
  const lowerIndex = CRUISE_DEVIATIONS.indexOf(temperature.lower);
  const upperIndex = CRUISE_DEVIATIONS.indexOf(temperature.upper);
  const lower = row.values[lowerIndex];
  const upper = row.values[upperIndex];
  return lower.powerPercent + (upper.powerPercent - lower.powerPercent) * temperature.ratio;
}

function selectCruiseRows(
  rows: CruiseRow[],
  rpm: number,
  powerPercent: number,
  deviationC: number
) {
  const candidates = rows
    .filter((row) => row.rpm === rpm)
    .map((row) => ({ row, power: cruisePowerAtDeviation(row, deviationC) }))
    .sort((a, b) => a.power - b.power);
  if (!candidates.length) return [];
  const powerBracket = bracket(
    powerPercent,
    candidates.map((candidate) => candidate.power)
  );
  const lower = candidates.find((candidate) => candidate.power === powerBracket.lower);
  const upper = candidates.find((candidate) => candidate.power === powerBracket.upper);
  return Array.from(
    new Set([lower?.row.sourceIndex, upper?.row.sourceIndex].filter((value): value is number => value !== undefined))
  );
}

function cruiseGroupColumns(overlay: GridOverlay, deviationC: number) {
  const deviation = bracket(deviationC, CRUISE_DEVIATIONS);
  const groups = Array.from(new Set([deviation.lower, deviation.upper])).map((value) =>
    CRUISE_DEVIATIONS.indexOf(value)
  );
  const groupSize = overlay.columns.length >= 14 ? 4 : 3;
  return groups.flatMap((group) =>
    Array.from({ length: Math.min(3, groupSize) }, (_, offset) => 2 + group * groupSize + offset)
  );
}

async function appendCruisePages(
  pdf: PDFDocument,
  registration: P2006TRegistration,
  font: PDFFont,
  bold: PDFFont
) {
  const settings = getP2006TPerformanceSettings();
  const altitude = bracket(settings.cruiseAltitudeFt, CRUISE_ALTITUDES);
  const altitudeValues = Array.from(new Set([altitude.lower, altitude.upper]));
  const result = p2006tCruisePerformance(registration, settings.cruiseAltitudeFt, {
    weightKg: 1150,
    isaDeviationC: settings.isaDeviationC,
    cruiseRpm: settings.cruiseRpm,
    cruisePowerPercent: settings.cruisePowerPercent,
  });

  for (const altitudeFt of altitudeValues) {
    const overlay = OVERLAYS.cruise[registration][String(altitudeFt) as "0" | "3000" | "6000" | "9000"];
    const textResponse = await fetch(overlay.image.replace(/\.png$/, ".txt"), {
      cache: "force-cache",
    });
    const imageResponse = await fetch(overlay.image, { cache: "force-cache" });
    if (!textResponse.ok || !imageResponse.ok) {
      throw new Error(`Cannot load cruise AFM table at ${altitudeFt} ft.`);
    }
    const tableRows = parseCruiseRows(await textResponse.text(), altitudeFt);
    const selectedRows = selectCruiseRows(
      tableRows,
      settings.cruiseRpm,
      settings.cruisePowerPercent,
      settings.isaDeviationC
    );
    const image = await pdf.embedPng(await imageResponse.arrayBuffer());
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawImage(image, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    selectedRows.forEach((rowIndex) => {
      drawNormalizedRow(page, overlay, rowIndex);
      [0, 1, ...cruiseGroupColumns(overlay, settings.isaDeviationC)].forEach(
        (columnIndex) => drawNormalizedCell(page, overlay, rowIndex, columnIndex)
      );
    });
    drawNotes(
      page,
      `CRUISE PERFORMANCE - ${registration} - ${altitudeFt.toLocaleString("en-US")} ft table`,
      [
        `Requested altitude ${settings.cruiseAltitudeFt} ft / ISA deviation ${settings.isaDeviationC} C`,
        `Altitude interpolation ${altitude.lower}-${altitude.upper} ft (${(
          altitude.ratio * 100
        ).toFixed(0)}%)`,
        `RPM ${settings.cruiseRpm} / requested power ${settings.cruisePowerPercent}%`,
        result
          ? `Result ${result.tasKt.toFixed(0)} KTAS / ${result.fuelFlowLh.toFixed(
              1
            )} L/h both engines / ${result.powerPercent?.toFixed(0) ?? "-"}%`
          : "No valid cruise result",
        "Published cruise tables use 1150 kg; no invented weight correction is applied.",
      ],
      font,
      bold
    );
  }
}

export async function buildP2006TPerformancePdf(
  input: BuildP2006TPerformancePdfInput
) {
  const settings = getP2006TPerformanceSettings();
  const rowsWithClimb = input.rows.map((row) => {
    const isaDeviation = row.oatC - isaTemperatureC(row.paFt);
    const climb = p2006tClimbPerformance(input.registration, row.paFt, {
      weightKg: roleWeight(row),
      isaDeviationC: isaDeviation,
      cruiseRpm: settings.cruiseRpm,
      cruisePowerPercent: settings.cruisePowerPercent,
    });
    return {
      ...row,
      rocFpm: climb?.rateFpm ?? row.rocFpm,
    };
  });

  const baseBytes = await buildBasePdf({ ...input, rows: rowsWithClimb });
  const pdf = await PDFDocument.load(baseBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  await appendClimbPages(pdf, input.registration, rowsWithClimb, font, bold);
  await appendCruisePages(pdf, input.registration, font, bold);
  return pdf.save();
}
