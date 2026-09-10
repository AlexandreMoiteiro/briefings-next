import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { calculateP2006TOeiPerformance } from "@/lib/performance/p2006t-oei";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV12,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v12";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A5_WIDTH = 420;
const A5_HEIGHT = 595;
const CONTENT_X = 24;
const CONTENT_WIDTH = A5_WIDTH - CONTENT_X * 2;

type CardOptions = {
  y: number;
  height: number;
  title: string;
  value: string;
  lines: string[];
  font: PDFFont;
  bold: PDFFont;
};

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function whole(value: number) {
  return Math.round(Number(value || 0));
}

function oneDecimal(value: number) {
  return Number(value || 0).toFixed(1);
}

function twoDecimals(value: number) {
  return Number(value || 0).toFixed(2);
}

function nearestTen(value: number) {
  return Math.round(Number(value || 0) / 10) * 10;
}

function signed(value: number, digits = 0) {
  const rounded = Number(value || 0).toFixed(digits);
  return `${value >= 0 ? "+" : ""}${rounded}`;
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  maximumLines = 2
) {
  const lines = wrapText(text, font, size, width).slice(0, maximumLines);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color: rgb(0.11, 0.12, 0.15),
    });
  });

  return y - lines.length * lineHeight;
}

function drawCard(page: PDFPage, options: CardOptions) {
  const { y, height, title, value, lines, font, bold } = options;
  page.drawRectangle({
    x: CONTENT_X,
    y,
    width: CONTENT_WIDTH,
    height,
    color: rgb(0.975, 0.978, 0.984),
    borderColor: rgb(0.76, 0.78, 0.82),
    borderWidth: 0.65,
  });
  page.drawText(clean(title), {
    x: CONTENT_X + 13,
    y: y + height - 21,
    size: 8.2,
    font: bold,
    color: rgb(0.3, 0.33, 0.39),
  });
  page.drawText(clean(value), {
    x: CONTENT_X + 13,
    y: y + height - 47,
    size: 17,
    font: bold,
    color: rgb(0.03, 0.05, 0.09),
  });

  let textY = y + height - 66;
  lines.forEach((line) => {
    textY = drawWrapped(
      page,
      line,
      CONTENT_X + 13,
      textY,
      CONTENT_WIDTH - 26,
      font,
      7.25,
      10,
      2
    );
    textY -= 2;
  });
}

function appendOeiKneeboard(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  const departure =
    input.rows.find((row) => row.role === "Departure") ?? input.rows[0];
  if (!departure) return;

  const oei = calculateP2006TOeiPerformance({
    registration: input.registration,
    weightKg: departure.takeoffWeightKg,
    pressureAltitudeFt: departure.paFt,
    oatC: departure.oatC,
  });
  const asdrM = departure.takeoffGroundRollM + departure.landingGroundRollM;
  const page = output.addPage([A5_WIDTH, A5_HEIGHT]);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: A5_WIDTH,
    height: A5_HEIGHT,
    color: rgb(1, 1, 1),
  });
  page.drawText("P2006T OEI KNEEBOARD", {
    x: CONTENT_X,
    y: A5_HEIGHT - 34,
    size: 16,
    font: bold,
    color: rgb(0.03, 0.05, 0.09),
  });
  page.drawText(
    clean(
      `${input.registration} | ${departure.icao} RWY ${departure.runway} | W ${whole(
        departure.takeoffWeightKg
      )} kg | PA ${whole(departure.paFt)} ft | OAT ${whole(departure.oatC)} C`
    ),
    {
      x: CONTENT_X,
      y: A5_HEIGHT - 52,
      size: 7.5,
      font,
      color: rgb(0.33, 0.35, 0.4),
    }
  );

  drawCard(page, {
    y: 413,
    height: 105,
    title: "ACCELERATE-STOP DISTANCE REQUIRED (ESTIMATE)",
    value: `${whole(asdrM)} m`,
    lines: [
      `ASDR = take-off ground roll + stopping ground roll = ${whole(
        departure.takeoffGroundRollM
      )} + ${whole(departure.landingGroundRollM)} = ${whole(asdrM)} m.`,
      "Uses the corrected departure-row ground-roll results; it is a planning estimate, not a separately published AFM ASDR table.",
    ],
    font,
    bold,
  });

  drawCard(page, {
    y: 263,
    height: 137,
    title: "OEI CLIMB GRADIENT - STILL AIR",
    value: `${twoDecimals(oei.gradientPct)} %`,
    lines: [
      `AFM ${oei.sourcePage}: VySE ${whole(oei.vyseKias)} KIAS, approximately ${oneDecimal(
        oei.tasKt
      )} KTAS, OEI ROC ${whole(oei.rocFpm)} ft/min.`,
      `Gradient = ROC / horizontal speed x 100 = ${whole(
        oei.rocFpm
      )} / (${oneDecimal(oei.tasKt)} x 101.27) x 100 = ${twoDecimals(
        oei.gradientPct
      )}%.`,
      "Configuration: operative engine at MCP, inoperative propeller feathered, flaps UP and landing gear UP.",
    ],
    font,
    bold,
  });

  const ceilingLabel = oei.serviceCeilingExtrapolated
    ? `${nearestTen(oei.serviceCeilingFt)} ft EST.`
    : `${nearestTen(oei.serviceCeilingFt)} ft`;
  drawCard(page, {
    y: 93,
    height: 157,
    title: "OEI SERVICE CEILING (50 FT/MIN)",
    value: ceilingLabel,
    lines: [
      `Same weight and ISA deviation ${signed(oei.isaDeviationC, 1)} C. Bracketing values: ${whole(
        oei.serviceCeilingLowerAltitudeFt
      )} ft / ${whole(oei.serviceCeilingLowerRocFpm)} fpm and ${whole(
        oei.serviceCeilingUpperAltitudeFt
      )} ft / ${whole(oei.serviceCeilingUpperRocFpm)} fpm.`,
      `H = H1 + (50 - ROC1) / (ROC2 - ROC1) x (H2 - H1) = ${whole(
        oei.serviceCeilingLowerAltitudeFt
      )} + (50 - ${whole(oei.serviceCeilingLowerRocFpm)}) / (${whole(
        oei.serviceCeilingUpperRocFpm
      )} - ${whole(oei.serviceCeilingLowerRocFpm)}) x ${whole(
        oei.serviceCeilingUpperAltitudeFt -
          oei.serviceCeilingLowerAltitudeFt
      )} = ${nearestTen(oei.serviceCeilingFt)} ft.`,
      oei.serviceCeilingExtrapolated
        ? "The 50 fpm crossing lies outside the published 0-7000 ft rows, so the last two AFM points are linearly extrapolated."
        : "The 50 fpm crossing is linearly interpolated between the two surrounding AFM rows.",
    ],
    font,
    bold,
  });

  const rangeNote = oei.limitedToPublishedRange
    ? " One or more inputs were limited to the nearest published table boundary."
    : "";
  drawWrapped(
    page,
    `Planning aid only. AFM/POH, approved procedures and the operator's OM remain controlling.${rangeNote}`,
    CONTENT_X,
    67,
    CONTENT_WIDTH,
    font,
    6.7,
    9,
    2
  );
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV12(input);
  const output = await PDFDocument.load(bytes);

  if (input.options.includeKneeboard) {
    const font = await output.embedFont(StandardFonts.Helvetica);
    const bold = await output.embedFont(StandardFonts.HelveticaBold);
    appendOeiKneeboard(output, input, font, bold);
  }

  output.setSubject(
    "P2006T forms, performance, standard kneeboard and OEI kneeboard data"
  );
  return output.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
}
