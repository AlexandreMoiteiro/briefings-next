import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import type { P2006TOeiCalculation } from "@/lib/performance/p2006t-oei";

export const P2006T_OEI_TEMPERATURES_C = [-25, 0, 25, 50] as const;
export const P2006T_OEI_ALTITUDES_FT = [
  0, 1000, 2000, 3000, 4000, 5000, 6000, 7000,
] as const;
export const P2006T_OEI_GRID_COLUMNS = 6;
export const P2006T_OEI_GRID_ROWS = 24;
export const P2006T_OEI_MAPPER_STORAGE_KEY =
  "briefings_p2006_oei_mapper_v1";

export type P2006TOeiRow = {
  altitudeFt: number;
  vyseKias: number;
  ratesFpm: [number, number, number, number];
};

export type P2006TOeiWeightTable = {
  weightKg: number;
  rows: P2006TOeiRow[];
};

export type P2006TOeiGridRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type P2006TOeiMapperStore = Partial<
  Record<
    P2006TRegistration,
    {
      rect: P2006TOeiGridRect;
      savedAt: string;
    }
  >
>;

export type P2006TOeiTraceCell = {
  rowIndex: number;
  columnIndex: number;
  weightKg: number;
  altitudeFt: number;
  purpose: "gradient" | "ceiling";
};

const COMMON_930_ROWS: P2006TOeiRow[] = [
  { altitudeFt: 0, vyseKias: 79, ratesFpm: [574, 455, 349, 253] },
  { altitudeFt: 1000, vyseKias: 79, ratesFpm: [529, 411, 305, 211] },
  { altitudeFt: 2000, vyseKias: 79, ratesFpm: [483, 367, 262, 168] },
  { altitudeFt: 3000, vyseKias: 78, ratesFpm: [438, 322, 219, 126] },
  { altitudeFt: 4000, vyseKias: 78, ratesFpm: [393, 278, 176, 83] },
  { altitudeFt: 5000, vyseKias: 78, ratesFpm: [348, 235, 133, 41] },
  { altitudeFt: 6000, vyseKias: 78, ratesFpm: [304, 191, 90, -1] },
  { altitudeFt: 7000, vyseKias: 77, ratesFpm: [259, 147, 47, -43] },
];

const COMMON_1080_ROWS: P2006TOeiRow[] = [
  { altitudeFt: 0, vyseKias: 80, ratesFpm: [436, 330, 235, 149] },
  { altitudeFt: 1000, vyseKias: 80, ratesFpm: [396, 290, 196, 111] },
  { altitudeFt: 2000, vyseKias: 79, ratesFpm: [355, 251, 157, 73] },
  { altitudeFt: 3000, vyseKias: 79, ratesFpm: [315, 211, 118, 35] },
  { altitudeFt: 4000, vyseKias: 79, ratesFpm: [275, 172, 80, -3] },
  { altitudeFt: 5000, vyseKias: 79, ratesFpm: [234, 132, 41, -41] },
  { altitudeFt: 6000, vyseKias: 78, ratesFpm: [194, 93, 3, -78] },
  { altitudeFt: 7000, vyseKias: 78, ratesFpm: [154, 54, -35, -116] },
];

const EAQ_1180_ROWS: P2006TOeiRow[] = [
  { altitudeFt: 0, vyseKias: 80, ratesFpm: [362, 261, 171, 89] },
  { altitudeFt: 1000, vyseKias: 80, ratesFpm: [324, 224, 134, 53] },
  { altitudeFt: 2000, vyseKias: 80, ratesFpm: [285, 186, 97, 17] },
  { altitudeFt: 3000, vyseKias: 79, ratesFpm: [247, 148, 60, -19] },
  { altitudeFt: 4000, vyseKias: 79, ratesFpm: [209, 111, 24, -55] },
  { altitudeFt: 5000, vyseKias: 79, ratesFpm: [171, 74, -13, -91] },
  { altitudeFt: 6000, vyseKias: 79, ratesFpm: [132, 36, -49, -127] },
  { altitudeFt: 7000, vyseKias: 78, ratesFpm: [94, -1, -86, -163] },
];

const INCREASED_MTOW_1230_ROWS: P2006TOeiRow[] = [
  { altitudeFt: 0, vyseKias: 84, ratesFpm: [330, 230, 142, 62] },
  { altitudeFt: 1000, vyseKias: 83, ratesFpm: [292, 193, 106, 26] },
  { altitudeFt: 2000, vyseKias: 82, ratesFpm: [254, 157, 69, -9] },
  { altitudeFt: 3000, vyseKias: 81, ratesFpm: [216, 120, 33, -44] },
  { altitudeFt: 4000, vyseKias: 80, ratesFpm: [179, 83, -3, -80] },
  { altitudeFt: 5000, vyseKias: 79, ratesFpm: [141, 46, -38, -115] },
  { altitudeFt: 6000, vyseKias: 79, ratesFpm: [104, 10, -74, -150] },
  { altitudeFt: 7000, vyseKias: 78, ratesFpm: [67, -27, -110, -185] },
];

