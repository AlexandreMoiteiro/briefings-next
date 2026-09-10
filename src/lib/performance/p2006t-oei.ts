import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";

const TEMPERATURES_C = [-25, 0, 25, 50] as const;
const ALTITUDES_FT = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000] as const;
const STANDARD_DENSITY_KG_M3 = 1.225;
const FEET_PER_MINUTE_PER_KNOT = 101.268591;

type OeiRow = {
  altitudeFt: number;
  vyseKias: number;
  ratesFpm: [number, number, number, number];
};

type WeightTable = {
  weightKg: number;
  rows: OeiRow[];
};

type EvaluatedPoint = {
  altitudeFt: number;
  oatC: number;
  vyseKias: number;
  rocFpm: number;
  temperatureLimited: boolean;
  altitudeLimited: boolean;
  weightLimited: boolean;
};

export type P2006TOeiCalculation = {
  sourcePage: string;
  weightKg: number;
  pressureAltitudeFt: number;
  oatC: number;
  isaDeviationC: number;
  vyseKias: number;
  tasKt: number;
  rocFpm: number;
  gradientPct: number;
  serviceCeilingFt: number;
  serviceCeilingLowerAltitudeFt: number;
  serviceCeilingUpperAltitudeFt: number;
  serviceCeilingLowerRocFpm: number;
  serviceCeilingUpperRocFpm: number;
  serviceCeilingExtrapolated: boolean;
  limitedToPublishedRange: boolean;
};

const COMMON_930_ROWS: OeiRow[] = [
  { altitudeFt: 0, vyseKias: 79, ratesFpm: [574, 455, 349, 253] },
  { altitudeFt: 1000, vyseKias: 79, ratesFpm: [529, 411, 305, 211] },
  { altitudeFt: 2000, vyseKias: 79, ratesFpm: [483, 367, 262, 168] },
  { altitudeFt: 3000, vyseKias: 78, ratesFpm: [438, 322, 219, 126] },
  { altitudeFt: 4000, vyseKias: 78, ratesFpm: [393, 278, 176, 83] },
  { altitudeFt: 5000, vyseKias: 78, ratesFpm: [348, 235, 133, 41] },
  { altitudeFt: 6000, vyseKias: 78, ratesFpm: [304, 191, 90, -1] },
  { altitudeFt: 7000, vyseKias: 77, ratesFpm: [259, 147, 47, -43] },
];

const COMMON_1080_ROWS: OeiRow[] = [
  { altitudeFt: 0, vyseKias: 80, ratesFpm: [436, 330, 235, 149] },
  { altitudeFt: 1000, vyseKias: 80, ratesFpm: [396, 290, 196, 111] },
  { altitudeFt: 2000, vyseKias: 79, ratesFpm: [355, 251, 157, 73] },
  { altitudeFt: 3000, vyseKias: 79, ratesFpm: [315, 211, 118, 35] },
  { altitudeFt: 4000, vyseKias: 79, ratesFpm: [275, 172, 80, -3] },
  { altitudeFt: 5000, vyseKias: 79, ratesFpm: [234, 132, 41, -41] },
  { altitudeFt: 6000, vyseKias: 78, ratesFpm: [194, 93, 3, -78] },
  { altitudeFt: 7000, vyseKias: 78, ratesFpm: [154, 54, -35, -116] },
];

const EAQ_1180_ROWS: OeiRow[] = [
  { altitudeFt: 0, vyseKias: 80, ratesFpm: [362, 261, 171, 89] },
  { altitudeFt: 1000, vyseKias: 80, ratesFpm: [324, 224, 134, 53] },
  { altitudeFt: 2000, vyseKias: 80, ratesFpm: [285, 186, 97, 17] },
  { altitudeFt: 3000, vyseKias: 79, ratesFpm: [247, 148, 60, -19] },
  { altitudeFt: 4000, vyseKias: 79, ratesFpm: [209, 111, 24, -55] },
  { altitudeFt: 5000, vyseKias: 79, ratesFpm: [171, 74, -13, -91] },
  { altitudeFt: 6000, vyseKias: 79, ratesFpm: [132, 36, -49, -127] },
  { altitudeFt: 7000, vyseKias: 78, ratesFpm: [94, -1, -86, -163] },
];

