import { PERFORMANCE_AERODROMES } from "@/lib/performance/aerodromes";

/**
 * AIP-audited aeronautical weather service availability.
 * Portugal: AIP GEN 3.5 (effective 2026-10-01).
 * Spain: ENAIRE AIP AD 2 MET services, consulted 2026-10-11.
 * This is *service availability*, not evidence a current report exists.
 */
const VERIFIED_AIP_SERVICES = {
  LPBJ: { metar: true, taf: false },
  LPCS: { metar: true, taf: true },
  LPFR: { metar: true, taf: true },
  LPPR: { metar: true, taf: true },
  LPPT: { metar: true, taf: true },
  LEBZ: { metar: true, taf: true },
  LEMG: { metar: true, taf: true },
  LEVX: { metar: true, taf: true },
  LEZL: { metar: true, taf: true }
} as const;

export type WeatherService = { metar:boolean; taf:boolean };
export type MeteorologyAerodrome = WeatherService & {
  icao:string; name:string;
};

export const METEOROLOGY_AERODROMES: MeteorologyAerodrome[] =
  Object.entries(VERIFIED_AIP_SERVICES)
    .filter(([icao]) => icao in PERFORMANCE_AERODROMES)
    .map(([icao, service]) => ({
      icao,
      name: PERFORMANCE_AERODROMES[icao as keyof typeof PERFORMANCE_AERODROMES].name,
      ...service
    }))
    .sort((a,b) => a.icao.localeCompare(b.icao));

export function airportWeatherService(icao:string):WeatherService|null {
  const match = METEOROLOGY_AERODROMES.find(item=>item.icao===icao);
  return match ? {metar:match.metar,taf:match.taf} : null;
}