const TABLES: Record<P2006TRegistration, P2006TOeiWeightTable[]> = {
  "CS-EAQ": [
    { weightKg: 930, rows: COMMON_930_ROWS },
    { weightKg: 1080, rows: COMMON_1080_ROWS },
    { weightKg: 1180, rows: EAQ_1180_ROWS },
  ],
  "CS-EBX": [
    { weightKg: 930, rows: COMMON_930_ROWS },
    { weightKg: 1080, rows: COMMON_1080_ROWS },
    { weightKg: 1230, rows: INCREASED_MTOW_1230_ROWS },
  ],
  "D-GSEV": [
    { weightKg: 930, rows: COMMON_930_ROWS },
    { weightKg: 1080, rows: COMMON_1080_ROWS },
    { weightKg: 1230, rows: INCREASED_MTOW_1230_ROWS },
  ],
};

const SOURCE_PAGE: Record<P2006TRegistration, string> = {
  "CS-EAQ": "5-14",
  "CS-EBX": "SW5-14",
  "D-GSEV": "S5-14",
};

export const DEFAULT_P2006T_OEI_GRID: P2006TOeiGridRect = {
  x: 0.285,
  y: 0.278,
  width: 0.61,
  height: 0.535,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function bracket(value: number, values: readonly number[]) {
  const limited = clamp(value, values[0], values[values.length - 1]);
  let lower = values[0];
  let upper = values[values.length - 1];

  for (const candidate of values) {
    if (candidate <= limited) lower = candidate;
    if (candidate >= limited) {
      upper = candidate;
      break;
    }
  }

  return Array.from(new Set([lower, upper]));
}

function isaTemperatureC(pressureAltitudeFt: number) {
  return 15 - 1.9812 * (pressureAltitudeFt / 1000);
}

function addCells(
  cells: P2006TOeiTraceCell[],
  registration: P2006TRegistration,
  weights: number[],
  altitudes: number[],
  temperatures: number[],
  purpose: P2006TOeiTraceCell["purpose"],
  includeVyse: boolean
) {
  const tables = TABLES[registration];

  weights.forEach((weightKg) => {
    const weightIndex = tables.findIndex((table) => table.weightKg === weightKg);
    if (weightIndex < 0) return;

    altitudes.forEach((altitudeFt) => {
      const altitudeIndex = P2006T_OEI_ALTITUDES_FT.indexOf(
        altitudeFt as (typeof P2006T_OEI_ALTITUDES_FT)[number]
      );
      if (altitudeIndex < 0) return;
      const rowIndex = weightIndex * P2006T_OEI_ALTITUDES_FT.length + altitudeIndex;

      if (includeVyse) {
        cells.push({
          rowIndex,
          columnIndex: 0,
          weightKg,
          altitudeFt,
          purpose,
        });
      }

      temperatures.forEach((temperatureC) => {
        const temperatureIndex = P2006T_OEI_TEMPERATURES_C.indexOf(
          temperatureC as (typeof P2006T_OEI_TEMPERATURES_C)[number]
        );
        if (temperatureIndex < 0) return;
        cells.push({
          rowIndex,
          columnIndex: temperatureIndex + 1,
          weightKg,
          altitudeFt,
          purpose,
        });
      });
    });
  });
}

export function getP2006TOeiTables(registration: P2006TRegistration) {
  return TABLES[registration];
}

export function getP2006TOeiSourcePage(registration: P2006TRegistration) {
  return SOURCE_PAGE[registration];
}

export function getP2006TOeiGrid(registration: P2006TRegistration) {
  if (typeof window === "undefined") return DEFAULT_P2006T_OEI_GRID;

  try {
    const raw = window.localStorage.getItem(P2006T_OEI_MAPPER_STORAGE_KEY);
    const store = raw ? (JSON.parse(raw) as P2006TOeiMapperStore) : {};
    return store[registration]?.rect ?? DEFAULT_P2006T_OEI_GRID;
  } catch {
    return DEFAULT_P2006T_OEI_GRID;
  }
}

export function getP2006TOeiTraceCells({
  registration,
  weightKg,
  pressureAltitudeFt,
  oatC,
  calculation,
}: {
  registration: P2006TRegistration;
  weightKg: number;
  pressureAltitudeFt: number;
  oatC: number;
  calculation: P2006TOeiCalculation;
}) {
  const tables = TABLES[registration];
  const weights = bracket(weightKg, tables.map((table) => table.weightKg));
  const gradientAltitudes = bracket(
    pressureAltitudeFt,
    P2006T_OEI_ALTITUDES_FT
  );
  const gradientTemperatures = bracket(oatC, P2006T_OEI_TEMPERATURES_C);
  const cells: P2006TOeiTraceCell[] = [];

  addCells(
    cells,
    registration,
    weights,
    gradientAltitudes,
    gradientTemperatures,
    "gradient",
    true
  );

  [
    calculation.serviceCeilingLowerAltitudeFt,
    calculation.serviceCeilingUpperAltitudeFt,
  ].forEach((altitudeFt) => {
    const publishedAltitude = bracket(
      altitudeFt,
      P2006T_OEI_ALTITUDES_FT
    );
    const tableOatC =
      isaTemperatureC(altitudeFt) + calculation.isaDeviationC;
    const temperatures = bracket(tableOatC, P2006T_OEI_TEMPERATURES_C);
    addCells(
      cells,
      registration,
      weights,
      publishedAltitude,
      temperatures,
      "ceiling",
      false
    );
  });

  const unique = new Map<string, P2006TOeiTraceCell>();
  cells.forEach((cell) => {
    const key = `${cell.rowIndex}:${cell.columnIndex}:${cell.purpose}`;
    unique.set(key, cell);
  });
  return Array.from(unique.values());
}
