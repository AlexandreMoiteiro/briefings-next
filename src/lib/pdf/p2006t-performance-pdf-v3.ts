import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
import {
  getP2006TPerformanceSettings,
} from "@/lib/performance/p2006t-performance-settings";
import {
  p2006tClimbPerformance,
  p2006tCruisePerformance,
} from "@/lib/performance/p2006t-climb-cruise";
import {
  P2006T_FUEL,
  P2006T_LOADING_ARMS,
  type P2006TMassPoint,
} from "@/lib/performance/p2006t-mission";
import type { P2006TPerformanceRow } from "@/lib/performance/p2006t-performance";
import {
  buildP2006TPerformancePdfV2,
  type BuildP2006TPerformancePdfV2Input,
} from "./p2006t-performance-pdf-v2";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const A5_WIDTH = 420;
const A5_HEIGHT = 595;

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type CoordinateMap = {
  formRects: Record<string, Rect>;
  massBalanceRects: Record<string, Rect>;
  massBalancePoints: Record<string, Point[]>;
};

const COORDS = coordinatesJson as CoordinateMap;

export type P2006TPdfOptions = {
  includePerformanceTables: boolean;
  includeEnroutePage: boolean;
  includeCruisePage: boolean;
  includeKneeboard: boolean;
};

export type BuildP2006TPerformancePdfV3Input =
  BuildP2006TPerformancePdfV2Input & {
    options: P2006TPdfOptions;
  };

export const DEFAULT_P2006T_PDF_OPTIONS: P2006TPdfOptions = {
  includePerformanceTables: true,
  includeEnroutePage: true,
  includeCruisePage: true,
  includeKneeboard: true,
};

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

function rounded(value: number, increment: number) {
  return Math.round(Number(value || 0) / increment) * increment;
}

function dateForPdf(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}

function roleLabel(role: P2006TPerformanceRow["role"]) {
  return role === "Alternate" ? "Alternate 1" : role;
}

function rowForRole(rows: P2006TPerformanceRow[], role: string) {
  return rows.find((row) => row.role === role) ?? null;
}

function clearRect(page: PDFPage, rect: Rect, border = true) {
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: border ? rgb(0.15, 0.15, 0.15) : undefined,
    borderWidth: border ? 0.45 : 0,
  });
}

