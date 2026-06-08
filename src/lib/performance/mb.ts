export type PerformanceAircraft = "Piper PA-28" | "Tecnam P2008";

export const KG_TO_LB = 2.2046226218;
export const USG_TO_L = 3.785411784;
export const L_TO_USG = 1 / USG_TO_L;

export const PA28 = {
  fuelUsableUsg: 48,
  fuelUsableL: 182,
  fuelLbPerUsg: 6,
  baggageMaxKg: 90,
  armFront: 80.5,
  armRear: 118.1,
  armFuel: 95.0,
  armBaggage: 142.8,
  taxiAllowLb: 8.0,
  taxiArm: 95.5,
  mtowLb: 2550,
  mlwLb: 2550,
};

export const TECNAM = {
  name: "Tecnam P2008 JC",
  fuelArm: 2.209,
  pilotArm: 1.8,
  baggageArm: 2.417,
  maxTakeoffWeightKg: 650,
  maxFuelVolumeL: 120,
  maxPassengerWeightKg: 230,
  maxBaggageWeightKg: 20,
  cgLimitsM: [1.841, 1.978] as const,
  fuelDensityKgL: 0.72,
};

export type Pa28MbInput = {
  emptyWeightLb: number;
  emptyMomentInLb: number;
  studentKg?: number;
  instructorKg?: number;
  frontKg: number;
  rearKg: number;
  baggageKg: number;
  fuelL: number;
  tripFuelL: number;
};

export type TecnamMbInput = {
  emptyWeightKg: number;
  emptyMomentKgM: number;
  studentKg?: number;
  instructorKg?: number;
  pilotPassengerKg: number;
  baggageKg: number;
  fuelL: number;
};

export type Pa28MbResult = {
  empty: Pa28Point;
  ramp: Pa28Point;
  takeoff: Pa28Point;
  landing: Pa28Point;
  fuelLb: number;
  fuelUsg: number;
  tripFuelLb: number;
  warnings: string[];
};

export type Pa28Point = {
  label: string;
  weightLb: number;
  weightKg: number;
  momentInLb: number;
  cgIn: number;
};

export type TecnamMbResult = {
  empty: TecnamLine;
  pilotPassenger: TecnamLine;
  baggage: TecnamLine;
  fuel: TecnamLine;
  total: TecnamLine;
  fuelKg: number;
  remainingByMtowKg: number;
  warnings: string[];
};

export type TecnamLine = {
  label: string;
  weightKg: number;
  armM: number;
  momentKgM: number;
  cgM?: number;
};

