export type C152FuelPlanningInput = {
  startupTaxiMin: number;
  startupTaxiGal: number;
  climbMin: number;
  climbFuelGal: number;
  enrouteMin: number;
  enrouteFuelGal: number;
  descentMin: number;
  descentFuelGal: number;
  alternateMin: number;
  alternateFuelGal: number;
  reserveFuelGal: number;
  loadedRampFuelGal: number;
};

export type C152FuelPlanningResult = C152FuelPlanningInput & {
  reserveMin: 45;
  tripMin: number;
  tripFuelGal: number;
  contingencyFuelGal: number;
  requiredRampFuelGal: number;
  extraFuelGal: number;
  fuelOk: boolean;
  warnings: string[];
};

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function calculateC152FuelPlanning(
  input: C152FuelPlanningInput
): C152FuelPlanningResult {
  const normalized: C152FuelPlanningInput = {
    startupTaxiMin: finiteNonNegative(input.startupTaxiMin),
    startupTaxiGal: finiteNonNegative(input.startupTaxiGal),
    climbMin: finiteNonNegative(input.climbMin),
    climbFuelGal: finiteNonNegative(input.climbFuelGal),
    enrouteMin: finiteNonNegative(input.enrouteMin),
    enrouteFuelGal: finiteNonNegative(input.enrouteFuelGal),
    descentMin: finiteNonNegative(input.descentMin),
    descentFuelGal: finiteNonNegative(input.descentFuelGal),
    alternateMin: finiteNonNegative(input.alternateMin),
    alternateFuelGal: finiteNonNegative(input.alternateFuelGal),
    reserveFuelGal: finiteNonNegative(input.reserveFuelGal),
    loadedRampFuelGal: finiteNonNegative(input.loadedRampFuelGal),
  };

  const tripMin = normalized.climbMin + normalized.enrouteMin + normalized.descentMin;
  const tripFuelGal =
    normalized.climbFuelGal + normalized.enrouteFuelGal + normalized.descentFuelGal;
  const contingencyFuelGal = tripFuelGal * 0.05;
  const requiredRampFuelGal =
    normalized.startupTaxiGal +
    tripFuelGal +
    contingencyFuelGal +
    normalized.alternateFuelGal +
    normalized.reserveFuelGal;
  const extraFuelGal = normalized.loadedRampFuelGal - requiredRampFuelGal;
  const fuelOk = extraFuelGal >= -0.01;

  const warnings: string[] = [];
  if (!fuelOk) {
    warnings.push(
      `Loaded usable fuel is ${round(Math.abs(extraFuelGal), 1)} US gal below required ramp fuel.`
    );
  }
  if (normalized.climbMin > 0 && normalized.climbFuelGal === 0) {
    warnings.push("Climb time is entered but climb fuel is zero.");
  }
  if (normalized.enrouteMin > 0 && normalized.enrouteFuelGal === 0) {
    warnings.push("Enroute time is entered but enroute fuel is zero.");
  }
  if (normalized.descentMin > 0 && normalized.descentFuelGal === 0) {
    warnings.push("Descent time is entered but descent fuel is zero.");
  }
  if (normalized.alternateMin > 0 && normalized.alternateFuelGal === 0) {
    warnings.push("Alternate time is entered but alternate fuel is zero.");
  }

  return {
    ...normalized,
    reserveMin: 45,
    tripMin: round(tripMin, 1),
    tripFuelGal: round(tripFuelGal),
    contingencyFuelGal: round(contingencyFuelGal),
    requiredRampFuelGal: round(requiredRampFuelGal),
    extraFuelGal: round(extraFuelGal),
    fuelOk,
    warnings,
  };
}
