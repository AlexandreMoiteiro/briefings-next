import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
import {
  P2006T_OEI_TEMPERATURES_C,
  getP2006TOeiTables,
  getP2006TOeiTraceCells,
} from "@/lib/performance/p2006t-oei-table";
import { calculateP2006TOeiPerformance } from "@/lib/performance/p2006t-oei";
import { getP2006TPerformanceSettings } from "@/lib/performance/p2006t-performance-settings";
import { p2006tClimbPerformance } from "@/lib/performance/p2006t-climb-cruise";
import { getP2006TDownloadMode } from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV21,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v21";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const FEET_PER_MINUTE_PER_KNOT = 101.268591;

type Rect = { x: number; y: number; width: number; height: number };
type Purpose = "gradient" | "ceiling";

function whole(value: number) {
  return Math.round(Number(value || 0));
}

function oneDecimal(value: number) {
  return Number(value || 0).toFixed(1);
}

function centerText(
  page: PDFPage,
  text: string,
  rect: Rect,
  font: PDFFont,
  size: number,
  color = rgb(0.06, 0.07, 0.09)
) {
  let fitted = size;
  while (fitted > 4.2 && font.widthOfTextAtSize(text, fitted) > rect.width - 3) {
    fitted -= 0.2;
  }
  const width = font.widthOfTextAtSize(text, fitted);
  page.drawText(text, {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - fitted) / 2 + 0.8,
    size: fitted,
    font,
    color,
  });
}

function interpolateTemperature(
  rates: readonly number[],
  temperatureC: number
) {
  const temperatures = P2006T_OEI_TEMPERATURES_C;
  const limited = Math.max(
    temperatures[0],
    Math.min(temperatures[temperatures.length - 1], temperatureC)
  );
  let upperIndex = temperatures.findIndex((temperature) => temperature >= limited);
  if (upperIndex < 0) upperIndex = temperatures.length - 1;
  const lowerIndex = Math.max(0, upperIndex - 1);
  const lowerTemperature = temperatures[lowerIndex];
  const upperTemperature = temperatures[upperIndex];
  if (lowerTemperature === upperTemperature) return rates[lowerIndex];
  const ratio =
    (limited - lowerTemperature) / (upperTemperature - lowerTemperature);
  return rates[lowerIndex] + (rates[upperIndex] - rates[lowerIndex]) * ratio;
}

function isaRate(altitudeFt: number, rates: readonly number[]) {
  const isaTemperatureC = 15 - 1.9812 * (altitudeFt / 1000);
  return interpolateTemperature(rates, isaTemperatureC);
}

function purposeTone(purposes: Set<Purpose>) {
  if (purposes.size > 1) {
    return {
      fill: rgb(0.55, 0.2, 0.75),
      border: rgb(0.4, 0.08, 0.62),
    };
  }
  if (purposes.has("ceiling")) {
    return {
      fill: rgb(0.05, 0.42, 0.82),
      border: rgb(0.02, 0.26, 0.68),
    };
  }
  return {
    fill: rgb(1, 0.62, 0.02),
    border: rgb(0.86, 0.25, 0.01),
  };
}

function tracePurposes(
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow
) {
  const calculation = calculateP2006TOeiPerformance({
    registration: input.registration,
    weightKg: row.takeoffWeightKg,
    pressureAltitudeFt: row.paFt,
    oatC: row.oatC,
  });
  const cells = getP2006TOeiTraceCells({
    registration: input.registration,
    weightKg: row.takeoffWeightKg,
    pressureAltitudeFt: row.paFt,
    oatC: row.oatC,
    calculation,
  });
  const purposes = new Map<string, Set<Purpose>>();
  cells.forEach((cell) => {
    const key = `${cell.rowIndex}:${cell.columnIndex}`;
    const set = purposes.get(key) ?? new Set<Purpose>();
    set.add(cell.purpose);
    purposes.set(key, set);
  });
  return purposes;
}

