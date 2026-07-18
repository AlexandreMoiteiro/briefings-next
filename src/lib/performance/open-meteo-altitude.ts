import {
  PERFORMANCE_AERODROMES,
  type PerformanceAerodrome,
} from "@/lib/performance/aerodromes";

const AERODROMES = PERFORMANCE_AERODROMES as Record<
  string,
  PerformanceAerodrome
>;
const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500] as const;

type HourlyValues = Record<string, Array<string | number | null> | undefined>;
type OpenMeteoPressureResponse = { hourly?: HourlyValues };

export type FetchedAltitudeTemperature = {
  tempC: number;
  altitudeFt: number;
  lowerLevelHpa: number;
  upperLevelHpa: number;
  limitedToAvailableLevels: boolean;
  label: string;
};

function nearestTimeIndex(times: string[], targetIso: string) {
  const target = new Date(targetIso).getTime();
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const instant = new Date(`${time}:00Z`).getTime();
    const distance = Math.abs(instant - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function numberAt(hourly: HourlyValues, key: string, index: number) {
  const value = hourly[key]?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function fetchOpenMeteoTemperatureAtAltitude({
  icao,
  flightDateIso,
  forecastHourUtc,
  altitudeFt,
}: {
  icao: string;
  flightDateIso: string;
  forecastHourUtc: number;
  altitudeFt: number;
}): Promise<FetchedAltitudeTemperature | null> {
  const aerodrome = AERODROMES[icao];
  if (!aerodrome || icao === "-") return null;

  const hour = Math.max(0, Math.min(23, Math.round(forecastHourUtc)));
  const targetIso = `${flightDateIso}T${String(hour).padStart(2, "0")}:00:00Z`;
  const variables = PRESSURE_LEVELS.flatMap((level) => [
    `temperature_${level}hPa`,
    `geopotential_height_${level}hPa`,
  ]);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", aerodrome.lat.toFixed(5));
  url.searchParams.set("longitude", aerodrome.lon.toFixed(5));
  url.searchParams.set("hourly", variables.join(","));
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("start_date", flightDateIso);
  url.searchParams.set("end_date", flightDateIso);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Open-Meteo altitude weather ${icao}: HTTP ${response.status}`);
  }

  const data = (await response.json()) as OpenMeteoPressureResponse;
  const hourly = data.hourly ?? {};
  const times = (hourly.time ?? []).filter(
    (value): value is string => typeof value === "string"
  );
  const index = nearestTimeIndex(times, targetIso);
  if (index < 0) return null;

  const levels = PRESSURE_LEVELS.map((level) => {
    const tempC = numberAt(hourly, `temperature_${level}hPa`, index);
    const heightM = numberAt(hourly, `geopotential_height_${level}hPa`, index);
    return tempC === null || heightM === null
      ? null
      : { levelHpa: level, tempC, heightFt: heightM / 0.3048 };
  })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .sort((a, b) => a.heightFt - b.heightFt);

  if (!levels.length) return null;

  const requestedAltitude = Math.max(0, altitudeFt);
  const clampedAltitude = Math.min(
    levels[levels.length - 1].heightFt,
    Math.max(levels[0].heightFt, requestedAltitude)
  );
  let lower = levels[0];
  let upper = levels[levels.length - 1];

  for (const level of levels) {
    if (level.heightFt <= clampedAltitude) lower = level;
    if (level.heightFt >= clampedAltitude) {
      upper = level;
      break;
    }
  }

  const ratio =
    upper.heightFt === lower.heightFt
      ? 0
      : (clampedAltitude - lower.heightFt) / (upper.heightFt - lower.heightFt);
  const tempC = lower.tempC + (upper.tempC - lower.tempC) * ratio;

  return {
    tempC: Math.round(tempC),
    altitudeFt: Math.round(requestedAltitude),
    lowerLevelHpa: lower.levelHpa,
    upperLevelHpa: upper.levelHpa,
    limitedToAvailableLevels: clampedAltitude !== requestedAltitude,
    label: `${flightDateIso} ${String(hour).padStart(2, "0")}:00Z`,
  };
}
