import type { NavlogLegProfile } from "@/lib/navlog";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";
import { P2006T_NAVLOG_DEFAULTS } from "@/lib/performance/p2006t-standard-profiles";

export type P2006TNavlogPerformance = {
  tasKt: number;
  fuelFlowLh: number;
  rateFpm: number | null;
  powerPercent: number | null;
  limitedToPublishedRange: boolean;
  source: "Sevenair Standard Profiles V2";
};

const P2006T_REGISTRATIONS = new Set<P2006TRegistration>([
  "CS-EAQ",
  "CS-EBX",
  "D-GSEV",
]);

export function isP2006TRegistration(
  registration: string
): registration is P2006TRegistration {
  return P2006T_REGISTRATIONS.has(registration as P2006TRegistration);
}

function profilePerformance(
  profile: NavlogLegProfile
): P2006TNavlogPerformance {
  if (profile === "CLIMB") {
    return {
      tasKt: P2006T_NAVLOG_DEFAULTS.climbTasKt,
      fuelFlowLh: P2006T_NAVLOG_DEFAULTS.fuelFlowLh,
      rateFpm: P2006T_NAVLOG_DEFAULTS.rocFpm,
      powerPercent: null,
      limitedToPublishedRange: false,
      source: "Sevenair Standard Profiles V2",
    };
  }

  if (profile === "DESCENT") {
    return {
      tasKt: P2006T_NAVLOG_DEFAULTS.descentTasKt,
      fuelFlowLh: P2006T_NAVLOG_DEFAULTS.fuelFlowLh,
      rateFpm: P2006T_NAVLOG_DEFAULTS.rodFpm,
      powerPercent: null,
      limitedToPublishedRange: false,
      source: "Sevenair Standard Profiles V2",
    };
  }

  return {
    tasKt: P2006T_NAVLOG_DEFAULTS.cruiseTasKt,
    fuelFlowLh: P2006T_NAVLOG_DEFAULTS.fuelFlowLh,
    rateFpm: null,
    powerPercent: null,
    limitedToPublishedRange: false,
    source: "Sevenair Standard Profiles V2",
  };
}

export function p2006tClimbPerformance(
  _registration: P2006TRegistration,
  _altitudeFt: number
) {
  return profilePerformance("CLIMB");
}

export function p2006tCruisePerformance(
  _registration: P2006TRegistration,
  _altitudeFt: number
) {
  return profilePerformance("LEVEL");
}

export function p2006tPerformanceForLeg(
  _registration: P2006TRegistration,
  profile: NavlogLegProfile,
  _altitudeFt: number
) {
  return profilePerformance(profile);
}
