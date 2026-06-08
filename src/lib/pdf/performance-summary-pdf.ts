import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type {
  Pa28MbResult,
  PerformanceAircraft,
  TecnamMbResult,
} from "@/lib/performance/mb";
import type { Pa28PerformanceRow } from "@/lib/performance/pa28-performance";
import type { TecnamPerformanceRow } from "@/lib/performance/tecnam-performance";

type PerformanceSummaryPdfInput = {
  aircraft: PerformanceAircraft;
  registration: string;
  mission: string;
  date: string;
  pa28?: Pa28MbResult;
  tecnam?: TecnamMbResult;
  pa28PerformanceRows?: Pa28PerformanceRow[];
  tecnamPerformanceRows?: TecnamPerformanceRow[];
};

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 42;

function clean(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

export async function buildPerformanceSummaryPdf(
  input: PerformanceSummaryPdfInput
) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPage() {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(height: number) {
    if (y - height < MARGIN) {
      newPage();
    }
  }

  function text(
    value: unknown,
    x: number,
    yy: number,
    options?: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
    }
  ) {
    page.drawText(clean(value), {
      x,
      y: yy,
      size: options?.size ?? 9,
      font: options?.bold ? bold : regular,
      color: options?.color ?? rgb(0.08, 0.08, 0.1),
    });
  }

  function title(value: string) {
    ensureSpace(42);

    text(value.toUpperCase(), MARGIN, y, {
      size: 11,
      bold: true,
    });

    page.drawLine({
      start: { x: MARGIN, y: y - 7 },
      end: { x: PAGE_WIDTH - MARGIN, y: y - 7 },
      thickness: 1,
      color: rgb(0.86, 0.86, 0.88),
    });

    y -= 26;
  }

  function metaBox(label: string, value: string, x: number) {
    page.drawRectangle({
      x,
      y: y - 35,
      width: 175,
      height: 38,
      borderColor: rgb(0.86, 0.86, 0.88),
      borderWidth: 1,
      color: rgb(0.985, 0.985, 0.985),
    });

    text(label, x + 9, y - 11, {
      size: 7,
      bold: true,
      color: rgb(0.42, 0.42, 0.46),
    });

    text(value || "-", x + 9, y - 27, {
      size: 10,
      bold: true,
    });
  }

  function table(headers: string[], rows: string[][], widths: number[]) {
    const rowHeight = 22;
    const tableWidth = widths.reduce((sum, width) => sum + width, 0);

    function row(values: string[], isHeader: boolean) {
      ensureSpace(rowHeight + 4);

      page.drawRectangle({
        x: MARGIN,
        y: y - rowHeight + 5,
        width: tableWidth,
        height: rowHeight,
        color: isHeader ? rgb(0.96, 0.96, 0.97) : rgb(1, 1, 1),
        borderColor: rgb(0.89, 0.89, 0.91),
        borderWidth: 0.5,
      });

      let x = MARGIN;

      values.forEach((value, index) => {
        text(value, x + 6, y - 9, {
          size: isHeader ? 7 : 8,
          bold: isHeader,
          color: isHeader ? rgb(0.38, 0.38, 0.42) : rgb(0.1, 0.1, 0.12),
        });

        x += widths[index] ?? 90;
      });

      y -= rowHeight;
    }

    row(headers, true);

    if (rows.length === 0) {
      row(["No data"], false);
    } else {
      rows.forEach((item) => row(item, false));
    }

    y -= 14;
  }

  function warnings(items: string[]) {
    ensureSpace(45 + items.length * 12);

    if (items.length === 0) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 28,
        width: PAGE_WIDTH - MARGIN * 2,
        height: 32,
        color: rgb(0.93, 0.99, 0.95),
        borderColor: rgb(0.68, 0.9, 0.75),
        borderWidth: 1,
      });

      text("No major warnings.", MARGIN + 10, y - 17, {
        size: 9,
        bold: true,
        color: rgb(0.05, 0.45, 0.18),
      });

      y -= 46;
      return;
    }

    page.drawRectangle({
      x: MARGIN,
      y: y - 28 - items.length * 13,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 34 + items.length * 13,
      color: rgb(1, 0.95, 0.95),
      borderColor: rgb(0.95, 0.68, 0.68),
      borderWidth: 1,
    });

    text("Avisos", MARGIN + 10, y - 17, {
      size: 9,
      bold: true,
      color: rgb(0.65, 0.05, 0.05),
    });

    y -= 33;

    items.forEach((item) => {
      text(`- ${item}`, MARGIN + 10, y, {
        size: 8,
        color: rgb(0.55, 0.05, 0.05),
      });
      y -= 13;
    });

    y -= 14;
  }

  text("PERFORMANCE & MASS BALANCE", MARGIN, y, {
    size: 18,
    bold: true,
  });

  text("Briefings", PAGE_WIDTH - MARGIN - 75, y + 2, {
    size: 12,
    bold: true,
    color: rgb(0.35, 0.35, 0.38),
  });

  y -= 30;

  metaBox("Aircraft", input.aircraft, MARGIN);
  metaBox("Registration", input.registration, MARGIN + 188);
  metaBox("Mission", input.mission || "-", MARGIN + 376);
  metaBox("Date", input.date || "-", MARGIN + 564);

  y -= 60;

  if (input.aircraft === "Piper PA-28" && input.pa28) {
    title("Mass & Balance");
    warnings(input.pa28.warnings);

    table(
      ["Condition", "Weight lb", "Weight kg", "Moment", "CG in"],
      [input.pa28.empty, input.pa28.ramp, input.pa28.takeoff, input.pa28.landing].map(
        (row) => [
          row.label,
          row.weightLb.toFixed(0),
          row.weightKg.toFixed(0),
          row.momentInLb.toFixed(0),
          row.cgIn.toFixed(1),
        ]
      ),
      [145, 110, 110, 150, 90]
    );

    title("Performance");

    table(
      ["Leg", "Takeoff", "Climb", "Landing", "TODR m", "LDR m"],
      (input.pa28PerformanceRows ?? []).map((row) => [
        row.label,
        `${row.toFt.toFixed(0)} ft`,
        `${row.rocFpm.toFixed(0)} fpm`,
        `${row.ldgFt.toFixed(0)} ft`,
        row.toMWithPct,
        row.ldgMWithPct,
      ]),
      [160, 105, 95, 105, 120, 120]
    );
  }

  if (input.aircraft === "Tecnam P2008" && input.tecnam) {
    title("Mass & Balance");
    warnings(input.tecnam.warnings);

    table(
      ["Item", "Weight kg", "Arm m", "Moment kgm"],
      [
        input.tecnam.empty,
        input.tecnam.pilotPassenger,
        input.tecnam.fuel,
        input.tecnam.baggage,
        input.tecnam.total,
      ].map((row) => [
        row.label,
        row.weightKg.toFixed(1),
        row.armM.toFixed(3),
        row.momentKgM.toFixed(2),
      ]),
      [180, 120, 120, 150]
    );

    title("Performance");

    table(
      ["Leg", "RWY", "PA/DA", "TODR", "TODA", "LDR", "LDA", "ROC", "Vy"],
      (input.tecnamPerformanceRows ?? []).map((row) => [
        `${row.role} ${row.icao}`,
        `${row.runway}/${row.qfu.toFixed(0)}`,
        `${row.paFt.toFixed(0)}/${row.daFt.toFixed(0)}`,
        `${row.takeoff50M.toFixed(0)} m`,
        `${row.todaM.toFixed(0)} m`,
        `${row.landing50M.toFixed(0)} m`,
        `${row.ldaM.toFixed(0)} m`,
        `${row.rocFpm.toFixed(0)}`,
        `${row.vyKt.toFixed(0)}`,
      ]),
      [120, 60, 80, 80, 75, 80, 75, 60, 50]
    );
  }

  const pages = pdf.getPages();

  pages.forEach((pdfPage, index) => {
    pdfPage.drawText(`Page ${index + 1}/${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 70,
      y: 24,
      size: 8,
      font: regular,
      color: rgb(0.45, 0.45, 0.48),
    });
  });

  return pdf.save();
}
