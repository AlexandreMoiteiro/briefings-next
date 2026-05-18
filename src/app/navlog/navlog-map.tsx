"use client";

import { useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMapEvents,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type {
  NavlogPoint,
  NavlogRouteNode,
  NavlogRouteWaypoint,
} from "@/lib/navlog";

type NavlogMapProps = {
  points: NavlogPoint[];
  routeWaypoints: NavlogRouteWaypoint[];
  calculatedNodes: NavlogRouteNode[];
  searchQuery: string;
  onAddPoint: (point: NavlogPoint) => void;
  onAddMapPoint: (lat: number, lon: number) => void;
};

function MapClickHandler({
  enabled,
  onAddMapPoint,
}: {
  enabled: boolean;
  onAddMapPoint: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onAddMapPoint(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function pointMatchesQuery(point: NavlogPoint, query: string) {
  const normalized = query.trim().toUpperCase();

  if (!normalized) return false;

  return (
    point.code.toUpperCase().includes(normalized) ||
    point.name.toUpperCase().includes(normalized) ||
    point.src.toUpperCase().includes(normalized) ||
    point.routes.toUpperCase().includes(normalized)
  );
}

function getPointRadius(src: string) {
  if (src === "AD") return 5;
  if (src === "VOR") return 4;
  if (src === "IFR") return 3;
  return 3;
}

export function NavlogMap({
  points,
  routeWaypoints,
  calculatedNodes,
  searchQuery,
  onAddPoint,
  onAddMapPoint,
}: NavlogMapProps) {
  const [clickToAdd, setClickToAdd] = useState(false);

  const routePositions = calculatedNodes.map(
    (node) => [node.lat, node.lon] as LatLngExpression
  );

  const center: LatLngExpression =
    routePositions.length > 0
      ? routePositions[0]
      : ([39.55, -8.0] as LatLngExpression);

  const visiblePoints = useMemo(() => {
    const query = searchQuery.trim();

    if (query) {
      return points.filter((point) => pointMatchesQuery(point, query)).slice(0, 500);
    }

    return points
      .filter((point) => ["AD", "VFR", "VOR"].includes(point.src))
      .slice(0, 1200);
  }, [points, searchQuery]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            Mapa da rota
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Clica num ponto do mapa para o adicionar à rota. Ativa “click manual”
            para criar um waypoint numa coordenada livre.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setClickToAdd((current) => !current)}
          className={[
            "rounded-xl px-4 py-2 text-sm font-medium transition",
            clickToAdd
              ? "bg-zinc-950 text-white"
              : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
          ].join(" ")}
        >
          {clickToAdd ? "Click manual ativo" : "Ativar click manual"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <MapContainer
          center={center}
          zoom={7}
          scrollWheelZoom
          className="h-[680px] w-full"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler
            enabled={clickToAdd}
            onAddMapPoint={onAddMapPoint}
          />

          {visiblePoints.map((point) => (
            <CircleMarker
              key={`${point.src}-${point.code}-${point.lat}-${point.lon}`}
              center={[point.lat, point.lon]}
              radius={getPointRadius(point.src)}
              pathOptions={{
                weight: 1,
                fillOpacity: 0.75,
              }}
            >
              <Popup>
                <div className="space-y-2">
                  <div>
                    <div className="text-sm font-semibold">{point.code}</div>
                    <div className="text-xs text-zinc-600">{point.name}</div>
                    <div className="text-xs text-zinc-500">
                      {point.src} · {point.lat.toFixed(5)},{" "}
                      {point.lon.toFixed(5)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAddPoint(point)}
                    className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Adicionar à rota
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {routePositions.length > 1 ? (
            <Polyline positions={routePositions} pathOptions={{ weight: 3 }} />
          ) : null}

          {calculatedNodes.map((node, index) => (
            <CircleMarker
              key={`${node.id}-${index}`}
              center={[node.lat, node.lon]}
              radius={node.src === "CALC" ? 5 : 6}
              pathOptions={{
                weight: 2,
                fillOpacity: 0.95,
              }}
            >
              <Popup>
                <div>
                  <div className="text-sm font-semibold">
                    {index + 1}. {node.code}
                  </div>
                  <div className="text-xs text-zinc-600">{node.name}</div>
                  <div className="text-xs text-zinc-500">
                    {node.src} · {node.alt.toFixed(0)} ft
                  </div>
                  {node.calcDetail ? (
                    <div className="mt-1 text-xs text-zinc-500">
                      {node.calcDetail}
                    </div>
                  ) : null}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </section>
  );
}
