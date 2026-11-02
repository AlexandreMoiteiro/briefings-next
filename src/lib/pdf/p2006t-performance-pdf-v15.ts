import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { calculateP2006TOeiPerformance } from "@/lib/performance/p2006t-oei";
import {
  P2006T_OEI_GRID_COLUMNS,
  P2006T_OEI_GRID_ROWS,
  getP2006TOeiGrid,
  getP2006TOeiSourcePage,
  getP2006TOeiTraceCells,
  type P2006TOeiGridRect,
} from "@/lib/performance/p2006t-oei-table";
import {
  clearP2006TDownloadMode,
  getP2006TDownloadMode,
  type P2006TDownloadMode,
} from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV13,
  DEFAULT_P2006T_PDF_OPTIONS,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v13";

export { DEFAULT_P2006T_PDF_OPTIONS };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

type Rect = { x: number; y: number; width: number; height: number };

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

function optionsFor(mode: P2006TDownloadMode): P2006TPdfOptions {
  if (mode === "form") {
    return {
      includePerformanceTables: false,
      includeEnroutePage: false,
      includeCruisePage: false,
      includeKneeboard: false,
    };
  }
  if (mode === "kneeboard") {
    return {
      includePerformanceTables: false,
      includeEnroutePage: false,
      includeCruisePage: false,
      includeKneeboard: true,
    };
  }
  return {
    includePerformanceTables: true,
    includeEnroutePage: true,
    includeCruisePage: true,
    includeKneeboard: false,
  };
}

async function pagesOnly(bytes: Uint8Array, pageIndexes: number[]) {
  const source = await PDFDocument.load(bytes);
  const output = await PDFDocument.create();
  const valid = pageIndexes.filter(
    (index) => index >= 0 && index < source.getPageCount()
  );
  const pages = await output.copyPages(source, valid);
  pages.forEach((page) => output.addPage(page));
  return output;
}

function fittedImageRect(image: PDFImage): Rect {
  const margin = 12;
  const scale = Math.min(
    (A4_WIDTH - margin * 2) / image.width,
    (A4_HEIGHT - margin * 2) / image.height
  );
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (A4_WIDTH - width) / 2,
    y: (A4_HEIGHT - height) / 2,
    width,
    height,
  };
}

function mappedCellRect(
  imageRect: Rect,
  grid: P2006TOeiGridRect,
  rowIndex: number,
  columnIndex: number
): Rect {
  const normalizedCellWidth = grid.width / P2006T_OEI_GRID_COLUMNS;
  const normalizedCellHeight = grid.height / P2006T_OEI_GRID_ROWS;
  const left = grid.x + columnIndex * normalizedCellWidth;
  const top = grid.y + rowIndex * normalizedCellHeight;
  return {
    x: imageRect.x + left * imageRect.width,
    y:
      imageRect.y +
      (1 - top - normalizedCellHeight) * imageRect.height,
    width: normalizedCellWidth * imageRect.width,
    height: normalizedCellHeight * imageRect.height,
  };
}

function drawMappedGrid(
  page: PDFPage,
  imageRect: Rect,
  grid: P2006TOeiGridRect
) {
  const x = imageRect.x + grid.x * imageRect.width;
  const y = imageRect.y + (1 - grid.y - grid.height) * imageRect.height;
  const width = grid.width * imageRect.width;
  const height = grid.height * imageRect.height;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.02, 0.45, 0.3),
    borderWidth: 0.85,
  });
  for (let column = 1; column < P2006T_OEI_GRID_COLUMNS; column += 1) {
    const lineX = x + (width * column) / P2006T_OEI_GRID_COLUMNS;
    page.drawLine({
      start: { x: lineX, y },
      end: { x: lineX, y: y + height },
      thickness: 0.18,
      color: rgb(0.02, 0.45, 0.3),
      opacity: 0.35,
    });
  }
  for (let row = 1; row < P2006T_OEI_GRID_ROWS; row += 1) {
    const lineY = y + (height * row) / P2006T_OEI_GRID_ROWS;
    page.drawLine({
      start: { x, y: lineY },
      end: { x: x + width, y: lineY },
      thickness: 0.18,
      color: rgb(0.02, 0.45, 0.3),
      opacity: 0.3,
    });
  }
}

