export const P2006T_NAVLOG_SETTINGS_KEY =
  "briefings_p2006t_navlog_conditions_v1";

export type P2006TCruiseRpm = 1900 | 2100 | 2250;

export type P2006TNavlogConditions = {
  weightKg: number;
  isaDeviationC: number;
  cruiseRpm: P2006TCruiseRpm;
  cruisePowerPercent: number;
};

export const DEFAULT_P2006T_NAVLOG_CONDITIONS: P2006TNavlogConditions = {
  weightKg: 1150,
  isaDeviationC: 0,
  cruiseRpm: 2250,
  cruisePowerPercent: 65,
};

let conditions: P2006TNavlogConditions = {
  ...DEFAULT_P2006T_NAVLOG_CONDITIONS,
};
let version = 0;
const listeners = new Set<() => void>();

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRpm(value: number): P2006TCruiseRpm {
  if (value === 1900 || value === 2100 || value === 2250) return value;
  return 2250;
}

function normalize(
  input: Partial<P2006TNavlogConditions>
): P2006TNavlogConditions {
  return {
    weightKg: Math.round(
      clamp(
        finiteOr(input.weightKg, conditions.weightKg),
        930,
        1230
      )
    ),
    isaDeviationC: Math.round(
      clamp(
        finiteOr(input.isaDeviationC, conditions.isaDeviationC),
        -30,
        30
      )
    ),
    cruiseRpm: normalizeRpm(
      finiteOr(input.cruiseRpm, conditions.cruiseRpm)
    ),
    cruisePowerPercent: Math.round(
      clamp(
        finiteOr(
          input.cruisePowerPercent,
          conditions.cruisePowerPercent
        ),
        35,
        90
      )
    ),
  };
}

function sameConditions(
  a: P2006TNavlogConditions,
  b: P2006TNavlogConditions
) {
  return (
    a.weightKg === b.weightKg &&
    a.isaDeviationC === b.isaDeviationC &&
    a.cruiseRpm === b.cruiseRpm &&
    a.cruisePowerPercent === b.cruisePowerPercent
  );
}

export function getP2006TNavlogConditions() {
  return conditions;
}

export function getP2006TNavlogConditionsVersion() {
  return version;
}

export function subscribeP2006TNavlogConditions(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setP2006TNavlogConditions(
  patch: Partial<P2006TNavlogConditions>
) {
  const next = normalize({ ...conditions, ...patch });
  if (sameConditions(next, conditions)) return;

  conditions = next;
  version += 1;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      P2006T_NAVLOG_SETTINGS_KEY,
      JSON.stringify(conditions)
    );
  }

  listeners.forEach((listener) => listener());
}

export function hydrateP2006TNavlogConditions() {
  if (typeof window === "undefined") return;

  try {
    const saved = window.localStorage.getItem(P2006T_NAVLOG_SETTINGS_KEY);
    if (!saved) return;
    setP2006TNavlogConditions(
      JSON.parse(saved) as Partial<P2006TNavlogConditions>
    );
  } catch {
    window.localStorage.removeItem(P2006T_NAVLOG_SETTINGS_KEY);
  }
}
