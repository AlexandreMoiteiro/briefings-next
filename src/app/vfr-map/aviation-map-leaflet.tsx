"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { divIcon, type DivIcon, type LatLngExpression } from "leaflet";
import type { NavlogPoint } from "@/lib/navlog";

type AviationLayer = "AD" | "VFR" | "IFR" | "VOR";

type AviationMapLeafletProps = {
  points: NavlogPoint[];
  activeLayers: AviationLayer[];
  searchQuery: string;
  selectedPoint: NavlogPoint | null;
};

const openAipApiKey = process.env.NEXT_PUBLIC_OPENAIP_API_KEY ?? "";

const openAipTilesUrl = openAipApiKey
  ? `https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${openAipApiKey}`
  : "";

function pointMatchesQuery(point: NavlogPoint, query: string) {
  const normalized = query.trim().toUpperCase();

  if (!normalized) return true;

  return (
    point.code.toUpperCase().includes(normalized) ||
    point.name.toUpperCase().includes(normalized) ||
    point.src.toUpperCase().includes(normalized) ||
    point.routes.toUpperCase().includes(normalized) ||
    point.remarks.toUpperCase().includes(normalized)
  );
}

function getIconSpec(src: string) {
  if (src === "AD") {
    return {
      bg: "#ef4444",
      border: "#991b1b",
      shape: "circle",
      size: 18,
    };
  }

  if (src === "VOR") {
    return {
      bg: "#a855f7",
      border: "#6d28d9",
      shape: "diamond",
      size: 16,
    };
  }

  if (src === "IFR") {
    return {
      bg: "#60a5fa",
      border: "#1d4ed8",
      shape: "diamond-small",
      size: 13,
    };
  }

  return {
    bg: "#22c55e",
    border: "#166534",
    shape: "circle-small",
    size: 13,
  };
}

function makeIcon(src: string, selected = false): DivIcon {
  const spec = getIconSpec(src);
  const size = selected ? spec.size + 7 : spec.size;
  const borderWidth = selected ? 3 : 2;

  let shapeStyle = "";

  if (spec.shape === "diamond" || spec.shape === "diamond-small") {
    shapeStyle = `
      width:${size}px;
      height:${size}px;
      background:${spec.bg};
      border:${borderWidth}px solid ${spec.border};
      transform: rotate(45deg);
      border-radius:2px;
      box-shadow:${selected ? "0 0 0 5px rgba(17,24,39,.18)" : "none"};
      box-sizing:border-box;
    `;
  } else {
    shapeStyle = `
      width:${size}px;
      height:${size}px;
      background:${spec.bg};
      border:${borderWidth}px solid ${spec.border};
      border-radius:9999px;
      box-shadow:${selected ? "0 0 0 5px rgba(17,24,39,.18)" : "none"};
      box-sizing:border-box;
    `;
  }

  return divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;"><div style="${shapeStyle}"></div></div>`,
    className: "aviation-map-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FlyToSelectedPoint({ point }: { point: NavlogPoint | null }) {
  const map = useMap();

  useEffect(() => {
    if (!point) return;

    map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), 11), {
      animate: true,
      duration: 0.65,
    });
  }, [map, point]);

  return null;
}

export function AviationMapLeaflet({
  points,
  activeLayers,
  searchQuery,
  selectedPoint,
}: AviationMapLeafletProps) {
  const activeLayerSet = useMemo(() => new Set(activeLayers), [activeLayers]);

  const visiblePoints = useMemo(() => {
    const query = searchQuery.trim();

    return points
      .filter((point) => activeLayerSet.has(point.src as AviationLayer))
      .filter((point) => pointMatchesQuery(point, query))
      .slice(0, query ? 1200 : 2600);
  }, [activeLayerSet, points, searchQuery]);

  const center: LatLngExpression = [39.55, -8.0];

  return (
    <div className="h-[780px] overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 shadow-sm">
      <MapContainer
        center={center}
        zoom={7}
        minZoom={5}
        maxZoom={20}
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
            opacity={0.65}
            minZoom={4}
            maxNativeZoom={16}
            maxZoom={20}
            detectRetina
          />
        ) : null}

        <FlyToSelectedPoint point={selectedPoint} />

        {visiblePoints.map((point) => {
          const selected =
            selectedPoint &&
            selectedPoint.code === point.code &&
            selectedPoint.lat === point.lat &&
            selectedPoint.lon === point.lon &&
            selectedPoint.src === point.src;

          return (
            <Marker
              key={`${point.src}-${point.code}-${point.lat}-${point.lon}`}
              position={[point.lat, point.lon]}
              icon={makeIcon(point.src, Boolean(selected))}
            >
              <Popup>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-semibold">{point.code}</p>
                    <p className="text-xs text-zinc-600">{point.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {point.src} · {point.lat.toFixed(5)},{" "}
                      {point.lon.toFixed(5)}
                    </p>
                  </div>

                  {point.routes ? (
                    <p className="text-xs text-zinc-500">{point.routes}</p>
                  ) : null}

                  {point.remarks ? (
                    <p className="text-xs text-zinc-500">{point.remarks}</p>
                  ) : null}
                </div>
              </Popup>

              {searchQuery.trim() || selected ? (
                <Tooltip permanent direction="right" offset={[10, 0]}>
                  {point.code}
                </Tooltip>
              ) : null}
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
