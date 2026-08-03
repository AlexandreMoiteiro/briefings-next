import { PDFDocument } from "pdf-lib";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV13,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v13";

export { DEFAULT_P2006T_PDF_OPTIONS, downloadP2006TPerformancePdfV3 };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A5_WIDTH = 420;
const A5_HEIGHT = 595;

const OEI_SOURCE_IMAGE: Record<P2006TRegistration, string> = {
  "CS-EAQ": "/p2006-performance-pages/CS-EAQ/page-178.png",
  "CS-EBX": "/p2006-performance-pages/CS-EBX/page-178.png",
  "D-GSEV": "/p2006-performance-pages/D-GSEV/page-176.png",
};

async function appendOeiSourcePage(
  output: PDFDocument,
  registration: P2006TRegistration
) {
  const sourcePath = OEI_SOURCE_IMAGE[registration];
  const response = await fetch(sourcePath, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`P2006T OEI source table is unavailable: ${sourcePath}`);
  }

  const sourceImage = await output.embedPng(await response.arrayBuffer());
  const page = output.addPage([A5_WIDTH, A5_HEIGHT]);
  const scale = Math.min(
    A5_WIDTH / sourceImage.width,
    A5_HEIGHT / sourceImage.height
  );
  const width = sourceImage.width * scale;
  const height = sourceImage.height * scale;

  page.drawImage(sourceImage, {
    x: (A5_WIDTH - width) / 2,
    y: (A5_HEIGHT - height) / 2,
    width,
    height,
  });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const bytes = await buildP2006TPerformancePdfV13(input);
  const output = await PDFDocument.load(bytes);

  if (input.options.includeKneeboard) {
    await appendOeiSourcePage(output, input.registration);
  }

  output.setSubject(
    "P2006T forms, performance, kneeboard, OEI calculations and original AFM OEI table"
  );
  return output.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
}
