import {
  PDFDocument,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import correctedOeiJson from "@/lib/performance/p2006t-oei-overlays.json";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
import { calculateP2006TOeiPerformance } from "@/lib/performance/p2006t-oei";
import { getP2006TOeiTraceCells } from "@/lib/performance/p2006t-oei-table";
import { getP2006TPerformanceSettings } from "@/lib/performance/p2006t-performance-settings";
import { p2006tClimbPerformance } from "@/lib/performance/p2006t-climb-cruise";
import {
  getP2006TDownloadMode,
  P2006T_DOWNLOAD_FAILED_EVENT,
  P2006T_DOWNLOAD_FINISHED_EVENT,
} from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV19,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3 as downloadP2006TPerformancePdfV19,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v19";

export { DEFAULT_P2006T_PDF_OPTIONS };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const FEET_PER_MINUTE_PER_KNOT = 101.268591;
const FINAL_CACHE_LIMIT = 6;
const FINAL_CACHE = new Map<string, Uint8Array>();
const IN_FLIGHT = new Map<string, Promise<Uint8Array>>();
const OEI_SOURCE_CACHE = new Map<P2006TRegistration, Promise<Uint8Array>>();
const RENDERER_VERSION = "p2006t-v24-conservative-fast";

type Rect = { x: number; y: number; width: number; height: number };
type ExactGrid = { columnCenters: number[]; rowCenters: number[] };
type OeiOverlayPayload = {
  mappings: Record<
    string,
    ExactGrid & {
      confirmed: boolean;
      confidence: number;
      method: string;
      savedAt: string;
    }
  >;
};

const OEI_OVERLAYS = correctedOeiJson as OeiOverlayPayload;

function whole(value: number) {
  return Math.round(Number(value || 0));
}

function roundUp10(value: number) {
  return Math.ceil(Math.max(0, Number(value || 0)) / 10) * 10;
}

function oneDecimal(value: number) {
  return Number(value || 0).toFixed(1);
}

function roleLabel(role: P2006TPerformanceRow["role"]) {
  return role === "Alternate" ? "Alternate 1" : role;
}

function exactOeiGrid(registration: P2006TRegistration): ExactGrid {
  const mapping = OEI_OVERLAYS.mappings[`oei-vyse:${registration}`];
  return {
    columnCenters: [...mapping.columnCenters],
    rowCenters: [...mapping.rowCenters],
  };
}

function axisEdges(centers: readonly number[]) {
  if (centers.length === 1) return [centers[0] - 0.01, centers[0] + 0.01];
  return [
    Math.max(0, centers[0] - (centers[1] - centers[0]) / 2),
    ...centers
      .slice(0, -1)
      .map((center, index) => (center + centers[index + 1]) / 2),
    Math.min(
      1,
      centers.at(-1)! + (centers.at(-1)! - centers.at(-2)!) / 2
    ),
  ];
}

function fullTableCrop(image: PDFImage, grid: ExactGrid, target: Rect) {
  const columns = axisEdges(grid.columnCenters);
  const rows = axisEdges(grid.rowCenters);
  const left = Math.max(0, columns[0] - 0.3);
  const right = Math.min(1, columns.at(-1)! + 0.035);
  const top = Math.max(0, rows[0] - 0.16);
  const bottom = Math.min(1, rows.at(-1)! + 0.025);

  const cropWidth = (right - left) * image.width;
  const cropHeight = (bottom - top) * image.height;
  const scale = Math.min(target.width / cropWidth, target.height / cropHeight);
  const width = image.width * scale;
  const height = image.height * scale;
  const visibleWidth = (right - left) * width;
  const visibleHeight = (bottom - top) * height;

  return {
    x: target.x + (target.width - visibleWidth) / 2 - left * width,
    y: target.y + (target.height - visibleHeight) / 2 - (1 - bottom) * height,
    width,
    height,
  };
}

function exactCellRect(
  imageRect: Rect,
  grid: ExactGrid,
  rowIndex: number,
  columnIndex: number
) {
  const columns = axisEdges(grid.columnCenters);
  const rows = axisEdges(grid.rowCenters);
  const left = columns[columnIndex];
  const right = columns[columnIndex + 1];
  const top = rows[rowIndex];
  const bottom = rows[rowIndex + 1];
  return {
    x: imageRect.x + left * imageRect.width,
    y: imageRect.y + (1 - bottom) * imageRect.height,
    width: (right - left) * imageRect.width,
    height: (bottom - top) * imageRect.height,
  };
}

function drawGrid(page: PDFPage, imageRect: Rect, grid: ExactGrid) {
  const columns = axisEdges(grid.columnCenters);
  const rows = axisEdges(grid.rowCenters);
  const left = imageRect.x + columns[0] * imageRect.width;
  const right = imageRect.x + columns.at(-1)! * imageRect.width;
  const top = imageRect.y + (1 - rows[0]) * imageRect.height;
  const bottom = imageRect.y + (1 - rows.at(-1)!) * imageRect.height;

  page.drawRectangle({
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
    borderColor: rgb(0.02, 0.45, 0.3),
    borderWidth: 0.75,
  });
  columns.slice(1, -1).forEach((position) => {
    const x = imageRect.x + position * imageRect.width;
    page.drawLine({
      start: { x, y: bottom },
      end: { x, y: top },
      thickness: 0.16,
      color: rgb(0.02, 0.45, 0.3),
      opacity: 0.3,
    });
  });
  rows.slice(1, -1).forEach((position) => {
    const y = imageRect.y + (1 - position) * imageRect.height;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.16,
      color: rgb(0.02, 0.45, 0.3),
      opacity: 0.26,
    });
  });
}

