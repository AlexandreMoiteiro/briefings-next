import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
import { calculateP2006TOeiPerformance } from "@/lib/performance/p2006t-oei";
import {
  getP2006TOeiTables,
  P2006T_OEI_ALTITUDES_FT,
  P2006T_OEI_TEMPERATURES_C,
} from "@/lib/performance/p2006t-oei-table";
import { getP2006TDownloadMode } from "./p2006t-download-mode";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV21,
} from "./p2006t-performance-pdf-v21";
import {
  buildP2006TPerformancePdfV3 as buildP2006TPerformancePdfV25,
  DEFAULT_P2006T_PDF_OPTIONS,
  downloadP2006TPerformancePdfV3 as downloadP2006TPerformancePdfV25,
  type BuildP2006TPerformancePdfV3Input,
  type P2006TPdfOptions,
} from "./p2006t-performance-pdf-v25-student";

export { DEFAULT_P2006T_PDF_OPTIONS };
export type { BuildP2006TPerformancePdfV3Input, P2006TPdfOptions };

const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const FEET_PER_MINUTE_PER_KNOT = 101.268591;

type Rect = { x: number; y: number; width: number; height: number };
type Bracket = {
  lower: number;
  upper: number;
  ratio: number;
  limitedLow: boolean;
  limitedHigh: boolean;
};

function whole(value: number) {
  return Math.round(Number(value || 0));
}

function rounded(value: number, increment: number) {
  return Math.round(Number(value || 0) / increment) * increment;
}

function oneDecimal(value: number) {
  return Number(value || 0).toFixed(1);
}

function twoDecimals(value: number) {
  return Number(value || 0).toFixed(2);
}

function roleLabel(role: P2006TPerformanceRow["role"]) {
  return role === "Alternate" ? "Alternate 1" : role;
}