function drawCentered(
  page: PDFPage,
  rect: Rect,
  value: unknown,
  font: PDFFont,
  preferredSize = 7.4
) {
  const text = clean(value);
  if (!text) return;
  let size = preferredSize;
  while (size > 4.6 && font.widthOfTextAtSize(text, size) > rect.width - 4) {
    size -= 0.2;
  }
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: rect.x + Math.max(2, (rect.width - width) / 2),
    y: rect.y + rect.height / 2 - size * 0.34,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function splitRect(rect: Rect) {
  const half = rect.width / 2;
  return [
    { ...rect, width: half },
    { ...rect, x: rect.x + half, width: half },
  ] as const;
}

function fitAxis(
  values: readonly number[],
  points: readonly Point[],
  dimension: "x" | "y"
) {
  const count = Math.min(values.length, points.length);
  const valueMean =
    values.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
  const pointMean =
    points.slice(0, count).reduce((sum, point) => sum + point[dimension], 0) /
    count;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    numerator +=
      (values[index] - valueMean) *
      (points[index][dimension] - pointMean);
    denominator += (values[index] - valueMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = pointMean - slope * valueMean;
  return (value: number) => intercept + slope * value;
}

function axisX(key: string, value: number, maximum: number) {
  const points = COORDS.massBalancePoints[key] ?? [];
  if (points.length < 2) return 0;
  const first = points[0].x;
  const last = points[points.length - 1].x;
  return first + (last - first) * Math.min(1, Math.max(0, value / maximum));
}

function drawPolyline(
  page: PDFPage,
  points: Point[],
  color = rgb(0.18, 0.25, 0.38),
  thickness = 1.25
) {
  for (let index = 1; index < points.length; index += 1) {
    page.drawLine({
      start: points[index - 1],
      end: points[index],
      thickness,
      color,
      opacity: 0.9,
    });
  }
  points.forEach((point) =>
    page.drawCircle({
      x: point.x,
      y: point.y,
      size: 2.2,
      color,
      opacity: 0.95,
    })
  );
}

function drawFinalPoint(
  page: PDFPage,
  point: P2006TMassPoint,
  label: string,
  massX: (value: number) => number,
  momentY: (value: number) => number,
  font: PDFFont,
  color: ReturnType<typeof rgb>
) {
  const x = massX(point.massKg);
  const y = momentY(point.momentKgm);
  page.drawCircle({ x, y, size: 4.7, color });
  page.drawText(label, {
    x: x + 5,
    y: y + 3,
    size: 6.5,
    font,
    color,
  });
  return { x, y };
}

function fillMassBalancePage(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  const frontKg = input.loading.studentKg + input.loading.instructorKg;
  const usableFuelMassKg =
    input.mission.fuel.usableLoadedL * P2006T_FUEL.densityKgL;
  const values: Record<string, string> = {
    "pilot-front-seat-mass": `${whole(input.loading.studentKg)} + ${whole(
      input.loading.instructorKg
    )} = ${whole(frontKg)} kg`,
    "rear-seats-mass": `${whole(input.loading.rearSeatsKg)} kg`,
    "fuel-mass": `${whole(usableFuelMassKg)} kg`,
    "baggage-mass": `${whole(input.loading.baggageKg)} kg`,
  };

  Object.entries(values).forEach(([key, value]) => {
    const rect = COORDS.massBalanceRects[key];
    if (!rect) return;
    clearRect(page, rect);
    drawCentered(page, rect, value, bold, 8.4);
  });

  clearRect(page, { x: 54, y: 484, width: 488, height: 78 }, false);

  if (input.loading.emptyMassKg <= 0 || input.loading.emptyMomentKgm <= 0) {
    page.drawText("Empty mass and moment required to plot M&B.", {
      x: 68,
      y: 516,
      size: 8,
      font: bold,
      color: rgb(0.65, 0.12, 0.05),
    });
    return;
  }

  const momentY = fitAxis(
    [140, 200, 260, 320, 380, 440, 500],
    COORDS.massBalancePoints["axis-empty-aircraft-moment"],
    "y"
  );
  const massX = fitAxis(
    [800, 900, 1000, 1100, 1200],
    COORDS.massBalancePoints["axis-flight-mass"],
    "x"
  );

  const emptyMoment = input.loading.emptyMomentKgm;
  const frontMoment =
    emptyMoment + frontKg * P2006T_LOADING_ARMS.frontSeatsM;
  const rearMoment =
    frontMoment +
    input.loading.rearSeatsKg * P2006T_LOADING_ARMS.rearSeatsM;
  const fuelMoment =
    rearMoment + usableFuelMassKg * P2006T_FUEL.armM;
  const baggageMoment =
    fuelMoment + input.loading.baggageKg * P2006T_LOADING_ARMS.baggageM;

  const loadingPath: Point[] = [
    {
      x: COORDS.massBalancePoints["axis-front-seat-mass"][0].x,
      y: momentY(emptyMoment),
    },
    {
      x: axisX("axis-front-seat-mass", frontKg, 200),
      y: momentY(frontMoment),
    },
    {
      x: axisX("axis-rear-seat-mass", input.loading.rearSeatsKg, 200),
      y: momentY(rearMoment),
    },
    {
      x: axisX("axis-fuel-mass", usableFuelMassKg, 140),
      y: momentY(fuelMoment),
    },
    {
      x: axisX("axis-baggage-mass", input.loading.baggageKg, 40),
      y: momentY(baggageMoment),
    },
  ];
  drawPolyline(page, loadingPath);

  const takeoff = drawFinalPoint(
    page,
    input.mission.takeoff,
    "TO",
    massX,
    momentY,
    bold,
    rgb(0.05, 0.3, 0.85)
  );
  const landing = drawFinalPoint(
    page,
    input.mission.arrival,
    "LDG",
    massX,
    momentY,
    bold,
    rgb(0.85, 0.12, 0.12)
  );
  const alternate = drawFinalPoint(
    page,
    input.mission.alternate1,
    "ALT",
    massX,
    momentY,
    bold,
    rgb(0.35, 0.2, 0.65)
  );

  const end = loadingPath[loadingPath.length - 1];
  drawPolyline(page, [end, { x: takeoff.x, y: end.y }, takeoff], rgb(0.05, 0.3, 0.85));
  drawPolyline(page, [takeoff, landing, alternate], rgb(0.25, 0.25, 0.28), 1.1);
}

function columnValues(row: P2006TPerformanceRow | null) {
  if (!row) return {} as Record<string, unknown>;
  return {
    airfield: row.icao,
    "runway-qfu": `${row.runway} / ${whole(row.qfu)}`,
    elevation: whole(row.elevationFt),
    qnh: whole(row.qnhHpa),
    temperature: whole(row.oatC),
    wind: `${String(whole(row.windFrom)).padStart(3, "0")} / ${whole(
      row.windKt
    )}`,
    "pressure-altitude": whole(row.paFt),
    "density-altitude": whole(row.daFt),
    toda: whole(row.todaM),
    todr: whole(row.takeoff50M),
    lda: whole(row.ldaM),
    ldr: whole(row.landing50M),
    roc: whole(row.rocFpm),
  };
}

function fillRegularColumn(
  page: PDFPage,
  prefix: "departure" | "arrival",
  row: P2006TPerformanceRow | null,
  font: PDFFont
) {
  const values = columnValues(row);
  Object.entries(values).forEach(([suffix, value]) => {
    const rect = COORDS.formRects[`${prefix}-${suffix}`];
    if (!rect) return;
    clearRect(page, rect);
    drawCentered(page, rect, value, font, 7.2);
  });
}

function fillSplitAlternates(
  page: PDFPage,
  rows: P2006TPerformanceRow[],
  font: PDFFont,
  bold: PDFFont
) {
  const alternate1 = columnValues(rowForRole(rows, "Alternate"));
  const alternate2 = columnValues(rowForRole(rows, "Alternate 2"));
  const header = { x: 419.8, y: 716.7, width: 120.5, height: 21.5 };
  clearRect(page, header);
  const [leftHeader, rightHeader] = splitRect(header);
  page.drawLine({
    start: { x: rightHeader.x, y: header.y },
    end: { x: rightHeader.x, y: header.y + header.height },
    thickness: 0.45,
    color: rgb(0.15, 0.15, 0.15),
  });
  drawCentered(page, leftHeader, "Alternate 1", bold, 5.8);
  drawCentered(page, rightHeader, "Alternate 2", bold, 5.8);

  Object.entries(alternate1).forEach(([suffix, leftValue]) => {
    const rect = COORDS.formRects[`alternate-${suffix}`];
    if (!rect) return;
    clearRect(page, rect);
    const [left, right] = splitRect(rect);
    page.drawLine({
      start: { x: right.x, y: rect.y },
      end: { x: right.x, y: rect.y + rect.height },
      thickness: 0.45,
      color: rgb(0.15, 0.15, 0.15),
    });
    drawCentered(page, left, leftValue, font, 5.8);
    drawCentered(page, right, alternate2[suffix], font, 5.8);
  });
}

function fillFuelPlan(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  const rows: Array<[number | null, number]> = [
    [null, input.mission.fuel.taxiFuelL],
    [input.fuelTimes.climbMin, input.mission.fuel.climbFuelL],
    [input.fuelTimes.enrouteMin, input.mission.fuel.enrouteFuelL],
    [input.fuelTimes.descentMin, input.mission.fuel.descentFuelL],
    [
      input.fuelTimes.climbMin +
        input.fuelTimes.enrouteMin +
        input.fuelTimes.descentMin,
      input.mission.fuel.tripFuelL,
    ],
    [null, input.mission.fuel.contingencyFuelL],
    [
      Math.max(input.fuelTimes.alternate1Min, input.fuelTimes.alternate2Min),
      Math.max(
        input.mission.fuel.alternate1FuelL,
        input.mission.fuel.alternate2FuelL
      ),
    ],
    [input.fuelTimes.reserveMin, input.mission.fuel.reserveFuelL],
    [null, input.mission.fuel.requiredUsableFuelL],
    [null, input.mission.fuel.extraUsableFuelL],
    [null, input.mission.fuel.usableLoadedL],
  ];

  rows.forEach(([minutes, liters], index) => {
    const row = index + 1;
    const timeRect = COORDS.formRects[`fuel-${row}-time`];
    const fuelRect = COORDS.formRects[`fuel-${row}-fuel`];
    if (timeRect) {
      clearRect(page, timeRect);
      drawCentered(
        page,
        timeRect,
        minutes === null ? "" : `${whole(minutes)} min`,
        font,
        6.9
      );
    }
    if (fuelRect) {
      clearRect(page, fuelRect);
      drawCentered(page, fuelRect, `${whole(liters)} L`, bold, 7.1);
    }
  });
}

function fillPerformanceForm(
  page: PDFPage,
  input: BuildP2006TPerformancePdfV3Input,
  font: PDFFont,
  bold: PDFFont
) {
  clearRect(page, COORDS.formRects.date);
  drawCentered(page, COORDS.formRects.date, dateForPdf(input.date), font, 7.3);
  clearRect(page, COORDS.formRects["aircraft-registration"]);
  drawCentered(
    page,
    COORDS.formRects["aircraft-registration"],
    input.registration,
    bold,
    7.4
  );
  fillRegularColumn(
    page,
    "departure",
    rowForRole(input.rows, "Departure"),
    font
  );
  fillRegularColumn(page, "arrival", rowForRole(input.rows, "Arrival"), font);
  fillSplitAlternates(page, input.rows, font, bold);
  fillFuelPlan(page, input, font, bold);
}

async function createFormsSpread(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input
) {
  const templateResponse = await fetch("/api/p2006-form", { cache: "no-store" });
  if (!templateResponse.ok) throw new Error("Official P2006T PDF is unavailable.");
  const source = await PDFDocument.load(await templateResponse.arrayBuffer());
  const formDoc = await PDFDocument.create();
  const [pageOne, pageTwo] = await formDoc.copyPages(source, [0, 1]);
  formDoc.addPage(pageOne);
  formDoc.addPage(pageTwo);
  const font = await formDoc.embedFont(StandardFonts.Helvetica);
  const bold = await formDoc.embedFont(StandardFonts.HelveticaBold);
  fillMassBalancePage(pageOne, input, font, bold);
  fillPerformanceForm(pageTwo, input, font, bold);

  const spread = output.addPage([A3_WIDTH, A3_HEIGHT]);
  const [embeddedOne, embeddedTwo] = await Promise.all([
    output.embedPage(pageOne),
    output.embedPage(pageTwo),
  ]);
  const gap = 7;
  const targetWidth = (A3_WIDTH - gap) / 2;
  const scale = Math.min(targetWidth / PAGE_WIDTH, A3_HEIGHT / PAGE_HEIGHT);
  const drawWidth = PAGE_WIDTH * scale;
  const drawHeight = PAGE_HEIGHT * scale;
  const y = (A3_HEIGHT - drawHeight) / 2;
  spread.drawPage(embeddedOne, {
    x: targetWidth - drawWidth,
    y,
    width: drawWidth,
    height: drawHeight,
  });
  spread.drawPage(embeddedTwo, {
    x: targetWidth + gap,
    y,
    width: drawWidth,
    height: drawHeight,
  });
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function replaceNote(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  bold: PDFFont
) {
  const rect = { x: 35, y: 18, width: A3_WIDTH - 70, height: 78 };
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.25, 0.25, 0.25),
    borderWidth: 0.5,
  });

  let y = rect.y + rect.height - 17;
  lines.forEach((line, lineIndex) => {
    const wrapped = wrapText(line, lineIndex === 0 ? bold : font, 7.2, rect.width - 20);
    wrapped.slice(0, lineIndex === 0 ? 1 : 2).forEach((part) => {
      page.drawText(part, {
        x: rect.x + 10,
        y,
        size: lineIndex === 0 ? 7.8 : 7.2,
        font: lineIndex === 0 ? bold : font,
        color: rgb(0.08, 0.08, 0.08),
      });
      y -= 14;
    });
  });
}

