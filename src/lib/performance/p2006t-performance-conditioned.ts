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
import { p2006tClimbPerformance } from "./p2006t-climb-cruise";

export type {
  P2006TDistanceKind,
  P2006TInterpolationTrace,
  P2006TPerformanceFailure,
  P2006TPerformanceResult,
  P2006TPerformanceRow,
  P2006TRunwayConditions,
};
export { p2006tDistanceSources };

function isaTemperatureC(pressureAltitudeFt: number) {
  return 15 - 1.9812 * (Math.max(0, pressureAltitudeFt) / 1000);
}

export async function calculateP2006TPerformance(
  input: Parameters<typeof calculateBaseP2006TPerformance>[0]
): Promise<P2006TPerformanceResult> {
  const result = await calculateBaseP2006TPerformance(input);
  if (!result.ok) return result;

  const isaDeviationC = result.oatC - isaTemperatureC(result.paFt);
  const climb = p2006tClimbPerformance(input.registration, result.paFt, {
    weightKg: result.takeoffWeightKg,
    isaDeviationC,
    cruiseRpm: 2100,
    cruisePowerPercent: 65,
  });

  return {
    ...result,
    rocFpm: Math.round(climb?.rateFpm ?? result.rocFpm),
  };
}
