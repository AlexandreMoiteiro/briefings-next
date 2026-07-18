import {
  PDFDocument,
  PDFName,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";
import type {
  MissionForm,
  UploadBucketId,
  UploadSectionId,
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

type LinkKey = "mission" | "fpl" | "weather" | "performance" | "notam" | "details";

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

const BRIEFING_ITEMS: Array<{
  number: number;
  text: string;
  linkKey?: LinkKey;
}> = [
  {
    number: 1,
    text: "Summary overview of mission objectives, designated time slot, and callsign.",
    linkKey: "mission",
  },
  {
    number: 2,
    text: "Verification of Personal ID, Student card (if applicable), and Medical Certificate.",
  },
  {
    number: 3,
    text: "Confirmation of the submitted Flight Plan.",
    linkKey: "fpl",
  },
  {
    number: 4,
    text: "Technical Logbook, focusing on aircraft status.",
  },
  {
    number: 5,
    text: "Weather Briefing.",
    linkKey: "weather",
  },
  {
    number: 6,
    text: "Mass & Balance and Performance Sheet.",
    linkKey: "performance",
  },
  {
    number: 7,
    text: "NOTAM information pertinent to operational areas.",
    linkKey: "notam",
  },
  {
    number: 8,
    text: "Mission-specific details and any remaining doubts, including the NavLog when applicable.",
    linkKey: "details",
  },
];

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function safeValue(value: string, fallback = "-") {
  return clean(value) || fallback;
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

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = rgb(0.06, 0.09, 0.16)
) {
  page.drawText(clean(text), { x, y, size, font, color });
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function addAnnotation(page: PDFPage, annotationRef: PDFRef) {
  const annots = page.node.Annots();
  if (annots) {
    annots.push(annotationRef);
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
  addAnnotation(page, pdfDoc.context.register(annotation));
}

function drawBackToBriefingBadge(
  pdfDoc: PDFDocument,
  page: PDFPage,
  briefingPage: PDFPage
) {
  const width = 68;
  const height = 20;
  const x = page.getWidth() - width - 14;
  const y = page.getHeight() - height - 14;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(1, 1, 1),
    opacity: 0.9,
    borderColor: rgb(0.75, 0.78, 0.82),
    borderWidth: 0.5,
  });
  const font = page.doc.embedStandardFont(StandardFonts.Helvetica);
  drawText(page, "Briefing", x + 13, y + 6, 7.5, font, rgb(0.25, 0.28, 0.33));
  addInternalLink(pdfDoc, page, { x, y, width, height }, briefingPage);
}

async function createBriefingPage(
  pdfDoc: PDFDocument,
  mission: MissionForm
): Promise<{
  page: PDFPage;
  linkRects: Partial<Record<LinkKey, { x: number; y: number; width: number; height: number }>>;
}> {
  const page = pdfDoc.addPage(A4_LANDSCAPE);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const width = page.getWidth();
  const height = page.getHeight();

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  drawText(page, "Briefing", 58, height - 68, 31, bold);

  const missionLine = [
    safeValue(mission.missionNumber, "Mission"),
    safeValue(mission.callsign, "Callsign"),
    safeValue(mission.registration, "Aircraft"),
    safeValue(mission.flightDate, "Date"),
    mission.timeUtc ? `${safeValue(mission.timeUtc)} UTC` : "Time",
  ].join("   |   ");
  drawText(page, missionLine, 60, height - 94, 10.5, regular, rgb(0.32, 0.35, 0.4));

  const linkRects: Partial<
    Record<LinkKey, { x: number; y: number; width: number; height: number }>
  > = {};
  let y = height - 142;

  BRIEFING_ITEMS.forEach((item) => {
    const lines = wrapText(item.text, regular, 12, width - 145);
    const blockHeight = Math.max(42, lines.length * 17 + 12);

    page.drawCircle({
      x: 76,
      y: y - 3,
      size: 13,
      color: rgb(0.08, 0.11, 0.17),
    });
    const numberText = String(item.number);
    const numberWidth = bold.widthOfTextAtSize(numberText, 9);
    drawText(page, numberText, 76 - numberWidth / 2, y - 6, 9, bold, rgb(1, 1, 1));

    lines.forEach((line, index) => {
      drawText(page, line, 104, y - 7 - index * 17, 12, regular);
    });

    if (item.linkKey) {
      linkRects[item.linkKey] = {
        x: 96,
        y: y - blockHeight + 9,
        width: width - 135,
        height: blockHeight,
      };
    }
    y -= blockHeight;
  });

  return { page, linkRects };
}

async function createMissionSummaryPage(
  pdfDoc: PDFDocument,
  mission: MissionForm
) {
  const page = pdfDoc.addPage(A4_LANDSCAPE);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const width = page.getWidth();
  const height = page.getHeight();

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  drawText(page, "1. Mission summary", 58, height - 68, 25, bold);

  const rows = [
    ["Mission", safeValue(mission.missionNumber)],
    ["Student / Pilot", safeValue(mission.pilot)],
    ["Callsign", safeValue(mission.callsign)],
    ["Aircraft", `${safeValue(mission.aircraftType)}  ${safeValue(mission.registration)}`],
    ["Date", safeValue(mission.flightDate)],
    ["Time slot", mission.timeUtc ? `${safeValue(mission.timeUtc)} UTC` : "-"],
  ];

  let y = height - 126;
  rows.forEach(([label, value]) => {
    page.drawRectangle({
      x: 60,
      y: y - 9,
      width: 700,
      height: 38,
      color: rgb(0.97, 0.975, 0.985),
      borderColor: rgb(0.86, 0.87, 0.9),
      borderWidth: 0.5,
    });
    drawText(page, label, 76, y + 4, 9, bold, rgb(0.38, 0.41, 0.46));
    drawText(page, value, 230, y + 1, 13, regular);
    y -= 50;
  });

  drawText(
    page,
    "Brief the mission objective and any mission-specific constraints before continuing with documents and the flight plan.",
    60,
    72,
    10,
    regular,
    rgb(0.35, 0.38, 0.43)
  );
  return page;
}

function getOrderedFiles(files: BriefingPdfFile[]) {
  const byBucket = (bucketId: UploadBucketId) =>
    files.filter((file) => file.bucketId === bucketId);

  return {
    fpl: byBucket("fpl"),
    weather: ["pressure", "sigwx", "wind", "weather_other"].flatMap((bucket) =>
      byBucket(bucket as UploadBucketId)
    ),
    performance: byBucket("performance"),
    notam: ["pib", "sup"].flatMap((bucket) =>
      byBucket(bucket as UploadBucketId)
    ),
    details: byBucket("attachments"),
  };
}

async function appendPdfFile(pdfDoc: PDFDocument, file: File) {
  const startIndex = pdfDoc.getPageCount();
  const sourcePdf = await PDFDocument.load(await file.arrayBuffer());
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
    if (!context) throw new Error("Canvas not available.");
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
  if (isPdf(item)) return appendPdfFile(pdfDoc, item.file);
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
  const { page: briefingPage, linkRects } = await createBriefingPage(
    pdfDoc,
    mission
  );
  const sectionStart: Partial<Record<LinkKey, number>> = {};

  const missionPage = await createMissionSummaryPage(pdfDoc, mission);
  sectionStart.mission = pdfDoc.getPages().indexOf(missionPage);

  const ordered = getOrderedFiles(files);

  for (const file of ordered.fpl) {
    const start = await appendSupportedFile(pdfDoc, file);
    if (start !== null && sectionStart.fpl === undefined) sectionStart.fpl = start;
  }

  for (const file of ordered.weather) {
    const start = await appendSupportedFile(pdfDoc, file);
    if (start !== null && sectionStart.weather === undefined) {
      sectionStart.weather = start;
    }
  }

  for (const file of ordered.performance) {
    const start = await appendSupportedFile(pdfDoc, file);
    if (start !== null && sectionStart.performance === undefined) {
      sectionStart.performance = start;
    }
  }

  for (const file of ordered.notam) {
    const start = await appendSupportedFile(pdfDoc, file);
    if (start !== null && sectionStart.notam === undefined) {
      sectionStart.notam = start;
    }
  }

  for (const file of ordered.details) {
    const start = await appendSupportedFile(pdfDoc, file);
    if (start !== null && sectionStart.details === undefined) {
      sectionStart.details = start;
    }
  }

  for (const route of routes) {
    for (const item of [route.navlog, route.vfrMap]) {
      if (!item) continue;
      const start = await appendSupportedFile(pdfDoc, item);
      if (start !== null && sectionStart.details === undefined) {
        sectionStart.details = start;
      }
    }
  }

  const pages = pdfDoc.getPages();
  for (const [key, rect] of Object.entries(linkRects) as Array<
    [LinkKey, { x: number; y: number; width: number; height: number }]
  >) {
    const index = sectionStart[key];
    if (index !== undefined && pages[index]) {
      addInternalLink(pdfDoc, briefingPage, rect, pages[index]);
    }
  }

  pages.forEach((page, index) => {
    if (index > 0) drawBackToBriefingBadge(pdfDoc, page, briefingPage);
  });

  pdfDoc.setTitle(`Briefing ${safeValue(mission.registration, "Aircraft")}`);
  pdfDoc.setSubject("Flight briefing package");
  pdfDoc.setCreator("Briefings");
  pdfDoc.setProducer("Briefings");
  return pdfDoc.save();
}
