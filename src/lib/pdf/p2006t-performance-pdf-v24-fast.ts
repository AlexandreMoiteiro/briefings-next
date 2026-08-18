import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
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

const FEET_PER_MINUTE_PER_KNOT = 101.268591;
const FINAL_CACHE_LIMIT = 6;
const FINAL_CACHE = new Map<string, Uint8Array>();
const IN_FLIGHT = new Map<string, Promise<Uint8Array>>();
const RENDERER_VERSION = "p2006t-v25-conservative-fast-path";

function whole(value: number) {
  return Math.round(Number(value || 0));
}

function practical10(value: number) {
  return Math.round(Math.max(0, Number(value || 0)) / 10) * 10;
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

function conservativeLookupLine(row: P2006TPerformanceRow) {
  const takeoff = row.takeoffTrace;
  const landing = row.landingTrace;
  const same =
    takeoff.lowerWeightKg === landing.lowerWeightKg &&
    takeoff.lowerAltitudeFt === landing.lowerAltitudeFt &&
    takeoff.lowerTemperatureC === landing.lowerTemperatureC;
  const lookup = (trace: P2006TPerformanceRow["takeoffTrace"]) =>
    `${whole(trace.lowerWeightKg)} kg / ${whole(
      trace.lowerAltitudeFt
    )} ft / ${whole(trace.lowerTemperatureC)} C`;

  return same
    ? `Conservative AFM cell: ${lookup(takeoff)} for takeoff and landing. No interpolation.`
    : `Conservative AFM cells: T/O ${lookup(takeoff)}; LDG ${lookup(
        landing
      )}. No interpolation.`;
}

function conservativeWindLine(row: P2006TPerformanceRow) {
  const wind = `${String(whole(row.windFrom)).padStart(3, "0")}/${whole(
    row.windKt
  )} kt`;
  if (row.headwindKt >= 0) {
    return `Wind ${wind}: headwind credit is ignored for planning distance.`;
  }
  return `Wind ${wind}: tailwind is rounded up and the adverse AFM penalty is retained.`;
}

function redrawConservativeAerodromeNote(
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
  const takeoffPct = Math.round(
    (takeoffRequired / Math.max(1, row.todaM)) * 100
  );
  const landingPct = Math.round(
    (landingRequired / Math.max(1, row.ldaM)) * 100
  );
  const asdr = practical10(row.takeoffGroundRollM + row.landingGroundRollM);
  const lines = [
    `${roleLabel(row.role)} ${row.icao} RWY ${row.runway} | actual W ${whole(
      row.takeoffWeightKg
    )} kg | PA ${whole(row.paFt)} ft | OAT ${whole(row.oatC)} C.`,
    conservativeLookupLine(row),
    conservativeWindLine(row),
    `T/O to 50 ft: ${whole(
      row.takeoff50M
    )} m practical value; OM x 1.25 -> about ${takeoffRequired} m (${takeoffPct}% of ${whole(
      row.todaM
    )} m TODA).`,
    `Landing from 50 ft: ${whole(
      row.landing50M
    )} m practical value; OM x 1.25 -> about ${landingRequired} m (${landingPct}% of ${whole(
      row.ldaM
    )} m LDA).`,
    `Ground roll: no paved-runway credit; adverse takeoff upslope is retained; favourable landing-slope credit is ignored. ASDR estimate ~${asdr} m.`,
  ];

  let y = rect.y + rect.height - 17;
  lines.forEach((line, index) => {
    const selectedFont = index <= 2 ? bold : font;
    const textSize = index === 0 ? 7.4 : 6.8;
    const wrapped = wrapText(
      line,
      selectedFont,
      textSize,
      rect.width - 20
    ).slice(0, 2);
    wrapped.forEach((part) => {
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
  const componentLabel = departure.headwindKt >= 0 ? "HW" : "TW";
  const componentKt = whole(Math.abs(departure.headwindKt));
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
    `Vy climb gradient using departure wind: TAS ~${whole(
      tasKt
    )} kt | ${componentLabel} ~${componentKt} kt -> GS ~${whole(
      groundSpeedKt
    )} kt; ${whole(rateFpm)} / (${whole(
      groundSpeedKt
    )} x 101.27) x 100 = ~${oneDecimal(gradientPct)}%.`,
    {
      x: 45,
      y: 26,
      size: 7.1,
      font,
      color: rgb(0.05, 0.06, 0.09),
    }
  );
}

async function enhanceFastTables(
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
      redrawConservativeAerodromeNote(output.getPage(index), row, font, bold);
    }
  });
  addVyGradient(output, input);

  output.setTitle(`P2006T ${input.registration} performance tables`);
  output.setSubject(
    "P2006T conservative AFM source cells and simplified calculation evidence"
  );
  output.setCreator("Briefings");
  output.setProducer("Briefings");
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
      mode === "tables" ? await enhanceFastTables(base, input) : base;
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