const INCREASED_MTOW_1230_ROWS: OeiRow[] = [
  { altitudeFt: 0, vyseKias: 84, ratesFpm: [330, 230, 142, 62] },
  { altitudeFt: 1000, vyseKias: 83, ratesFpm: [292, 193, 106, 26] },
  { altitudeFt: 2000, vyseKias: 82, ratesFpm: [254, 157, 69, -9] },
  { altitudeFt: 3000, vyseKias: 81, ratesFpm: [216, 120, 33, -44] },
  { altitudeFt: 4000, vyseKias: 80, ratesFpm: [179, 83, -3, -80] },
  { altitudeFt: 5000, vyseKias: 79, ratesFpm: [141, 46, -38, -115] },
  { altitudeFt: 6000, vyseKias: 79, ratesFpm: [104, 10, -74, -150] },
  { altitudeFt: 7000, vyseKias: 78, ratesFpm: [67, -27, -110, -185] },
];

const TABLES: Record<P2006TRegistration, WeightTable[]> = {
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
  "CS-EAQ": "AFM 5-14",
  "CS-EBX": "AFM SW5-14",
  "D-GSEV": "AFM S5-14",
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolate(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

function bracket(value: number, values: readonly number[]) {
  const minimum = values[0];
  const maximum = values[values.length - 1];
  const limited = clamp(value, minimum, maximum);
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
    limited: limited !== value,
  };
}

function temperatureRate(row: OeiRow, oatC: number) {
  const temperature = bracket(oatC, TEMPERATURES_C);
  const lowerIndex = TEMPERATURES_C.indexOf(
    temperature.lower as (typeof TEMPERATURES_C)[number]
  );
  const upperIndex = TEMPERATURES_C.indexOf(
    temperature.upper as (typeof TEMPERATURES_C)[number]
  );

  return {
    rateFpm: interpolate(
      row.ratesFpm[lowerIndex],
      row.ratesFpm[upperIndex],
      temperature.ratio
    ),
    limited: temperature.limited,
  };
}

function evaluateTable(table: WeightTable, altitudeFt: number, oatC: number) {
  const altitude = bracket(altitudeFt, ALTITUDES_FT);
  const lowerRow = table.rows.find(
    (row) => row.altitudeFt === altitude.lower
  );
  const upperRow = table.rows.find(
    (row) => row.altitudeFt === altitude.upper
  );

  if (!lowerRow || !upperRow) {
    throw new Error("P2006T OEI altitude row is unavailable.");
  }

  const lower = temperatureRate(lowerRow, oatC);
  const upper = temperatureRate(upperRow, oatC);

  return {
    rocFpm: interpolate(lower.rateFpm, upper.rateFpm, altitude.ratio),
    vyseKias: interpolate(lowerRow.vyseKias, upperRow.vyseKias, altitude.ratio),
    temperatureLimited: lower.limited || upper.limited,
    altitudeLimited: altitude.limited,
  };
}

function evaluatePoint(
  registration: P2006TRegistration,
  weightKg: number,
  altitudeFt: number,
  oatC: number
): EvaluatedPoint {
  const tables = TABLES[registration];
  const weights = tables.map((table) => table.weightKg);
  const weight = bracket(weightKg, weights);
  const lowerTable = tables.find((table) => table.weightKg === weight.lower);
  const upperTable = tables.find((table) => table.weightKg === weight.upper);

  if (!lowerTable || !upperTable) {
    throw new Error("P2006T OEI weight table is unavailable.");
  }

  const lower = evaluateTable(lowerTable, altitudeFt, oatC);
  const upper = evaluateTable(upperTable, altitudeFt, oatC);

  return {
    altitudeFt,
    oatC,
    vyseKias: interpolate(lower.vyseKias, upper.vyseKias, weight.ratio),
    rocFpm: interpolate(lower.rocFpm, upper.rocFpm, weight.ratio),
    temperatureLimited:
      lower.temperatureLimited || upper.temperatureLimited,
    altitudeLimited: lower.altitudeLimited || upper.altitudeLimited,
    weightLimited: weight.limited,
  };
}

function isaTemperatureC(pressureAltitudeFt: number) {
  return 15 - 1.9812 * (pressureAltitudeFt / 1000);
}

function approximateTasKt(kias: number, pressureAltitudeFt: number, oatC: number) {
  const altitudeM = clamp(pressureAltitudeFt * 0.3048, -500, 11000);
  const pressurePa =
    101325 * Math.pow(1 - (0.0065 * altitudeM) / 288.15, 5.255877);
  const temperatureK = Math.max(180, oatC + 273.15);
  const density = pressurePa / (287.05287 * temperatureK);
  return kias * Math.sqrt(STANDARD_DENSITY_KG_M3 / Math.max(0.2, density));
}

function calculateServiceCeiling(
  registration: P2006TRegistration,
  weightKg: number,
  isaDeviationC: number
) {
  const points = ALTITUDES_FT.map((altitudeFt) =>
    evaluatePoint(
      registration,
      weightKg,
      altitudeFt,
      isaTemperatureC(altitudeFt) + isaDeviationC
    )
  );

  let lower = points[0];
  let upper = points[1];
  let extrapolated = false;
  const crossing = points.slice(0, -1).findIndex((point, index) => {
    const next = points[index + 1];
    return (
      (point.rocFpm >= 50 && next.rocFpm <= 50) ||
      (point.rocFpm <= 50 && next.rocFpm >= 50)
    );
  });

  if (crossing >= 0) {
    lower = points[crossing];
    upper = points[crossing + 1];
  } else if (points[points.length - 1].rocFpm > 50) {
    lower = points[points.length - 2];
    upper = points[points.length - 1];
    extrapolated = true;
  } else if (points[0].rocFpm < 50) {
    lower = points[0];
    upper = points[1];
    extrapolated = true;
  } else {
    const nearestIndex = points.reduce(
      (best, point, index) =>
        Math.abs(point.rocFpm - 50) < Math.abs(points[best].rocFpm - 50)
          ? index
          : best,
      0
    );
    lower = points[Math.max(0, nearestIndex - 1)];
    upper = points[Math.min(points.length - 1, nearestIndex + 1)];
    extrapolated = true;
  }

  const denominator = upper.rocFpm - lower.rocFpm;
  const calculated =
    Math.abs(denominator) < 0.001
      ? lower.altitudeFt
      : lower.altitudeFt +
        ((50 - lower.rocFpm) / denominator) *
          (upper.altitudeFt - lower.altitudeFt);

  return {
    serviceCeilingFt: Math.max(0, calculated),
    lower,
    upper,
    extrapolated,
    limited: points.some(
      (point) => point.temperatureLimited || point.weightLimited
    ),
  };
}

export function calculateP2006TOeiPerformance({
  registration,
  weightKg,
  pressureAltitudeFt,
  oatC,
}: {
  registration: P2006TRegistration;
  weightKg: number;
  pressureAltitudeFt: number;
  oatC: number;
}): P2006TOeiCalculation {
  const point = evaluatePoint(
    registration,
    weightKg,
    pressureAltitudeFt,
    oatC
  );
  const tasKt = approximateTasKt(
    point.vyseKias,
    pressureAltitudeFt,
    oatC
  );
  const gradientPct =
    (point.rocFpm / Math.max(1, tasKt * FEET_PER_MINUTE_PER_KNOT)) * 100;
  const isaDeviationC = oatC - isaTemperatureC(pressureAltitudeFt);
  const ceiling = calculateServiceCeiling(
    registration,
    weightKg,
    isaDeviationC
  );

  return {
    sourcePage: SOURCE_PAGE[registration],
    weightKg,
    pressureAltitudeFt,
    oatC,
    isaDeviationC,
    vyseKias: point.vyseKias,
    tasKt,
    rocFpm: point.rocFpm,
    gradientPct,
    serviceCeilingFt: ceiling.serviceCeilingFt,
    serviceCeilingLowerAltitudeFt: ceiling.lower.altitudeFt,
    serviceCeilingUpperAltitudeFt: ceiling.upper.altitudeFt,
    serviceCeilingLowerRocFpm: ceiling.lower.rocFpm,
    serviceCeilingUpperRocFpm: ceiling.upper.rocFpm,
    serviceCeilingExtrapolated: ceiling.extrapolated,
    limitedToPublishedRange:
      point.temperatureLimited ||
      point.altitudeLimited ||
      point.weightLimited ||
      ceiling.limited,
  };
}
