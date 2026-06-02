"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { CoordinateMapArea, ParsedCoordinatePoint } from "./area-map-client";

type CoordinateLeafletMapProps = {
  areas: CoordinateMapArea[];
  selectedAreaId?: string;
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

function getBoundsCenter(points: ParsedCoordinatePoint[]): [number, number] {
  const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lon]));
  const center = bounds.getCenter();

  return [center.lat, center.lng];
}

function getPolygonCentroid(points: ParsedCoordinatePoint[]): [number, number] {
  if (points.length < 3) return getBoundsCenter(points);

  const closed = closePolygon(points);
  let crossSum = 0;
  let cx = 0;
  let cy = 0;

  for (let index = 0; index < closed.length - 1; index += 1) {
    const current = closed[index];
    const next = closed[index + 1];

    const x0 = current.lon;
    const y0 = current.lat;
    const x1 = next.lon;
    const y1 = next.lat;
    const cross = x0 * y1 - x1 * y0;

    crossSum += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }

  if (Math.abs(crossSum) < 0.00000001) {
    return getBoundsCenter(points);
  }

  return [cy / (3 * crossSum), cx / (3 * crossSum)];
}

function getLabelPosition(points: ParsedCoordinatePoint[]): [number, number] {
  if (points.length >= 3) return getPolygonCentroid(points);
  return getBoundsCenter(points);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function areaNameIcon(name: string, selected: boolean) {
  const safeName = escapeHtml(name.trim() || "Area");

  return L.divIcon({
    className: "",
    html: `<div class="area-map-label ${
      selected ? "area-map-label-selected" : ""
    }">${safeName}</div>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

function FitToAreas({
  areas,
  expanded,
}: {
  areas: CoordinateMapArea[];
  expanded: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      map.invalidateSize();

      const allPoints = areas.flatMap((area) => area.points);

      if (!allPoints.length) {
        map.setView(defaultCenter, 9);
        return;
      }

      if (allPoints.length === 1) {
        map.setView([allPoints[0].lat, allPoints[0].lon], 13);
        return;
      }

      const bounds = L.latLngBounds(
        allPoints.map((point) => [point.lat, point.lon])
      );

      map.fitBounds(bounds.pad(0.25), { animate: false });
    }, 160);

    return () => window.clearTimeout(timeout);
  }, [map, areas, expanded]);

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

export function CoordinateLeafletMap({
  areas,
  selectedAreaId,
}: CoordinateLeafletMapProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const openAipUrl = buildOpenAipUrl();

  const drawableAreas = useMemo(
    () => areas.filter((area) => area.points.length > 0),
    [areas]
  );

  useEffect(() => {
    function onFullscreenChange() {
      setExpanded(document.fullscreenElement === rootRef.current);
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (rootRef.current?.requestFullscreen) {
      await rootRef.current.requestFullscreen();
      return;
    }

    setExpanded((value) => !value);
  }

  return (
    <section
      ref={rootRef}
      className={
        expanded
          ? "fixed inset-0 z-[9999] overflow-hidden bg-white"
          : "relative overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm"
      }
    >
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute right-3 top-3 z-[10000] rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold text-zinc-950 shadow-sm ring-1 ring-zinc-200 transition hover:bg-white"
      >
        {expanded ? "Fechar" : "Fullscreen"}
      </button>

      <div className={expanded ? "h-screen w-screen" : "h-[640px] w-full"}>
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

          <FitToAreas areas={drawableAreas} expanded={expanded} />

          {drawableAreas.map((area) => {
            const selected =
              area.id === selectedAreaId || area.isSelected || area.isDraft;
            const pathOptions = {
              color: selected ? "#020617" : "#18181b",
              weight: selected ? 4 : 2,
              fillOpacity: selected ? 0.22 : 0.12,
              dashArray: area.isDraft ? "6 6" : undefined,
            };

            const labelPosition = getLabelPosition(area.points);

            return (
              <div key={area.id}>
                {area.points.length >= 3 ? (
                  <Polygon
                    positions={closePolygon(area.points).map((point) => [
                      point.lat,
                      point.lon,
                    ])}
                    pathOptions={pathOptions}
                  />
                ) : area.points.length >= 2 ? (
                  <Polyline
                    positions={area.points.map((point) => [
                      point.lat,
                      point.lon,
                    ])}
                    pathOptions={pathOptions}
                  />
                ) : (
                  <CircleMarker
                    center={[area.points[0].lat, area.points[0].lon]}
                    radius={8}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 2,
                      fillColor: selected ? "#020617" : "#18181b",
                      fillOpacity: 1,
                    }}
                  />
                )}

                <Marker
                  position={labelPosition}
                  icon={areaNameIcon(area.name, selected)}
                  interactive={false}
                />
              </div>
            );
          })}
        </MapContainer>
      </div>

      <style jsx global>{`
        section:fullscreen {
          width: 100vw;
          height: 100vh;
          border-radius: 0;
        }

        .area-map-label {
          transform: translate(-50%, -50%);
          white-space: nowrap;
          border: 1px solid rgba(24, 24, 27, 0.18);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          color: #18181b;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.3;
          pointer-events: none;
        }

        .area-map-label-selected {
          background: rgba(2, 6, 23, 0.92);
          border-color: rgba(2, 6, 23, 0.92);
          color: #ffffff;
        }
      `}</style>
    </section>
  );
}