function correctionText(row: P2006TPerformanceRow) {
  const parts = ["weight, altitude and temperature interpolation"];
  if (Math.abs(row.headwindKt) >= 1) {
    parts.push(row.headwindKt >= 0 ? "headwind correction" : "tailwind correction");
  }
  if (row.uphillSlopePct > 0.05) parts.push("uphill slope correction");
  return parts.join(", ");
}

function humanAerodromeNote(row: P2006TPerformanceRow) {
  const takeoffRequired = whole(row.takeoff50M * 1.25);
  const landingRequired = whole(row.landing50M * 1.25);
  const takeoffPct = whole((takeoffRequired / Math.max(1, row.todaM)) * 100);
  const landingPct = whole((landingRequired / Math.max(1, row.ldaM)) * 100);
  const weight = rounded(row.takeoffWeightKg, 10);
  const pa = rounded(row.paFt, 100);
  const oat = rounded(row.oatC, 5);
  const corrections = correctionText(row);

  return [
    `${roleLabel(row.role)} ${row.icao}, runway ${row.runway}: I used about ${weight} kg, ${pa} ft pressure altitude and ${oat} C.`,
    `The AFM result includes ${corrections}. Takeoff is about ${whole(
      row.takeoff50M
    )} m, or ${takeoffRequired} m after the 25% operational margin.`,
    `That is roughly ${takeoffPct}% of TODA. Landing is about ${whole(
      row.landing50M
    )} m, or ${landingRequired} m with the margin - roughly ${landingPct}% of LDA.`,
  ];
}

