import type { NavlogLegProfile } from "@/lib/navlog";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import type { P2006TNavlogConditions } from "@/lib/performance/p2006t-navlog-settings";

type ClimbRow = {
  altitudeFt: number;
  speedKias: number;
  rates: [number, number, number, number];
};

type CruiseRow = {
  rpm: number;
  mapInHg: number;
  values: [CruiseValue, CruiseValue, CruiseValue];
};

type CruiseValue = {
  powerPercent: number;
  ktas: number;
  fuelLphPerEngine: number;
};

type CruiseChart = {
  altitudeFt: number;
  rows: CruiseRow[];
};

export type P2006TNavlogPerformance = {
  tasKt: number;
  fuelFlowLh: number;
  rateFpm: number | null;
  powerPercent: number | null;
  limitedToPublishedRange: boolean;
  source: "AFM enroute climb Vy" | "AFM cruise tables";
};

const CLIMB_TEMPERATURES = [-25, 0, 25, 50] as const;
const CRUISE_ISA_DEVIATIONS = [-30, 0, 30] as const;
const P2006T_REGISTRATION_SET = new Set<P2006TRegistration>([
  "CS-EAQ",
  "CS-EBX",
  "D-GSEV",
]);

const COMMON_1080_ROWS: ClimbRow[] = [
  { altitudeFt: 0, speedKias: 83, rates: [1560, 1360, 1182, 1022] },
  { altitudeFt: 2000, speedKias: 82, rates: [1408, 1212, 1037, 879] },
  { altitudeFt: 4000, speedKias: 80, rates: [1257, 1064, 892, 737] },
  { altitudeFt: 6000, speedKias: 78, rates: [1106, 917, 748, 595] },
  { altitudeFt: 8000, speedKias: 76, rates: [956, 770, 604, 454] },
  { altitudeFt: 10000, speedKias: 74, rates: [807, 624, 461, 314] },
  { altitudeFt: 12000, speedKias: 72, rates: [657, 478, 318, 173] },
  { altitudeFt: 14000, speedKias: 70, rates: [509, 333, 175, 34] },
];

const COMMON_930_ROWS: ClimbRow[] = [
  { altitudeFt: 0, speedKias: 82, rates: [1873, 1649, 1449, 1269] },
  { altitudeFt: 2000, speedKias: 81, rates: [1703, 1483, 1286, 1109] },
  { altitudeFt: 4000, speedKias: 79, rates: [1533, 1317, 1124, 950] },
  { altitudeFt: 6000, speedKias: 77, rates: [1364, 1151, 962, 791] },
  { altitudeFt: 8000, speedKias: 75, rates: [1196, 987, 800, 632] },
  { altitudeFt: 10000, speedKias: 73, rates: [1028, 823, 639, 474] },
  { altitudeFt: 12000, speedKias: 71, rates: [860, 659, 479, 317] },
  { altitudeFt: 14000, speedKias: 69, rates: [693, 496, 319, 160] },
];

const EAQ_MAX_ROWS: ClimbRow[] = [
  { altitudeFt: 0, speedKias: 84, rates: [1392, 1205, 1038, 887] },
  { altitudeFt: 2000, speedKias: 83, rates: [1249, 1066, 901, 753] },
  { altitudeFt: 4000, speedKias: 81, rates: [1108, 927, 766, 620] },
  { altitudeFt: 6000, speedKias: 79, rates: [966, 789, 630, 487] },
  { altitudeFt: 8000, speedKias: 77, rates: [826, 651, 495, 355] },
  { altitudeFt: 10000, speedKias: 75, rates: [685, 514, 361, 223] },
  { altitudeFt: 12000, speedKias: 73, rates: [545, 377, 227, 92] },
  { altitudeFt: 14000, speedKias: 71, rates: [406, 241, 93, -39] },
];

