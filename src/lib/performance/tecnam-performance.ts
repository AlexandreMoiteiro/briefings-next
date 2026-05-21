import type { PerformanceLegResult } from "@/lib/performance/aerodrome-performance";
import {
  TECNAM_LANDING,
  TECNAM_ROC,
  TECNAM_TAKEOFF,
  TECNAM_VY,
} from "@/lib/performance/tecnam-performance-data";

type PerformanceTable = Record<
  string,
  Record<string, Record<string, number>>
>;

type RocTable = Record<string, Record<string, Record<string, number>>>;
type VyTable = Record<string, Record<string, number>>;

export type TecnamPerformanceRow = {
  role: string;
  icao: string;
  runway: string;
  qfu: number;
  paFt: number;
  daFt: number;
  todaM: number;
  ldaM: number;
  takeoffGroundRollM: number;
  takeoff50M: number;
  landingGroundRollM: number;
  landing50M: number;
  takeoffMarginM: number;
  landingMarginM: number;
  takeoffPct: number;
  landingPct: number;
  takeoffOk: boolean;
  landingOk: boolean;
  headwindKt: number;
  crosswindKt: number;
  crosswindSide: "L" | "R" | "";
  rocFpm: number;
  vyKt: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function interp1(x: number, x0: number, x1: number, y0: number, y1: number) {
  if (x1 === x0) return y0;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

function numericKeys(object: Record<string, unknown>) {
  return Object.keys(object)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function bracket(keys: number[], value: number) {
  const clamped = clamp(value, keys[0], keys[keys.length - 1]);
  const lower = Math.max(...keys.filter((key) => key <= clamped));
  const upper = Math.min(...keys.filter((key) => key >= clamped));

  return [lower, upper, clamped] as const;
}

function getTableValue(object: Record<string, unknown>, key: number | string) {
  return object[String(key)] as any;
}

function tempBracket(tempC: number) {
  const temps = [-25, 0, 25, 50];
  const t = clamp(tempC, temps[0], temps[temps.length - 1]);

  if (t <= 0) return [-25, 0, t] as const;
  if (t <= 25) return [0, 25, t] as const;

  return [25, 50, t] as const;
}

function bilinear(
  paFt: number,
  tempC: number,
  table: PerformanceTable,
  field: "GR" | "50ft"
) {
  const pressureKeys = numericKeys(table);
  const [p0, p1, pa] = bracket(pressureKeys, paFt);
  const [t0, t1, t] = tempBracket(tempC);

  const row0 = getTableValue(table, p0)[field] as Record<string, number>;
  const row1 = getTableValue(table, p1)[field] as Record<string, number>;

  const v00 = Number(row0[String(t0)]);
  const v01 = Number(row0[String(t1)]);
  const v10 = Number(row1[String(t0)]);
  const v11 = Number(row1[String(t1)]);

  const v0 = interp1(t, t0, t1, v00, v01);
  const v1 = interp1(t, t0, t1, v10, v11);

  return interp1(pa, p0, p1, v0, v1);
}

function rocInterp(paFt: number, tempC: number, weightKg: number) {
  const table = TECNAM_ROC as unknown as RocTable;
  const weight = clamp(weightKg, 550, 650);

  function rocForWeight(weightKey: 550 | 600 | 650) {
    const rowTable = table[String(weightKey)];
    const pressureKeys = numericKeys(rowTable);
    const [p0, p1, pa] = bracket(pressureKeys, paFt);
    const [t0, t1, t] = tempBracket(tempC);

    const row0 = rowTable[String(p0)];
    const row1 = rowTable[String(p1)];

    const v00 = Number(row0[String(t0)]);
    const v01 = Number(row0[String(t1)]);
    const v10 = Number(row1[String(t0)]);
    const v11 = Number(row1[String(t1)]);

    const v0 = interp1(t, t0, t1, v00, v01);
    const v1 = interp1(t, t0, t1, v10, v11);

    return interp1(pa, p0, p1, v0, v1);
  }

  if (weight <= 600) {
    return interp1(weight, 550, 600, rocForWeight(550), rocForWeight(600));
  }

  return interp1(weight, 600, 650, rocForWeight(600), rocForWeight(650));
}

function vyInterp(paFt: number, weightKg: number) {
  const table = TECNAM_VY as unknown as VyTable;
  const weightKey = weightKg <= 575 ? 550 : weightKg <= 625 ? 600 : 650;
  const rowTable = table[String(weightKey)];
  const pressureKeys = numericKeys(rowTable);
  const [p0, p1, pa] = bracket(pressureKeys, paFt);

  return interp1(
    pa,
    p0,
    p1,
    Number(rowTable[String(p0)]),
    Number(rowTable[String(p1)])
  );
}

function correctTakeoffGroundRoll(
  groundRollM: number,
  headwindKt: number,
  paved = false,
  slopePc = 0
) {
  let value = groundRollM;

  if (headwindKt >= 0) {
    value -= 5 * headwindKt;
  } else {
    value += 15 * Math.abs(headwindKt);
  }

  if (paved) {
    value *= 0.9;
  }

  const slope = clamp(slopePc, -5, 5);
  value *= 1 + 0.07 * slope;

  return Math.max(0, value);
}

function correctLandingGroundRoll(
  groundRollM: number,
  headwindKt: number,
  paved = false,
  slopePc = 0
) {
  let value = groundRollM;

  if (headwindKt >= 0) {
    value -= 4 * headwindKt;
  } else {
    value += 13 * Math.abs(headwindKt);
  }

  if (paved) {
    value *= 0.9;
  }

  const slope = clamp(slopePc, -5, 5);
  value *= 1 - 0.03 * slope;

  return Math.max(0, value);
}

function roundToStep(value: number, step: number) {
  if (!Number.isFinite(value) || step <= 0) return 0;
  return Math.round(value / step) * step;
}

export function calculateTecnamPerformance(
  result: PerformanceLegResult,
  totalWeightKg: number
): TecnamPerformanceRow | null {
  if (!result.aerodrome || !result.bestRunway) return null;

  const runway = result.bestRunway;
  const paFt = result.pressureAltitudeFt;
  const daFt = result.densityAltitudeFt;
  const tempC = result.leg.tempC;

  const rawTakeoffGroundRoll = bilinear(
    paFt,
    tempC,
    TECNAM_TAKEOFF as unknown as PerformanceTable,
    "GR"
  );
  const rawTakeoff50 = bilinear(
    paFt,
    tempC,
    TECNAM_TAKEOFF as unknown as PerformanceTable,
    "50ft"
  );
  const rawLandingGroundRoll = bilinear(
    paFt,
    tempC,
    TECNAM_LANDING as unknown as PerformanceTable,
    "GR"
  );
  const rawLanding50 = bilinear(
    paFt,
    tempC,
    TECNAM_LANDING as unknown as PerformanceTable,
    "50ft"
  );

  const takeoffGroundRoll = correctTakeoffGroundRoll(
    rawTakeoffGroundRoll,
    result.headwindKt,
    Boolean(runway.paved),
    runway.slope_pc ?? 0
  );
  const landingGroundRoll = correctLandingGroundRoll(
    rawLandingGroundRoll,
    result.headwindKt,
    Boolean(runway.paved),
    runway.slope_pc ?? 0
  );

  const takeoff50 = rawTakeoff50;
  const landing50 = rawLanding50;

  return {
    role: result.leg.role,
    icao: result.leg.icao,
    runway: runway.id,
    qfu: runway.qfu,
    paFt,
    daFt,
    todaM: runway.toda,
    ldaM: runway.lda,
    takeoffGroundRollM: roundToStep(takeoffGroundRoll, 1),
    takeoff50M: roundToStep(takeoff50, 1),
    landingGroundRollM: roundToStep(landingGroundRoll, 1),
    landing50M: roundToStep(landing50, 1),
    takeoffMarginM: roundToStep(runway.toda - takeoff50, 1),
    landingMarginM: roundToStep(runway.lda - landing50, 1),
    takeoffPct: runway.toda > 0 ? Math.round((takeoff50 / runway.toda) * 100) : 0,
    landingPct: runway.lda > 0 ? Math.round((landing50 / runway.lda) * 100) : 0,
    takeoffOk: takeoff50 <= runway.toda,
    landingOk: landing50 <= runway.lda,
    headwindKt: result.headwindKt,
    crosswindKt: result.crosswindKt,
    crosswindSide: result.crosswindSide,
    rocFpm: roundToStep(rocInterp(paFt, tempC, totalWeightKg), 1),
    vyKt: roundToStep(vyInterp(paFt, totalWeightKg), 1),
  };
}