function highlightCells(
  page: PDFPage,
  imageRect: Rect,
  grid: ExactGrid,
  cells: ReturnType<typeof getP2006TOeiTraceCells>
) {
  const purposesByCell = new Map<string, Set<string>>();
  cells.forEach((cell) => {
    const key = `${cell.rowIndex}:${cell.columnIndex}`;
    const purposes = purposesByCell.get(key) ?? new Set<string>();
    purposes.add(cell.purpose);
    purposesByCell.set(key, purposes);
  });

  purposesByCell.forEach((purposes, key) => {
    const [rowIndex, columnIndex] = key.split(":").map(Number);
    const rect = exactCellRect(imageRect, grid, rowIndex, columnIndex);
    const both = purposes.size > 1;
    const ceiling = purposes.has("ceiling") && !purposes.has("gradient");
    page.drawRectangle({
      ...rect,
      color: both
        ? rgb(0.55, 0.2, 0.75)
        : ceiling
          ? rgb(0.05, 0.42, 0.82)
          : rgb(1, 0.62, 0.02),
      opacity: 0.24,
      borderColor: both
        ? rgb(0.4, 0.08, 0.62)
        : ceiling
          ? rgb(0.02, 0.26, 0.68)
          : rgb(0.86, 0.25, 0.01),
      borderWidth: 0.75,
    });
  });
}

function redrawPanelTable(
  page: PDFPage,
  image: PDFImage,
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow,
  panel: Rect
) {
  const headerHeight = 18;
  const headerGap = 8;
  const grid = exactOeiGrid(input.registration);
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
  const imageTarget = {
    x: panel.x + 10,
    y: panel.y + 10,
    width: panel.width * 0.55,
    height: panel.height - headerHeight - headerGap - 10,
  };

  page.drawRectangle({
    x: imageTarget.x - 2,
    y: imageTarget.y - 2,
    width: imageTarget.width + 4,
    height: imageTarget.height + 4,
    color: rgb(1, 1, 1),
  });

  const imageRect = fullTableCrop(image, grid, imageTarget);
  page.pushOperators(
    pushGraphicsState(),
    rectangle(imageTarget.x, imageTarget.y, imageTarget.width, imageTarget.height),
    clip(),
    endPath()
  );
  page.drawImage(image, imageRect);
  drawGrid(page, imageRect, grid);
  highlightCells(page, imageRect, grid, cells);
  page.pushOperators(popGraphicsState());
  page.drawRectangle({
    ...imageTarget,
    borderColor: rgb(0.75, 0.77, 0.81),
    borderWidth: 0.45,
  });
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = text.replace(/[^\x20-\x7E]/g, " ").split(/\s+/).filter(Boolean);
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
    ? `Conservative AFM lookup: ${lookup(takeoff)} for takeoff and landing. No interpolation.`
    : `Conservative AFM lookup: T/O ${lookup(takeoff)}; LDG ${lookup(
        landing
      )}. No interpolation.`;
}

