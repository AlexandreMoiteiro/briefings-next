"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

type JsonRecord = Record<string, unknown>;

type EventMapPoint = {
  lat: number;
  lon: number;
  label: string;
  detail?: string;
};

type EventMapPath = {
  id: string;
  label: string;
  points: EventMapPoint[];
  closed?: boolean;
  tone: "route" | "performance" | "area";
};

const defaultCenter: [number, number] = [39.4, -8.1];
const openAipApiKey = process.env.NEXT_PUBLIC_OPENAIP_API_KEY ?? "";
const openAipTilesUrl = openAipApiKey
  ? `https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${openAipApiKey}`
  : "";

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function pointFromRecord(
  value: unknown,
  index: number,
  fallbackLabel: string
): EventMapPoint | null {
  const record = asRecord(value);

  if (!record) return null;

  const lat = asNumber(record.lat ?? record.latitude);
  const lon = asNumber(record.lon ?? record.lng ?? record.longitude);

  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }

  const label = asText(
    record.code ?? record.icao ?? record.label ?? record.name,
    `${fallbackLabel}${index + 1}`
  );
  const detail = asText(record.name ?? record.role ?? record.src);

  return { lat, lon, label, detail: detail === label ? "" : detail };
}

function extractNavlogPath(payload: JsonRecord): EventMapPath | null {
  const points = asArray(payload.route)
    .map((value, index) => pointFromRecord(value, index, "WP"))
    .filter((value): value is EventMapPoint => Boolean(value));

  if (!points.length) return null;

  return {
    id: "navlog-route",
    label: "NavLog route",
    points,
    tone: "route",
  };
}

function extractPerformancePath(payload: JsonRecord): EventMapPath | null {
  const points = asArray(payload.performanceResults)
    .map((value, index): EventMapPoint | null => {
      const result = asRecord(value);
      const aerodrome = asRecord(result?.aerodrome);
      const leg = asRecord(result?.leg);

      if (!aerodrome) return null;

      const point = pointFromRecord(
        {
          ...aerodrome,
          code: leg?.icao,
          role: leg?.role,
        },
        index,
        "AD"
      );

      if (!point) return null;

      return {
        ...point,
        detail: [asText(leg?.role), asText(aerodrome.name)]
          .filter(Boolean)
          .join(" · "),
      };
    })
    .filter((value): value is EventMapPoint => Boolean(value));

  if (!points.length) return null;

  return {
    id: "performance-aerodromes",
    label: "Performance aerodromes",
    points,
    tone: "performance",
  };
}

function extractAreaPaths(payload: JsonRecord): EventMapPath[] {
  const areas = asArray(payload.areas);

  if (areas.length) {
    return areas
      .map((value, areaIndex): EventMapPath | null => {
        const area = asRecord(value);
        const points = asArray(area?.points)
          .map((point, pointIndex) =>
            pointFromRecord(point, pointIndex, `A${areaIndex + 1}-P`)
          )
          .filter((point): point is EventMapPoint => Boolean(point));

        if (!points.length) return null;

        return {
          id: asText(area?.id, `area-${areaIndex}`),
          label: asText(area?.name, `Area ${areaIndex + 1}`),
          points,
          closed: points.length >= 3,
          tone: "area" as const,
        };
      })
      .filter((value): value is EventMapPath => Boolean(value));
  }

  const points = asArray(payload.points)
    .map((point, index) => pointFromRecord(point, index, "P"))
    .filter((point): point is EventMapPoint => Boolean(point));

  if (!points.length) return [];

  return [
    {
      id: "area",
      label: asText(payload.name, "Area"),
      points,
      closed: points.length >= 3,
      tone: "area",
    },
  ];
}

function extractPaths(payload: JsonRecord) {
  const paths: EventMapPath[] = [];
  const navlog = extractNavlogPath(payload);
  const performance = extractPerformancePath(payload);

  if (navlog) paths.push(navlog);
  if (performance) paths.push(performance);
  paths.push(...extractAreaPaths(payload));

  return paths;
}

function FitEventMap({ paths }: { paths: EventMapPath[] }) {
  const map = useMap();

  useEffect(() => {
    const points = paths.flatMap((path) => path.points);
    const timeout = window.setTimeout(() => {
      map.invalidateSize();

      if (!points.length) {
        map.setView(defaultCenter, 7);
        return;
      }

      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lon], 12);
        return;
      }

      const bounds = L.latLngBounds(
        points.map((point) => [point.lat, point.lon] as [number, number])
      );
      map.fitBounds(bounds.pad(0.25), { animate: false });
    }, 100);

    return () => window.clearTimeout(timeout);
  }, [map, paths]);

  return null;
}

function pathStyle(tone: EventMapPath["tone"]) {
  if (tone === "route") {
    return { color: "#dc2626", weight: 4, fillOpacity: 0.1 };
  }

  if (tone === "performance") {
    return { color: "#2563eb", weight: 3, fillOpacity: 0.1 };
  }

  return { color: "#18181b", weight: 3, fillOpacity: 0.16 };
}

export function UsageEventMap({ payload }: { payload: JsonRecord }) {
  const paths = useMemo(() => extractPaths(payload), [payload]);
  const pointCount = paths.reduce((total, path) => total + path.points.length, 0);

  if (!pointCount) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
        This event has no mappable coordinates.
      </div>
    );
  }

  return (
    <div className="h-[360px] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
      <MapContainer
        center={defaultCenter}
        zoom={7}
        maxZoom={18}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          maxZoom={17}
        />

        {openAipTilesUrl ? (
          <TileLayer
            attribution="openAIP"
            url={openAipTilesUrl}
            opacity={0.6}
            minZoom={4}
            maxNativeZoom={16}
            maxZoom={18}
            detectRetina
            zIndex={260}
          />
        ) : null}

        <FitEventMap paths={paths} />

        {paths.map((path) => {
          const positions = path.points.map(
            (point) => [point.lat, point.lon] as [number, number]
          );
          const style = pathStyle(path.tone);

          return (
            <div key={path.id}>
              {path.closed && positions.length >= 3 ? (
                <Polygon positions={positions} pathOptions={style} />
              ) : positions.length >= 2 ? (
                <Polyline positions={positions} pathOptions={style} />
              ) : null}

              {path.points.map((point, index) => (
                <CircleMarker
                  key={`${path.id}-${index}-${point.lat}-${point.lon}`}
                  center={[point.lat, point.lon]}
                  radius={index === 0 || index === path.points.length - 1 ? 7 : 5}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2,
                    fillColor: style.color,
                    fillOpacity: 1,
                  }}
                >
                  <Tooltip
                    permanent={path.points.length <= 12}
                    direction="top"
                    offset={[0, -7]}
                    opacity={0.95}
                  >
                    <strong>{point.label}</strong>
                    {point.detail ? <span> · {point.detail}</span> : null}
                  </Tooltip>
                </CircleMarker>
              ))}
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}
