import type { P2006TCruiseRpm } from "./p2006t-navlog-settings";

export type P2006TPerformanceSettings = {
  cruiseAltitudeFt: number;
  isaDeviationC: number;
  cruiseRpm: P2006TCruiseRpm;
  cruisePowerPercent: number;
};

export const DEFAULT_P2006T_PERFORMANCE_SETTINGS: P2006TPerformanceSettings = {
  cruiseAltitudeFt: 3000,
  isaDeviationC: 0,
  cruiseRpm: 2100,
  cruisePowerPercent: 65,
};

let settings: P2006TPerformanceSettings = {
  ...DEFAULT_P2006T_PERFORMANCE_SETTINGS,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getP2006TPerformanceSettings() {
  return settings;
}

export function setP2006TPerformanceSettings(
  patch: Partial<P2006TPerformanceSettings>
) {
  const rpm = Number(patch.cruiseRpm ?? settings.cruiseRpm);
  settings = {
    cruiseAltitudeFt: Math.round(
      clamp(Number(patch.cruiseAltitudeFt ?? settings.cruiseAltitudeFt), 0, 9000)
    ),
    isaDeviationC: Math.round(
      clamp(Number(patch.isaDeviationC ?? settings.isaDeviationC), -30, 30)
    ),
    cruiseRpm:
      rpm === 1900 || rpm === 2100 || rpm === 2250 ? rpm : settings.cruiseRpm,
    cruisePowerPercent: Math.round(
      clamp(
        Number(patch.cruisePowerPercent ?? settings.cruisePowerPercent),
        35,
        90
      )
    ),
  };
  return settings;
}
