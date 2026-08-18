import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
import { calculateP2006TOeiPerformance } from "@/lib/performance/p2006t-oei";
import { getP2006TPerformanceSettings } from "@/lib/performance/p2006t-performance-settings";
import { p2006tClimbPerformance } from "@/lib/performance/p2006t-climb-cruise";
import {
  getP2006TDownloadMode,
  P2006T_DOWNLOAD_FAILED_EVENT,
  P2006T_DOWNLOAD_FINISHED_EVENT,
} from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV17,
} from "./p2006t-performance-pdf-v17";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV19,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3 as downloadP2006TPerformancePdfV19,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v19";

export { DEFAULT_P2006T_PDF_OPTIONS };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A5_WIDTH = 420;
const A5_HEIGHT = 595;
const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const FEET_PER_MINUTE_PER_KNOT = 101.268591;
const FINAL_CACHE_LIMIT = 6;
const FINAL_CACHE = new Map<string, Uint8Array>();
const IN_FLIGHT = new Map<string, Promise<Uint8Array>>();
const RENDERER_VERSION = "p2006t-v26-student-rounding";

type Rect = { x: number; y: number; width: number; height: number };

type OeiResult = ReturnType<typeof oeiForRow>;

function whole(value: number) {
  return Math.round(Number(value || 0));
}

function rounded(value: number, increment: number) {
  return Math.round(Number(value || 0) / increment) * increment;
}

function practical10(value: number) {
  return rounded(Math.max(0, value), 10);
}

function oneDecimal(value: number) {
  return Number(value || 0).toFixed(1);
}

function roleLabel(role: P2006TPerformanceRow["role"]) {
  return role === "Alternate" ? "Alternate 1" : role;
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = text
    .replace(/[^\x20-\x7E]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(next, size) <= width) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawFittedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  preferredSize: number,
  color = rgb(0.05, 0.06, 0.09)
) {
  let size = preferredSize;
  while (size > 4.5 && font.widthOfTextAtSize(text, size) > width) size -= 0.2;
  page.drawText(text, { x, y, size, font, color });
}

function coverLine(page: PDFPage, x: number, y: number, width: number, height = 11) {
  page.drawRectangle({
    x: x - 1,
    y: y - 2,
    width: width + 2,
    height,
    color: rgb(1, 1, 1),
  });
}

function roundedActualCondition(row: P2006TPerformanceRow) {
  const takeoffWeight = rounded(row.takeoffWeightKg, 10);
  const landingWeight = rounded(row.landingWeightKg, 10);
  const weightText =
    takeoffWeight === landingWeight
      ? `W ~${takeoffWeight} kg`
      : `W T/O ~${takeoffWeight} kg / LDG ~${landingWeight} kg`;
  return `${weightText} | PA ~${rounded(row.paFt, 100)} ft | OAT ~${whole(
    row.oatC
  )} C`;
}

function tablePoint(trace: P2006TPerformanceRow["takeoffTrace"]) {
  return `${whole(trace.lowerWeightKg)} kg / ${whole(
    trace.lowerAltitudeFt
  )} ft / ${whole(trace.lowerTemperatureC)} C`;
}

function studentLookupLine(row: P2006TPerformanceRow) {
  const takeoff = tablePoint(row.takeoffTrace);
  const landing = tablePoint(row.landingTrace);
  if (takeoff === landing) {
    return `I use the next published AFM point: ${takeoff}, rather than interpolating.`;
  }
  return `I use the next AFM points: T/O ${takeoff}; LDG ${landing}, rather than interpolating.`;
}

function studentWindLine(row: P2006TPerformanceRow) {
  const component = whole(Math.abs(row.headwindKt));
  const label = row.headwindKt >= 0 ? "headwind" : "tailwind";
  return `Wind ${String(whole(row.windFrom)).padStart(3, "0")}/${whole(
    row.windKt
  )} gives about ${component} kt ${label}, so I apply the normal AFM ${label} correction.`;
}

