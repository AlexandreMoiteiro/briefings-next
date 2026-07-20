import {
  PDFDocument,
  PDFName,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";
import type {
  NavlogCalculationResult,
  NavlogDataBundle,
  NavlogRouteWaypoint,
  NavlogSetupForm,
} from "@/lib/navlog";
import { buildNavlogFormPdf as buildNavlogFormPdfV2 } from "./navlog-form-pdf-v2";

type BuildNavlogFormPdfInput = {
  setup: NavlogSetupForm;
  waypoints: NavlogRouteWaypoint[];
  calculation: NavlogCalculationResult;
  navlogData?: NavlogDataBundle | null;
};

type FieldRect = { x: number; y: number; width: number; height: number };

const TEMPLATE_MAIN_URL = "/legacy/templates/NAVLOG_FORM.pdf";

function objectText(value: any) {
  if (!value) return "";
  if (typeof value.decodeText === "function") return value.decodeText();
  return String(value).replace(/^\(/, "").replace(/\)$/, "");
}

function objectNumber(value: any) {
  if (!value) return 0;
  if (typeof value.asNumber === "function") return value.asNumber();
  return Number(String(value));
}

function annotationFieldName(pdfDoc: PDFDocument, annotation: any) {
  let current = annotation;
  for (let guard = 0; guard < 8 && current; guard += 1) {
    const name = current.get(PDFName.of("T"));
    if (name) return objectText(name);
    const parent = current.get(PDFName.of("Parent"));
    if (!parent) break;
    current = pdfDoc.context.lookup(parent) as any;
  }
  return "";
}

function annotationRect(pdfDoc: PDFDocument, annotation: any): FieldRect | null {
  const rectRef = annotation.get(PDFName.of("Rect"));
  const rect = pdfDoc.context.lookup(rectRef) as any;
  if (!rect || typeof rect.get !== "function") return null;
  const x1 = objectNumber(rect.get(0));
  const y1 = objectNumber(rect.get(1));
  const x2 = objectNumber(rect.get(2));
  const y2 = objectNumber(rect.get(3));
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function fieldRect(pdfDoc: PDFDocument, page: PDFPage, fieldName: string) {
  const annotationsRef = page.node.get(PDFName.of("Annots"));
  const annotations = annotationsRef
    ? (pdfDoc.context.lookup(annotationsRef) as any)
    : null;
  if (!annotations || typeof annotations.size !== "function") return null;

  for (let index = 0; index < annotations.size(); index += 1) {
    const annotationRef = annotations.get(index) as PDFRef;
    const annotation = pdfDoc.context.lookup(annotationRef) as any;
    if (annotationFieldName(pdfDoc, annotation) === fieldName) {
      return annotationRect(pdfDoc, annotation);
    }
  }
  return null;
}

function aircraftCode(setup: NavlogSetupForm) {
  if (setup.aircraftType === "Tecnam P2006T") return "P06T";
  if (setup.aircraftType === "Tecnam P2008") return "P208";
  if (setup.aircraftType === "Piper PA-28") return "PA28";
  return setup.aircraftType.trim().slice(0, 6).toUpperCase();
}

function drawCentered(
  page: PDFPage,
  rect: FieldRect,
  value: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>
) {
  const inset = 0.7;
  page.drawRectangle({
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
    color: rgb(1, 1, 1),
  });
  let size = 5.4;
  while (size > 4 && font.widthOfTextAtSize(value, size) > rect.width - 2) {
    size -= 0.2;
  }
  const width = font.widthOfTextAtSize(value, size);
  page.drawText(value, {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - size) / 2 + 0.5,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

export async function buildNavlogFormPdf(input: BuildNavlogFormPdfInput) {
  const bytes = await buildNavlogFormPdfV2(input);
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() === 0) return bytes;

  const response = await fetch(TEMPLATE_MAIN_URL);
  if (!response.ok) throw new Error("Could not load the NavLog form template.");
  const template = await PDFDocument.load(await response.arrayBuffer());
  const rect = fieldRect(template, template.getPage(0), "AIRCRAFT");
  if (rect) {
    const font = await output.embedFont(StandardFonts.Helvetica);
    drawCentered(output.getPage(0), rect, aircraftCode(input.setup), font);
  }

  return output.save({ useObjectStreams: true, addDefaultPage: false });
}
