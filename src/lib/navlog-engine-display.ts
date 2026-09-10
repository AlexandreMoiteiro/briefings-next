import {
  buildNavlogCalculation as buildBaseNavlogCalculation,
} from "./navlog-engine";
import type {
  NavlogCalculationResult,
  NavlogDataBundle,
  NavlogLeg,
  NavlogRouteWaypoint,
  NavlogSetupForm,
} from "@/lib/navlog";
import {
  C152_NAVLOG_SYNC_STORAGE_KEY,
  type C152NavlogSyncPlan,
} from "@/lib/c152-operational-presets";

export * from "./navlog-engine";
export { formatNavlogDuration as formatDuration } from "./operational-duration";

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function minutes(seconds: number) {
  return Math.max(0, Math.round(seconds / 60));
}

function phaseTotals(legs: NavlogLeg[]) {
  const totals = {
    climbSec: 0,
    climbFuelL: 0,
    enrouteSec: 0,
    enrouteFuelL: 0,
    descentSec: 0,
    descentFuelL: 0,
  };

  for (const leg of legs) {
    if (leg.profile === "CLIMB") {
      totals.climbSec += leg.eteSec;
      totals.climbFuelL += leg.burnL;
    } else if (leg.profile === "DESCENT") {
      totals.descentSec += leg.eteSec;
      totals.descentFuelL += leg.burnL;
    } else {
      totals.enrouteSec += leg.eteSec;
      totals.enrouteFuelL += leg.burnL;
    }

    // Stops/holds belong to the enroute line of the academy fuel sheet.
    totals.enrouteSec += leg.holdSec;
    totals.enrouteFuelL += leg.holdBurnL;
  }

  return totals;
}

function persistC152Plan(
  setup: NavlogSetupForm,
  waypoints: NavlogRouteWaypoint[],
  result: NavlogCalculationResult
) {
  if (typeof window === "undefined") return;
  if (setup.aircraftType !== "Cessna 152") return;

  if (waypoints.length < 2 || result.legs.length === 0) {
    window.localStorage.removeItem(C152_NAVLOG_SYNC_STORAGE_KEY);
    return;
  }

  const alternateMarker = waypoints.find((waypoint) => waypoint.alternateMarker === true);
  const markerLegIndex = alternateMarker
    ? result.legs.findIndex((leg) => leg.to.id === alternateMarker.id)
    : -1;

  const tripLegs =
    markerLegIndex >= 0 ? result.legs.slice(0, markerLegIndex + 1) : result.legs;
  const alternateLegs =
    markerLegIndex >= 0 ? result.legs.slice(markerLegIndex + 1) : [];
  const phases = phaseTotals(tripLegs);

  const alternateSec = alternateLegs.reduce(
    (sum, leg) => sum + leg.eteSec + leg.holdSec,
    0
  );
  const alternateFuelL = alternateLegs.reduce(
    (sum, leg) => sum + leg.burnL + leg.holdBurnL,
    0
  );

  const destinationWaypoint = alternateMarker ?? waypoints[waypoints.length - 1];
  const finalWaypoint = waypoints[waypoints.length - 1];
  const taxiFuelL = (setup.taxiFuelFlowLh * Math.max(0, setup.taxiMin)) / 60;

  const payload: C152NavlogSyncPlan = {
    version: 1,
    savedAt: new Date().toISOString(),
    registration: "CS-AVC",
    setup: {
      startEfobL: round1(setup.startEfob),
      taxiMin: Math.max(0, setup.taxiMin),
      taxiFuelL: round1(taxiFuelL),
      climbTasKt: setup.climbTas,
      cruiseTasKt: setup.cruiseTas,
      descentTasKt: setup.descentTas,
      fuelFlowLh: setup.fuelFlowLh,
      rocFpm: setup.rocFpm,
      rodFpm: setup.rodFpm,
      defaultAltitudeFt: setup.defaultAltitude,
    },
    route: {
      departureIcao: waypoints[0]?.point.code?.toUpperCase() ?? "",
      arrivalIcao: destinationWaypoint?.point.code?.toUpperCase() ?? "",
      alternateIcao:
        alternateMarker && finalWaypoint.id !== destinationWaypoint.id
          ? finalWaypoint.point.code.toUpperCase()
          : "",
    },
    fuelPlanning: {
      startupTaxiMin: Math.max(0, setup.taxiMin),
      startupTaxiFuelL: round1(taxiFuelL),
      climbMin: minutes(phases.climbSec),
      climbFuelL: round1(phases.climbFuelL),
      enrouteMin: minutes(phases.enrouteSec),
      enrouteFuelL: round1(phases.enrouteFuelL),
      descentMin: minutes(phases.descentSec),
      descentFuelL: round1(phases.descentFuelL),
      alternateMin: minutes(alternateSec),
      alternateFuelL: round1(alternateFuelL),
    },
  };

  window.localStorage.setItem(C152_NAVLOG_SYNC_STORAGE_KEY, JSON.stringify(payload));
}

export function buildNavlogCalculation(
  setup: NavlogSetupForm,
  waypoints: NavlogRouteWaypoint[],
  data: NavlogDataBundle | null
): NavlogCalculationResult {
  const result = buildBaseNavlogCalculation(setup, waypoints, data);
  persistC152Plan(setup, waypoints, result);
  return result;
}
