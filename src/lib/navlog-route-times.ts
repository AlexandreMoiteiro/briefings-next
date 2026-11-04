import type { NavlogLeg } from "@/lib/navlog";

/**
 * The alternate begins AFTER the marked destination waypoint. It is a
 * contingency, not part of the flight/block time logged for the planned leg.
 */
export function navlogRouteTimes(legs: NavlogLeg[], alternateStartWaypointId: string | null, taxiMinutes: number) {
  const destinationLegIndex = alternateStartWaypointId
    ? legs.findIndex((leg) => leg.to.id === alternateStartWaypointId)
    : -1;
  const plannedLegs = destinationLegIndex >= 0 ? legs.slice(0, destinationLegIndex + 1) : legs;
  const alternateLegs = destinationLegIndex >= 0 ? legs.slice(destinationLegIndex + 1) : [];
  const time = (segment: NavlogLeg[]) => segment.reduce((seconds, leg) => seconds + leg.eteSec + leg.holdSec, 0);
  const flightTimeSec = time(plannedLegs);
  const taxiTimeSec = Number.isFinite(taxiMinutes) ? Math.max(0, taxiMinutes) * 60 : 0;
  const blockTimeSec = flightTimeSec + taxiTimeSec;
  const alternateTimeSec = time(alternateLegs);

  return {
    flightTimeSec,
    blockTimeSec,
    alternateTimeSec,
    blockPlusAlternateSec: blockTimeSec + alternateTimeSec,
    hasAlternate: alternateLegs.length > 0,
    plannedDistanceNm: plannedLegs.reduce((distance, leg) => distance + leg.distNm, 0),
    destinationEfobL: plannedLegs.at(-1)?.efobEndL ?? 0,
    plannedOnBlockClock: plannedLegs.at(-1)?.clockEnd ?? "",
  };
}
