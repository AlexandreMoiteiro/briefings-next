import type { P2006TPerformanceResult, P2006TPerformanceRow } from "./p2006t-performance";
import {
  calculateP2006TPerformance as calculateBaseP2006TPerformance,
  p2006tDistanceSources,
} from "./p2006t-performance";
import { conservativeP2006TDistance } from "./p2006t-conservative-distance";
import { p2006tTakeoffClimbPerformance } from "./p2006t-takeoff-climb";

export type {
  P2006TDistanceKind,
  P2006TInterpolationTrace,
  P2006TPerformanceFailure,
  P2006TPerformanceResult,
  P2006TPerformanceRow,
  P2006TRunwayConditions,
} from "./p2006t-performance";
export { p2006tDistanceSources };

type Input = Parameters<typeof calculateBaseP2006TPerformance>[0];

function up(value: number, increment = 10) {
  return Math.ceil(Math.max(0, Number(value || 0)) / increment) * increment;
}

function down(value: number, increment = 50) {
  return Math.floor(Math.max(0, Number(value || 0)) / increment) * increment;
}

function tailwindKt(headwindKt: number) {
  return headwindKt < 0 ? Math.ceil(Math.abs(headwindKt)) : 0;
}

function uphillSlope(slopePct: number) {
  return Math.ceil(Math.max(0, Math.min(5, slopePct)) * 10) / 10;
}

export async function calculateP2006TPerformance(
  input: Input
): Promise<P2006TPerformanceResult> {
  const { registration, result, takeoffWeightKg, landingWeightKg, conditions } = input;
  const role = result.leg.role;
  const icao = result.leg.icao;
  if (!result.aerodrome || !result.bestRunway) {
    return { ok: false, role, icao, reason: "Aerodrome or runway data is unavailable." };
  }

  try {
    const common = {
      registration,
      pressureAltitudeFt: result.pressureAltitudeFt,
      oatC: result.leg.tempC,
    };
    const [takeoffGround, takeoff50, landingGround, landing50] = await Promise.all([
      conservativeP2006TDistance({ ...common, family: "takeoff", profile: "ground", weightKg: takeoffWeightKg }),
      conservativeP2006TDistance({ ...common, family: "takeoff", profile: "50ft", weightKg: takeoffWeightKg }),
      conservativeP2006TDistance({ ...common, family: "landing", profile: "ground", weightKg: landingWeightKg }),
      conservativeP2006TDistance({ ...common, family: "landing", profile: "50ft", weightKg: landingWeightKg }),
    ]);

    const tw = tailwindKt(result.headwindKt);
    const slope = uphillSlope(conditions.uphillSlopePct);
    const takeoffGroundM = up((takeoffGround.distanceM + tw * 10) * (1 + slope * 0.05));
    const takeoff50M = up(takeoff50.distanceM + tw * 10);
    const landingGroundM = up(landingGround.distanceM + tw * 11);
    const landing50M = up(landing50.distanceM + tw * 11);
    const runway = result.bestRunway;
    const climb = p2006tTakeoffClimbPerformance(
      registration,
      takeoffWeightKg,
      result.pressureAltitudeFt,
      result.leg.tempC
    );

    const row: P2006TPerformanceRow = {
      ok: true,
      role,
      icao,
      aerodrome: result.aerodrome.name,
      runway: runway.id,
      qfu: runway.qfu,
      elevationFt: result.aerodrome.elev_ft,
      paFt: result.pressureAltitudeFt,
      daFt: result.densityAltitudeFt,
      oatC: result.leg.tempC,
      qnhHpa: result.leg.qnhHpa,
      windFrom: result.leg.windFrom,
      windKt: result.leg.windKt,
      headwindKt: result.headwindKt,
      crosswindKt: result.crosswindKt,
      crosswindSide: result.crosswindSide,
      todaM: runway.toda,
      ldaM: runway.lda,
      uphillSlopePct: slope,
      takeoffWeightKg,
      landingWeightKg,
      takeoffGroundRollM: takeoffGroundM,
      takeoff50M,
      landingGroundRollM: landingGroundM,
      landing50M,
      takeoffMarginM: Math.round(runway.toda - takeoff50M),
      landingMarginM: Math.round(runway.lda - landing50M),
      takeoffPct: runway.toda > 0 ? Math.ceil((takeoff50M / runway.toda) * 100) : 0,
      landingPct: runway.lda > 0 ? Math.ceil((landing50M / runway.lda) * 100) : 0,
      takeoffOk: takeoff50M <= runway.toda,
      landingOk: landing50M <= runway.lda,
      rocFpm: down(climb?.rateFpm ?? 850),
      takeoffTrace: takeoff50.trace,
      landingTrace: landing50.trace,
    };
    return row;
  } catch (error) {
    return {
      ok: false,
      role,
      icao,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
