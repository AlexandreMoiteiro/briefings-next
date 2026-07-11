import type { PerformanceLegResult } from "@/lib/performance/aerodrome-performance";
import {
  calculateP2006TDistance,
  type P2006TDistanceFailure,
} from "@/lib/performance/p2006t-distance";

export const P2006T_CS_EAQ = {
  aircraft: "Tecnam P2006T" as const,
  registration: "CS-EAQ" as const,
  serialNumber: "046" as const,
  mtowKg: 1180,
  usableFuelL: 194.4,
  takeoffReferenceWeightKg: 1180,
  landingReferenceWeightKg: 930,
  source: "AFM Doc. 2006/044 · 4th Edition, Rev. 22",
} as const;

export type P2006TRunwaySurface = "grass" | "paved";

export type P2006TCsEaqRunwayConditions = {
  surface: P2006TRunwaySurface;
  /** Positive uphill slope. The AFM does not publish downhill credit. */
  uphillSlopePct: number;
};

export type P2006TCsEaqPerformanceRow = {
  ok: true;
  role: string;
  icao: string;
  aerodrome: string;
  runway: string;
  qfu: number;
  paFt: number;
  daFt: number;
  oatC: number;
  todaM: number;
  ldaM: number;
  surface: P2006TRunwaySurface;
  uphillSlopePct: number;
  headwindKt: number;
  crosswindKt: number;
  crosswindSide: "L" | "R" | "";
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
  sourcePages: string[];
};

export type P2006TCsEaqPerformanceFailure = {
  ok: false;
  role: string;
  icao: string;
  reason: string;
  issues?: string[];
};

export type P2006TCsEaqPerformanceResult =
  | P2006TCsEaqPerformanceRow
  | P2006TCsEaqPerformanceFailure;

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function applyTakeoffWind(distanceM: number, headwindKt: number) {
  const corrected =
    headwindKt >= 0
      ? distanceM - 2.5 * headwindKt
      : distanceM + 10 * Math.abs(headwindKt);

  return Math.max(0, corrected);
}

function applyLandingWind(distanceM: number, headwindKt: number) {
  const corrected =
    headwindKt >= 0
      ? distanceM - 5 * headwindKt
      : distanceM + 11 * Math.abs(headwindKt);

  return Math.max(0, corrected);
}

function applyTakeoffGroundCorrections(
  distanceM: number,
  conditions: P2006TCsEaqRunwayConditions
) {
  let corrected = distanceM;

  if (conditions.surface === "paved") corrected *= 0.94;

  const uphillSlopePct = clamp(conditions.uphillSlopePct, 0, 5);
  corrected *= 1 + 0.05 * uphillSlopePct;

  return Math.max(0, corrected);
}

function applyLandingGroundCorrections(
  distanceM: number,
  conditions: P2006TCsEaqRunwayConditions
) {
  let corrected = distanceM;

  if (conditions.surface === "paved") corrected *= 0.98;

  const uphillSlopePct = clamp(conditions.uphillSlopePct, 0, 5);
  corrected *= 1 - 0.025 * uphillSlopePct;

  return Math.max(0, corrected);
}

function distanceFailure(
  role: string,
  icao: string,
  failures: P2006TDistanceFailure[]
): P2006TCsEaqPerformanceFailure {
  return {
    ok: false,
    role,
    icao,
    reason: failures.map((failure) => failure.reason).join(" "),
    issues: failures.flatMap((failure) => failure.issues ?? []),
  };
}

export function calculateP2006TCsEaqPerformance(
  result: PerformanceLegResult,
  conditions: P2006TCsEaqRunwayConditions
): P2006TCsEaqPerformanceResult {
  const role = result.leg.role;
  const icao = result.leg.icao;

  if (!result.aerodrome || !result.bestRunway) {
    return {
      ok: false,
      role,
      icao,
      reason: "Aerodrome or runway data is unavailable.",
    };
  }

  const pressureAltitudeFt = result.pressureAltitudeFt;
  const oatC = result.leg.tempC;

  const takeoffGround = calculateP2006TDistance({
    kind: "takeoff-ground-roll",
    weightKg: P2006T_CS_EAQ.takeoffReferenceWeightKg,
    pressureAltitudeFt,
    oatC,
  });
  const takeoff50 = calculateP2006TDistance({
    kind: "takeoff-50ft",
    weightKg: P2006T_CS_EAQ.takeoffReferenceWeightKg,
    pressureAltitudeFt,
    oatC,
  });
  const landingGround = calculateP2006TDistance({
    kind: "landing-ground-roll",
    weightKg: P2006T_CS_EAQ.landingReferenceWeightKg,
    pressureAltitudeFt,
    oatC,
  });
  const landing50 = calculateP2006TDistance({
    kind: "landing-50ft",
    weightKg: P2006T_CS_EAQ.landingReferenceWeightKg,
    pressureAltitudeFt,
    oatC,
  });

  const failures = [takeoffGround, takeoff50, landingGround, landing50].filter(
    (distance): distance is P2006TDistanceFailure => !distance.ok
  );

  if (failures.length > 0) return distanceFailure(role, icao, failures);

  const windCorrectedTakeoffGround = applyTakeoffWind(
    takeoffGround.distanceM,
    result.headwindKt
  );
  const correctedTakeoffGround = applyTakeoffGroundCorrections(
    windCorrectedTakeoffGround,
    conditions
  );
  const correctedTakeoff50 = applyTakeoffWind(
    takeoff50.distanceM,
    result.headwindKt
  );

  const windCorrectedLandingGround = applyLandingWind(
    landingGround.distanceM,
    result.headwindKt
  );
  const correctedLandingGround = applyLandingGroundCorrections(
    windCorrectedLandingGround,
    conditions
  );
  const correctedLanding50 = applyLandingWind(
    landing50.distanceM,
    result.headwindKt
  );

  const runway = result.bestRunway;
  const takeoffMarginM = runway.toda - correctedTakeoff50;
  const landingMarginM = runway.lda - correctedLanding50;

  return {
    ok: true,
    role,
    icao,
    aerodrome: result.aerodrome.name,
    runway: runway.id,
    qfu: runway.qfu,
    paFt: pressureAltitudeFt,
    daFt: result.densityAltitudeFt,
    oatC,
    todaM: runway.toda,
    ldaM: runway.lda,
    surface: conditions.surface,
    uphillSlopePct: clamp(conditions.uphillSlopePct, 0, 5),
    headwindKt: result.headwindKt,
    crosswindKt: result.crosswindKt,
    crosswindSide: result.crosswindSide,
    takeoffGroundRollM: round(correctedTakeoffGround),
    takeoff50M: round(correctedTakeoff50),
    landingGroundRollM: round(correctedLandingGround),
    landing50M: round(correctedLanding50),
    takeoffMarginM: round(takeoffMarginM),
    landingMarginM: round(landingMarginM),
    takeoffPct:
      runway.toda > 0 ? round((correctedTakeoff50 / runway.toda) * 100) : 0,
    landingPct:
      runway.lda > 0 ? round((correctedLanding50 / runway.lda) * 100) : 0,
    takeoffOk: correctedTakeoff50 <= runway.toda,
    landingOk: correctedLanding50 <= runway.lda,
    sourcePages: Array.from(
      new Set([
        takeoffGround.sourcePage,
        takeoff50.sourcePage,
        landingGround.sourcePage,
        landing50.sourcePage,
      ])
    ),
  };
}
