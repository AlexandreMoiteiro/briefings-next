import type { P2006TFleetAircraft } from "@/lib/performance/p2006t-fleet";

export const P2006T_FUEL = {
  totalCapacityL: 200,
  usableCapacityL: 194.4,
  unusableFuelL: 5.6,
  densityKgL: 0.72,
  armM: 0.755,
} as const;

export const P2006T_LOADING_ARMS = {
  frontSeatsM: -0.893,
  rearSeatsM: 0.226,
  baggageM: 1.215,
  meanAerodynamicChordM: 1.339,
} as const;

export const DEFAULT_P2006T_LOADING = {
  studentKg: 50,
  instructorKg: 80,
  rearSeatsKg: 0,
  baggageKg: 5,
  totalFuelInTanksL: 200,
} as const;

export const DEFAULT_P2006T_FUEL_TIMES = {
  taxiFuelL: 10,
  climbMin: 10,
  enrouteMin: 100,
  descentMin: 10,
  alternate1Min: 45,
  alternate2Min: 45,
  reserveMin: 45,
} as const;

export type P2006TLoadingInput = {
  emptyMassKg: number;
  emptyMomentKgm: number;
  studentKg: number;
  instructorKg: number;
  rearSeatsKg: number;
  baggageKg: number;
  totalFuelInTanksL: number;
};

export type P2006TFuelTimesInput = {
  taxiFuelL: number;
  climbMin: number;
  enrouteMin: number;
  descentMin: number;
  alternate1Min: number;
  alternate2Min: number;
  reserveMin: number;
};

export type P2006TPhaseFuelRates = {
  climbLh: number;
  cruiseLh: number;
  descentLh: number;
};

export type P2006TFuelPlan = {
  usableLoadedL: number;
  unusableFuelL: number;
  taxiFuelL: number;
  climbFuelL: number;
  enrouteFuelL: number;
  descentFuelL: number;
  tripFuelL: number;
  contingencyFuelL: number;
  alternate1FuelL: number;
  alternate2FuelL: number;
  reserveFuelL: number;
  requiredUsableFuelL: number;
  extraUsableFuelL: number;
  fuelSufficient: boolean;
  climbLh: number;
  cruiseLh: number;
  descentLh: number;
};

export type P2006TMassPoint = {
  label: "Ramp" | "Takeoff" | "Arrival" | "Alternate 1" | "Alternate 2";
  massKg: number;
  momentKgm: number;
  cgPercentMac: number;
  usableFuelL: number;
  withinMassLimit: boolean;
  withinCgLimit: boolean;
};

export type P2006TMissionCalculation = {
  loading: P2006TLoadingInput;
  fuel: P2006TFuelPlan;
  zeroFuelMassKg: number;
  zeroFuelMomentKgm: number;
  points: P2006TMassPoint[];
  takeoff: P2006TMassPoint;
  arrival: P2006TMassPoint;
  alternate1: P2006TMassPoint;
  alternate2: P2006TMassPoint;
  warnings: string[];
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number(value || 0)));
}

function whole(value: number) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function fuelForMinutes(minutes: number, rateLh: number) {
  return whole((Math.max(0, minutes) / 60) * Math.max(0, rateLh));
}

export function usableFuelFromTotal(totalFuelInTanksL: number) {
  return clamp(
    Number(totalFuelInTanksL || 0) - P2006T_FUEL.unusableFuelL,
    0,
    P2006T_FUEL.usableCapacityL
  );
}

export function calculateP2006TFuelPlan(
  totalFuelInTanksL: number,
  times: P2006TFuelTimesInput,
  rates: P2006TPhaseFuelRates
): P2006TFuelPlan {
  const usableLoadedL = usableFuelFromTotal(totalFuelInTanksL);
  const taxiFuelL = whole(times.taxiFuelL);
  const climbFuelL = fuelForMinutes(times.climbMin, rates.climbLh);
  const enrouteFuelL = fuelForMinutes(times.enrouteMin, rates.cruiseLh);
  const descentFuelL = fuelForMinutes(times.descentMin, rates.descentLh);
  const tripFuelL = whole(climbFuelL + enrouteFuelL + descentFuelL);
  const contingencyFuelL = whole(tripFuelL * 0.05);
  const alternate1FuelL = fuelForMinutes(times.alternate1Min, rates.cruiseLh);
  const alternate2FuelL = fuelForMinutes(times.alternate2Min, rates.cruiseLh);
  const reserveFuelL = fuelForMinutes(times.reserveMin, rates.cruiseLh);
  const requiredUsableFuelL = whole(
    taxiFuelL +
      tripFuelL +
      contingencyFuelL +
      Math.max(alternate1FuelL, alternate2FuelL) +
      reserveFuelL
  );
  const extraUsableFuelL = whole(
    Math.max(0, usableLoadedL - requiredUsableFuelL)
  );

  return {
    usableLoadedL,
    unusableFuelL: P2006T_FUEL.unusableFuelL,
    taxiFuelL,
    climbFuelL,
    enrouteFuelL,
    descentFuelL,
    tripFuelL,
    contingencyFuelL,
    alternate1FuelL,
    alternate2FuelL,
    reserveFuelL,
    requiredUsableFuelL,
    extraUsableFuelL,
    fuelSufficient: usableLoadedL >= requiredUsableFuelL,
    climbLh: rates.climbLh,
    cruiseLh: rates.cruiseLh,
    descentLh: rates.descentLh,
  };
}

