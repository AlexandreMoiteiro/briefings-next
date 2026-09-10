import {
  C152_CS_AVC,
  c152ForwardCgLimitIn,
  c152LitersToGallons,
  type C152WeightBalanceResult,
} from "@/lib/performance/c152-performance";

export type C152FlightCgLabel = "TO" | "LDG" | "ALT";

export type C152FlightCgPoint = {
  label: C152FlightCgLabel;
  fuelBurnGal: number;
  fuelRemainingGal: number;
  weightLb: number;
  momentLbIn: number;
  cgIn: number;
  forwardLimitIn: number;
  aftLimitIn: number;
  withinEnvelope: boolean;
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pointAfterFuelBurn(
  wb: C152WeightBalanceResult,
  label: C152FlightCgLabel,
  fuelBurnGal: number
): C152FlightCgPoint | null {
  const burnGal = Math.max(0, Number(fuelBurnGal || 0));
  if (burnGal > wb.takeoffFuelGal + 0.01) return null;

  const fuelWeightBurnLb = burnGal * C152_CS_AVC.fuelDensityLbGal;
  const weightLb = wb.takeoff.weightLb - fuelWeightBurnLb;
  const momentLbIn =
    wb.takeoff.momentLbIn - fuelWeightBurnLb * C152_CS_AVC.fuelArmIn;

  if (weightLb <= 0) return null;

  const cgIn = momentLbIn / weightLb;
  const forwardLimitIn = c152ForwardCgLimitIn(weightLb);
  const aftLimitIn = 36.5;

  return {
    label,
    fuelBurnGal: round(burnGal),
    fuelRemainingGal: round(Math.max(0, wb.takeoffFuelGal - burnGal)),
    weightLb: round(weightLb, 1),
    momentLbIn: round(momentLbIn, 1),
    cgIn: round(cgIn, 2),
    forwardLimitIn: round(forwardLimitIn, 2),
    aftLimitIn,
    withinEnvelope: cgIn >= forwardLimitIn && cgIn <= aftLimitIn,
  };
}

export function buildC152FlightCgTrack(
  wb: C152WeightBalanceResult,
  tripFuelL: number,
  alternateFuelL: number
) {
  const tripGal = c152LitersToGallons(Math.max(0, Number(tripFuelL || 0)));
  const alternateGal = c152LitersToGallons(
    Math.max(0, Number(alternateFuelL || 0))
  );

  return [
    pointAfterFuelBurn(wb, "TO", 0),
    pointAfterFuelBurn(wb, "LDG", tripGal),
    pointAfterFuelBurn(wb, "ALT", tripGal + alternateGal),
  ].filter((point): point is C152FlightCgPoint => point !== null);
}
