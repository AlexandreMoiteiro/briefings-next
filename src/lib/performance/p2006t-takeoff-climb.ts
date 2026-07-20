import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";

type TakeoffClimbRow = {
  altitudeFt: number;
  speedKias: number;
  ratesFpm: [number, number, number, number];
};

type WeightTable = {
  weightKg: number;
  rows: TakeoffClimbRow[];
};

export type P2006TTakeoffClimbPerformance = {
  speedKias: number;
  rateFpm: number;
  limitedToPublishedRange: boolean;
  source: "AFM take-off rate of climb at Vy";
};

const TEMPERATURES_C = [-25, 0, 25, 50] as const;

const COMMON_930_ROWS: TakeoffClimbRow[] = [
  { altitudeFt: 0, speedKias: 85, ratesFpm: [1803, 1575, 1372, 1189] },
  { altitudeFt: 2000, speedKias: 82, ratesFpm: [1630, 1406, 1206, 1026] },
  { altitudeFt: 4000, speedKias: 79, ratesFpm: [1457, 1238, 1041, 864] },
  { altitudeFt: 6000, speedKias: 75, ratesFpm: [1286, 1070, 877, 703] },
  { altitudeFt: 8000, speedKias: 72, ratesFpm: [1114, 902, 713, 542] },
  { altitudeFt: 10000, speedKias: 69, ratesFpm: [944, 735, 549, 382] },
  { altitudeFt: 12000, speedKias: 65, ratesFpm: [774, 569, 387, 222] },
  { altitudeFt: 14000, speedKias: 62, ratesFpm: [604, 404, 224, 63] },
];

const COMMON_1080_ROWS: TakeoffClimbRow[] = [
  { altitudeFt: 0, speedKias: 85, ratesFpm: [1507, 1302, 1119, 954] },
  { altitudeFt: 2000, speedKias: 82, ratesFpm: [1351, 1150, 970, 808] },
  { altitudeFt: 4000, speedKias: 79, ratesFpm: [1196, 998, 822, 662] },
  { altitudeFt: 6000, speedKias: 76, ratesFpm: [1041, 847, 674, 517] },
  { altitudeFt: 8000, speedKias: 73, ratesFpm: [887, 696, 526, 372] },
  { altitudeFt: 10000, speedKias: 69, ratesFpm: [734, 546, 379, 228] },
  { altitudeFt: 12000, speedKias: 66, ratesFpm: [581, 397, 232, 84] },
  { altitudeFt: 14000, speedKias: 63, ratesFpm: [428, 248, 86, -59] },
];

const EAQ_1180_ROWS: TakeoffClimbRow[] = [
  { altitudeFt: 0, speedKias: 85, ratesFpm: [1347, 1154, 982, 826] },
  { altitudeFt: 2000, speedKias: 82, ratesFpm: [1200, 1010, 841, 688] },
  { altitudeFt: 4000, speedKias: 79, ratesFpm: [1054, 867, 701, 551] },
  { altitudeFt: 6000, speedKias: 76, ratesFpm: [908, 725, 561, 413] },
  { altitudeFt: 8000, speedKias: 73, ratesFpm: [763, 583, 422, 277] },
  { altitudeFt: 10000, speedKias: 70, ratesFpm: [618, 441, 283, 141] },
  { altitudeFt: 12000, speedKias: 67, ratesFpm: [473, 300, 145, 5] },
  { altitudeFt: 14000, speedKias: 64, ratesFpm: [330, 159, 7, -130] },
];

const INCREASED_MTOW_1230_ROWS: TakeoffClimbRow[] = [
  { altitudeFt: 0, speedKias: 86, ratesFpm: [1276, 1088, 920, 768] },
  { altitudeFt: 2000, speedKias: 83, ratesFpm: [1133, 948, 783, 634] },
  { altitudeFt: 4000, speedKias: 79, ratesFpm: [990, 809, 646, 500] },
  { altitudeFt: 6000, speedKias: 76, ratesFpm: [848, 670, 510, 366] },
  { altitudeFt: 8000, speedKias: 73, ratesFpm: [707, 531, 374, 233] },
  { altitudeFt: 10000, speedKias: 70, ratesFpm: [565, 393, 239, 100] },
  { altitudeFt: 12000, speedKias: 67, ratesFpm: [425, 256, 104, -32] },
  { altitudeFt: 14000, speedKias: 64, ratesFpm: [285, 118, -30, -164] },
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

function bracket(value: number, values: readonly number[]) {
  if (!values.length) return null;
  const limitedValue = clamp(value, values[0], values[values.length - 1]);
  let lowerIndex = 0;
  let upperIndex = values.length - 1;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] <= limitedValue) lowerIndex = index;
    if (values[index] >= limitedValue) {
      upperIndex = index;
      break;
    }
  }

  const lowerValue = values[lowerIndex];
  const upperValue = values[upperIndex];
  return {
    lowerIndex,
    upperIndex,
    ratio:
      upperValue === lowerValue
        ? 0
        : (limitedValue - lowerValue) / (upperValue - lowerValue),
    limited: limitedValue !== value,
  };
}

function interpolateTemperature(row: TakeoffClimbRow, oatC: number) {
  const temperature = bracket(oatC, TEMPERATURES_C);
  if (!temperature) return null;
  return {
    rateFpm: lerp(
      row.ratesFpm[temperature.lowerIndex],
      row.ratesFpm[temperature.upperIndex],
      temperature.ratio
    ),
    limited: temperature.limited,
  };
}

function performanceAtPublishedWeight(
  rows: TakeoffClimbRow[],
  pressureAltitudeFt: number,
  oatC: number
) {
  const altitude = bracket(
    pressureAltitudeFt,
    rows.map((row) => row.altitudeFt)
  );
  if (!altitude) return null;

  const lowerRow = rows[altitude.lowerIndex];
  const upperRow = rows[altitude.upperIndex];
  const lowerRate = interpolateTemperature(lowerRow, oatC);
  const upperRate = interpolateTemperature(upperRow, oatC);
  if (!lowerRate || !upperRate) return null;

  return {
    speedKias: lerp(lowerRow.speedKias, upperRow.speedKias, altitude.ratio),
    rateFpm: lerp(lowerRate.rateFpm, upperRate.rateFpm, altitude.ratio),
    limited: altitude.limited || lowerRate.limited || upperRate.limited,
  };
}

export function p2006tTakeoffClimbPerformance(
  registration: P2006TRegistration,
  weightKg: number,
  pressureAltitudeFt: number,
  oatC: number
): P2006TTakeoffClimbPerformance | null {
  const tables = TABLES[registration];
  const weight = bracket(
    weightKg,
    tables.map((table) => table.weightKg)
  );
  if (!weight) return null;

  const lower = performanceAtPublishedWeight(
    tables[weight.lowerIndex].rows,
    pressureAltitudeFt,
    oatC
  );
  const upper = performanceAtPublishedWeight(
    tables[weight.upperIndex].rows,
    pressureAltitudeFt,
    oatC
  );
  if (!lower || !upper) return null;

  return {
    speedKias: lerp(lower.speedKias, upper.speedKias, weight.ratio),
    rateFpm: Math.max(0, lerp(lower.rateFpm, upper.rateFpm, weight.ratio)),
    limitedToPublishedRange: weight.limited || lower.limited || upper.limited,
    source: "AFM take-off rate of climb at Vy",
  };
}