const INCREASED_MTOW_MAX_ROWS: ClimbRow[] = [
  { altitudeFt: 0, speedKias: 84, rates: [1317, 1135, 973, 827] },
  { altitudeFt: 2000, speedKias: 83, rates: [1179, 1000, 841, 697] },
  { altitudeFt: 4000, speedKias: 81, rates: [1041, 865, 709, 568] },
  { altitudeFt: 6000, speedKias: 80, rates: [904, 731, 577, 439] },
  { altitudeFt: 8000, speedKias: 78, rates: [767, 598, 446, 310] },
  { altitudeFt: 10000, speedKias: 77, rates: [631, 464, 316, 182] },
  { altitudeFt: 12000, speedKias: 75, rates: [495, 332, 186, 54] },
  { altitudeFt: 14000, speedKias: 73, rates: [360, 199, 56, -73] },
];

const CLIMB_ROWS: Record<
  P2006TRegistration,
  Array<{ weightKg: number; rows: ClimbRow[] }>
> = {
  "CS-EAQ": [
    { weightKg: 930, rows: COMMON_930_ROWS },
    { weightKg: 1080, rows: COMMON_1080_ROWS },
    { weightKg: 1180, rows: EAQ_MAX_ROWS },
  ],
  "CS-EBX": [
    { weightKg: 930, rows: COMMON_930_ROWS },
    { weightKg: 1080, rows: COMMON_1080_ROWS },
    { weightKg: 1230, rows: INCREASED_MTOW_MAX_ROWS },
  ],
  "D-GSEV": [
    { weightKg: 930, rows: COMMON_930_ROWS },
    { weightKg: 1080, rows: COMMON_1080_ROWS },
    { weightKg: 1230, rows: INCREASED_MTOW_MAX_ROWS },
  ],
};

function cruiseRow(
  rpm: number,
  mapInHg: number,
  values: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
): CruiseRow {
  return {
    rpm,
    mapInHg,
    values: [
      {
        powerPercent: values[0],
        ktas: values[1],
        fuelLphPerEngine: values[2],
      },
      {
        powerPercent: values[3],
        ktas: values[4],
        fuelLphPerEngine: values[5],
      },
      {
        powerPercent: values[6],
        ktas: values[7],
        fuelLphPerEngine: values[8],
      },
    ],
  };
}

const CRUISE_0_ROWS: CruiseRow[] = [
  cruiseRow(2250, 29.5, [103, 143, 28.6, 97, 145, 27.1, 92, 146, 25.8]),
  cruiseRow(2250, 28, [88, 134, 24.5, 83, 136, 23.2, 79, 138, 22]),
  cruiseRow(2250, 26, [69, 122, 19.2, 65, 124, 18.2, 62, 125, 17.3]),
  cruiseRow(2250, 24, [59, 115, 16.6, 56, 116, 15.7, 53, 117, 14.9]),
  cruiseRow(2250, 22, [46, 103, 12.8, 43, 103, 12.1, 41, 103, 11.5]),
  cruiseRow(2250, 20, [39, 96, 11, 37, 95, 10.4, 35, 94, 9.9]),
  cruiseRow(2100, 28, [84, 132, 23.5, 80, 134, 22.2, 76, 135, 21.1]),
  cruiseRow(2100, 26, [66, 121, 18.5, 63, 122, 17.5, 60, 123, 16.7]),
  cruiseRow(2100, 24, [57, 114, 16, 54, 114, 15.1, 52, 115, 14.4]),
  cruiseRow(2100, 22, [43, 100, 12.1, 41, 100, 11.5, 39, 100, 10.9]),
  cruiseRow(2100, 20, [37, 92, 10.2, 35, 91, 9.7, 33, 89, 9.2]),
  cruiseRow(1900, 26, [61, 117, 17.1, 58, 118, 16.2, 55, 119, 15.4]),
  cruiseRow(1900, 24, [53, 110, 14.9, 50, 111, 14.1, 48, 111, 13.4]),
  cruiseRow(1900, 22, [41, 97, 11.4, 39, 97, 10.8, 37, 96, 10.2]),
  cruiseRow(1900, 20, [35, 89, 9.6, 33, 88, 9.1, 31, 85, 8.7]),
];