function conservativeWindLine(row: P2006TPerformanceRow) {
  if (row.headwindKt >= 0) {
    return `Wind: ${String(whole(row.windFrom)).padStart(3, "0")}/${whole(
      row.windKt
    )} kt. Headwind credit is ignored for the planning distance.`;
  }
  return `Wind: ${String(whole(row.windFrom)).padStart(3, "0")}/${whole(
    row.windKt
  )} kt. Tailwind is rounded up and the AFM tailwind penalty is added.`;
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

  const takeoffRequired = roundUp10(row.takeoff50M * 1.25);
  const landingRequired = roundUp10(row.landing50M * 1.25);
  const takeoffPct = Math.ceil(
    (takeoffRequired / Math.max(1, row.todaM)) * 100
  );
  const landingPct = Math.ceil(
    (landingRequired / Math.max(1, row.ldaM)) * 100
  );
  const asdr = roundUp10(row.takeoffGroundRollM + row.landingGroundRollM);
  const lines = [
    `${roleLabel(row.role)} ${row.icao} RWY ${row.runway} | actual W ${whole(
      row.takeoffWeightKg
    )} kg | PA ${whole(row.paFt)} ft | OAT ${whole(row.oatC)} C.`,
    conservativeLookupLine(row),
    conservativeWindLine(row),
    `T/O to 50 ft: ${whole(
      row.takeoff50M
    )} m after conservative rounding; OM x 1.25 -> ${takeoffRequired} m (${takeoffPct}% of ${whole(
      row.todaM
    )} m TODA).`,
    `Landing from 50 ft: ${whole(
      row.landing50M
    )} m after conservative rounding; OM x 1.25 -> ${landingRequired} m (${landingPct}% of ${whole(
      row.ldaM
    )} m LDA).`,
    `Ground roll: no paved-runway credit; takeoff uphill penalty is retained; favourable landing-slope credit is ignored. ASDR estimate ~${asdr} m.`,
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

async function loadOeiSource(registration: P2006TRegistration) {
  const cached = OEI_SOURCE_CACHE.get(registration);
  if (cached) return cached;

  const promise = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(
        `/api/p2006-oei-source?registration=${encodeURIComponent(registration)}`,
        { cache: "force-cache", signal: controller.signal }
      );
      if (!response.ok) {
        throw new Error("Could not load the mapped OEI source page.");
      }
      return new Uint8Array(await response.arrayBuffer());
    } finally {
      window.clearTimeout(timeout);
    }
  })();

  OEI_SOURCE_CACHE.set(registration, promise);
  try {
    return await promise;
  } catch (error) {
    OEI_SOURCE_CACHE.delete(registration);
    throw error;
  }
}

async function enhanceTables(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() === 0) return bytes;

  const [sourceBytes, font, bold] = await Promise.all([
    loadOeiSource(input.registration),
    output.embedFont(StandardFonts.Helvetica),
    output.embedFont(StandardFonts.HelveticaBold),
  ]);

  input.rows.forEach((row, index) => {
    if (index < output.getPageCount()) {
      redrawConservativeAerodromeNote(output.getPage(index), row, font, bold);
    }
  });

  const image = await output.embedPng(sourceBytes);
  const oeiPage = output.getPage(output.getPageCount() - 1);
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
    redrawPanelTable(oeiPage, image, input, row, positions[index]);
  });
  addVyGradient(output, input);

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
    const bytes = await buildP2006TPerformancePdfV19(input);
    const output = mode === "tables" ? await enhanceTables(bytes, input) : bytes;
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
