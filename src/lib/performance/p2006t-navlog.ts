import type { NavlogLegProfile } from "@/lib/navlog";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";

type ClimbRow = {
  altitudeFt: number;
  speedKias: number;
  rateFpm: number;
};

type CruisePoint = {
  altitudeFt: number;
  tasKt: number;
  fuelFlowLh: number;
};

export type P2006TNavlogPerformance = {
  tasKt: number;
  fuelFlowLh: number;
  rateFpm: number | null;
  source: "AFM enroute climb Vy" | "AFM cruise 65%";
};

const P2006T_REGISTRATIONS = new Set<P2006TRegistration>([
  "CS-EAQ",
  "CS-EBX",
  "D-GSEV",
]);

// AFM Enroute Rate of Climb at Vy, maximum aircraft weight, ISA column.
const CLIMB_ROWS: Record<P2006TRegistration, ClimbRow[]> = {
  "CS-EAQ": [
    { altitudeFt: 0, speedKias: 84, rateFpm: 1102 },
    { altitudeFt: 2000, speedKias: 83, rateFpm: 991 },
    { altitudeFt: 4000, speedKias: 81, rateFpm: 880 },
    { altitudeFt: 6000, speedKias: 79, rateFpm: 768 },
    { altitudeFt: 8000, speedKias: 77, rateFpm: 657 },
    { altitudeFt: 10000, speedKias: 75, rateFpm: 546 },
    { altitudeFt: 12000, speedKias: 73, rateFpm: 434 },
    { altitudeFt: 14000, speedKias: 71, rateFpm: 323 },
  ],
  "CS-EBX": [
    { altitudeFt: 0, speedKias: 84, rateFpm: 1036 },
    { altitudeFt: 2000, speedKias: 83, rateFpm: 928 },
    { altitudeFt: 4000, speedKias: 81, rateFpm: 819 },
    { altitudeFt: 6000, speedKias: 80, rateFpm: 711 },
    { altitudeFt: 8000, speedKias: 78, rateFpm: 603 },
    { altitudeFt: 10000, speedKias: 77, rateFpm: 495 },
    { altitudeFt: 12000, speedKias: 75, rateFpm: 387 },
    { altitudeFt: 14000, speedKias: 73, rateFpm: 279 },
  ],
  "D-GSEV": [
    { altitudeFt: 0, speedKias: 84, rateFpm: 1036 },
    { altitudeFt: 2000, speedKias: 83, rateFpm: 928 },
    { altitudeFt: 4000, speedKias: 81, rateFpm: 819 },
    { altitudeFt: 6000, speedKias: 80, rateFpm: 711 },
    { altitudeFt: 8000, speedKias: 78, rateFpm: 603 },
    { altitudeFt: 10000, speedKias: 77, rateFpm: 495 },
    { altitudeFt: 12000, speedKias: 75, rateFpm: 387 },
    { altitudeFt: 14000, speedKias: 73, rateFpm: 279 },
  ],
};

// 2250 RPM, interpolated to 65% power in the ISA column. Fuel flow is
// the published per-engine value multiplied by two engines.
const CRUISE_65_PERCENT: CruisePoint[] = [
  { altitudeFt: 0, tasKt: 124, fuelFlowLh: 36.4 },
  { altitudeFt: 3000, tasKt: 126.43, fuelFlowLh: 36.17 },
  { altitudeFt: 6000, tasKt: 130, fuelFlowLh: 36.2 },
  { altitudeFt: 9000, tasKt: 133.57, fuelFlowLh: 36.11 },
];

// Maximum-continuous-power cruise-page proxy, ISA column, both engines.
// This is used only for climb fuel planning; climb speed and rate come from
// the dedicated Enroute Rate of Climb at Vy table above.
const CLIMB_FUEL_FLOW: CruisePoint[] = [
  { altitudeFt: 0, tasKt: 0, fuelFlowLh: 54.2 },
  { altitudeFt: 3000, tasKt: 0, fuelFlowLh: 48.6 },
  { altitudeFt: 6000, tasKt: 0, fuelFlowLh: 44 },
  { altitudeFt: 9000, tasKt: 0, fuelFlowLh: 39.4 },
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(a: number, b: number, ratio: number) {
  return a + (b - a) * ratio;
}

function interpolate<T extends { altitudeFt: number }>(
  rows: T[],
  altitudeFt: number
): { lower: T; upper: T; ratio: number } {
  const altitude = clamp(
    altitudeFt,
    rows[0].altitudeFt,
    rows[rows.length - 1].altitudeFt
  );
  let lower = rows[0];
  let upper = rows[rows.length - 1];

  for (const row of rows) {
    if (row.altitudeFt <= altitude) lower = row;
    if (row.altitudeFt >= altitude) {
      upper = row;
      break;
    }
  }

  return {
    lower,
    upper,
    ratio:
      upper.altitudeFt === lower.altitudeFt
        ? 0
        : (altitude - lower.altitudeFt) /
          (upper.altitudeFt - lower.altitudeFt),
  };
}

function standardDensityRatio(altitudeFt: number) {
  const altitude = clamp(altitudeFt, 0, 36089);
  const temperatureRatio = Math.max(0.1, 1 - 6.87535e-6 * altitude);
  return temperatureRatio ** 4.2561;
}

function indicatedToTrueAirspeed(kias: number, altitudeFt: number) {
  return kias / Math.sqrt(standardDensityRatio(altitudeFt));
}

export function isP2006TRegistration(
  registration: string
): registration is P2006TRegistration {
  return P2006T_REGISTRATIONS.has(registration as P2006TRegistration);
}

export function p2006tClimbPerformance(
  registration: P2006TRegistration,
  altitudeFt: number
): P2006TNavlogPerformance {
  const climb = interpolate(CLIMB_ROWS[registration], altitudeFt);
  const fuel = interpolate(CLIMB_FUEL_FLOW, altitudeFt);
  const speedKias = lerp(
    climb.lower.speedKias,
    climb.upper.speedKias,
    climb.ratio
  );

  return {
    tasKt: indicatedToTrueAirspeed(speedKias, altitudeFt),
    fuelFlowLh: lerp(
      fuel.lower.fuelFlowLh,
      fuel.upper.fuelFlowLh,
      fuel.ratio
    ),
    rateFpm: Math.max(
      1,
      lerp(climb.lower.rateFpm, climb.upper.rateFpm, climb.ratio)
    ),
    source: "AFM enroute climb Vy",
  };
}

export function p2006tCruisePerformance(
  altitudeFt: number
): P2006TNavlogPerformance {
  const cruise = interpolate(CRUISE_65_PERCENT, altitudeFt);
  return {
    tasKt: lerp(cruise.lower.tasKt, cruise.upper.tasKt, cruise.ratio),
    fuelFlowLh: lerp(
      cruise.lower.fuelFlowLh,
      cruise.upper.fuelFlowLh,
      cruise.ratio
    ),
    rateFpm: null,
    source: "AFM cruise 65%",
  };
}

export function p2006tPerformanceForLeg(
  registration: P2006TRegistration,
  profile: NavlogLegProfile,
  altitudeFt: number
): P2006TNavlogPerformance | null {
  if (profile === "CLIMB") {
    return p2006tClimbPerformance(registration, altitudeFt);
  }
  if (profile === "LEVEL") {
    return p2006tCruisePerformance(altitudeFt);
  }
  return null;
}