function bracket(value: number, values: readonly number[]): Bracket {
  const minimum = values[0];
  const maximum = values[values.length - 1];
  const limited = Math.min(maximum, Math.max(minimum, value));
  let lower = minimum;
  let upper = maximum;

  for (const candidate of values) {
    if (candidate <= limited) lower = candidate;
    if (candidate >= limited) {
      upper = candidate;
      break;
    }
  }

  return {
    lower,
    upper,
    ratio: upper === lower ? 0 : (limited - lower) / (upper - lower),
    limitedLow: value < minimum,
    limitedHigh: value > maximum,
  };
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

function interpolationLine(
  label: string,
  value: number,
  unit: string,
  selected: Bracket,
  minimumLabel?: string
) {
  if (selected.limitedLow) {
    return `${label}: ${whole(value)} ${unit} is below the published minimum; use ${
      minimumLabel ?? `${whole(selected.lower)} ${unit}`
    } (conservative boundary).`;
  }
  if (selected.limitedHigh) {
    return `${label}: ${whole(value)} ${unit} is above the published maximum; use ${whole(
      selected.upper
    )} ${unit} (published boundary).`;
  }
  if (selected.lower === selected.upper) {
    return `${label}: exact published value ${whole(selected.lower)} ${unit}; no interpolation.`;
  }
  return `${label}: ${whole(selected.lower)} -> ${whole(selected.upper)} ${unit}; factor = (${whole(
    value
  )}-${whole(selected.lower)})/(${whole(selected.upper)}-${whole(
    selected.lower
  )}) = ${twoDecimals(selected.ratio)}.`;
}

function ceilingLines(calculation: ReturnType<typeof calculateP2006TOeiPerformance>) {
  const lowerAlt = calculation.serviceCeilingLowerAltitudeFt;
  const upperAlt = calculation.serviceCeilingUpperAltitudeFt;
  const lowerRoc = calculation.serviceCeilingLowerRocFpm;
  const upperRoc = calculation.serviceCeilingUpperRocFpm;

  if (
    calculation.serviceCeilingExtrapolated &&
    lowerAlt >= P2006T_OEI_ALTITUDES_FT.at(-2)! &&
    upperAlt === P2006T_OEI_ALTITUDES_FT.at(-1)! &&
    lowerRoc > 50 &&
    upperRoc > 50
  ) {
    return [
      `Ceiling: at ${whole(upperAlt)} ft the interpolated OEI ROC is still ${whole(
        upperRoc
      )} fpm (>50).`,
      `Therefore OEI service ceiling is >${whole(
        upperAlt
      )} ft; no exact value is claimed beyond the published table.`,
    ];
  }

  if (
    calculation.serviceCeilingExtrapolated &&
    lowerAlt === P2006T_OEI_ALTITUDES_FT[0] &&
    upperAlt === P2006T_OEI_ALTITUDES_FT[1] &&
    lowerRoc < 50 &&
    upperRoc < 50
  ) {
    return [
      `Ceiling: OEI ROC is already ${whole(lowerRoc)} fpm at S.L. (<50).`,
      "The 50 fpm service-ceiling criterion is therefore below S.L.; display floor is 0 ft.",
    ];
  }

  if (Math.abs(upperRoc - lowerRoc) < 0.001 || upperAlt === lowerAlt) {
    return [
      `Ceiling: 50 fpm reference is at about ${rounded(
        calculation.serviceCeilingFt,
        50
      )} ft.`,
    ];
  }

  return [
    `Ceiling bracket: ${whole(lowerAlt)} ft -> ${whole(
      lowerRoc
    )} fpm; ${whole(upperAlt)} ft -> ${whole(upperRoc)} fpm.`,
    `Ceiling = ${whole(lowerAlt)} + (50-${whole(lowerRoc)})/(${whole(
      upperRoc
    )}-${whole(lowerRoc)}) x ${whole(upperAlt - lowerAlt)} = ~${rounded(
      calculation.serviceCeilingFt,
      50
    )} ft.`,
  ];
}

function drawExplanation(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  row: P2006TPerformanceRow,
  panel: Rect,
  font: PDFFont,
  bold: PDFFont
) {
  const calculation = calculateP2006TOeiPerformance({
    registration: input.registration,
    weightKg: row.takeoffWeightKg,
    pressureAltitudeFt: row.paFt,
    oatC: row.oatC,
  });
  const weights = getP2006TOeiTables(input.registration).map(
    (table) => table.weightKg
  );
  const weight = bracket(row.takeoffWeightKg, weights);
  const altitude = bracket(row.paFt, P2006T_OEI_ALTITUDES_FT);
  const temperature = bracket(row.oatC, P2006T_OEI_TEMPERATURES_C);
  const groundSpeedKt = Math.max(1, calculation.tasKt - row.headwindKt);
  const gradientPct =
    (calculation.rocFpm /
      Math.max(1, groundSpeedKt * FEET_PER_MINUTE_PER_KNOT)) *
    100;

  const imageTarget = {
    x: panel.x + 10,
    y: panel.y + 10,
    width: panel.width * 0.55,
    height: panel.height - 36,
  };
  const rect = {
    x: imageTarget.x + imageTarget.width + 12,
    y: panel.y + 12,
    width: panel.x + panel.width - (imageTarget.x + imageTarget.width + 22),
    height: panel.height - 48,
  };

  page.drawRectangle({
    x: rect.x - 3,
    y: rect.y - 2,
    width: rect.width + 6,
    height: rect.height + 4,
    color: rgb(1, 1, 1),
  });

  const lines: Array<{ text: string; bold?: boolean }> = [
    {
      text: `Actual: W ${whole(row.takeoffWeightKg)} kg | PA ${whole(
        row.paFt
      )} ft | OAT ${whole(row.oatC)} C`,
      bold: true,
    },
    {
      text: interpolationLine("Weight", row.takeoffWeightKg, "kg", weight),
    },
    {
      text: interpolationLine("PA", row.paFt, "ft", altitude, "S.L."),
    },
    {
      text: interpolationLine("OAT", row.oatC, "C", temperature),
    },
    {
      text: `Interpolated result: VySE ~${whole(
        calculation.vyseKias
      )} KIAS | OEI ROC ~${rounded(calculation.rocFpm, 10)} fpm.`,
      bold: true,
    },
    {
      text: `TAS ~${whole(calculation.tasKt)} kt; ${
        row.headwindKt >= 0 ? "headwind" : "tailwind"
      } ~${whole(Math.abs(row.headwindKt))} kt -> GS ~${whole(
        groundSpeedKt
      )} kt.`,
    },
    {
      text: `Gradient = ${rounded(calculation.rocFpm, 10)} / (${whole(
        groundSpeedKt
      )} x 101.27) x 100 = ${oneDecimal(gradientPct)}%.`,
      bold: true,
    },
    ...ceilingLines(calculation).map((text) => ({ text, bold: true })),
  ];

  let y = rect.y + rect.height - 13;
  lines.forEach(({ text, bold: useBold }) => {
    const selectedFont = useBold ? bold : font;
    const size = useBold ? 6.85 : 6.65;
    const wrapped = wrapText(text, selectedFont, size, rect.width).slice(0, 2);
    wrapped.forEach((part) => {
      page.drawText(part, {
        x: rect.x,
        y,
        size,
        font: selectedFont,
        color: rgb(0.05, 0.06, 0.09),
      });
      y -= 9.45;
    });
    y -= 2.25;
  });
}

async function explainOeiTables(
  bytes: Uint8Array,
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() === 0) return bytes;
  const page = output.getPage(output.getPageCount() - 1);
  const [font, bold] = await Promise.all([
    output.embedFont(StandardFonts.Helvetica),
    output.embedFont(StandardFonts.HelveticaBold),
  ]);

  const margin = 24;
  const gap = 16;
  const titleSpace = 42;
  const panelWidth = (A3_WIDTH - margin * 2 - gap) / 2;
  const panelHeight = (A3_HEIGHT - margin * 2 - titleSpace - gap) / 2;
  const panels: Rect[] = [
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
    drawExplanation(page, input, row, panels[index], font, bold);
  });

  output.setTitle(`P2006T ${input.registration} performance tables`);
  output.setSubject(
    "P2006T AFM source tables with visible headings and explicit OEI interpolation calculations"
  );
  return output.save({ useObjectStreams: false, addDefaultPage: false });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const mode = getP2006TDownloadMode();
  if (mode !== "tables") return buildP2006TPerformancePdfV25(input);

  // V21 keeps the complete original AFM heading visible instead of zooming
  // only into the numerical grid. It also preserves the original source image
  // and the mapped highlight cells.
  const bytes = await buildP2006TPerformancePdfV21(input);
  return explainOeiTables(bytes, input);
}

export function downloadP2006TPerformancePdfV3(
  bytes: Uint8Array,
  registration: BuildP2006TPerformancePdfV3Input["registration"],
  date: string
) {
  downloadP2006TPerformancePdfV25(bytes, registration, date);
}
