import {
  PDFDocument,
  PDFName,
  type PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import {
  type MissionForm,
  type UploadBucketId,
  type UploadSectionId,
} from "@/lib/briefing";

type BriefingPdfFile = {
  sectionId: UploadSectionId;
  bucketId: UploadBucketId;
  name: string;
  type: string;
  file: File;
};

type RoutePdfFile = {
  name: string;
  type: string;
  file: File;
};

type RoutePairForPdf = {
  name: string;
  navlog: RoutePdfFile | null;
  vfrMap: RoutePdfFile | null;
};

type BuildBriefingPdfInput = {
  mission: MissionForm;
  files: BriefingPdfFile[];
  routes: RoutePairForPdf[];
};

type SectionKey = "weather" | "notam" | "perf_mb" | "fpl" | "routes";

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

const structure: { key: SectionKey; label: string }[] = [
  { key: "weather", label: "Weather" },
  { key: "notam", label: "NOTAM" },
  { key: "perf_mb", label: "PERF/M&B" },
  { key: "fpl", label: "FPL" },
  { key: "routes", label: "Routes" },
];

const weatherOrder: UploadBucketId[] = [
  "pressure",
  "sigwx",
  "wind",
  "weather_other",
];

const notamOrder: UploadBucketId[] = ["pib", "sup"];

function safeValue(value: string, fallback = "") {
  return value.trim() || fallback;
}

function isPdf(file: { name: string; type: string }) {
  return file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
}

function isJpg(file: { name: string; type: string }) {
  const lower = file.name.toLowerCase();

  return (
    file.type.includes("jpeg") ||
    file.type.includes("jpg") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg")
  );
}

function isPng(file: { name: string; type: string }) {
  return file.type.includes("png") || file.name.toLowerCase().endsWith(".png");
}

function isGif(file: { name: string; type: string }) {
  return file.type.includes("gif") || file.name.toLowerCase().endsWith(".gif");
}

function getOrderedFiles(files: BriefingPdfFile[]) {
  const byBucket = (bucketId: UploadBucketId) =>
    files.filter((file) => file.bucketId === bucketId);

  return {
    weather: weatherOrder.flatMap(byBucket),
    notam: notamOrder.flatMap(byBucket),
    perf_mb: byBucket("performance"),
    fpl: byBucket("fpl"),
  };
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  color = rgb(0.06, 0.09, 0.16)
) {
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color,
  });
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  centerX: number,
  y: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  color = rgb(0.06, 0.09, 0.16)
) {
  const textWidth = font.widthOfTextAtSize(text, size);

  page.drawText(text, {
    x: centerX - textWidth / 2,
    y,
    size,
    font,
    color,
  });
}

function addAnnotation(page: PDFPage, annotationRef: unknown) {
  const annots = page.node.Annots();

  if (annots) {
    annots.push(annotationRef as never);
    return;
  }

  page.node.set(
    PDFName.of("Annots"),
    page.doc.context.obj([annotationRef])
  );
}

function addInternalLink(
  pdfDoc: PDFDocument,
  page: PDFPage,
  rect: { x: number; y: number; width: number; height: number },
  targetPage: PDFPage
) {
  const annotation = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Border: [0, 0, 0],
    Dest: [targetPage.ref, PDFName.of("Fit")],
  });

  const annotationRef = pdfDoc.context.register(annotation);
  addAnnotation(page, annotationRef);
}

async function createCoverPage(
  pdfDoc: PDFDocument,
  mission: MissionForm
): Promise<{
  page: PDFPage;
  linkRects: Record<SectionKey, { x: number; y: number; width: number; height: number }>;
}> {
  const page = pdfDoc.addPage(A4_LANDSCAPE);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const width = page.getWidth();
  const height = page.getHeight();

  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(1, 1, 1),
  });

  drawCenteredText(page, "Briefing", width / 2, height - 78, 32, bold);

  const info: string[] = [];

  if (mission.missionNumber) info.push(`Mission: ${mission.missionNumber}`);
  if (mission.pilot) info.push(`Pilot: ${mission.pilot}`);
  if (mission.aircraftType) info.push(`Aircraft: ${mission.aircraftType}`);
  if (mission.callsign) info.push(`Callsign: ${mission.callsign}`);
  if (mission.registration) info.push(`Reg: ${mission.registration}`);

  if (info.length > 0) {
    drawCenteredText(page, info.join("   "), width / 2, height - 112, 14, regular);
  }

  if (mission.flightDate || mission.timeUtc) {
    drawCenteredText(
      page,
      `Date: ${safeValue(mission.flightDate)}   UTC: ${safeValue(mission.timeUtc)}`,
      width / 2,
      height - 138,
      14,
      regular
    );
  }

  drawCenteredText(page, "Index", width / 2, height - 184, 16, bold);

  const linkRects = {} as Record<
    SectionKey,
    { x: number; y: number; width: number; height: number }
  >;

  const indexBlockWidth = 700;
  const indexBlockX = (width - indexBlockWidth) / 2;
  const xNum = indexBlockX + 10;
  const xLabel = indexBlockX + 95;
  const xLineEnd = indexBlockX + indexBlockWidth;
  let yFromTop = 238;
  const step = 47;

  structure.forEach((item, index) => {
    const pageY = height - yFromTop;

    drawText(
      page,
      `${index + 1}`.padStart(2, "0"),
      xNum,
      pageY,
      28,
      bold,
      rgb(0.35, 0.5, 0.7)
    );

    drawText(page, item.label, xLabel, pageY + 3, 18, bold);

    page.drawLine({
      start: { x: xLabel, y: pageY - 9 },
      end: { x: xLineEnd, y: pageY - 9 },
      thickness: 0.8,
      color: rgb(0.86, 0.88, 0.9),
    });

    linkRects[item.key] = {
      x: xLabel - 6,
      y: pageY - 10,
      width: indexBlockWidth - 90,
      height: 34,
    };

    yFromTop += step;
  });

  return { page, linkRects };
}