async function appendMappedOeiTable(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input
) {
  const departure =
    input.rows.find((row) => row.role === "Departure") ?? input.rows[0];
  if (!departure) return;

  const calculation = calculateP2006TOeiPerformance({
    registration: input.registration,
    weightKg: departure.takeoffWeightKg,
    pressureAltitudeFt: departure.paFt,
    oatC: departure.oatC,
  });
  const cells = getP2006TOeiTraceCells({
    registration: input.registration,
    weightKg: departure.takeoffWeightKg,
    pressureAltitudeFt: departure.paFt,
    oatC: departure.oatC,
    calculation,
  });
  const response = await fetch(
    `/api/p2006-oei-source?registration=${encodeURIComponent(input.registration)}`,
    { cache: "force-cache" }
  );
  if (!response.ok) {
    throw new Error("Não foi possível carregar a tabela AFM OEI mapeada.");
  }

  const image = await output.embedPng(await response.arrayBuffer());
  const page = output.addPage([A4_WIDTH, A4_HEIGHT]);
  const imageRect = fittedImageRect(image);
  const grid = getP2006TOeiGrid(input.registration);
  const regular = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);

  page.drawImage(image, imageRect);
  drawMappedGrid(page, imageRect, grid);

  const purposesByCell = new Map<string, Set<string>>();
  cells.forEach((cell) => {
    const key = `${cell.rowIndex}:${cell.columnIndex}`;
    const purposes = purposesByCell.get(key) ?? new Set<string>();
    purposes.add(cell.purpose);
    purposesByCell.set(key, purposes);
  });

  purposesByCell.forEach((purposes, key) => {
    const [rowIndex, columnIndex] = key.split(":").map(Number);
    const rect = mappedCellRect(imageRect, grid, rowIndex, columnIndex);
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
      borderWidth: 0.9,
    });
  });

  page.drawRectangle({
    x: 22,
    y: 15,
    width: A4_WIDTH - 44,
    height: 50,
    color: rgb(1, 1, 1),
    opacity: 0.94,
    borderColor: rgb(0.68, 0.7, 0.75),
    borderWidth: 0.55,
  });
  page.drawText(
    clean(
      `${input.registration} | AFM ${getP2006TOeiSourcePage(
        input.registration
      )} | W ${whole(departure.takeoffWeightKg)} kg | PA ${whole(
        departure.paFt
      )} ft | OAT ${whole(departure.oatC)} C`
    ),
    { x: 32, y: 49, size: 7.8, font: bold, color: rgb(0.05, 0.06, 0.09) }
  );
  page.drawText(
    clean(
      `Laranja: gradiente OEI (${whole(calculation.rocFpm)} fpm, ${calculation.gradientPct.toFixed(
        2
      )}%). Azul: teto OEI 50 fpm (${whole(
        calculation.serviceCeilingFt
      )} ft${calculation.serviceCeilingExtrapolated ? ", extrapolado" : ""}). Roxo: célula comum.`
    ),
    { x: 32, y: 34, size: 6.7, font: regular, color: rgb(0.22, 0.24, 0.29) }
  );
  page.drawText(
    "A grelha 6×24 provém do mapper Admin e pode ser reajustada por matrícula.",
    { x: 32, y: 21, size: 6.4, font: regular, color: rgb(0.32, 0.34, 0.39) }
  );
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const mode = getP2006TDownloadMode();
  if (!mode) {
    return buildP2006TPerformancePdfV13(input);
  }

  const bytes = await buildP2006TPerformancePdfV13({
    ...input,
    options: optionsFor(mode),
  });

  if (mode === "form") {
    const output = await pagesOnly(bytes, [0]);
    output.setTitle(`P2006T ${input.registration} performance form`);
    return output.save({ useObjectStreams: false, addDefaultPage: false });
  }

  const source = await PDFDocument.load(bytes);
  const output = await pagesOnly(
    bytes,
    Array.from({ length: Math.max(0, source.getPageCount() - 1) }, (_, index) =>
      index + 1
    )
  );

  if (mode === "tables") {
    await appendMappedOeiTable(output, input);
    output.setTitle(`P2006T ${input.registration} performance tables`);
  } else {
    output.setTitle(`P2006T ${input.registration} kneeboard`);
  }
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

export function downloadP2006TPerformancePdfV3(
  bytes: Uint8Array,
  registration: BuildP2006TPerformancePdfV3Input["registration"],
  date: string
) {
  const mode = getP2006TDownloadMode();
  const suffix =
    mode === "form"
      ? "Performance_Form"
      : mode === "kneeboard"
        ? "Kneeboard"
        : mode === "tables"
          ? "Performance_Tables"
          : "Performance";
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `P2006T_${registration}_${suffix}_${date || "flight"}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  clearP2006TDownloadMode();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
