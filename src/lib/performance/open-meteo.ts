import {
  PERFORMANCE_AERODROMES,
  type PerformanceAerodrome,
} from "@/lib/performance/aerodromes";
import type { PerformanceLegInput } from "@/lib/performance/aerodrome-performance";

const OPEN_METEO_AERODROME_DB = PERFORMANCE_AERODROMES as Record<
  string,
  PerformanceAerodrome
>;

type OpenMeteoHourly = {
  time?: string[];
  temperature_2m?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_direction_10m?: Array<number | null>;
  pressure_msl?: Array<number | null>;
};

type OpenMeteoResponse = {
  hourly?: OpenMeteoHourly;
};

export type FetchedMet = {
  tempC: number;
  qnhHpa: number;
  windFrom: number;
  windKt: number;
  label: string;
};

function nearestIndex(times: string[], targetIso: string) {
  const target = new Date(targetIso).getTime();

  if (!Number.isFinite(target)) return -1;

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const value = new Date(`${time}:00Z`).getTime();
    const distance = Math.abs(value - target);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function roundWindDir(value: number) {
  const rounded = Math.round(value / 10) * 10;
  const normalized = ((rounded % 360) + 360) % 360;

  return normalized === 0 ? 360 : normalized;
}

export async function fetchOpenMeteoForLeg(
  leg: PerformanceLegInput,
  flightDateIso: string
): Promise<FetchedMet | null> {
  const aerodrome = OPEN_METEO_AERODROME_DB[leg.icao];

  if (!aerodrome || leg.icao === "-") return null;

  const hour = Math.max(0, Math.min(23, leg.forecastHourUtc ?? 9));
  const targetIso = `${flightDateIso}T${String(hour).padStart(2, "0")}:00:00Z`;

  const url = new URL("https://api.open-meteo.com/v1/forecast");

  url.searchParams.set("latitude", aerodrome.lat.toFixed(5));
  url.searchParams.set("longitude", aerodrome.lon.toFixed(5));
  url.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "wind_speed_10m",
      "wind_direction_10m",
      "pressure_msl",
    ].join(",")
  );
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("windspeed_unit", "kn");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("pressure_unit", "hPa");
  url.searchParams.set("start_date", flightDateIso);
  url.searchParams.set("end_date", flightDateIso);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Open-Meteo ${leg.icao}: HTTP ${response.status}`);
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const hourly = data.hourly ?? {};
  const times = hourly.time ?? [];
  const index = nearestIndex(times, targetIso);

  if (index < 0) return null;

  const temp = hourly.temperature_2m?.[index];
  const windSpeed = hourly.wind_speed_10m?.[index];
  const windDirection = hourly.wind_direction_10m?.[index];
  const pressure = hourly.pressure_msl?.[index];

  if (
    temp === null ||
    temp === undefined ||
    windSpeed === null ||
    windSpeed === undefined ||
    windDirection === null ||
    windDirection === undefined ||
    pressure === null ||
    pressure === undefined
  ) {
    return null;
  }

  return {
    tempC: Math.round(temp),
    qnhHpa: Math.round(pressure),
    windFrom: roundWindDir(windDirection),
    windKt: Math.round(windSpeed),
    label: `${flightDateIso} ${String(hour).padStart(2, "0")}:00Z`,
  };
}