function drawBackToIndexBadge(
  pdfDoc: PDFDocument,
  page: PDFPage,
  coverPage: PDFPage
) {
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  const margin = 17;
  const width = 27;
  const height = 23;
  const x = pageWidth - margin - width;
  const y = pageHeight - margin - height;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderWidth: 0.4,
    borderColor: rgb(0.84, 0.87, 0.92),
    color: rgb(0.98, 0.985, 1),
    opacity: 0.1,
    borderOpacity: 0.2,
  });

  const midY = y + height * 0.55;
  const rightX = x + width - 4;
  const headX = x + 10;

  page.drawLine({
    start: { x: rightX, y: midY },
    end: { x: headX, y: midY },
    thickness: 0.8,
    color: rgb(0.52, 0.56, 0.62),
  });

  page.drawLine({
    start: { x: headX, y: midY },
    end: { x: headX + 6, y: midY - 6 },
    thickness: 0.8,
    color: rgb(0.52, 0.56, 0.62),
  });

  page.drawLine({
    start: { x: headX, y: midY },
    end: { x: headX + 6, y: midY + 6 },
    thickness: 0.8,
    color: rgb(0.52, 0.56, 0.62),
  });

  page.drawLine({
    start: { x: rightX, y: midY },
    end: { x: rightX, y: midY - 6 },
    thickness: 0.7,
    color: rgb(0.52, 0.56, 0.62),
  });

  addInternalLink(pdfDoc, page, { x, y, width, height }, coverPage);
}

async function appendPdfFile(pdfDoc: PDFDocument, file: File) {
  const startIndex = pdfDoc.getPageCount();
  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const copiedPages = await pdfDoc.copyPages(
    sourcePdf,
    sourcePdf.getPageIndices()
  );

  copiedPages.forEach((page) => pdfDoc.addPage(page));

  return startIndex;
}

async function imageFileToPngBytes(file: File) {
  const url = URL.createObjectURL(file);

  try {
    const image = document.createElement("img");
    image.src = url;

    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas not available.");
    }

    context.drawImage(image, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Could not convert image."));
      }, "image/png");
    });

    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function appendImageFile(pdfDoc: PDFDocument, file: File) {
  const startIndex = pdfDoc.getPageCount();
  const page = pdfDoc.addPage(A4_LANDSCAPE);

  const bytes = new Uint8Array(await file.arrayBuffer());

  const image = isJpg(file)
    ? await pdfDoc.embedJpg(bytes)
    : isPng(file)
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedPng(await imageFileToPngBytes(file));

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;

  page.drawImage(image, {
    x: (pageWidth - imageWidth) / 2,
    y: (pageHeight - imageHeight) / 2,
    width: imageWidth,
    height: imageHeight,
  });

  return startIndex;
}

async function appendSupportedFile(
  pdfDoc: PDFDocument,
  item: { file: File; name: string; type: string }
) {
  if (isPdf(item)) {
    return appendPdfFile(pdfDoc, item.file);
  }

  if (isJpg(item) || isPng(item) || isGif(item)) {
    return appendImageFile(pdfDoc, item.file);
  }

  return null;
}

export async function buildBriefingPdf({
  mission,
  files,
  routes,
}: BuildBriefingPdfInput) {
  const pdfDoc = await PDFDocument.create();

  const { page: coverPage, linkRects } = await createCoverPage(pdfDoc, mission);

  const sectionStart: Record<SectionKey, number | null> = {
    weather: null,
    notam: null,
    perf_mb: null,
    fpl: null,
    routes: null,
  };

  const ordered = getOrderedFiles(files);

  for (const file of ordered.weather) {
    const start = await appendSupportedFile(pdfDoc, file);
    if (start !== null && sectionStart.weather === null) {
      sectionStart.weather = start;
    }
  }

  for (const file of ordered.notam) {
    const start = await appendSupportedFile(pdfDoc, file);
    if (start !== null && sectionStart.notam === null) {
      sectionStart.notam = start;
    }
  }

  for (const file of ordered.perf_mb) {
    const start = await appendSupportedFile(pdfDoc, file);
    if (start !== null && sectionStart.perf_mb === null) {
      sectionStart.perf_mb = start;
    }
  }

  for (const file of ordered.fpl) {
    const start = await appendSupportedFile(pdfDoc, file);
    if (start !== null && sectionStart.fpl === null) {
      sectionStart.fpl = start;
    }
  }

  for (const route of routes) {
    if (route.navlog) {
      const start = await appendSupportedFile(pdfDoc, route.navlog);

      if (start !== null && sectionStart.routes === null) {
        sectionStart.routes = start;
      }
    }

    if (route.vfrMap) {
      const start = await appendSupportedFile(pdfDoc, route.vfrMap);

      if (start !== null && sectionStart.routes === null) {
        sectionStart.routes = start;
      }
    }
  }

  const pages = pdfDoc.getPages();

  for (const item of structure) {
    const targetIndex = sectionStart[item.key];

    if (targetIndex !== null && pages[targetIndex]) {
      addInternalLink(pdfDoc, coverPage, linkRects[item.key], pages[targetIndex]);
    }
  }

  pages.forEach((page, index) => {
    if (index === 0) return;
    drawBackToIndexBadge(pdfDoc, page, coverPage);
  });

  return pdfDoc.save();
}