const CRUISE_3000_ROWS: CruiseRow[] = [
  cruiseRow(2388, 26.4, [92, 141, 25.7, 87, 143, 24.3, 83, 144, 23.1]),
  cruiseRow(2250, 26.4, [89, 139, 25, 85, 141, 23.6, 80, 143, 22.4]),
  cruiseRow(2250, 26, [85, 137, 23.9, 81, 138, 22.6, 77, 140, 21.5]),
  cruiseRow(2250, 24, [72, 128, 20, 68, 129, 18.9, 64, 130, 18]),
  cruiseRow(2250, 22, [57, 116, 16, 54, 117, 15.1, 51, 118, 14.3]),
  cruiseRow(2250, 20, [48, 108, 13.4, 45, 108, 12.7, 43, 108, 12.1]),
  cruiseRow(2100, 26.4, [85, 137, 23.9, 81, 138, 22.6, 77, 140, 21.4]),
  cruiseRow(2100, 26, [82, 134, 22.8, 77, 136, 21.6, 73, 137, 20.5]),
  cruiseRow(2100, 24, [69, 125, 19.2, 65, 127, 18.1, 62, 128, 17.2]),
  cruiseRow(2100, 22, [54, 114, 15.2, 51, 114, 14.3, 49, 115, 13.6]),
  cruiseRow(2100, 20, [45, 104, 12.6, 43, 104, 11.9, 41, 104, 11.3]),
  cruiseRow(1900, 26.4, [78, 132, 21.9, 74, 134, 20.7, 70, 135, 19.6]),
  cruiseRow(1900, 26, [75, 130, 20.9, 71, 131, 19.8, 67, 132, 18.8]),
  cruiseRow(1900, 24, [63, 121, 17.7, 60, 122, 16.7, 57, 123, 15.9]),
  cruiseRow(1900, 22, [50, 110, 14.1, 48, 110, 13.3, 45, 110, 12.6]),
  cruiseRow(1900, 20, [42, 101, 11.7, 40, 101, 11.1, 38, 100, 10.6]),
];

const CRUISE_6000_ROWS: CruiseRow[] = [
  cruiseRow(2388, 23.6, [83, 139, 23.3, 79, 141, 22, 75, 142, 20.9]),
  cruiseRow(2250, 23.6, [81, 138, 22.6, 76, 139, 21.4, 73, 141, 20.3]),
  cruiseRow(2250, 22, [68, 129, 19.1, 65, 130, 18.1, 61, 131, 17.2]),
  cruiseRow(2250, 20, [57, 119, 15.8, 54, 120, 14.9, 51, 120, 14.2]),
  cruiseRow(2250, 18, [46, 108, 12.9, 44, 108, 12.2, 41, 107, 11.6]),
  cruiseRow(2100, 23.6, [77, 135, 21.6, 73, 137, 20.4, 69, 138, 19.4]),
  cruiseRow(2100, 22, [65, 126, 18.2, 62, 127, 17.2, 59, 128, 16.4]),
  cruiseRow(2100, 20, [54, 116, 15, 51, 116, 14.1, 48, 117, 13.4]),
  cruiseRow(2100, 18, [44, 106, 12.4, 42, 106, 11.7, 40, 105, 11.1]),
  cruiseRow(1900, 23.6, [71, 130, 19.8, 67, 132, 18.7, 64, 133, 17.8]),
  cruiseRow(1900, 22, [60, 122, 16.8, 57, 123, 15.8, 54, 123, 15]),
  cruiseRow(1900, 20, [50, 112, 13.9, 47, 112, 13.1, 44, 112, 12.4]),
  cruiseRow(1900, 18, [41, 102, 11.6, 39, 102, 10.9, 37, 100, 10.4]),
];