function studentGroundLine(row: P2006TPerformanceRow) {
  const slope = Math.abs(row.uphillSlopePct);
  return slope > 0.05
    ? `For ground roll I also apply the paved-runway correction (-6% T/O, -2% LDG) and the ${oneDecimal(
        slope
      )}% runway-slope correction.`
    : "For ground roll I also apply the paved-runway correction (-6% T/O and -2% LDG).";
}

function redrawAerodromeNote(
  page: PDFPage,
  row: P2006TPerformanceRow,
  font: PDFFont,
  bold: PDFFont
) {
  const size = page.getSize();
  const rect = { x: 28, y: 18, width: size.width - 56, height: 178 };
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.24, 0.27, 0.33),
    borderWidth: 0.65,
  });

  const takeoffRequired = practical10(row.takeoff50M * 1.25);
  const landingRequired = practical10(row.landing50M * 1.25);
  const takeoffPct = Math.round((takeoffRequired / Math.max(1, row.todaM)) * 100);
  const landingPct = Math.round((landingRequired / Math.max(1, row.ldaM)) * 100);
  const asdr = practical10(row.takeoffGroundRollM + row.landingGroundRollM);
  const lines = [
    `${roleLabel(row.role)} ${row.icao} RWY ${row.runway} | ${roundedActualCondition(row)}.`,
    studentLookupLine(row),
    studentWindLine(row),
    studentGroundLine(row),
    `Take-off comes to about ${whole(
      row.takeoff50M
    )} m to 50 ft; with the 25% margin I use about ${takeoffRequired} m (${takeoffPct}% of TODA).`,
    `Landing comes to about ${whole(
      row.landing50M
    )} m from 50 ft; with the 25% margin I use about ${landingRequired} m (${landingPct}% of LDA). ASDR is about ${asdr} m.`,
  ];

  let y = rect.y + rect.height - 17;
  lines.forEach((line, index) => {
    const selectedFont = index <= 1 ? bold : font;
    const textSize = index === 0 ? 7.4 : 6.8;
    wrapText(line, selectedFont, textSize, rect.width - 20)
      .slice(0, 2)
      .forEach((part) => {
        page.drawText(part, {
          x: rect.x + 10,
          y,
          size: textSize,
          font: selectedFont,
          color: rgb(0.05, 0.06, 0.09),
        });
        y -= 11.2;
      });
    y -= 1.2;
  });
}

function oeiForRow(
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow
) {
  const calculation = calculateP2006TOeiPerformance({
    registration: input.registration,
    weightKg: row.takeoffWeightKg,
    pressureAltitudeFt: row.paFt,
    oatC: row.oatC,
  });
  const groundSpeedKt = Math.max(1, calculation.tasKt - row.headwindKt);
  const gradientPct =
    (calculation.rocFpm /
      Math.max(1, groundSpeedKt * FEET_PER_MINUTE_PER_KNOT)) *
    100;
  return { ...calculation, groundSpeedKt, gradientPct };
}

function studentOeiWindLine(row: P2006TPerformanceRow, calculation: OeiResult) {
  const component = whole(Math.abs(row.headwindKt));
  const label = row.headwindKt >= 0 ? "headwind" : "tailwind";
  return `TAS ~${whole(calculation.tasKt)} kt; with ~${component} kt ${label}, GS is ~${whole(
    calculation.groundSpeedKt
  )} kt.`;
}

function studentCeilingLine(calculation: OeiResult) {
  const ceiling = rounded(calculation.serviceCeilingFt, 100);
  if (calculation.limitedToPublishedRange) {
    return `The OEI table still gives at least 50 fpm at ${ceiling} ft, so I only state >=${ceiling} ft (published limit).`;
  }
  return `For OEI ceiling I use the highest published row still giving at least 50 fpm: about ${ceiling} ft.`;
}