function interpolate(value: number, lower: number, upper: number, a: number, b: number) {
  if (upper === lower) return a;
  const ratio = Math.min(1, Math.max(0, (value - lower) / (upper - lower)));
  return a + (b - a) * ratio;
}

function altitudeSpeed(altitudeFt: number, altitudes: number[], speeds: number[]) {
  const value = Math.min(altitudes[altitudes.length - 1], Math.max(altitudes[0], altitudeFt));
  let upperIndex = altitudes.findIndex((altitude) => altitude >= value);
  if (upperIndex < 0) upperIndex = altitudes.length - 1;
  const lowerIndex = Math.max(0, upperIndex - 1);
  return interpolate(
    value,
    altitudes[lowerIndex],
    altitudes[upperIndex],
    speeds[lowerIndex],
    speeds[upperIndex]
  );
}

function interpolateByWeight(
  weightKg: number,
  maximumWeightKg: number,
  values: [number, number, number]
) {
  if (weightKg <= 1080) {
    return interpolate(weightKg, 930, 1080, values[0], values[1]);
  }
  return interpolate(weightKg, 1080, maximumWeightKg, values[1], values[2]);
}

function vyKiasApprox(
  registration: BuildP2006TPerformancePdfV3Input["registration"],
  weightKg: number,
  altitudeFt: number
) {
  const altitudes = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000];
  const speed930 = [82, 81, 79, 77, 75, 73, 71, 69];
  const speed1080 = [83, 82, 80, 78, 76, 74, 72, 70];
  const speedMax =
    registration === "CS-EAQ"
      ? [84, 83, 81, 79, 77, 75, 73, 71]
      : [84, 83, 81, 80, 78, 77, 75, 73];
  const maximum = registration === "CS-EAQ" ? 1180 : 1230;
  return whole(
    interpolateByWeight(weightKg, maximum, [
      altitudeSpeed(altitudeFt, altitudes, speed930),
      altitudeSpeed(altitudeFt, altitudes, speed1080),
      altitudeSpeed(altitudeFt, altitudes, speedMax),
    ])
  );
}