const CRUISE_9000_ROWS: CruiseRow[] = [
  cruiseRow(2388, 21.1, [75, 137, 20.9, 71, 139, 19.7, 67, 140, 18.7]),
  cruiseRow(2250, 21.1, [73, 136, 20.3, 69, 137, 19.2, 65, 138, 18.2]),
  cruiseRow(2250, 20, [65, 130, 18.3, 62, 131, 17.2, 58, 131, 16.3]),
  cruiseRow(2250, 18, [53, 118, 14.9, 50, 119, 14, 48, 118, 13.3]),
  cruiseRow(2100, 21.1, [69, 133, 19.4, 65, 134, 18.3, 62, 135, 17.4]),
  cruiseRow(2100, 20, [62, 127, 17.4, 59, 128, 16.4, 56, 128, 15.6]),
  cruiseRow(2100, 18, [51, 116, 14.2, 48, 116, 13.4, 46, 116, 12.7]),
  cruiseRow(1900, 21.1, [64, 128, 17.8, 60, 129, 16.8, 57, 130, 15.9]),
  cruiseRow(1900, 20, [57, 122, 16, 54, 123, 15.1, 51, 123, 14.3]),
  cruiseRow(1900, 18, [47, 112, 13.2, 44, 112, 12.4, 42, 111, 11.8]),
];

const BASE_CRUISE_CHARTS: CruiseChart[] = [
  { altitudeFt: 0, rows: CRUISE_0_ROWS },
  { altitudeFt: 3000, rows: CRUISE_3000_ROWS },
  { altitudeFt: 6000, rows: CRUISE_6000_ROWS },
  { altitudeFt: 9000, rows: CRUISE_9000_ROWS },
];

const CRUISE_CHARTS: Record<P2006TRegistration, CruiseChart[]> = {
  "CS-EAQ": BASE_CRUISE_CHARTS.map((chart) =>
    chart.altitudeFt === 3000
      ? {
          ...chart,
          rows: chart.rows.filter(
            (row) => !(row.rpm === 1900 && row.mapInHg === 20)
          ),
        }
      : chart
  ),
  "CS-EBX": BASE_CRUISE_CHARTS,
  "D-GSEV": BASE_CRUISE_CHARTS,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

function bracket(value: number, values: readonly number[]) {
  if (!values.length) return null;
  const clamped = clamp(value, values[0], values[values.length - 1]);
  let lower = 0;
  let upper = values.length - 1;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] <= clamped) lower = index;
    if (values[index] >= clamped) {
      upper = index;
      break;
    }
  }

  const low = values[lower];
  const high = values[upper];
  return {
    lower,
    upper,
    value: clamped,
    ratio: high === low ? 0 : (clamped - low) / (high - low),
    limited: clamped !== value,
  };
}

function interpolateTemperatureRates(
  row: ClimbRow,
  temperatureC: number
) {
  const bracketed = bracket(temperatureC, CLIMB_TEMPERATURES);
  if (!bracketed) return null;
  return {
    rateFpm: lerp(
      row.rates[bracketed.lower],
      row.rates[bracketed.upper],
      bracketed.ratio
    ),
    limited: bracketed.limited,
  };
}

function climbAtPublishedWeight(
  rows: ClimbRow[],
  altitudeFt: number,
  temperatureC: number
) {
  const ordered = [...rows].sort((a, b) => a.altitudeFt - b.altitudeFt);
  const altitude = bracket(
    altitudeFt,
    ordered.map((row) => row.altitudeFt)
  );
  if (!altitude) return null;

  const lower = ordered[altitude.lower];
  const upper = ordered[altitude.upper];
  const lowerRate = interpolateTemperatureRates(lower, temperatureC);
  const upperRate = interpolateTemperatureRates(upper, temperatureC);
  if (!lowerRate || !upperRate) return null;

  return {
    speedKias: lerp(lower.speedKias, upper.speedKias, altitude.ratio),
    rateFpm: lerp(lowerRate.rateFpm, upperRate.rateFpm, altitude.ratio),
    limited:
      altitude.limited || lowerRate.limited || upperRate.limited,
  };
}