function drawOeiSummaryText(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow,
  panel: Rect,
  font: PDFFont,
  bold: PDFFont
) {
  const calculation = oeiForRow(input, row);
  const imageTarget = {
    x: panel.x + 10,
    y: panel.y + 10,
    width: panel.width * 0.55,
    height: panel.height - 45,
  };
  const rect = {
    x: imageTarget.x + imageTarget.width + 12,
    y: panel.y + 12,
    width: panel.x + panel.width - (imageTarget.x + imageTarget.width + 22),
    height: panel.height - 48,
  };

  page.drawRectangle({
    x: rect.x - 3,
    y: rect.y - 2,
    width: rect.width + 6,
    height: rect.height + 4,
    color: rgb(1, 1, 1),
  });

  const lines: Array<{ text: string; bold?: boolean; size?: number }> = [
    {
      text: `Actual: W ~${rounded(row.takeoffWeightKg, 10)} kg | PA ~${rounded(
        row.paFt,
        100
      )} ft | OAT ~${whole(row.oatC)} C`,
      bold: true,
      size: 7.2,
    },
    {
      text: `For OEI I use the next AFM point: ${whole(
        calculation.weightKg
      )} kg / ${whole(calculation.pressureAltitudeFt)} ft / ${whole(
        calculation.oatC
      )} C.`,
    },
    {
      text: `That gives VySE ~${whole(calculation.vyseKias)} KIAS and OEI ROC ~${rounded(
        calculation.rocFpm,
        10
      )} fpm.`,
      bold: true,
    },
    { text: studentOeiWindLine(row, calculation) },
    {
      text: `So gradient is about ${rounded(
        calculation.rocFpm,
        10
      )} / (${whole(calculation.groundSpeedKt)} x 101) x 100 = ${oneDecimal(
        calculation.gradientPct
      )}%.`,
    },
    { text: studentCeilingLine(calculation), bold: true },
  ];

  let y = rect.y + rect.height - 14;
  lines.forEach(({ text, bold: useBold, size = 7 }) => {
    const selectedFont = useBold ? bold : font;
    wrapText(text, selectedFont, size, rect.width)
      .slice(0, 2)
      .forEach((part) => {
        page.drawText(part, {
          x: rect.x,
          y,
          size,
          font: selectedFont,
          color: rgb(0.05, 0.06, 0.09),
        });
        y -= 10.3;
      });
    y -= 3;
  });
}

function redrawCombinedOeiSummary(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  if (!input.rows.length || output.getPageCount() === 0) return;
  const page = output.getPage(output.getPageCount() - 1);
  const margin = 24;
  const gap = 16;
  const titleSpace = 42;
  const panelWidth = (A3_WIDTH - margin * 2 - gap) / 2;
  const panelHeight = (A3_HEIGHT - margin * 2 - titleSpace - gap) / 2;
  const positions: Rect[] = [
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
    drawOeiSummaryText(page, input, row, positions[index], font, bold);
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

  return climb ? { climb, departure } : null;
}

function addVyGradient(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input
) {
  const pageIndex = input.rows.length;
  if (pageIndex >= output.getPageCount()) return;

  const result = enrouteClimb(input);
  const rateFpm = result?.climb.rateFpm;
  const tasKt = result?.climb.tasKt;
  if (!result || !rateFpm || !tasKt) return;

  const { departure } = result;
  const groundSpeedKt = Math.max(1, tasKt - departure.headwindKt);
  const gradientPct =
    (rateFpm / Math.max(1, groundSpeedKt * FEET_PER_MINUTE_PER_KNOT)) * 100;
  const component = whole(Math.abs(departure.headwindKt));
  const label = departure.headwindKt >= 0 ? "headwind" : "tailwind";
  const page = output.getPage(pageIndex);
  const size = page.getSize();
  const font = output.embedStandardFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 43,
    y: 20,
    width: size.width - 86,
    height: 18,
    color: rgb(1, 1, 1),
  });
  page.drawText(
    `For Vy I get about ${rounded(rateFpm, 50)} fpm and ${whole(
      tasKt
    )} kt TAS. With ${component} kt ${label}, GS is about ${whole(
      groundSpeedKt
    )} kt, giving a climb gradient of about ${oneDecimal(gradientPct)}%.`,
    {
      x: 45,
      y: 26,
      size: 7.1,
      font,
      color: rgb(0.05, 0.06, 0.09),
    }
  );
}