function vxKiasApprox(
  registration: BuildP2006TPerformancePdfV3Input["registration"],
  weightKg: number,
  altitudeFt: number
) {
  const altitudes = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000];
  const speed930 = [72, 72, 71, 71, 71, 71, 71, 70];
  const speed1080 = [72, 72, 72, 72, 71, 71, 71, 71];
  const speedMax = [72, 72, 72, 72, 72, 72, 71, 71];
  const maximum = registration === "CS-EAQ" ? 1180 : 1230;
  return whole(
    interpolateByWeight(weightKg, maximum, [
      altitudeSpeed(altitudeFt, altitudes, speed930),
      altitudeSpeed(altitudeFt, altitudes, speed1080),
      altitudeSpeed(altitudeFt, altitudes, speedMax),
    ])
  );
}

function enrouteValues(input: BuildP2006TPerformancePdfV3Input) {
  const settings = getP2006TPerformanceSettings();
  const departure = rowForRole(input.rows, "Departure");
  const temperatureC =
    input.cruiseTemperatureC ??
    (departure
      ? departure.oatC -
        1.9812 * ((settings.cruiseAltitudeFt - departure.paFt) / 1000)
      : 15);
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
  const cruise = p2006tCruisePerformance(
    input.registration,
    settings.cruiseAltitudeFt,
    {
      weightKg: 1150,
      isaDeviationC,
      cruiseRpm: settings.cruiseRpm,
      cruisePowerPercent: settings.cruisePowerPercent,
    }
  );
  return {
    settings,
    temperatureC,
    isaDeviationC,
    climb,
    cruise,
    vyKias: vyKiasApprox(
      input.registration,
      input.mission.takeoff.massKg,
      settings.cruiseAltitudeFt
    ),
    vxKias: vxKiasApprox(
      input.registration,
      input.mission.takeoff.massKg,
      settings.cruiseAltitudeFt
    ),
  };
}

