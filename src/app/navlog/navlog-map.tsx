"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { divIcon, latLngBounds, type DivIcon } from "leaflet";
import type { LatLngExpression } from "leaflet";
import type {
  NavlogPoint,
  NavlogReferenceLayer,
  NavlogRouteNode,
  NavlogRouteWaypoint,
} from "@/lib/navlog";

type NavlogMapProps = {
  points: NavlogPoint[];
  routeWaypoints: NavlogRouteWaypoint[];
  calculatedNodes: NavlogRouteNode[];
  searchQuery: string;
  showReferencePoints: boolean;
  referenceLayers: NavlogReferenceLayer[];
  manualMapClickEnabled: boolean;
  onAddPoint: (point: NavlogPoint) => void;
  onAddMapPoint: (lat: number, lon: number) => void;
};

const openAipApiKey = process.env.NEXT_PUBLIC_OPENAIP_API_KEY ?? "";

const openAipTilesUrl = openAipApiKey
  ? `https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${openAipApiKey}`
  : "";

function InvalidateMapSize() {
  const map = useMap();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [map]);

  return null;
}

function FitToRoute({
  routePositions,
}: {
  routePositions: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    if (routePositions.length > 1) {
      map.fitBounds(latLngBounds(routePositions), {
        padding: [32, 32],
      });
      return;
    }

    if (routePositions.length === 1) {
      map.setView(routePositions[0], 9);
    }
  }, [map, routePositions]);

  return null;
}

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

function getIconSpec(src: string) {
  switch (src) {
    case "AD":
      return {
        label: "AD",
        bg: "#ef4444",
        border: "#991b1b",
        shape: "circle",
        size: 16,
      };

    case "VOR":
      return {
        label: "VOR",
        bg: "#a855f7",
        border: "#6d28d9",
        shape: "diamond",
        size: 15,
      };

    case "IFR":
      return {
        label: "IFR",
        bg: "#60a5fa",
        border: "#1d4ed8",
        shape: "diamond-small",
        size: 12,
      };

    case "VFR":
      return {
        label: "VFR",
        bg: "#22c55e",
        border: "#166534",
        shape: "circle-small",
        size: 12,
      };

    case "CALC":
      return {
        label: "CALC",
        bg: "#ffffff",
        border: "#111827",
        shape: "square",
        size: 14,
      };

    default:
      return {
        label: src,
        bg: "#a1a1aa",
        border: "#52525b",
        shape: "circle-small",
        size: 12,
      };
  }
}

function makeIcon(src: string, emphasized = false): DivIcon {
  const spec = getIconSpec(src);
  const size = emphasized ? spec.size + 4 : spec.size;
  const borderWidth = emphasized ? 2.5 : 2;

  let shapeStyle = "";

  if (spec.shape === "diamond" || spec.shape === "diamond-small") {
    shapeStyle = `
      width:${size}px;
      height:${size}px;
      background:${spec.bg};
      border:${borderWidth}px solid ${spec.border};
      transform: rotate(45deg);
      border-radius: ${spec.shape === "diamond" ? "2px" : "1px"};
      box-sizing:border-box;
    `;
  } else if (spec.shape === "square") {
    shapeStyle = `
      width:${size}px;
      height:${size}px;
      background:${spec.bg};
      border:${borderWidth}px solid ${spec.border};
      border-radius:4px;
      box-sizing:border-box;
    `;
  } else {
    shapeStyle = `
      width:${size}px;
      height:${size}px;
      background:${spec.bg};
      border:${borderWidth}px solid ${spec.border};
      border-radius:9999px;
      box-sizing:border-box;
    `;
  }

  const html = `
    <div style="display:flex;align-items:center;justify-content:center;">
      <div style="${shapeStyle}"></div>
    </div>
  `;

  return divIcon({
    html,
    className: "navlog-map-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function NavlogMap({
  points,
  calculatedNodes,
  searchQuery,
  showReferencePoints,
  referenceLayers,
  manualMapClickEnabled,
  onAddPoint,
  onAddMapPoint,
}: NavlogMapProps) {
  const selectedLayerSet = useMemo(
    () => new Set(referenceLayers),
    [referenceLayers]
  );

  const routePositions = useMemo(
    () =>
      calculatedNodes.map((node) => [node.lat, node.lon] as [number, number]),
    [calculatedNodes]
  );

  const center: LatLngExpression =
    routePositions.length > 0
      ? routePositions[0]
      : ([39.55, -8.0] as LatLngExpression);

  const visiblePoints = useMemo(() => {
    if (!showReferencePoints) return [];

    const query = searchQuery.trim();

    return points
      .filter((point) =>
        selectedLayerSet.has(point.src as NavlogReferenceLayer)
      )
      .filter((point) => {
        if (!query) return true;
        return pointMatchesQuery(point, query);
      })
      .slice(0, query ? 1000 : 1500);
  }, [points, searchQuery, selectedLayerSet, showReferencePoints]);

  const shouldLabelReferencePoints = searchQuery.trim().length > 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div className="h-[720px] bg-zinc-100">
        <MapContainer
          center={center}
          zoom={7}
          maxZoom={17}
          scrollWheelZoom
          className="h-full w-full"
        >
          <InvalidateMapSize />
          <FitToRoute routePositions={routePositions} />

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

          <MapClickHandler
            enabled={manualMapClickEnabled}
            onAddMapPoint={onAddMapPoint}
          />

          {visiblePoints.map((point) => (
            <Marker
              key={`${point.src}-${point.code}-${point.lat}-${point.lon}`}
              position={[point.lat, point.lon]}
              icon={makeIcon(point.src)}
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
                    {point.routes ? (
                      <div className="mt-1 text-xs text-zinc-500">
                        {point.routes}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => onAddPoint(point)}
                    className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Add to route
                  </button>
                </div>
              </Popup>

              {shouldLabelReferencePoints ? (
                <Tooltip permanent direction="right" offset={[10, 0]} opacity={0.9}>
                  {point.code}
                </Tooltip>
              ) : null}
            </Marker>
          ))}

          {routePositions.length > 1 ? (
            <Polyline
              positions={routePositions}
              pathOptions={{ color: "#111827", weight: 4, opacity: 0.9 }}
            />
          ) : null}

          {calculatedNodes.map((node, index) => (
            <Marker
              key={`${node.id}-${index}`}
              position={[node.lat, node.lon]}
              icon={makeIcon(node.src, true)}
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

              <Tooltip permanent direction="right" offset={[10, 0]} opacity={0.95}>
                {node.code}
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
