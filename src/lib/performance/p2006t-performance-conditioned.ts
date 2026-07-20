import {
  calculateP2006TPerformance as calculateBaseP2006TPerformance,
  p2006tDistanceSources,
} from "./p2006t-performance";
import type {
  P2006TDistanceKind,
  P2006TInterpolationTrace,
  P2006TPerformanceFailure,
  P2006TPerformanceResult,
  P2006TPerformanceRow,
  P2006TRunwayConditions,
} from "./p2006t-performance";
import { p2006tTakeoffClimbPerformance } from "./p2006t-takeoff-climb";

export type {
  P2006TDistanceKind,
  P2006TInterpolationTrace,
  P2006TPerformanceFailure,
  P2006TPerformanceResult,
  P2006TPerformanceRow,
  P2006TRunwayConditions,
};
export { p2006tDistanceSources };

export async function calculateP2006TPerformance(
  input: Parameters<typeof calculateBaseP2006TPerformance>[0]
): Promise<P2006TPerformanceResult> {
  const result = await calculateBaseP2006TPerformance(input);
  if (!result.ok) return result;

  const takeoffClimb = p2006tTakeoffClimbPerformance(
    input.registration,
    result.takeoffWeightKg,
    result.paFt,
    result.oatC
  );

  return {
    ...result,
    rocFpm: Math.round(takeoffClimb?.rateFpm ?? result.rocFpm),
  };
}