function calculateClimbPoint(
  registration: P2006TRegistration,
  weightKg: number,
  altitudeFt: number,
  temperatureC: number
) {
  const groups = CLIMB_ROWS[registration];
  const weights = groups.map((group) => group.weightKg);
  const weight = bracket(weightKg, weights);
  if (!weight) return null;

  const lower = climbAtPublishedWeight(
    groups[weight.lower].rows,
    altitudeFt,
    temperatureC
  );
  const upper = climbAtPublishedWeight(
    groups[weight.upper].rows,
    altitudeFt,
    temperatureC
  );
  if (!lower || !upper) return null;

  return {
    speedKias: lerp(lower.speedKias, upper.speedKias, weight.ratio),
    rateFpm: lerp(lower.rateFpm, upper.rateFpm, weight.ratio),
    limited: weight.limited || lower.limited || upper.limited,
  };
}

function isaTemperatureC(altitudeFt: number) {
  return 15 - 0.0019812 * clamp(altitudeFt, 0, 36089);
}

function indicatedToTrueAirspeed(
  kias: number,
  pressureAltitudeFt: number,
  oatC: number
) {
  const altitude = clamp(pressureAltitudeFt, 0, 36089);
  const pressureRatio = Math.max(
    0.01,
    (1 - 6.87535e-6 * altitude) ** 5.2561
  );
  const temperatureRatio = Math.max(0.1, (oatC + 273.15) / 288.15);
  const densityRatio = pressureRatio / temperatureRatio;
  return kias / Math.sqrt(Math.max(0.05, densityRatio));
}

function cruiseValueAtDeviation(
  row: CruiseRow,
  isaDeviationC: number
) {
  const temperature = bracket(
    isaDeviationC,
    CRUISE_ISA_DEVIATIONS
  );
  if (!temperature) return null;
  const lower = row.values[temperature.lower];
  const upper = row.values[temperature.upper];
  return {
    powerPercent: lerp(
      lower.powerPercent,
      upper.powerPercent,
      temperature.ratio
    ),
    ktas: lerp(lower.ktas, upper.ktas, temperature.ratio),
    fuelLphPerEngine: lerp(
      lower.fuelLphPerEngine,
      upper.fuelLphPerEngine,
      temperature.ratio
    ),
    limited: temperature.limited,
  };
}

