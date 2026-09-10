import type { PerformanceAircraft } from "@/lib/performance/mb";

export type FuelPlanningInput = {
  rateLh: number;
  fuelLoadedL: number;

  taxiMin: number;
  climbMin: number;
  enrouteMin: number;
  descentMin: number;
  alternateMin: number;
  reserveMin: number;

  taxiFuelL: number;
  climbFuelL: number;
  enrouteFuelL: number;
  descentFuelL: number;

  tripMin: number;
  tripFuelL: number;

  contingencyMin: number;
  contingencyFuelL: number;

  alternateFuelL: number;
  reserveFuelL: number;

  requiredRampMin: number;
  requiredRampFuelL: number;

  extraMin: number;
  extraFuelL: number;

  totalRampMin: number;
  totalRampFuelL: number;

  fuelSufficient: boolean;
};

// Established operational approximation rules shared with NavLog:
// time to the nearest minute and fuel to the nearest litre.
function roundMinutes(value: number) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function roundFuel(value: number) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function fuelForMinutes(minutes: number, rateLh: number) {
  return roundFuel(Number(rateLh || 0) * (roundMinutes(minutes) / 60));
}

function minutesForFuel(fuelL: number, rateLh: number) {
  if (!rateLh || rateLh <= 0) return 0;
  return roundMinutes((fuelL / rateLh) * 60);
}

export function recalculateFuelPlan(
  input: Partial<FuelPlanningInput>
): FuelPlanningInput {
  const rateLh = Math.max(0, Number(input.rateLh ?? 0));
  const fuelLoadedL = Math.max(0, Number(input.fuelLoadedL ?? 0));

  const taxiMin = roundMinutes(Number(input.taxiMin ?? 0));
  const climbMin = roundMinutes(Number(input.climbMin ?? 0));
  const enrouteMin = roundMinutes(Number(input.enrouteMin ?? 0));
  const descentMin = roundMinutes(Number(input.descentMin ?? 0));
  const alternateMin = roundMinutes(Number(input.alternateMin ?? 0));
  const reserveMin = roundMinutes(Number(input.reserveMin ?? 45));

  const taxiFuelL = fuelForMinutes(taxiMin, rateLh);
  const climbFuelL = fuelForMinutes(climbMin, rateLh);
  const enrouteFuelL = fuelForMinutes(enrouteMin, rateLh);
  const descentFuelL = fuelForMinutes(descentMin, rateLh);

  const tripMin = climbMin + enrouteMin + descentMin;
  const tripFuelL = fuelForMinutes(tripMin, rateLh);

  const contingencyMin = roundMinutes(tripMin * 0.05);
  const contingencyFuelL = fuelForMinutes(contingencyMin, rateLh);

  const alternateFuelL = fuelForMinutes(alternateMin, rateLh);
  const reserveFuelL = fuelForMinutes(reserveMin, rateLh);

  const requiredRampMin =
    taxiMin + tripMin + contingencyMin + alternateMin + reserveMin;
  const requiredRampFuelL = fuelForMinutes(requiredRampMin, rateLh);

  const extraFuelL = Math.max(0, roundFuel(fuelLoadedL - requiredRampFuelL));
  const extraMin = minutesForFuel(extraFuelL, rateLh);

  return {
    rateLh,
    fuelLoadedL,

    taxiMin,
    climbMin,
    enrouteMin,
    descentMin,
    alternateMin,
    reserveMin,

    taxiFuelL,
    climbFuelL,
    enrouteFuelL,
    descentFuelL,

    tripMin,
    tripFuelL,

    contingencyMin,
    contingencyFuelL,

    alternateFuelL,
    reserveFuelL,

    requiredRampMin,
    requiredRampFuelL,

    extraMin,
    extraFuelL,

    totalRampMin: requiredRampMin + extraMin,
    totalRampFuelL: roundFuel(fuelLoadedL),

    fuelSufficient: fuelLoadedL >= requiredRampFuelL,
  };
}

export function defaultFuelPlanForAircraft(
  aircraft: PerformanceAircraft,
  fuelLoadedL: number
): FuelPlanningInput {
  if (aircraft === "Piper PA-28") {
    return recalculateFuelPlan({
      rateLh: 37.9,
      fuelLoadedL,
      taxiMin: 20,
      climbMin: 10,
      enrouteMin: 100,
      descentMin: 10,
      alternateMin: 45,
      reserveMin: 45,
    });
  }

  return recalculateFuelPlan({
    rateLh: 20,
    fuelLoadedL,
    taxiMin: 20,
    climbMin: 10,
    enrouteMin: 100,
    descentMin: 10,
    alternateMin: 45,
    reserveMin: 45,
  });
}

export function formatFuelTime(minutes: number) {
  const rounded = roundMinutes(minutes);

  if (rounded === 0) return "";

  if (rounded < 60) return `${rounded}'`;

  const h = Math.floor(rounded / 60);
  const m = rounded % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatFuelLiters(liters: number) {
  const value = roundFuel(liters);
  return value > 0 ? String(value) : "";
}
