import {
  PDFDocument,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
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
import { getP2006TDownloadMode } from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV20,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v20";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const FEET_PER_MINUTE_PER_KNOT = 101.268591;

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

function oneDecimal(value: number) {
  return Number(value || 0).toFixed(1);
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
    ...centers.slice(0, -1).map(
      (center, index) => (center + centers[index + 1]) / 2
    ),
    Math.min(
      1,
      centers.at(-1)! + (centers.at(-1)! - centers.at(-2)!) / 2
    ),
  ];
}

function fullHeadingCrop(image: PDFImage, grid: ExactGrid, target: Rect) {
  const columns = axisEdges(grid.columnCenters);
  const rows = axisEdges(grid.rowCenters);
  const left = Math.max(0, columns[0] - 0.018);
  const right = Math.min(1, columns.at(-1)! + 0.018);

  // The mapped rows start below the table heading. Keep enough source area
  // above row zero to show the complete multi-row heading, not only [ft]/[KIAS].
  const top = Math.max(0, rows[0] - 0.12);
  const bottom = Math.min(1, rows.at(-1)! + 0.018);
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

  const imageRect = fullHeadingCrop(image, grid, imageTarget);
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

  return p2006tClimbPerformance(
    input.registration,
    settings.cruiseAltitudeFt,
    {
      weightKg: input.mission.takeoff.massKg,
      isaDeviationC,
      cruiseRpm: settings.cruiseRpm,
      cruisePowerPercent: settings.cruisePowerPercent,
    }
  );
}

function addVyGradient(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input
) {
  const pageIndex = input.rows.length;
  if (pageIndex >= output.getPageCount()) return;

  const climb = enrouteClimb(input);
  if (!climb?.rateFpm || !climb.tasKt) return;

  const page = output.getPage(pageIndex);
  const size = page.getSize();
  const gradientPct =
    (climb.rateFpm /
      Math.max(1, climb.tasKt * FEET_PER_MINUTE_PER_KNOT)) *
    100;
  const font = output.embedStandardFont(StandardFonts.HelveticaBold);

  // Add one concise line at the bottom of the existing enroute note.
  page.drawRectangle({
    x: 43,
    y: 20,
    width: size.width - 86,
    height: 18,
    color: rgb(1, 1, 1),
  });
  page.drawText(
    `Normal climb gradient at Vy (still air): ${whole(
      climb.rateFpm
    )} / (${whole(climb.tasKt)} KTAS x 101.27) x 100 = ~${oneDecimal(
      gradientPct
    )}%.`,
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

  const response = await fetch(
    `/api/p2006-oei-source?registration=${encodeURIComponent(input.registration)}`,
    { cache: "force-cache" }
  );
  if (!response.ok) throw new Error("Could not load the mapped OEI source page.");
  const image = await output.embedPng(await response.arrayBuffer());
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

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV20(input);
  return getP2006TDownloadMode() === "tables"
    ? enhanceTables(bytes, input)
    : bytes;
}
