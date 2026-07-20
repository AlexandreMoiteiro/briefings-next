import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import coordinatesJson from "@/lib/performance/p2006t-coordinate-map.json";
import distanceOverlaysJson from "@/lib/performance/p2006t-table-overlays.json";
import enrouteOverlaysJson from "@/lib/performance/p2006t-enroute-overlays.json";
import cruiseOverlaysJson from "@/lib/performance/p2006t-climb-cruise-overlays.json";
import {
  getP2006TPerformanceSettings,
} from "@/lib/performance/p2006t-performance-settings";
import {
  p2006tClimbPerformance,
  p2006tCruisePerformance,
} from "@/lib/performance/p2006t-climb-cruise";
import type {
  P2006TInterpolationTrace,
  P2006TPerformanceRow,
} from "@/lib/performance/p2006t-performance";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import {
  P2006T_FUEL,
  type P2006TFuelTimesInput,
  type P2006TLoadingInput,
  type P2006TMissionCalculation,
} from "@/lib/performance/p2006t-mission";
import { recalculateFuelPlan } from "@/lib/performance/fuel-planning";
import {
  buildP2006TPerformancePdf as buildLegacyPdf,
  type P2006TLoadingInput as LegacyLoadingInput,
} from "./p2006t-performance-pdf";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const A3_WIDTH = 1191;
const A3_HEIGHT = 842;
const TEMPERATURES = [-25, 0, 25, 50] as const;
const CRUISE_ALTITUDES = [0, 3000, 6000, 9000] as const;
const CRUISE_DEVIATIONS = [-30, 0, 30] as const;

type Rect = { x: number; y: number; width: number; height: number };
type CoordinateMap = {
  formRects: Record<string, Rect>;
  massBalanceRects: Record<string, Rect>;
};
type TableOverlay = {
  columns: number[];
  rows: number[];
  notesRect?: { x: number; y: number; width: number; height: number };
};
type EnrouteOverlay = { image: string; columns: number[]; rows: number[] };
type EnrouteData = {
  vy: Record<P2006TRegistration, EnrouteOverlay>;
  vx: Record<P2006TRegistration, EnrouteOverlay>;
};
type CruiseData = {
  cruise: Record<
    P2006TRegistration,
    Record<"0" | "3000" | "6000" | "9000", EnrouteOverlay>
  >;
};
type CruiseRow = {
  sourceIndex: number;
  rpm: number;
  values: Array<{ powerPercent: number; ktas: number; fuelLph: number }>;
};

const COORDS = coordinatesJson as CoordinateMap;
const DISTANCE_OVERLAYS = distanceOverlaysJson as Record<string, TableOverlay>;
const ENROUTE_OVERLAYS = enrouteOverlaysJson as EnrouteData;
const CRUISE_OVERLAYS = cruiseOverlaysJson as CruiseData;

export type BuildP2006TPerformancePdfV2Input = {
  registration: P2006TRegistration;
  date: string;
  loading: P2006TLoadingInput;
  fuelTimes: P2006TFuelTimesInput;
  mission: P2006TMissionCalculation;
  rows: P2006TPerformanceRow[];
  cruiseTemperatureC: number | null;
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

function roleLabel(role: P2006TPerformanceRow["role"]) {
  if (role === "Alternate") return "Alternate 1";
  return role;
}

function rowForRole(rows: P2006TPerformanceRow[], role: string) {
  return rows.find((row) => row.role === role) ?? null;
}

function drawCentered(
  page: PDFPage,
  rect: Rect,
  value: unknown,
  font: PDFFont,
  size = 7.5
) {
  const text = clean(value);
  if (!text) return;
  let selectedSize = size;
  while (
    selectedSize > 4.8 &&
    font.widthOfTextAtSize(text, selectedSize) > rect.width - 4
  ) {
    selectedSize -= 0.2;
  }
  const width = font.widthOfTextAtSize(text, selectedSize);
  page.drawText(text, {
    x: rect.x + Math.max(2, (rect.width - width) / 2),
    y: rect.y + rect.height / 2 - selectedSize * 0.34,
    size: selectedSize,
    font,
    color: rgb(0, 0, 0),
  });
}

function clearRect(page: PDFPage, rect: Rect, border = true) {
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: border ? rgb(0.15, 0.15, 0.15) : undefined,
    borderWidth: border ? 0.45 : 0,
  });
}