function drawHeader(
  page: PDFPage,
  target: Rect,
  widths: number[],
  regular: PDFFont,
  bold: PDFFont
) {
  const headerHeight = 30;
  const rowHeight = headerHeight / 2;
  const top = target.y + target.height;
  const bottom = top - headerHeight;
  const rateStart = target.x + widths[0] + widths[1] + widths[2];

  page.drawRectangle({
    x: target.x,
    y: bottom,
    width: target.width,
    height: headerHeight,
    color: rgb(0.84, 0.85, 0.87),
    borderColor: rgb(0.22, 0.24, 0.27),
    borderWidth: 0.65,
  });

  let x = target.x;
  widths.slice(0, -1).forEach((width, index) => {
    x += width;
    page.drawLine({
      start: { x, y: bottom },
      end: {
        x,
        y: index >= 2 ? top - rowHeight : top,
      },
      thickness: 0.45,
      color: rgb(0.28, 0.3, 0.33),
    });
  });
  page.drawLine({
    start: { x: rateStart, y: top - rowHeight },
    end: { x: target.x + target.width, y: top - rowHeight },
    thickness: 0.45,
    color: rgb(0.28, 0.3, 0.33),
  });

  centerText(
    page,
    "W kg",
    { x: target.x, y: bottom, width: widths[0], height: headerHeight },
    bold,
    6.2
  );
  centerText(
    page,
    "PA ft",
    {
      x: target.x + widths[0],
      y: bottom,
      width: widths[1],
      height: headerHeight,
    },
    bold,
    6.2
  );
  centerText(
    page,
    "VySE",
    {
      x: target.x + widths[0] + widths[1],
      y: bottom,
      width: widths[2],
      height: headerHeight,
    },
    bold,
    6.3
  );
  centerText(
    page,
    "OEI ROC (ft/min)",
    {
      x: rateStart,
      y: top - rowHeight,
      width: target.x + target.width - rateStart,
      height: rowHeight,
    },
    bold,
    6.3
  );

  const labels = ["-25 C", "0 C", "25 C", "50 C", "ISA"];
  let labelX = rateStart;
  labels.forEach((label, index) => {
    centerText(
      page,
      label,
      {
        x: labelX,
        y: bottom,
        width: widths[index + 3],
        height: rowHeight,
      },
      index === labels.length - 1 ? bold : regular,
      5.8
    );
    labelX += widths[index + 3];
  });
}

function drawOeiTable(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow,
  panel: Rect,
  regular: PDFFont,
  bold: PDFFont
) {
  const target: Rect = {
    x: panel.x + 10,
    y: panel.y + 10,
    width: panel.width * 0.55,
    height: panel.height - 36,
  };
  const fractions = [0.11, 0.13, 0.12, 0.128, 0.128, 0.128, 0.128, 0.128];
  const widths = fractions.map((fraction) => target.width * fraction);
  const headerHeight = 30;
  const tables = getP2006TOeiTables(input.registration);
  const rows = tables.flatMap((table) =>
    table.rows.map((sourceRow) => ({ weightKg: table.weightKg, sourceRow }))
  );
  const rowHeight = (target.height - headerHeight) / rows.length;
  const purposes = tracePurposes(input, row);

  page.drawRectangle({
    x: target.x - 2,
    y: target.y - 2,
    width: target.width + 4,
    height: target.height + 4,
    color: rgb(1, 1, 1),
  });
  drawHeader(page, target, widths, regular, bold);

  rows.forEach((entry, rowIndex) => {
    const y = target.y + target.height - headerHeight - (rowIndex + 1) * rowHeight;
    const values = [
      String(whole(entry.weightKg)),
      entry.sourceRow.altitudeFt === 0
        ? "S.L."
        : String(whole(entry.sourceRow.altitudeFt)),
      String(whole(entry.sourceRow.vyseKias)),
      ...entry.sourceRow.ratesFpm.map((rate) => String(whole(rate))),
      String(whole(isaRate(entry.sourceRow.altitudeFt, entry.sourceRow.ratesFpm))),
    ];
    const groupIndex = Math.floor(rowIndex / 8);
    const base = groupIndex % 2 === 0 ? rgb(0.975, 0.978, 0.982) : rgb(1, 1, 1);

    let x = target.x;
    values.forEach((value, columnIndex) => {
      const rect = { x, y, width: widths[columnIndex], height: rowHeight };
      const sourceColumnIndex =
        columnIndex === 2 ? 0 : columnIndex >= 3 && columnIndex <= 6 ? columnIndex - 2 : -1;
      const selected =
        sourceColumnIndex >= 0
          ? purposes.get(`${rowIndex}:${sourceColumnIndex}`)
          : undefined;

      page.drawRectangle({
        ...rect,
        color: selected ? purposeTone(selected).fill : base,
        opacity: selected ? 0.25 : 1,
        borderColor: selected
          ? purposeTone(selected).border
          : rgb(0.48, 0.5, 0.54),
        borderWidth: selected ? 0.75 : 0.32,
      });
      centerText(
        page,
        value,
        rect,
        columnIndex === 0 || columnIndex === 2 || columnIndex === 7
          ? bold
          : regular,
        5.55
      );
      x += widths[columnIndex];
    });

    if (rowIndex === 8 || rowIndex === 16) {
      page.drawLine({
        start: { x: target.x, y: y + rowHeight },
        end: { x: target.x + target.width, y: y + rowHeight },
        thickness: 1,
        color: rgb(0.15, 0.16, 0.18),
      });
    }
  });

  page.drawRectangle({
    ...target,
    borderColor: rgb(0.18, 0.2, 0.23),
    borderWidth: 0.75,
  });
}

