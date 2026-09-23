export type PlotNotam = {
  id: string;
  number: string;
  status: string;
  locationCode: string;
  affectedFir: string;
  qCode: string;
  category: string;
  text: string;
  shortReading: string;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  schedule: string;
  latitude: number;
  longitude: number;
  radiusNm: number;
  lowerLimit: string;
  upperLimit: string;
  minimumFl: string;
  maximumFl: string;
};

export type NotamApiResponse = {
  configured: boolean;
  provider: string;
  notices: PlotNotam[];
  total: number;
  plotted: number;
  truncated: boolean;
  fetchedAt: string;
  message?: string;
};

export type NotamBbox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export const DEFAULT_PORTUGAL_NOTAM_BBOX: NotamBbox = {
  minLon: -10.25,
  minLat: 35.12,
  maxLon: -6.0,
  maxLat: 42.32,
};

export function bboxFromPoints(
  points: Array<{ lat: number; lon: number }>,
  fallback: NotamBbox = DEFAULT_PORTUGAL_NOTAM_BBOX
): NotamBbox {
  if (!points.length) return fallback;

  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = Math.max(0.25, maxLat - minLat);
  const lonSpan = Math.max(0.25, maxLon - minLon);
  const latPad = Math.max(0.2, latSpan * 0.2);
  const lonPad = Math.max(0.2, lonSpan * 0.2);

  return {
    minLon: Math.max(-180, minLon - lonPad),
    minLat: Math.max(-90, minLat - latPad),
    maxLon: Math.min(180, maxLon + lonPad),
    maxLat: Math.min(90, maxLat + latPad),
  };
}

export function bboxToQuery(bbox: NotamBbox) {
  return [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat]
    .map((value) => value.toFixed(5))
    .join(",");
}