async function appendSelectedPerformancePages(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input
) {
  const { options } = input;
  if (
    !options.includePerformanceTables &&
    !options.includeEnroutePage &&
    !options.includeCruisePage
  ) {
    return;
  }

  const sourceBytes = await buildP2006TPerformancePdfV2(input);
  const source = await PDFDocument.load(sourceBytes);
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);

  if (options.includePerformanceTables) {
    for (let index = 0; index < input.rows.length; index += 1) {
      const [page] = await output.copyPages(source, [2 + index]);
      output.addPage(page);
      replaceNote(page, humanAerodromeNote(input.rows[index]), font, bold);
    }
  }

  const enroute = enrouteValues(input);
  if (options.includeEnroutePage) {
    const [page] = await output.copyPages(source, [2 + input.rows.length]);
    output.addPage(page);
    replaceNote(
      page,
      [
        `Enroute climb: I used the takeoff weight, approximately ${rounded(
          input.mission.takeoff.massKg,
          10
        )} kg, and the forecast conditions near ${rounded(
          enroute.settings.cruiseAltitudeFt,
          500
        )} ft.`,
        `For the briefing I would use Vy about ${enroute.vyKias} KIAS and Vx about ${enroute.vxKias} KIAS.`,
        enroute.climb
          ? `Expected rate of climb is about ${rounded(
              enroute.climb.rateFpm ?? 0,
              50
            )} ft/min in those conditions.`
          : "The selected condition is outside the available climb table.",
      ],
      font,
      bold
    );
  }

  if (options.includeCruisePage) {
    const [page] = await output.copyPages(source, [3 + input.rows.length]);
    output.addPage(page);
    replaceNote(
      page,
      [
        `Cruise: I used approximately ${rounded(
          enroute.settings.cruiseAltitudeFt,
          500
        )} ft and ISA ${enroute.isaDeviationC >= 0 ? "+" : ""}${rounded(
          enroute.isaDeviationC,
          5
        )} C at ${enroute.settings.cruiseRpm} RPM and ${whole(
          enroute.settings.cruisePowerPercent
        )}% power.`,
        enroute.cruise
          ? `I would plan on about ${whole(
              enroute.cruise.tasKt
            )} KTAS and ${whole(
              enroute.cruise.fuelFlowLh
            )} L/h for both engines.`
          : "The selected condition is outside the available cruise rows.",
        "The published cruise tables are referenced at 1150 kg; no artificial weight correction has been added.",
      ],
      font,
      bold
    );
  }
}

function drawRule(page: PDFPage, y: number) {
  page.drawLine({
    start: { x: 24, y },
    end: { x: A5_WIDTH - 24, y },
    thickness: 0.5,
    color: rgb(0.78, 0.8, 0.84),
  });
}