function splitRect(rect: Rect) {
  const half = rect.width / 2;
  return [
    { ...rect, width: half },
    { ...rect, x: rect.x + half, width: half },
  ] as const;
}

function alternateValues(row: P2006TPerformanceRow | null) {
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

function redrawSplitAlternates(
  page: PDFPage,
  rows: P2006TPerformanceRow[],
  font: PDFFont,
  bold: PDFFont
) {
  const alternate1 = alternateValues(rowForRole(rows, "Alternate"));
  const alternate2 = alternateValues(rowForRole(rows, "Alternate 2"));
  const header = { x: 419.5, y: 717, width: 121, height: 21 };
  clearRect(page, header);
  const [header1, header2] = splitRect(header);
  page.drawLine({
    start: { x: header2.x, y: header.y },
    end: { x: header2.x, y: header.y + header.height },
    thickness: 0.45,
    color: rgb(0.15, 0.15, 0.15),
  });
  drawCentered(page, header1, "Alternate 1", bold, 6.3);
  drawCentered(page, header2, "Alternate 2", bold, 6.3);

  for (const [suffix, value1] of Object.entries(alternate1)) {
    const rect = COORDS.formRects[`alternate-${suffix}`];
    if (!rect) continue;
    clearRect(page, rect);
    const [left, right] = splitRect(rect);
    page.drawLine({
      start: { x: right.x, y: rect.y },
      end: { x: right.x, y: rect.y + rect.height },
      thickness: 0.45,
      color: rgb(0.15, 0.15, 0.15),
    });
    drawCentered(page, left, value1, font, 6.2);
    drawCentered(page, right, alternate2[suffix], font, 6.2);
  }
}

function redrawLoadingAndFuel(
  pages: PDFPage[],
  input: BuildP2006TPerformancePdfV2Input,
  font: PDFFont,
  bold: PDFFont
) {
  const pageOne = pages[0];
  const frontKg = input.loading.studentKg + input.loading.instructorKg;
  const fuelMassKg = input.mission.fuel.usableLoadedL * P2006T_FUEL.densityKgL;
  const massValues: Record<string, string> = {
    "pilot-front-seat-mass": `Student ${whole(
      input.loading.studentKg
    )} + Instructor ${whole(input.loading.instructorKg)} = ${whole(frontKg)} kg`,
    "rear-seats-mass": `${whole(input.loading.rearSeatsKg)} kg`,
    "fuel-mass": `${whole(fuelMassKg)} kg`,
    "baggage-mass": `${whole(input.loading.baggageKg)} kg`,
  };

  Object.entries(massValues).forEach(([key, value]) => {
    const rect = COORDS.massBalanceRects[key];
    if (!rect) return;
    clearRect(pageOne, rect);
    drawCentered(pageOne, rect, value, bold, 8.2);
  });

  const summary = { x: 55, y: 486, width: 485, height: 72 };
  clearRect(pageOne, summary);
  const points = [
    input.mission.takeoff,
    input.mission.arrival,
    input.mission.alternate1,
    input.mission.alternate2,
  ];
  pageOne.drawText(
    `Empty ${whole(input.loading.emptyMassKg)} kg / ${whole(
      input.loading.emptyMomentKgm
    )} kgm   |   Usable fuel ${whole(input.mission.fuel.usableLoadedL)} L`,
    { x: 65, y: 536, size: 7.2, font, color: rgb(0.08, 0.08, 0.08) }
  );
  points.forEach((point, index) => {
    pageOne.drawText(
      `${point.label}: ${whole(point.massKg)} kg / ${whole(
        point.momentKgm
      )} kgm / ${point.cgPercentMac.toFixed(1)}% MAC`,
      {
        x: index < 2 ? 65 : 300,
        y: index % 2 === 0 ? 518 : 501,
        size: 7.1,
        font: bold,
        color:
          point.withinMassLimit && point.withinCgLimit
            ? rgb(0.02, 0.35, 0.12)
            : rgb(0.7, 0.05, 0.04),
      }
    );
  });

  const performancePage = pages[1];
  const fuelRows = [
    [input.fuelTimes.taxiFuelL, input.mission.fuel.taxiFuelL],
    [input.fuelTimes.climbMin, input.mission.fuel.climbFuelL],
    [input.fuelTimes.enrouteMin, input.mission.fuel.enrouteFuelL],
    [input.fuelTimes.descentMin, input.mission.fuel.descentFuelL],
    [
      input.fuelTimes.climbMin +
        input.fuelTimes.enrouteMin +
        input.fuelTimes.descentMin,
      input.mission.fuel.tripFuelL,
    ],
    [0, input.mission.fuel.contingencyFuelL],
    [
      Math.max(input.fuelTimes.alternate1Min, input.fuelTimes.alternate2Min),
      Math.max(
        input.mission.fuel.alternate1FuelL,
        input.mission.fuel.alternate2FuelL
      ),
    ],
    [input.fuelTimes.reserveMin, input.mission.fuel.reserveFuelL],
    [0, input.mission.fuel.requiredUsableFuelL],
    [0, input.mission.fuel.extraUsableFuelL],
    [0, input.mission.fuel.usableLoadedL],
  ];

  fuelRows.forEach(([minutes, liters], index) => {
    const row = index + 1;
    const timeRect = COORDS.formRects[`fuel-${row}-time`];
    const fuelRect = COORDS.formRects[`fuel-${row}-fuel`];
    if (timeRect) {
      clearRect(performancePage, timeRect);
      drawCentered(
        performancePage,
        timeRect,
        minutes > 0 ? `${whole(minutes)} min` : "",
        font,
        7
      );
    }
    if (fuelRect) {
      clearRect(performancePage, fuelRect);
      drawCentered(performancePage, fuelRect, `${whole(liters)} L`, bold, 7.3);
    }
  });
}

function cellBounds(centers: readonly number[], index: number) {
  const center = centers[index];
  const previous = centers[index - 1];
  const next = centers[index + 1];
  const start =
    previous === undefined ? center - (next - center) / 2 : (previous + center) / 2;
  const end =
    next === undefined ? center + (center - previous) / 2 : (center + next) / 2;
  return [start, end] as const;
}

function fittedRect(image: PDFImage, target: Rect) {
  const scale = Math.min(target.width / image.width, target.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: target.x + (target.width - width) / 2,
    y: target.y + (target.height - height) / 2,
    width,
    height,
  };
}

function drawNormalizedCell({
  page,
  overlay,
  imageRect,
  rowIndex,
  columnIndex,
  blue = false,
}: {
  page: PDFPage;
  overlay: TableOverlay | EnrouteOverlay;
  imageRect: Rect;
  rowIndex: number;
  columnIndex: number;
  blue?: boolean;
}) {
  if (
    overlay.rows[rowIndex] === undefined ||
    overlay.columns[columnIndex] === undefined
  ) {
    return;
  }
  const [top, bottom] = cellBounds(overlay.rows, rowIndex);
  const [left, right] = cellBounds(overlay.columns, columnIndex);
  page.drawRectangle({
    x: imageRect.x + left * imageRect.width,
    y: imageRect.y + (1 - bottom) * imageRect.height,
    width: (right - left) * imageRect.width,
    height: (bottom - top) * imageRect.height,
    color: blue ? rgb(0.2, 0.55, 1) : rgb(1, 0.72, 0.02),
    opacity: 0.23,
    borderColor: blue ? rgb(0.05, 0.3, 0.85) : rgb(0.9, 0.25, 0.02),
    borderWidth: 1,
  });
}

function distanceOverlayKey(
  registration: P2006TRegistration,
  family: "takeoff" | "landing",
  weightKg: number
) {
  const weight = weightKg === 930 ? 930 : weightKg === 1080 ? 1080 : 1180;
  return `${registration}:${family}:${weight}`;
}

function highlightDistanceTrace(
  page: PDFPage,
  overlay: TableOverlay,
  imageRect: Rect,
  trace: P2006TInterpolationTrace
) {
  const rows = Array.from(
    new Set(
      [trace.lowerAltitudeFt, trace.upperAltitudeFt].map(
        (altitude) =>
          Math.max(0, Math.min(10, Math.round(altitude / 1000))) * 2 +
          (trace.profile === "50ft" ? 1 : 0)
      )
    )
  );
  const columns = Array.from(
    new Set(
      [trace.lowerTemperatureC, trace.upperTemperatureC]
        .map((temperature) =>
          TEMPERATURES.indexOf(temperature as (typeof TEMPERATURES)[number])
        )
        .filter((index) => index >= 0)
    )
  );
  rows.forEach((rowIndex) =>
    columns.forEach((columnIndex) =>
      drawNormalizedCell({
        page,
        overlay,
        imageRect,
        rowIndex,
        columnIndex,
      })
    )
  );
}

async function loadPng(pdf: PDFDocument, path: string) {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Cannot load AFM page ${path}.`);
  return pdf.embedPng(await response.arrayBuffer());
}

function drawPageHeading(
  page: PDFPage,
  title: string,
  subtitle: string,
  font: PDFFont,
  bold: PDFFont
) {
  page.drawText(clean(title), {
    x: 35,
    y: A3_HEIGHT - 27,
    size: 15,
    font: bold,
    color: rgb(0.03, 0.03, 0.03),
  });
  page.drawText(clean(subtitle), {
    x: 35,
    y: A3_HEIGHT - 43,
    size: 8,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });
}

function drawHumanNote(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  bold: PDFFont
) {
  const rect = { x: 35, y: 18, width: A3_WIDTH - 70, height: 74 };
  page.drawRectangle({
    ...rect,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.25, 0.25, 0.25),
    borderWidth: 0.5,
  });
  lines.slice(0, 4).forEach((line, index) => {
    page.drawText(clean(line), {
      x: rect.x + 10,
      y: rect.y + rect.height - 17 - index * 15,
      size: index === 0 ? 8.2 : 7.3,
      font: index === 0 ? bold : font,
      color: rgb(0.08, 0.08, 0.08),
    });
  });
}

async function appendAerodromePages(
  pdf: PDFDocument,
  registration: P2006TRegistration,
  rows: P2006TPerformanceRow[],
  font: PDFFont,
  bold: PDFFont
) {
  for (const row of rows) {
    const page = pdf.addPage([A3_WIDTH, A3_HEIGHT]);
    const omTakeoff = whole(row.takeoff50M * 1.25);
    const omLanding = whole(row.landing50M * 1.25);
    drawPageHeading(
      page,
      `${roleLabel(row.role)} · ${row.icao} · RWY ${row.runway}`,
      `Weight ${whole(row.takeoffWeightKg)} kg · PA ${whole(row.paFt)} ft · OAT ${whole(
        row.oatC
      )} C · Wind ${whole(row.windFrom)}/${whole(row.windKt)} kt`,
      font,
      bold
    );

    const sources = [
      ...row.takeoffTrace.sourcePages.map((source) => ({
        family: "takeoff" as const,
        trace: row.takeoffTrace,
        source,
      })),
      ...row.landingTrace.sourcePages.map((source) => ({
        family: "landing" as const,
        trace: row.landingTrace,
        source,
      })),
    ].slice(0, 4);
    const cells: Rect[] = [
      { x: 35, y: 462, width: 550, height: 325 },
      { x: 606, y: 462, width: 550, height: 325 },
      { x: 35, y: 112, width: 550, height: 325 },
      { x: 606, y: 112, width: 550, height: 325 },
    ];

    for (let index = 0; index < sources.length; index += 1) {
      const item = sources[index];
      const image = await loadPng(pdf, item.source.image);
      const imageRect = fittedRect(image, cells[index]);
      page.drawImage(image, imageRect);
      const overlay = DISTANCE_OVERLAYS[
        distanceOverlayKey(registration, item.family, item.source.weightKg)
      ];
      if (overlay) {
        highlightDistanceTrace(page, overlay, imageRect, item.trace);
      }
    }

    drawHumanNote(
      page,
      [
        `${row.icao}: the calculation follows the highlighted AFM cells for ${whole(
          row.takeoffWeightKg
        )} kg, ${whole(row.paFt)} ft and ${whole(row.oatC)} C.`,
        `Takeoff: ${whole(row.takeoff50M)} m to 50 ft. With the OM/POH 25% margin: ${omTakeoff} m; TODA ${whole(
          row.todaM
        )} m - ${row.todaM >= omTakeoff ? "COMPLIANT" : "NOT COMPLIANT"}.`,
        `Landing: ${whole(row.landing50M)} m from 50 ft. With the OM/POH 25% margin: ${omLanding} m; LDA ${whole(
          row.ldaM
        )} m - ${row.ldaM >= omLanding ? "COMPLIANT" : "NOT COMPLIANT"}.`,
        `The aircraft weight used here is the expected weight at this aerodrome, after the applicable trip or alternate fuel.`,
      ],
      font,
      bold
    );
  }
}

function bracket(value: number, values: readonly number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const limited = Math.min(ordered[ordered.length - 1], Math.max(ordered[0], value));
  let lower = ordered[0];
  let upper = ordered[ordered.length - 1];
  for (const candidate of ordered) {
    if (candidate <= limited) lower = candidate;
    if (candidate >= limited) {
      upper = candidate;
      break;
    }
  }
  return { lower, upper, limited, ratio: upper === lower ? 0 : (limited - lower) / (upper - lower) };
}

function highlightEnrouteSelection({
  page,
  overlay,
  imageRect,
  maximumWeightKg,
  weightKg,
  altitudeFt,
  temperatureC,
  family,
}: {
  page: PDFPage;
  overlay: EnrouteOverlay;
  imageRect: Rect;
  maximumWeightKg: number;
  weightKg: number;
  altitudeFt: number;
  temperatureC: number;
  family: "vy" | "vx";
}) {
  const weights = [930, 1080, maximumWeightKg];
  const weight = bracket(weightKg, weights);
  const altitudeValues =
    family === "vy"
      ? [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000]
      : [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000];
  const altitude = bracket(altitudeFt, altitudeValues);
  const temperature = bracket(temperatureC, TEMPERATURES);
  const blockWeights = [maximumWeightKg, 1080, 930];

  for (const selectedWeight of new Set([weight.lower, weight.upper])) {
    const block = blockWeights.indexOf(selectedWeight);
    if (block < 0) continue;
    for (const selectedAltitude of new Set([altitude.lower, altitude.upper])) {
      const altitudeIndex = altitudeValues.indexOf(selectedAltitude);
      const rowIndex = block * 8 + altitudeIndex;
      drawNormalizedCell({
        page,
        overlay,
        imageRect,
        rowIndex,
        columnIndex: 0,
        blue: true,
      });
      for (const selectedTemperature of new Set([
        temperature.lower,
        temperature.upper,
      ])) {
        const temperatureIndex = TEMPERATURES.indexOf(
          selectedTemperature as (typeof TEMPERATURES)[number]
        );
        drawNormalizedCell({
          page,
          overlay,
          imageRect,
          rowIndex,
          columnIndex: 1 + temperatureIndex,
        });
      }
    }
  }

  return { weight, altitude, temperature };
}

async function appendEnroutePage(
  pdf: PDFDocument,
  input: BuildP2006TPerformancePdfV2Input,
  font: PDFFont,
  bold: PDFFont
) {
  const page = pdf.addPage([A3_WIDTH, A3_HEIGHT]);
  const settings = getP2006TPerformanceSettings();
  const departure = rowForRole(input.rows, "Departure");
  const weightKg = input.mission.takeoff.massKg;
  const altitudeFt = settings.cruiseAltitudeFt;
  const temperatureC =
    input.cruiseTemperatureC ??
    (departure ? departure.oatC - 1.9812 * ((altitudeFt - departure.paFt) / 1000) : 15);
  const maximumWeightKg = input.registration === "CS-EAQ" ? 1180 : 1230;
  const vyOverlay = ENROUTE_OVERLAYS.vy[input.registration];
  const vxOverlay = ENROUTE_OVERLAYS.vx[input.registration];
  const vyImage = await loadPng(pdf, vyOverlay.image);
  const vxImage = await loadPng(pdf, vxOverlay.image);
  const leftTarget = { x: 35, y: 112, width: 550, height: 675 };
  const rightTarget = { x: 606, y: 112, width: 550, height: 675 };
  const vyRect = fittedRect(vyImage, leftTarget);
  const vxRect = fittedRect(vxImage, rightTarget);
  page.drawImage(vyImage, vyRect);
  page.drawImage(vxImage, vxRect);
  const vy = highlightEnrouteSelection({
    page,
    overlay: vyOverlay,
    imageRect: vyRect,
    maximumWeightKg,
    weightKg,
    altitudeFt,
    temperatureC,
    family: "vy",
  });
  const vx = highlightEnrouteSelection({
    page,
    overlay: vxOverlay,
    imageRect: vxRect,
    maximumWeightKg,
    weightKg,
    altitudeFt,
    temperatureC,
    family: "vx",
  });
  const isaDeviationC = temperatureC - (15 - 1.9812 * (altitudeFt / 1000));
  const result = p2006tClimbPerformance(input.registration, altitudeFt, {
    weightKg,
    isaDeviationC,
    cruiseRpm: settings.cruiseRpm,
    cruisePowerPercent: settings.cruisePowerPercent,
  });

  drawPageHeading(
    page,
    `Enroute climb · ${input.registration}`,
    `Vy on the left, Vx on the right · takeoff weight ${whole(
      weightKg
    )} kg · ${whole(altitudeFt)} ft · ${whole(temperatureC)} C`,
    font,
    bold
  );
  drawHumanNote(
    page,
    [
      `For the enroute climb check, the takeoff weight is used once for the flight; the table is not repeated for every aerodrome.`,
      `Vy uses ${vy.weight.lower}-${vy.weight.upper} kg, ${vy.altitude.lower}-${vy.altitude.upper} ft and ${vy.temperature.lower}-${vy.temperature.upper} C.`,
      `Vx uses ${vx.weight.lower}-${vx.weight.upper} kg, ${vx.altitude.lower}-${vx.altitude.upper} ft and ${vx.temperature.lower}-${vx.temperature.upper} C. Blue marks speed; orange marks rate of climb.`,
      result
        ? `Interpolated Vy result: about ${whole(result.tasKt)} KTAS and ${whole(
            result.rateFpm ?? 0
          )} ft/min.`
        : "The selected point is outside the available published range.",
    ],
    font,
    bold
  );
}

function parseCruiseRows(text: string, altitudeFt: number): CruiseRow[] {
  const lines = text.replace(/\u00a0/g, " ").split(/\r?\n/);
  const marker = new RegExp(`Pressure\\s+Altitude:\\s*${altitudeFt}\\s*ft`, "i");
  const start = lines.findIndex((line) => marker.test(line));
  if (start < 0) return [];
  const next = lines.findIndex(
    (line, index) => index > start && /Pressure\s+Altitude:\s*\d+\s*ft/i.test(line)
  );
  const block = lines.slice(start + 1, next > start ? next : undefined);
  return block
    .map((line) => line.trim())
    .filter((line) => /^(?:1900|2100|2250|2388)\s+/.test(line))
    .map((line, sourceIndex) => ({
      sourceIndex,
      numbers: line.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [],
    }))
    .filter((item) => item.numbers.length >= 11)
    .map(({ sourceIndex, numbers }) => ({
      sourceIndex,
      rpm: numbers[0],
      values: [
        { powerPercent: numbers[2], ktas: numbers[3], fuelLph: numbers[4] },
        { powerPercent: numbers[5], ktas: numbers[6], fuelLph: numbers[7] },
        { powerPercent: numbers[8], ktas: numbers[9], fuelLph: numbers[10] },
      ],
    }));
}

function cruisePowerAtDeviation(row: CruiseRow, deviationC: number) {
  const temperature = bracket(deviationC, CRUISE_DEVIATIONS);
  const lower = row.values[CRUISE_DEVIATIONS.indexOf(temperature.lower as -30 | 0 | 30)];
  const upper = row.values[CRUISE_DEVIATIONS.indexOf(temperature.upper as -30 | 0 | 30)];
  return lower.powerPercent + (upper.powerPercent - lower.powerPercent) * temperature.ratio;
}

function selectedCruiseRows(
  rows: CruiseRow[],
  rpm: number,
  powerPercent: number,
  deviationC: number
) {
  const candidates = rows
    .filter((row) => row.rpm === rpm)
    .map((row) => ({ row, power: cruisePowerAtDeviation(row, deviationC) }))
    .sort((a, b) => a.power - b.power);
  if (!candidates.length) return [];
  const power = bracket(
    powerPercent,
    candidates.map((candidate) => candidate.power)
  );
  const lower = candidates.reduce((best, item) =>
    Math.abs(item.power - power.lower) < Math.abs(best.power - power.lower) ? item : best
  );
  const upper = candidates.reduce((best, item) =>
    Math.abs(item.power - power.upper) < Math.abs(best.power - power.upper) ? item : best
  );
  return Array.from(new Set([lower.row.sourceIndex, upper.row.sourceIndex]));
}

function highlightCruiseRow(
  page: PDFPage,
  overlay: EnrouteOverlay,
  imageRect: Rect,
  rowIndex: number,
  deviationC: number
) {
  const deviation = bracket(deviationC, CRUISE_DEVIATIONS);
  const groups = Array.from(new Set([deviation.lower, deviation.upper])).map((value) =>
    CRUISE_DEVIATIONS.indexOf(value as -30 | 0 | 30)
  );
  const groupSize = overlay.columns.length >= 14 ? 4 : 3;
  const columns = [
    0,
    1,
    ...groups.flatMap((group) =>
      Array.from({ length: Math.min(3, groupSize) }, (_, offset) => 2 + group * groupSize + offset)
    ),
  ];
  columns.forEach((columnIndex) =>
    drawNormalizedCell({ page, overlay, imageRect, rowIndex, columnIndex })
  );
}

async function appendCruisePage(
  pdf: PDFDocument,
  input: BuildP2006TPerformancePdfV2Input,
  font: PDFFont,
  bold: PDFFont
) {
  const settings = getP2006TPerformanceSettings();
  const altitude = bracket(settings.cruiseAltitudeFt, CRUISE_ALTITUDES);
  const altitudeValues = Array.from(new Set([altitude.lower, altitude.upper]));
  const page = pdf.addPage([A3_WIDTH, A3_HEIGHT]);
  const targets = [
    { x: 35, y: 112, width: 550, height: 675 },
    { x: 606, y: 112, width: 550, height: 675 },
  ];

  for (let index = 0; index < altitudeValues.length; index += 1) {
    const altitudeFt = altitudeValues[index] as 0 | 3000 | 6000 | 9000;
    const overlay = CRUISE_OVERLAYS.cruise[input.registration][String(altitudeFt) as "0" | "3000" | "6000" | "9000"];
    const [imageResponse, textResponse] = await Promise.all([
      fetch(overlay.image, { cache: "force-cache" }),
      fetch(overlay.image.replace(/\.png$/, ".txt"), { cache: "force-cache" }),
    ]);
    if (!imageResponse.ok || !textResponse.ok) {
      throw new Error(`Cannot load cruise table at ${altitudeFt} ft.`);
    }
    const image = await pdf.embedPng(await imageResponse.arrayBuffer());
    const imageRect = fittedRect(image, targets[index]);
    page.drawImage(image, imageRect);
    const tableRows = parseCruiseRows(await textResponse.text(), altitudeFt);
    selectedCruiseRows(
      tableRows,
      settings.cruiseRpm,
      settings.cruisePowerPercent,
      settings.isaDeviationC
    ).forEach((rowIndex) =>
      highlightCruiseRow(page, overlay, imageRect, rowIndex, settings.isaDeviationC)
    );
  }

  const result = p2006tCruisePerformance(
    input.registration,
    settings.cruiseAltitudeFt,
    {
      weightKg: 1150,
      isaDeviationC: settings.isaDeviationC,
      cruiseRpm: settings.cruiseRpm,
      cruisePowerPercent: settings.cruisePowerPercent,
    }
  );
  drawPageHeading(
    page,
    `Cruise performance · ${input.registration}`,
    `${whole(settings.cruiseAltitudeFt)} ft · ISA ${settings.isaDeviationC >= 0 ? "+" : ""}${whole(
      settings.isaDeviationC
    )} C · ${settings.cruiseRpm} RPM · ${whole(settings.cruisePowerPercent)}%`,
    font,
    bold
  );
  drawHumanNote(
    page,
    [
      `The two published altitude tables around the planned cruise level are shown together; only one is shown when the level matches a table exactly.`,
      `The highlighted rows bracket the requested power at ${settings.cruiseRpm} RPM and the highlighted temperature group brackets ISA ${settings.isaDeviationC >= 0 ? "+" : ""}${whole(
        settings.isaDeviationC
      )} C.`,
      result
        ? `Cruise result: about ${whole(result.tasKt)} KTAS and ${whole(
            result.fuelFlowLh
          )} L/h for both engines.`
        : "The requested cruise condition is outside the published rows.",
      `The AFM cruise tables are published at 1150 kg; no artificial weight correction has been added.`,
    ],
    font,
    bold
  );
}

export async function buildP2006TPerformancePdfV2(
  input: BuildP2006TPerformancePdfV2Input
) {
  const settings = getP2006TPerformanceSettings();
  const legacyLoading: LegacyLoadingInput = {
    emptyMassKg: input.loading.emptyMassKg,
    emptyMomentKgm: input.loading.emptyMomentKgm,
    pilotFrontKg: input.loading.studentKg + input.loading.instructorKg,
    rearSeatsKg: input.loading.rearSeatsKg,
    fuelLoadedL: input.mission.takeoff.usableFuelL,
    baggageKg: input.loading.baggageKg,
  };
  const legacyFuelPlan = recalculateFuelPlan({
    rateLh: input.mission.fuel.cruiseLh,
    fuelLoadedL: input.mission.fuel.usableLoadedL,
    taxiMin: 0,
    climbMin: input.fuelTimes.climbMin,
    enrouteMin: input.fuelTimes.enrouteMin,
    descentMin: input.fuelTimes.descentMin,
    alternateMin: Math.max(
      input.fuelTimes.alternate1Min,
      input.fuelTimes.alternate2Min
    ),
    reserveMin: input.fuelTimes.reserveMin,
  });
  const legacyBytes = await buildLegacyPdf({
    registration: input.registration,
    date: input.date,
    loading: legacyLoading,
    fuelPlan: legacyFuelPlan,
    rows: input.rows,
  });
  const pdf = await PDFDocument.load(legacyBytes);
  while (pdf.getPageCount() > 2) pdf.removePage(2);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  redrawLoadingAndFuel(pdf.getPages(), input, font, bold);
  redrawSplitAlternates(pdf.getPages()[1], input.rows, font, bold);
  await appendAerodromePages(pdf, input.registration, input.rows, font, bold);
  await appendEnroutePage(pdf, input, font, bold);
  await appendCruisePage(pdf, input, font, bold);
  pdf.setTitle(`P2006T ${input.registration} M&B and Performance`);
  pdf.setSubject("P2006T M&B, aerodrome performance, enroute climb and cruise");
  pdf.setCreator("Briefings");
  pdf.setProducer("Briefings");
  return pdf.save();
}

export function downloadP2006TPerformancePdfV2(
  bytes: Uint8Array,
  registration: P2006TRegistration,
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
