"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { ParsedCoordinatePoint } from "./area-map-client";

type CoordinateLeafletMapProps = {
  points: ParsedCoordinatePoint[];
};

const defaultCenter: [number, number] = [38.7223, -9.1393];

function closePolygon(points: ParsedCoordinatePoint[]) {
  if (points.length < 3) return points;

  const first = points[0];
  const last = points[points.length - 1];

  if (
    Math.abs(first.lat - last.lat) < 0.000001 &&
    Math.abs(first.lon - last.lon) < 0.000001
  ) {
    return points;
  }

  return [...points, first];
}

function FitToPoints({ points }: { points: ParsedCoordinatePoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) {
      map.setView(defaultCenter, 9);
      return;
    }

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 13);
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lon]));
    map.fitBounds(bounds.pad(0.25), { animate: false });
  }, [map, points]);

  return null;
}

function buildOpenAipUrl() {
  const template = process.env.NEXT_PUBLIC_OPENAIP_TILES_URL;
  const apiKey = process.env.NEXT_PUBLIC_OPENAIP_API_KEY;

  if (!template || !apiKey) return null;

  if (template.includes("{apiKey}")) {
    return template.replace("{apiKey}", apiKey);
  }

  if (template.includes("apiKey=")) {
    return `${template}${apiKey}`;
  }

  return `${template}${template.includes("?") ? "&" : "?"}apiKey=${apiKey}`;
}

export function CoordinateLeafletMap({ points }: CoordinateLeafletMapProps) {
  const polygonPoints = useMemo(() => closePolygon(points), [points]);
  const openAipUrl = buildOpenAipUrl();
  const singlePoint = points.length === 1 ? points[0] : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div className="h-[640px] w-full">
        <MapContainer
          center={defaultCenter}
          zoom={9}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution="Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap"
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          />

          {openAipUrl ? (
            <TileLayer attribution="OpenAIP" url={openAipUrl} opacity={0.65} />
          ) : null}

          <FitToPoints points={points} />

          {points.length >= 3 ? (
            <Polygon
              positions={polygonPoints.map((point) => [point.lat, point.lon])}
              pathOptions={{
                color: "#18181b",
                weight: 3,
                fillOpacity: 0.16,
              }}
            />
          ) : points.length >= 2 ? (
            <Polyline
              positions={points.map((point) => [point.lat, point.lon])}
              pathOptions={{
                color: "#18181b",
                weight: 3,
              }}
            />
          ) : null}

          {singlePoint ? (
            <CircleMarker
              center={[singlePoint.lat, singlePoint.lon]}
              radius={8}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: "#18181b",
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <p>
                    <strong>{singlePoint.label}</strong>
                  </p>
                  <p>{singlePoint.raw}</p>
                  <p>
                    {singlePoint.lat.toFixed(6)}, {singlePoint.lon.toFixed(6)}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          ) : null}
        </MapContainer>
      </div>
    </section>
  );
}
