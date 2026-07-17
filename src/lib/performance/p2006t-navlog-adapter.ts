import type { NavlogLegProfile } from "@/lib/navlog";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";

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
      tasKt: 100,
      fuelFlowLh: 36,
      rateFpm: 850,
      powerPercent: null,
      limitedToPublishedRange: false,
      source: "Sevenair Standard Profiles V2",
    };
  }

  if (profile === "DESCENT") {
    return {
      tasKt: 120,
      fuelFlowLh: 36,
      rateFpm: 500,
      powerPercent: null,
      limitedToPublishedRange: false,
      source: "Sevenair Standard Profiles V2",
    };
  }

  return {
    tasKt: 125,
    fuelFlowLh: 36,
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