function safeDiv(a: number, b: number) {
  return b > 0 ? a / b : 0;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function kgToLb(kg: number) {
  return kg * KG_TO_LB;
}

export function lbToKg(lb: number) {
  return lb / KG_TO_LB;
}

export function litersToUsg(liters: number) {
  return liters * L_TO_USG;
}

export function usgToLiters(usg: number) {
  return usg * USG_TO_L;
}

export function fuelLToPa28Lb(fuelL: number) {
  let fuelUsg = litersToUsg(fuelL);

  if (Math.abs(fuelL - PA28.fuelUsableL) < 0.5) {
    fuelUsg = PA28.fuelUsableUsg;
  }

  return {
    fuelUsg,
    fuelLb: fuelUsg * PA28.fuelLbPerUsg,
  };
}

export function calculatePa28Mb(input: Pa28MbInput): Pa28MbResult {
  const frontKg =
    input.studentKg !== undefined || input.instructorKg !== undefined
      ? Number(input.studentKg ?? 0) + Number(input.instructorKg ?? 0)
      : input.frontKg;

  const frontLb = kgToLb(frontKg);
  const rearLb = kgToLb(input.rearKg);
  const bagLb = kgToLb(input.baggageKg);
  const { fuelUsg, fuelLb } = fuelLToPa28Lb(input.fuelL);
  const { fuelLb: tripFuelLb } = fuelLToPa28Lb(input.tripFuelL);

  const emptyWeightLb = input.emptyWeightLb;
  const emptyMomentInLb = input.emptyMomentInLb;
  const emptyCg = safeDiv(emptyMomentInLb, emptyWeightLb);

  const momentFront = frontLb * PA28.armFront;
  const momentRear = rearLb * PA28.armRear;
  const momentFuel = fuelLb * PA28.armFuel;
  const momentBag = bagLb * PA28.armBaggage;

  const rampWeight = emptyWeightLb + frontLb + rearLb + fuelLb + bagLb;
  const rampMoment =
    emptyMomentInLb + momentFront + momentRear + momentFuel + momentBag;

  const takeoffWeight = rampWeight - PA28.taxiAllowLb;
  const takeoffMoment = rampMoment - PA28.taxiAllowLb * PA28.taxiArm;

  const landingWeight = Math.max(0, takeoffWeight - tripFuelLb);
  const landingMoment = takeoffMoment - tripFuelLb * PA28.armFuel;

  const warnings: string[] = [];

  if (input.baggageKg > PA28.baggageMaxKg) {
    warnings.push(`Baggage above limit: ${input.baggageKg.toFixed(0)} kg > ${PA28.baggageMaxKg.toFixed(0)} kg.`);
  }

  if (input.fuelL > PA28.fuelUsableL) {
    warnings.push(`Fuel above usable fuel: ${input.fuelL.toFixed(0)} L > ${PA28.fuelUsableL.toFixed(0)} L.`);
  }

  if (takeoffWeight > PA28.mtowLb) {
    warnings.push(`MTOW exceeded: ${takeoffWeight.toFixed(0)} lb > ${PA28.mtowLb.toFixed(0)} lb.`);
  }

  if (landingWeight > PA28.mlwLb) {
    warnings.push(`MLW exceeded: ${landingWeight.toFixed(0)} lb > ${PA28.mlwLb.toFixed(0)} lb.`);
  }

  return {
    empty: {
      label: "Empty",
      weightLb: round(emptyWeightLb, 0),
      weightKg: round(lbToKg(emptyWeightLb), 0),
      momentInLb: round(emptyMomentInLb, 0),
      cgIn: round(emptyCg, 1),
    },
    ramp: {
      label: "Ramp",
      weightLb: round(rampWeight, 0),
      weightKg: round(lbToKg(rampWeight), 0),
      momentInLb: round(rampMoment, 0),
      cgIn: round(safeDiv(rampMoment, rampWeight), 1),
    },
    takeoff: {
      label: "Takeoff",
      weightLb: round(takeoffWeight, 0),
      weightKg: round(lbToKg(takeoffWeight), 0),
      momentInLb: round(takeoffMoment, 0),
      cgIn: round(safeDiv(takeoffMoment, takeoffWeight), 1),
    },
    landing: {
      label: "Landing",
      weightLb: round(landingWeight, 0),
      weightKg: round(lbToKg(landingWeight), 0),
      momentInLb: round(landingMoment, 0),
      cgIn: round(safeDiv(landingMoment, landingWeight), 1),
    },
    fuelLb: round(fuelLb, 0),
    fuelUsg: round(fuelUsg, 1),
    tripFuelLb: round(tripFuelLb, 0),
    warnings,
  };
}

export function calculateTecnamMb(input: TecnamMbInput): TecnamMbResult {
  const fuelKg = input.fuelL * TECNAM.fuelDensityKgL;

  const empty: TecnamLine = {
    label: "Empty",
    weightKg: input.emptyWeightKg,
    armM: safeDiv(input.emptyMomentKgM, input.emptyWeightKg),
    momentKgM: input.emptyMomentKgM,
  };

  const pilotPassengerKg =
    input.studentKg !== undefined || input.instructorKg !== undefined
      ? Number(input.studentKg ?? 0) + Number(input.instructorKg ?? 0)
      : input.pilotPassengerKg;

  const pilotPassenger: TecnamLine = {
    label: "Student & Instructor",
    weightKg: pilotPassengerKg,
    armM: TECNAM.pilotArm,
    momentKgM: pilotPassengerKg * TECNAM.pilotArm,
  };

  const baggage: TecnamLine = {
    label: "Baggage",
    weightKg: input.baggageKg,
    armM: TECNAM.baggageArm,
    momentKgM: input.baggageKg * TECNAM.baggageArm,
  };

  const fuel: TecnamLine = {
    label: "Fuel",
    weightKg: fuelKg,
    armM: TECNAM.fuelArm,
    momentKgM: fuelKg * TECNAM.fuelArm,
  };

  const totalWeight =
    empty.weightKg + pilotPassenger.weightKg + baggage.weightKg + fuel.weightKg;
  const totalMoment =
    empty.momentKgM +
    pilotPassenger.momentKgM +
    baggage.momentKgM +
    fuel.momentKgM;
  const cg = safeDiv(totalMoment, totalWeight);

  const total: TecnamLine = {
    label: "Total",
    weightKg: round(totalWeight, 1),
    armM: round(cg, 3),
    momentKgM: round(totalMoment, 2),
    cgM: round(cg, 3),
  };

  const warnings: string[] = [];
  const [cgMin, cgMax] = TECNAM.cgLimitsM;

  if (input.fuelL > TECNAM.maxFuelVolumeL) {
    warnings.push(`Fuel above maximum: ${input.fuelL.toFixed(0)} L > ${TECNAM.maxFuelVolumeL.toFixed(0)} L.`);
  }

  if (pilotPassengerKg > TECNAM.maxPassengerWeightKg) {
    warnings.push(`Student/instructor above maximum: ${pilotPassengerKg.toFixed(0)} kg > ${TECNAM.maxPassengerWeightKg.toFixed(0)} kg.`);
  }

  if (input.baggageKg > TECNAM.maxBaggageWeightKg) {
    warnings.push(`Baggage above maximum: ${input.baggageKg.toFixed(0)} kg > ${TECNAM.maxBaggageWeightKg.toFixed(0)} kg.`);
  }

  if (totalWeight > TECNAM.maxTakeoffWeightKg) {
    warnings.push(`MTOW exceeded: ${totalWeight.toFixed(1)} kg > ${TECNAM.maxTakeoffWeightKg.toFixed(0)} kg.`);
  }

  if (cg > 0 && (cg < cgMin || cg > cgMax)) {
    warnings.push(`CG outside limits: ${cg.toFixed(3)} m is not between ${cgMin.toFixed(3)} e ${cgMax.toFixed(3)} m.`);
  }

  return {
    empty,
    pilotPassenger,
    baggage,
    fuel,
    total,
    fuelKg: round(fuelKg, 1),
    remainingByMtowKg: round(Math.max(0, TECNAM.maxTakeoffWeightKg - totalWeight), 1),
    warnings,
  };
}

export function statusClass(ok: boolean) {
  return ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";
}
