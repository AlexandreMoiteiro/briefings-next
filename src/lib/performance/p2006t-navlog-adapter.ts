import type { NavlogLegProfile } from "@/lib/navlog";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import { getP2006TNavlogConditions } from "./p2006t-navlog-settings";
import {
  isP2006TRegistration,
  p2006tClimbPerformance as calculateClimb,
  p2006tCruisePerformance as calculateCruise,
  p2006tPerformanceForLeg as calculateForLeg,
  type P2006TNavlogPerformance,
} from "./p2006t-navlog";

export { isP2006TRegistration };
export type { P2006TNavlogPerformance };

export function p2006tClimbPerformance(
  registration: P2006TRegistration,
  altitudeFt: number
) {
  return calculateClimb(
    registration,
    altitudeFt,
    getP2006TNavlogConditions()
  );
}

export function p2006tCruisePerformance(
  registration: P2006TRegistration,
  altitudeFt: number
) {
  return calculateCruise(
    registration,
    altitudeFt,
    getP2006TNavlogConditions()
  );
}

export function p2006tPerformanceForLeg(
  registration: P2006TRegistration,
  profile: NavlogLegProfile,
  altitudeFt: number
) {
  return calculateForLeg(
    registration,
    profile,
    altitudeFt,
    getP2006TNavlogConditions()
  );
}