function drawKneeboard(
  output: PDFDocument,
  input: BuildP2006TPerformancePdfV3Input
) {
  const page = output.addPage([A5_WIDTH, A5_HEIGHT]);
  const font = output.embedStandardFont(StandardFonts.Helvetica);
  const bold = output.embedStandardFont(StandardFonts.HelveticaBold);
  const enroute = enrouteValues(input);
  const cruise = enroute.cruise;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: A5_WIDTH,
    height: A5_HEIGHT,
    color: rgb(1, 1, 1),
  });
  page.drawText("P2006T KNEEBOARD", {
    x: 24,
    y: A5_HEIGHT - 34,
    size: 16,
    font: bold,
    color: rgb(0.04, 0.06, 0.1),
  });
  page.drawText(`${input.registration}  |  ${dateForPdf(input.date)}`, {
    x: 24,
    y: A5_HEIGHT - 51,
    size: 8.5,
    font,
    color: rgb(0.3, 0.33, 0.38),
  });

  let y = A5_HEIGHT - 76;
  const line = (text: string, strong = false, size = 8.2) => {
    page.drawText(clean(text), {
      x: 24,
      y,
      size,
      font: strong ? bold : font,
      color: rgb(0.06, 0.07, 0.09),
    });
    y -= 13;
  };

  line("WEIGHTS / FUEL", true, 9.2);
  line(
    `TO ${whole(input.mission.takeoff.massKg)} kg  |  LDG ${whole(
      input.mission.arrival.massKg
    )} kg  |  ALT ${whole(input.mission.alternate1.massKg)} kg`
  );
  line(
    `Usable ${whole(input.mission.fuel.usableLoadedL)} L  |  Trip ${whole(
      input.mission.fuel.tripFuelL
    )} L  |  Reserve ${whole(input.mission.fuel.reserveFuelL)} L`
  );
  y -= 3;
  drawRule(page, y);
  y -= 15;

  line("ENROUTE", true, 9.2);
  line(
    `Vy ~${enroute.vyKias} KIAS  |  Vx ~${enroute.vxKias} KIAS  |  ROC ~${
      enroute.climb ? rounded(enroute.climb.rateFpm ?? 0, 50) : "-"
    } ft/min`
  );
  line(
    `Cruise ${rounded(
      enroute.settings.cruiseAltitudeFt,
      500
    )} ft  |  ${enroute.settings.cruiseRpm} RPM  |  ${whole(
      enroute.settings.cruisePowerPercent
    )}%`
  );
  line(
    `Expect ${cruise ? whole(cruise.tasKt) : "-"} KTAS / ${
      cruise ? whole(cruise.fuelFlowLh) : "-"
    } L/h`
  );
  y -= 3;
  drawRule(page, y);
  y -= 15;

  line("AERODROMES", true, 9.2);
  input.rows.forEach((row) => {
    const toRequired = whole(row.takeoff50M * 1.25);
    const ldRequired = whole(row.landing50M * 1.25);
    const toPct = whole((toRequired / Math.max(1, row.todaM)) * 100);
    const ldPct = whole((ldRequired / Math.max(1, row.ldaM)) * 100);
    line(`${roleLabel(row.role)}  ${row.icao}  RWY ${row.runway}`, true, 8.1);
    line(
      `W ${whole(row.takeoffWeightKg)} kg  |  ${whole(
        row.windFrom
      )}/${whole(row.windKt)} kt  |  PA ~${rounded(row.paFt, 100)} ft`
    );
    line(
      `TO ${toRequired}/${whole(row.todaM)} m (~${toPct}%)  |  LDG ${ldRequired}/${whole(
        row.ldaM
      )} m (~${ldPct}%)`
    );
    y -= 5;
  });

  drawRule(page, 39);
  page.drawText("Distances include the 25% OM/POH planning margin.", {
    x: 24,
    y: 24,
    size: 7,
    font,
    color: rgb(0.35, 0.37, 0.42),
  });
}

export async function buildP2006TPerformancePdfV3(
  input: BuildP2006TPerformancePdfV3Input
) {
  const output = await PDFDocument.create();
  await createFormsSpread(output, input);
  await appendSelectedPerformancePages(output, input);
  if (input.options.includeKneeboard) drawKneeboard(output, input);

  output.setTitle(`P2006T ${input.registration} M&B and Performance`);
  output.setSubject("P2006T forms, performance and kneeboard data");
  output.setCreator("Briefings");
  output.setProducer("Briefings");
  return output.save();
}

export function downloadP2006TPerformancePdfV3(
  bytes: Uint8Array,
  registration: BuildP2006TPerformancePdfV3Input["registration"],
  date: string
) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `P2006T_${registration}_Performance_${date || "flight"}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
