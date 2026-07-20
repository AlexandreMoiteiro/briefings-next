import {
  PERFORMANCE_AERODROMES,
  type PerformanceAerodrome,
  type PerformanceRunway,
} from "@/lib/performance/aerodromes";
import { applyAipRunwayOverrides } from "@/lib/performance/aip-runway-overrides";

const AERODROME_DB = PERFORMANCE_AERODROMES as Record<
  string,
  PerformanceAerodrome
>;

export type PerformanceLegRole =
  | "Departure"
  | "Arrival"
  | "Alternate"
  | "Alternate 2";

export type PerformanceLegInput = {
  role: PerformanceLegRole;
  icao: string;
  tempC: number;
  qnhHpa: number;
  windFrom: number;
  windKt: number;
  forecastHourUtc?: number;
};

export type PerformanceLegResult = {
  leg: PerformanceLegInput;
  aerodrome: PerformanceAerodrome | null;
  bestRunway: PerformanceRunway | null;
  pressureAltitudeFt: number;
  densityAltitudeFt: number;
  headwindKt: number;
  crosswindKt: number;
  crosswindSide: "L" | "R" | "";
};

export type WindComponentsResult = {
  headwindKt: number;
  crosswindKt: number;
  crosswindSide: "L" | "R" | "";
};

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function pressureAltitudeFt(elevFt: number, qnhHpa: number) {
  return elevFt + (1013 - qnhHpa) * 30;
}

export function isaTempC(elevFt: number) {
  return 15 - 2 * (elevFt / 1000);
}

export function densityAltitudeFt(elevFt: number, qnhHpa: number, oatC: number) {
  const pa = pressureAltitudeFt(elevFt, qnhHpa);
  const isa = isaTempC(elevFt);
  return pa + 120 * (oatC - isa);
}

export function windComponents(
  qfuDeg: number,
  windFromDeg: number,
  windKt: number
): WindComponentsResult {
  const diff = (((windFromDeg - qfuDeg + 180) % 360) + 360) % 360 - 180;
  const rad = (diff * Math.PI) / 180;
  const headwind = windKt * Math.cos(rad);
  const crosswind = windKt * Math.sin(rad);

  let crosswindSide: WindComponentsResult["crosswindSide"] = "";
  if (crosswind > 0) crosswindSide = "R";
  if (crosswind < 0) crosswindSide = "L";

  return {
    headwindKt: round(headwind, 1),
    crosswindKt: round(Math.abs(crosswind), 1),
    crosswindSide,
  };
}

export function chooseBestRunwayByWind(
  aerodrome: PerformanceAerodrome,
  windFrom: number,
  windKt: number
) {
  let best:
    | {
        runway: PerformanceRunway;
        headwindKt: number;
        crosswindKt: number;
        crosswindSide: "L" | "R" | "";
      }
    | null = null;

  for (const runway of aerodrome.runways) {
    const wind = windComponents(runway.qfu, windFrom, windKt);
    if (!best) {
      best = { runway, ...wind };
      continue;
    }
    if (
      wind.headwindKt > best.headwindKt ||
      (Math.abs(wind.headwindKt - best.headwindKt) < 0.1 &&
        wind.crosswindKt < best.crosswindKt)
    ) {
      best = { runway, ...wind };
    }
  }

  return best;
}

export function evaluatePerformanceLeg(
  leg: PerformanceLegInput
): PerformanceLegResult {
  const sourceAerodrome = AERODROME_DB[leg.icao] ?? null;
  const aerodrome = sourceAerodrome
    ? applyAipRunwayOverrides(leg.icao, sourceAerodrome)
    : null;

  if (!aerodrome) {
    return {
      leg,
      aerodrome: null,
      bestRunway: null,
      pressureAltitudeFt: 0,
      densityAltitudeFt: 0,
      headwindKt: 0,
      crosswindKt: 0,
      crosswindSide: "",
    };
  }

  const best = chooseBestRunwayByWind(
    aerodrome,
    leg.windFrom,
    leg.windKt
  );

  return {
    leg,
    aerodrome,
    bestRunway: best?.runway ?? null,
    pressureAltitudeFt: round(
      pressureAltitudeFt(aerodrome.elev_ft, leg.qnhHpa),
      0
    ),
    densityAltitudeFt: round(
      densityAltitudeFt(aerodrome.elev_ft, leg.qnhHpa, leg.tempC),
      0
    ),
    headwindKt: best?.headwindKt ?? 0,
    crosswindKt: best?.crosswindKt ?? 0,
    crosswindSide: best?.crosswindSide ?? "",
  };
}
