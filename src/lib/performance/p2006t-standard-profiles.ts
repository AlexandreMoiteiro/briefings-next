export const P2006T_STANDARD_PROFILE_SOURCE = {
  document: "Sevenair Academy RVP.CFI.024.02",
  title: "P2006T Standard Profiles V2",
  aircraft: "P2006T CS-EBX",
} as const;

export const P2006T_STANDARD_PROFILES = {
  climb: {
    label: "Normal climb",
    speedKt: 100,
    pitchDeg: 5,
    manifoldPressureInHg: 27,
    rpm: 2200,
    sourcePage: 4,
  },
  cruise: {
    label: "Normal cruise",
    speedKt: 125,
    speedReference: "TAS",
    pitchDeg: 0,
    manifoldPressureInHg: 24,
    rpm: 2100,
    sourcePage: 4,
  },
  slowCruise: {
    label: "Slow cruise",
    speedKt: 110,
    speedReference: "KIAS",
    pitchDeg: 2,
    manifoldPressureInHg: 22,
    rpm: 2100,
    sourcePage: 4,
  },
  descent: {
    label: "Cruise descent",
    speedKt: 120,
    pitchDeg: -4,
    manifoldPressureInHg: 21,
    rpm: 2100,
    sourcePage: 8,
  },
} as const;

/**
 * NavLog uses stable operational profiles, not AFM table interpolation.
 * The complete aircraft tables remain exclusive to Performance and its PDF.
 */
export const P2006T_NAVLOG_DEFAULTS = {
  climbTasKt: P2006T_STANDARD_PROFILES.climb.speedKt,
  cruiseTasKt: P2006T_STANDARD_PROFILES.cruise.speedKt,
  descentTasKt: P2006T_STANDARD_PROFILES.descent.speedKt,
  fuelFlowLh: 36,
  taxiFuelL: 5,
  taxiFuelFlowLh: 16,
  startEfobL: 200,
  taxiMin: 20,
  rocFpm: 850,
  rodFpm: 500,
  defaultAltitudeFt: 3000,
} as const;
