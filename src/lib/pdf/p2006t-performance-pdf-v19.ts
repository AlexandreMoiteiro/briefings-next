import { PDFDocument } from "pdf-lib";
import { getP2006TDownloadMode } from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV18,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v18";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const PDF_RENDERER_VERSION = "p2006t-v22-complete-oei";
const NORMALIZED_TARGET = {
  x: 22,
  y: 20,
  width: A3_WIDTH - 44,
  height: A3_HEIGHT - 82,
};
const CACHE_LIMIT = 6;
const PDF_CACHE = new Map<string, Uint8Array>();

function normalizedSourceRect(sourceWidth: number, sourceHeight: number) {
  const scale = Math.min(
    NORMALIZED_TARGET.width / sourceWidth,
    NORMALIZED_TARGET.height / sourceHeight
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: NORMALIZED_TARGET.x + (NORMALIZED_TARGET.width - width) / 2,
    y: NORMALIZED_TARGET.y + (NORMALIZED_TARGET.height - height) / 2,
    width,
    height,
  };
}

async function restoreOriginalTablePages(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const source = await PDFDocument.load(bytes);
  const output = await PDFDocument.create();

  for (let index = 0; index < source.getPageCount(); index += 1) {
    const portraitAerodromePage = index < input.rows.length;
    const pageWidth = portraitAerodromePage ? A4_WIDTH : A3_WIDTH;
    const pageHeight = portraitAerodromePage ? A4_HEIGHT : A3_HEIGHT;
    const cropRect = normalizedSourceRect(pageWidth, pageHeight);
    const embedded = await output.embedPage(source.getPage(index), {
      left: cropRect.x,
      bottom: cropRect.y,
      right: cropRect.x + cropRect.width,
      top: cropRect.y + cropRect.height,
    });
    const page = output.addPage([pageWidth, pageHeight]);
    page.drawPage(embedded, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  output.setTitle(`P2006T ${input.registration} performance tables`);
  output.setSubject("P2006T performance tables and calculation evidence");
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

function cacheKey(
  input: BuildP2006TPerformancePdfV3Input,
  mode: ReturnType<typeof getP2006TDownloadMode>
) {
  return JSON.stringify({
    renderer: PDF_RENDERER_VERSION,
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
  if (PDF_CACHE.size >= CACHE_LIMIT) {
    const oldest = PDF_CACHE.keys().next().value as string | undefined;
    if (oldest) PDF_CACHE.delete(oldest);
  }
  PDF_CACHE.set(key, Uint8Array.from(bytes));
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const mode = getP2006TDownloadMode();
  const key = cacheKey(input, mode);
  const cached = PDF_CACHE.get(key);
  if (cached) return Uint8Array.from(cached);

  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  const bytes = await buildP2006TPerformancePdfV18(input);
  const output =
    mode === "tables" ? await restoreOriginalTablePages(bytes, input) : bytes;

  remember(key, output);
  return Uint8Array.from(output);
}