async function enhanceTables(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() === 0) return bytes;

  const [font, bold] = await Promise.all([
    output.embedFont(StandardFonts.Helvetica),
    output.embedFont(StandardFonts.HelveticaBold),
  ]);

  input.rows.forEach((row, index) => {
    if (index < output.getPageCount()) {
      redrawAerodromeNote(output.getPage(index), row, font, bold);
    }
  });
  redrawCombinedOeiSummary(output, input, font, bold);
  addVyGradient(output, input);

  output.setTitle(`P2006T ${input.registration} performance tables`);
  output.setSubject(
    "P2006T AFM source cells with rounded student-style calculation notes"
  );
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

function redrawKneeboardSummary(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont
) {
  const rect = { x: 18, y: 468, width: A5_WIDTH - 36, height: 72 };
  const x = rect.x + 10;
  const y = rect.y + 35;
  const width = rect.width / 2 - 20;
  coverLine(page, x, y, width, 10);
  drawFittedText(
    page,
    `TO ${rounded(input.mission.takeoff.massKg, 10)} kg | LDG ${rounded(
      input.mission.arrival.massKg,
      10
    )} kg | ALT ${rounded(input.mission.alternate1.massKg, 10)} kg`,
    x,
    y,
    width,
    font,
    6.8
  );
}

function redrawKneeboardCard(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow,
  rect: Rect,
  font: PDFFont,
  bold: PDFFont
) {
  const oei = oeiForRow(input, row);
  const width = rect.width - 18;
  const x = rect.x + 9;
  const conditionY = rect.y + rect.height - 40;
  const windY = conditionY - 13;
  const runwayY = windY - 13;

  coverLine(page, x, conditionY, width);
  drawFittedText(
    page,
    `W ~${rounded(row.takeoffWeightKg, 10)} kg | PA ~${rounded(
      row.paFt,
      100
    )} ft | OAT ~${whole(row.oatC)} C`,
    x,
    conditionY,
    width,
    font,
    6.5
  );

  coverLine(page, x, windY, width);
  drawFittedText(
    page,
    `Wind ${String(whole(row.windFrom)).padStart(3, "0")}/${whole(
      row.windKt
    )} kt | ${row.headwindKt >= 0 ? "HW" : "TW"} ~${whole(
      Math.abs(row.headwindKt)
    )} kt`,
    x,
    windY,
    width,
    font,
    6.5
  );

  coverLine(page, x, runwayY, width);
  drawFittedText(
    page,
    `TO ${practical10(row.takeoff50M * 1.25)}/${whole(
      row.todaM
    )} m | LDG ${practical10(row.landing50M * 1.25)}/${whole(row.ldaM)} m`,
    x,
    runwayY,
    width,
    font,
    6.5
  );

  const asdrY = rect.y + 91;
  coverLine(page, x, asdrY, width, 17);
  drawFittedText(
    page,
    `ASDR = ${practical10(row.takeoffGroundRollM + row.landingGroundRollM)} m`,
    x,
    asdrY,
    width,
    bold,
    13
  );

  const vyseY = rect.y + 64;
  coverLine(page, x, vyseY, width);
  drawFittedText(
    page,
    `VySE ${whole(oei.vyseKias)} KIAS | OEI ROC ~${rounded(
      oei.rocFpm,
      10
    )} fpm`,
    x,
    vyseY,
    width,
    bold,
    6.7
  );

  const tasY = rect.y + 49;
  coverLine(page, x, tasY, width);
  drawFittedText(
    page,
    `TAS ~${whole(oei.tasKt)} kt | GS ~${whole(oei.groundSpeedKt)} kt`,
    x,
    tasY,
    width,
    font,
    6.6
  );

  const gradientY = rect.y + 34;
  coverLine(page, x, gradientY, width);
  drawFittedText(
    page,
    `OEI GRADIENT ~${oneDecimal(oei.gradientPct)}%`,
    x,
    gradientY,
    width,
    bold,
    7.1
  );

  const ceilingY = rect.y + 18;
  coverLine(page, x, ceilingY, width);
  drawFittedText(
    page,
    oei.limitedToPublishedRange
      ? `OEI CEILING >=${rounded(oei.serviceCeilingFt, 100)} ft`
      : `OEI CEILING ~${rounded(oei.serviceCeilingFt, 100)} ft`,
    x,
    ceilingY,
    width,
    bold,
    6.7
  );
}

