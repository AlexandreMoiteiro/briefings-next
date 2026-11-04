"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { PerfectRouteWaypointRaw } from "@/lib/navlog-saved-routes";

type MapPoint = { lat: number; lon: number; label: string; name?: string };

function AddPointOnMap({ onAddPoint }: { onAddPoint?: (lat: number, lon: number) => void }) {
  useMapEvents({ click(event) { onAddPoint?.(event.latlng.lat, event.latlng.lng); } });
  return null;
}

function FitRoute({ points, routeId, fitToken }: { points: MapPoint[]; routeId: string; fitToken: number }) {
  const map = useMap();
  const lastFittedRoute = useRef<string | null>(null);
  useEffect(() => {
    // A different route or newly added point fits the map, but dragging coordinates
    // must not constantly undo the admin's chosen zoom and pan.
    const signature = `${routeId}:${points.length}:${fitToken}`;
    if (lastFittedRoute.current === signature) return;
    lastFittedRoute.current = signature;
    const timeout = window.setTimeout(() => {
      map.invalidateSize();
      if (points.length > 1) {
        const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lon] as [number, number]));
        map.fitBounds(bounds.pad(0.2), { animate: false, maxZoom: 12 });
      } else if (points.length === 1) {
        map.setView([points[0].lat, points[0].lon], 10, { animate: false });
      }
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [map, points, routeId, fitToken]);
  return null;
}

export function AdminRouteMap({ routeId, points, onAddPoint, onMovePoint, onSelectPoint, selectedIndex }: {
  routeId: string;
  points: PerfectRouteWaypointRaw[];
  onAddPoint?: (lat: number, lon: number) => void;
  onMovePoint?: (index: number, lat: number, lon: number) => void;
  onSelectPoint?: (index: number) => void;
  selectedIndex?: number;
}) {
  const [fitToken, setFitToken] = useState(0);
  const valid = useMemo(() => points
    .map((point, index) => ({ lat: point.lat, lon: point.lon, label: point.code || point.name || `WP${index + 1}`, name: point.name, index }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180), [points]);

  if (!valid.length) {
    return <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">Esta rota não tem coordenadas válidas para mostrar no mapa.</div>;
  }

  const positions = valid.map((point) => [point.lat, point.lon] as [number, number]);
  return (
    <section aria-label="Mapa geográfico da rota" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">Percurso no mapa</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">{onAddPoint ? "Clica para adicionar" : onMovePoint ? "Arrasta os marcadores para ajustar coordenadas" : "Arrasta para explorar · +/− para zoom"}</span>
          <button type="button" onClick={() => setFitToken((value) => value + 1)} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:border-sky-400">Ajustar vista à rota</button>
        </div>
      </div>
      <div className={`h-[360px] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 sm:h-[440px] ${onAddPoint ? "cursor-crosshair" : ""}`}>
        <MapContainer center={[39.5, -8]} zoom={7} scrollWheelZoom={false} className="h-full w-full" zoomControl>
          <AddPointOnMap onAddPoint={onAddPoint} />
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
          <FitRoute points={valid} routeId={routeId} fitToken={fitToken} />
          {positions.length > 1 ? <Polyline positions={positions} pathOptions={{ color: "#18181b", weight: 3, opacity: 0.9 }} /> : null}
          {valid.map((point, index) => {
            const isEnd = index === valid.length - 1;
            const isStart = index === 0;
            return onMovePoint ? (
              <Marker key={`${index}-${point.label}`} position={[point.lat, point.lon]} draggable
                icon={L.divIcon({ className: "", html: `<span style="display:flex;align-items:center;justify-content:center;border:2px solid #fff;background:${selectedIndex === point.index ? "#0284c7" : "#18181b"};color:#fff;border-radius:999px;width:29px;height:29px;font-size:12px;font-weight:700;box-shadow:0 2px 6px #0005">${point.index + 1}</span>`, iconSize: [29, 29], iconAnchor: [14, 14] })}
                eventHandlers={{ click() { onSelectPoint?.(point.index); }, dragend(event) { const location = event.target.getLatLng(); onSelectPoint?.(point.index); onMovePoint(point.index, Number(location.lat.toFixed(6)), Number(location.lng.toFixed(6))); } }}>
                <Tooltip direction="top" offset={[0, -12]}><strong>{point.label}</strong></Tooltip>
              </Marker>
            ) : (
              <CircleMarker key={`${index}-${point.lat}-${point.lon}`} center={[point.lat, point.lon]}
                radius={isStart || isEnd ? 7 : 4.5}
                pathOptions={{ color: "#ffffff", weight: 2, fillColor: isStart ? "#166534" : isEnd ? "#18181b" : "#52525b", fillOpacity: 1 }}>
                <Tooltip direction="top" permanent={valid.length <= 10 && (isStart || isEnd)} offset={[0, -6]} opacity={0.98}>
                  <strong>{point.label}</strong>{point.name && point.name !== point.label ? ` · ${point.name}` : ""}
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <p className="text-[11px] leading-5 text-zinc-500">{onMovePoint ? "Clica num marcador para editar o ponto; arrasta-o para ajustar as coordenadas. Azul = selecionado. " : "Verde: origem · Preto: destino. "}Base OpenStreetMap. Mapa apenas para orientação na gestão; não é uma carta aeronáutica.</p>
    </section>
  );
}
