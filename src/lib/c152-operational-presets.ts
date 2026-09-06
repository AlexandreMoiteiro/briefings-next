export const C152_NAVLOG_SYNC_STORAGE_KEY = "briefings_c152_navlog_plan_v1";

export const C152_NAVLOG_PRESET = {
  registration: "CS-AVC" as string,
  climbTasKt: 68,
  cruiseTasKt: 101,
  descentTasKt: 90,
  fuelFlowLh: 22.3,
  taxiFuelL: 3.0,
  taxiFuelFlowLh: 18.2,
  startEfobL: 92.7,
  taxiMin: 10,
  rocFpm: 590,
  rodFpm: 500,
  defaultAltitudeFt: 3000,
} as const;

export const C152_PERFORMANCE_PRESET = {
  pilotKg: 50,
  passengerKg: 80,
  baggageArea1Kg: 5,
  baggageArea2Kg: 0,
  startTaxiTakeoffAllowanceGal: 0.8,
  climbTo3000Min: 5,
  climbTo3000FuelGal: 0.7,
  reserve45MinFuelGal: 4.4,
  cruiseReferenceRpm: 2400,
  cruiseReferenceFuelGph: 5.9,
};

export type C152NavlogSyncPlan = {
  version: 1;
  savedAt: string;
  registration: "CS-AVC";
  setup: {
    startEfobL: number;
    taxiMin: number;
    taxiFuelL: number;
    climbTasKt: number;
    cruiseTasKt: number;
    descentTasKt: number;
    fuelFlowLh: number;
    rocFpm: number;
    rodFpm: number;
    defaultAltitudeFt: number;
  };
  route: {
    departureIcao: string;
    arrivalIcao: string;
    alternateIcao: string;
  };
  fuelPlanning: {
    startupTaxiMin: number;
    startupTaxiFuelL: number;
    climbMin: number;
    climbFuelL: number;
    enrouteMin: number;
    enrouteFuelL: number;
    descentMin: number;
    descentFuelL: number;
    alternateMin: number;
    alternateFuelL: number;
  };
};