async function enhanceKneeboard(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() === 0) return bytes;
  const page = output.getPage(0);
  const [font, bold] = await Promise.all([
    output.embedFont(StandardFonts.Helvetica),
    output.embedFont(StandardFonts.HelveticaBold),
  ]);

  redrawKneeboardSummary(page, input, font);
  const margin = 18;
  const gap = 10;
  const cardWidth = (A5_WIDTH - margin * 2 - gap) / 2;
  const cardHeight = 210;
  const positions: Rect[] = [
    { x: margin, y: 244, width: cardWidth, height: cardHeight },
    { x: margin + cardWidth + gap, y: 244, width: cardWidth, height: cardHeight },
    { x: margin, y: 24, width: cardWidth, height: cardHeight },
    { x: margin + cardWidth + gap, y: 24, width: cardWidth, height: cardHeight },
  ];

  input.rows.slice(0, 4).forEach((row, index) => {
    redrawKneeboardCard(page, input, row, positions[index], font, bold);
  });

  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

function cacheKey(
  input: BuildP2006TPerformancePdfV3Input,
  mode: ReturnType<typeof getP2006TDownloadMode>
) {
  return JSON.stringify({
    renderer: RENDERER_VERSION,
    mode,
    registration: input.registration,
    date: input.date,
    loading: input.loading,
    fuelTimes: input.fuelTimes,
    mission: input.mission,
    rows: input.rows,
    cruiseTemperatureC: input.cruiseTemperatureC,
    options: input.options,
  });
}

function remember(key: string, bytes: Uint8Array) {
  if (FINAL_CACHE.size >= FINAL_CACHE_LIMIT) {
    const oldest = FINAL_CACHE.keys().next().value as string | undefined;
    if (oldest) FINAL_CACHE.delete(oldest);
  }
  FINAL_CACHE.set(key, Uint8Array.from(bytes));
}

function dispatchFailure(error: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(P2006T_DOWNLOAD_FAILED_EVENT, {
      detail: {
        message: error instanceof Error ? error.message : String(error),
      },
    })
  );
}

async function yieldToUi() {
  if (typeof window === "undefined") return;
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const mode = getP2006TDownloadMode();
  const key = cacheKey(input, mode);
  const cached = FINAL_CACHE.get(key);
  if (cached) return Uint8Array.from(cached);

  const running = IN_FLIGHT.get(key);
  if (running) return Uint8Array.from(await running);

  const task = (async () => {
    await yieldToUi();
    const base =
      mode === "tables"
        ? await buildP2006TPerformancePdfV17(input)
        : await buildP2006TPerformancePdfV19(input);
    const output =
      mode === "tables"
        ? await enhanceTables(base, input)
        : mode === "kneeboard"
          ? await enhanceKneeboard(base, input)
          : base;
    const copy = Uint8Array.from(output);
    remember(key, copy);
    return copy;
  })();
  IN_FLIGHT.set(key, task);

  try {
    return Uint8Array.from(await task);
  } catch (error) {
    dispatchFailure(error);
    throw error;
  } finally {
    IN_FLIGHT.delete(key);
  }
}

export function downloadP2006TPerformancePdfV3(
  bytes: Uint8Array,
  registration: BuildP2006TPerformancePdfV3Input["registration"],
  date: string
) {
  downloadP2006TPerformancePdfV19(bytes, registration, date);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(P2006T_DOWNLOAD_FINISHED_EVENT));
  }
}