function pointFromFuel({
  label,
  zeroFuelMassKg,
  zeroFuelMomentKgm,
  usableFuelL,
  maximumMassKg,
}: {
  label: P2006TMassPoint["label"];
  zeroFuelMassKg: number;
  zeroFuelMomentKgm: number;
  usableFuelL: number;
  maximumMassKg: number;
}): P2006TMassPoint {
  const fuelMassKg = Math.max(0, usableFuelL) * P2006T_FUEL.densityKgL;
  const massKg = zeroFuelMassKg + fuelMassKg;
  const momentKgm = zeroFuelMomentKgm + fuelMassKg * P2006T_FUEL.armM;
  const cgPercentMac =
    massKg > 0
      ? (momentKgm / massKg / P2006T_LOADING_ARMS.meanAerodynamicChordM) * 100
      : 0;

  return {
    label,
    massKg,
    momentKgm,
    cgPercentMac,
    usableFuelL: Math.max(0, usableFuelL),
    withinMassLimit: massKg <= maximumMassKg,
    withinCgLimit: cgPercentMac >= 16.5 && cgPercentMac <= 31,
  };
}

export function calculateP2006TMission({
  aircraft,
  loading,
  fuelTimes,
  rates,
}: {
  aircraft: P2006TFleetAircraft;
  loading: P2006TLoadingInput;
  fuelTimes: P2006TFuelTimesInput;
  rates: P2006TPhaseFuelRates;
}): P2006TMissionCalculation {
  const fuel = calculateP2006TFuelPlan(
    loading.totalFuelInTanksL,
    fuelTimes,
    rates
  );
  const frontKg = Math.max(0, loading.studentKg) + Math.max(0, loading.instructorKg);
  const zeroFuelMassKg =
    Math.max(0, loading.emptyMassKg) +
    frontKg +
    Math.max(0, loading.rearSeatsKg) +
    Math.max(0, loading.baggageKg);
  const zeroFuelMomentKgm =
    Math.max(0, loading.emptyMomentKgm) +
    frontKg * P2006T_LOADING_ARMS.frontSeatsM +
    Math.max(0, loading.rearSeatsKg) * P2006T_LOADING_ARMS.rearSeatsM +
    Math.max(0, loading.baggageKg) * P2006T_LOADING_ARMS.baggageM;

  const rampUsableFuelL = fuel.usableLoadedL;
  const takeoffUsableFuelL = Math.max(0, rampUsableFuelL - fuel.taxiFuelL);
  const arrivalUsableFuelL = Math.max(0, takeoffUsableFuelL - fuel.tripFuelL);
  const alternate1UsableFuelL = Math.max(
    0,
    arrivalUsableFuelL - fuel.alternate1FuelL
  );
  const alternate2UsableFuelL = Math.max(
    0,
    arrivalUsableFuelL - fuel.alternate2FuelL
  );

  const makePoint = (
    label: P2006TMassPoint["label"],
    usableFuelL: number
  ) =>
    pointFromFuel({
      label,
      zeroFuelMassKg,
      zeroFuelMomentKgm,
      usableFuelL,
      maximumMassKg: aircraft.maxMassKg,
    });

  const ramp = makePoint("Ramp", rampUsableFuelL);
  const takeoff = makePoint("Takeoff", takeoffUsableFuelL);
  const arrival = makePoint("Arrival", arrivalUsableFuelL);
  const alternate1 = makePoint("Alternate 1", alternate1UsableFuelL);
  const alternate2 = makePoint("Alternate 2", alternate2UsableFuelL);
  const points = [ramp, takeoff, arrival, alternate1, alternate2];
  const warnings: string[] = [];
  const maximumZeroFuelMassKg = aircraft.maxMassKg === 1230 ? 1195 : 1145;

  if (loading.emptyMassKg <= 0 || loading.emptyMomentKgm <= 0) {
    warnings.push("Empty mass and moment are required before M&B can be checked.");
  }
  if (loading.totalFuelInTanksL > P2006T_FUEL.totalCapacityL) {
    warnings.push(
      `Fuel exceeds tank capacity: ${whole(loading.totalFuelInTanksL)} L > ${P2006T_FUEL.totalCapacityL} L.`
    );
  }
  if (zeroFuelMassKg > maximumZeroFuelMassKg) {
    warnings.push(
      `Zero-fuel mass exceeds ${maximumZeroFuelMassKg} kg.`
    );
  }
  for (const point of points) {
    if (!point.withinMassLimit) {
      warnings.push(
        `${point.label} mass ${whole(point.massKg)} kg exceeds ${aircraft.maxMassKg} kg.`
      );
    }
    if (point.massKg > 0 && !point.withinCgLimit) {
      warnings.push(
        `${point.label} CG ${point.cgPercentMac.toFixed(1)}% MAC is outside 16.5–31.0% MAC.`
      );
    }
  }
  if (!fuel.fuelSufficient) {
    warnings.push(
      `Usable fuel is short by ${whole(fuel.requiredUsableFuelL - fuel.usableLoadedL)} L.`
    );
  }

  return {
    loading,
    fuel,
    zeroFuelMassKg,
    zeroFuelMomentKgm,
    points,
    takeoff,
    arrival,
    alternate1,
    alternate2,
    warnings: Array.from(new Set(warnings)),
  };
}

export function massForRole(
  calculation: P2006TMissionCalculation,
  role: "Departure" | "Arrival" | "Alternate" | "Alternate 2"
) {
  if (role === "Departure") return calculation.takeoff.massKg;
  if (role === "Arrival") return calculation.arrival.massKg;
  if (role === "Alternate") return calculation.alternate1.massKg;
  return calculation.alternate2.massKg;
}