function evaluatedCruiseRows(
  chart: CruiseChart,
  rpm: number,
  isaDeviationC: number
) {
  return chart.rows
    .filter((row) => row.rpm === rpm)
    .map((row) => {
      const value = cruiseValueAtDeviation(row, isaDeviationC);
      return value ? { ...value, mapInHg: row.mapInHg } : null;
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .sort((a, b) => a.powerPercent - b.powerPercent);
}

function evaluateAtPower(
  rows: ReturnType<typeof evaluatedCruiseRows>,
  powerPercent: number
) {
  const power = bracket(
    powerPercent,
    rows.map((row) => row.powerPercent)
  );
  if (!power) return null;
  const lower = rows[power.lower];
  const upper = rows[power.upper];
  return {
    powerPercent: power.value,
    ktas: lerp(lower.ktas, upper.ktas, power.ratio),
    fuelLphPerEngine: lerp(
      lower.fuelLphPerEngine,
      upper.fuelLphPerEngine,
      power.ratio
    ),
    limited: power.limited || lower.limited || upper.limited,
  };
}

function calculateCruisePoint(
  registration: P2006TRegistration,
  altitudeFt: number,
  rpm: number,
  powerPercent: number,
  isaDeviationC: number
) {
  const charts = CRUISE_CHARTS[registration];
  const altitude = bracket(
    altitudeFt,
    charts.map((chart) => chart.altitudeFt)
  );
  if (!altitude) return null;

  const lowerRows = evaluatedCruiseRows(
    charts[altitude.lower],
    rpm,
    isaDeviationC
  );
  const upperRows = evaluatedCruiseRows(
    charts[altitude.upper],
    rpm,
    isaDeviationC
  );
  if (!lowerRows.length || !upperRows.length) return null;

  const commonMinimum = Math.max(
    lowerRows[0].powerPercent,
    upperRows[0].powerPercent
  );
  const commonMaximum = Math.min(
    lowerRows[lowerRows.length - 1].powerPercent,
    upperRows[upperRows.length - 1].powerPercent
  );
  const requestedPower =
    commonMinimum <= commonMaximum
      ? clamp(powerPercent, commonMinimum, commonMaximum)
      : powerPercent;

  const lower = evaluateAtPower(lowerRows, requestedPower);
  const upper = evaluateAtPower(upperRows, requestedPower);
  if (!lower || !upper) return null;

  return {
    powerPercent: lerp(
      lower.powerPercent,
      upper.powerPercent,
      altitude.ratio
    ),
    ktas: lerp(lower.ktas, upper.ktas, altitude.ratio),
    fuelFlowLh:
      lerp(
        lower.fuelLphPerEngine,
        upper.fuelLphPerEngine,
        altitude.ratio
      ) * 2,
    limited:
      altitude.limited ||
      requestedPower !== powerPercent ||
      lower.limited ||
      upper.limited,
  };
}

function maximumContinuousFuelFlow(
  registration: P2006TRegistration,
  altitudeFt: number,
  isaDeviationC: number
) {
  const charts = CRUISE_CHARTS[registration];
  const altitude = bracket(
    altitudeFt,
    charts.map((chart) => chart.altitudeFt)
  );
  if (!altitude) return null;

  const maximumAtChart = (chart: CruiseChart) =>
    chart.rows
      .map((row) => cruiseValueAtDeviation(row, isaDeviationC))
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .sort((a, b) => b.powerPercent - a.powerPercent)[0];

  const lower = maximumAtChart(charts[altitude.lower]);
  const upper = maximumAtChart(charts[altitude.upper]);
  if (!lower || !upper) return null;

  return {
    fuelFlowLh:
      lerp(
        lower.fuelLphPerEngine,
        upper.fuelLphPerEngine,
        altitude.ratio
      ) * 2,
    limited: altitude.limited || lower.limited || upper.limited,
  };
}

export function isP2006TRegistration(
  registration: string
): registration is P2006TRegistration {
  return P2006T_REGISTRATION_SET.has(
    registration as P2006TRegistration
  );
}

export function p2006tClimbPerformance(
  registration: P2006TRegistration,
  altitudeFt: number,
  conditions: P2006TNavlogConditions
): P2006TNavlogPerformance | null {
  const oatC =
    isaTemperatureC(altitudeFt) + conditions.isaDeviationC;
  const climb = calculateClimbPoint(
    registration,
    conditions.weightKg,
    altitudeFt,
    oatC
  );
  const fuel = maximumContinuousFuelFlow(
    registration,
    altitudeFt,
    conditions.isaDeviationC
  );
  if (!climb || !fuel) return null;

  return {
    tasKt: indicatedToTrueAirspeed(
      climb.speedKias,
      altitudeFt,
      oatC
    ),
    fuelFlowLh: fuel.fuelFlowLh,
    rateFpm: Math.max(1, climb.rateFpm),
    powerPercent: null,
    limitedToPublishedRange: climb.limited || fuel.limited,
    source: "AFM enroute climb Vy",
  };
}

export function p2006tCruisePerformance(
  registration: P2006TRegistration,
  altitudeFt: number,
  conditions: P2006TNavlogConditions
): P2006TNavlogPerformance | null {
  const cruise = calculateCruisePoint(
    registration,
    altitudeFt,
    conditions.cruiseRpm,
    conditions.cruisePowerPercent,
    conditions.isaDeviationC
  );
  if (!cruise) return null;

  return {
    tasKt: cruise.ktas,
    fuelFlowLh: cruise.fuelFlowLh,
    rateFpm: null,
    powerPercent: cruise.powerPercent,
    limitedToPublishedRange: cruise.limited,
    source: "AFM cruise tables",
  };
}

export function p2006tPerformanceForLeg(
  registration: P2006TRegistration,
  profile: NavlogLegProfile,
  altitudeFt: number,
  conditions: P2006TNavlogConditions
): P2006TNavlogPerformance | null {
  if (profile === "CLIMB") {
    return p2006tClimbPerformance(
      registration,
      altitudeFt,
      conditions
    );
  }
  if (profile === "LEVEL") {
    return p2006tCruisePerformance(
      registration,
      altitudeFt,
      conditions
    );
  }
  return null;
}