function enrouteClimb(input: BuildP2006TPerformancePdfV3Input) {
  const settings = getP2006TPerformanceSettings();
  const departure =
    input.rows.find((row) => row.role === "Departure") ?? input.rows[0];
  if (!departure) return null;

  const temperatureC =
    input.cruiseTemperatureC ??
    departure.oatC -
      1.9812 * ((settings.cruiseAltitudeFt - departure.paFt) / 1000);
  const isaDeviationC =
    temperatureC - (15 - 1.9812 * (settings.cruiseAltitudeFt / 1000));
  const climb = p2006tClimbPerformance(
    input.registration,
    settings.cruiseAltitudeFt,
    {
      weightKg: input.mission.takeoff.massKg,
      isaDeviationC,
      cruiseRpm: settings.cruiseRpm,
      cruisePowerPercent: settings.cruisePowerPercent,
    }
  );
  if (!climb) return null;

  const groundSpeedKt = Math.max(1, climb.tasKt - departure.headwindKt);
  const gradientPct =
    (Math.max(0, climb.rateFpm ?? 0) /
      Math.max(1, groundSpeedKt * FEET_PER_MINUTE_PER_KNOT)) *
    100;
  return { departure, climb, groundSpeedKt, gradientPct };
}

function redrawVyGradient(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input,
  bold: PDFFont
) {
  const pageIndex = input.rows.length;
  if (pageIndex >= output.getPageCount()) return;
  const result = enrouteClimb(input);
  if (!result?.climb.rateFpm) return;

  const page = output.getPage(pageIndex);
  const size = page.getSize();
  const component = result.departure.headwindKt >= 0 ? "HW" : "TW";
  const componentKt = whole(Math.abs(result.departure.headwindKt));

  page.drawRectangle({
    x: 40,
    y: 18,
    width: size.width - 80,
    height: 21,
    color: rgb(1, 1, 1),
  });
  page.drawText(
    `Vy climb gradient using departure wind: TAS ~${whole(
      result.climb.tasKt
    )} kt | ${component} ~${componentKt} kt -> GS ~${whole(
      result.groundSpeedKt
    )} kt; ${whole(result.climb.rateFpm)} / (${whole(
      result.groundSpeedKt
    )} x 101.27) x 100 = ~${oneDecimal(result.gradientPct)}%.`,
    {
      x: 44,
      y: 25.5,
      size: 6.9,
      font: bold,
      color: rgb(0.05, 0.06, 0.09),
    }
  );
}

async function replaceCroppedTables(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() === 0) return bytes;
  const regular = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const page = output.getPage(output.getPageCount() - 1);

  const margin = 24;
  const gap = 16;
  const titleSpace = 42;
  const panelWidth = (A3_WIDTH - margin * 2 - gap) / 2;
  const panelHeight = (A3_HEIGHT - margin * 2 - titleSpace - gap) / 2;
  const panels: Rect[] = [
    {
      x: margin,
      y: margin + panelHeight + gap,
      width: panelWidth,
      height: panelHeight,
    },
    {
      x: margin + panelWidth + gap,
      y: margin + panelHeight + gap,
      width: panelWidth,
      height: panelHeight,
    },
    { x: margin, y: margin, width: panelWidth, height: panelHeight },
    {
      x: margin + panelWidth + gap,
      y: margin,
      width: panelWidth,
      height: panelHeight,
    },
  ];

  input.rows.slice(0, 4).forEach((row, index) => {
    drawOeiTable(page, input, row, panels[index], regular, bold);
  });
  redrawVyGradient(output, input, bold);

  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV21(input);
  return getP2006TDownloadMode() === "tables"
    ? replaceCroppedTables(bytes, input)
    : bytes;
}
