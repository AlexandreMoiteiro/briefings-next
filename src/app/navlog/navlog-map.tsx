"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ImageOverlay,
  MapContainer,
  Marker,
  Pane,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  divIcon,
  latLngBounds,
  type DivIcon,
  type LatLngBounds,
  type LatLngBoundsExpression,
  type LatLngExpression,
} from "leaflet";
import { buildNavlogRouteMapPdf } from "@/lib/pdf/navlog-route-map-pdf";
import type {
  NavlogPoint,
  NavlogReferenceLayer,
  NavlogRouteNode,
  NavlogRouteWaypoint,
} from "@/lib/navlog";

type MapSourceMode = "standard" | "vfr-chart";

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

type VfrKmzOverlayItem = {
  href: string;
  level: number;
  north: number;
  south: number;
  east: number;
  west: number;
};

type VfrKmzManifest = {
  levels?: number[];
  overlays: VfrKmzOverlayItem[];
};

const LPFR_REQUIRED_NAVLOG_MAP_POINTS: NavlogPoint[] = [
  { code: "FR611", name: "FR611", lat: 36.992278, lon: -7.815806, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID RWY10 ILS LOC RWY10", remarks: "LPFR RNAV SID/IAP waypoint AIRAC 005-26" },
  { code: "FR621", name: "FR621", lat: 37.068969, lon: -7.697489, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID RWY10", remarks: "LPFR RNAV SID waypoint AIRAC 005-26" },
  { code: "DEDUX", name: "DEDUX", lat: 37.411358, lon: -7.957933, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID EVURA1C STAR RWY10", remarks: "LPFR RNAV SID/STAR waypoint AIRAC 005-26" },
  { code: "XAPAS", name: "XAPAS", lat: 37.597228, lon: -7.949892, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID EVURA1C STAR RWY10", remarks: "LPFR RNAV SID/STAR waypoint AIRAC 005-26" },
  { code: "ODPAK", name: "ODPAK", lat: 38.128422, lon: -7.926689, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID EVURA1C STAR RWY10", remarks: "LPFR RNAV SID/STAR waypoint AIRAC 005-26" },
  { code: "DOGUT", name: "DOGUT", lat: 38.295256, lon: -7.924153, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID EVURA1C STAR RWY10", remarks: "LPFR RNAV SID/STAR waypoint AIRAC 005-26" },
  { code: "EVURA", name: "EVURA", lat: 38.664972, lon: -7.918492, alt: 0, src: "IFR", routes: "LPFR EVURA1F SID EVURA1C STAR RWY10", remarks: "LPFR RNAV SID/STAR waypoint AIRAC 005-26" },
  { code: "FR631", name: "FR631", lat: 37.339767, lon: -8.087881, alt: 0, src: "IFR", routes: "LPFR EVURA1C STAR RWY10", remarks: "LPFR RNAV STAR waypoint AIRAC 005-26" },
  { code: "USALU", name: "USALU", lat: 37.222111, lon: -8.300347, alt: 0, src: "IFR", routes: "LPFR EVURA1C STAR RWY10", remarks: "LPFR RNAV STAR waypoint AIRAC 005-26" },
  { code: "KOPAV", name: "KOPAV", lat: 37.057094, lon: -8.269211, alt: 0, src: "IFR", routes: "LPFR EVURA1C STAR ILS LOC RWY10", remarks: "LPFR STAR/IAP clearance limit AIRAC 005-26" },
  { code: "FR910", name: "FR910", lat: 37.043778, lon: -8.174000, alt: 0, src: "IFR", routes: "LPFR ILS LOC RWY10", remarks: "LPFR ILS/LOC RWY10 FAP waypoint AIRAC 005-26" },
  { code: "THR10", name: "THR RWY 10", lat: 37.017222, lon: -7.985611, alt: 0, src: "IFR", routes: "LPFR ILS LOC RWY10", remarks: "LPFR RWY10 threshold / MAPt AIRAC 005-26" },
  { code: "FR728", name: "FR728", lat: 36.997, lon: -7.842167, alt: 0, src: "IFR", routes: "LPFR ILS LOC RWY10 MISSED APPROACH", remarks: "LPFR missed approach waypoint AIRAC 005-26" },
  { code: "GIMAL", name: "GIMAL", lat: 36.764444, lon: -8.005861, alt: 0, src: "IFR", routes: "LPFR ILS LOC RWY10 MISSED APPROACH", remarks: "LPFR missed approach holding waypoint AIRAC 005-26" },
  { code: "FR609", name: "FR609", lat: 36.930906, lon: -8.346689, alt: 0, src: "IFR", routes: "LPFR GIMAL9C STAR ILS LOC RWY10", remarks: "LPFR RNAV STAR/IAP chart waypoint AIRAC 005-26" },
];

const openAipApiKey = process.env.NEXT_PUBLIC_OPENAIP_API_KEY ?? "";
const openAipTilesUrl = openAipApiKey
  ? `https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${openAipApiKey}`
  : "";

const vfrChartTilesUrl = "/vfr-chart/{z}/{x}/{y}.png";
const vfrChartManifestUrl = (
  process.env.NEXT_PUBLIC_VFR_CHART_MANIFEST_URL ?? ""
).trim();
const vfrChartAttribution =
  process.env.NEXT_PUBLIC_VFR_CHART_ATTRIBUTION ??
  "ANC Portugal 1:500 000 / NAV Portugal";
const hasVfrChartOverlay = Boolean(vfrChartTilesUrl || vfrChartManifestUrl);

function parseMapNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalMapNumber(value: string | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

const vfrChartMinZoom = parseMapNumber(
  process.env.NEXT_PUBLIC_VFR_CHART_MIN_ZOOM,
  6
);
const vfrChartMaxNativeZoom = parseMapNumber(
  process.env.NEXT_PUBLIC_VFR_CHART_MAX_NATIVE_ZOOM,
  14
);
const vfrChartOpacity = parseMapNumber(
  process.env.NEXT_PUBLIC_VFR_CHART_OPACITY,
  0.78
);
const forcedVfrChartManifestLevel = parseOptionalMapNumber(
  process.env.NEXT_PUBLIC_VFR_CHART_MANIFEST_LEVEL
);
const vfrChartBounds: LatLngBoundsExpression = [
  [35.124950538548724, -10.25],
  [42.3125, -6.00004279020789],
];

function navlogMapPointKey(point: NavlogPoint) {
  return `${point.src}:${point.code.trim().toUpperCase()}:${point.lat.toFixed(6)}:${point.lon.toFixed(6)}`;
}

function downloadBinaryFile(bytes: Uint8Array, filename: string, mime: string) {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFilenameToken(value: string) {
  return (
    value.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") ||
    "ROUTE"
  );
}

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

function FitToRoute({ routePositions }: { routePositions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (routePositions.length > 1) {
      map.fitBounds(latLngBounds(routePositions), { padding: [32, 32] });
      return;
    }

    if (routePositions.length === 1) {
      map.setView(routePositions[0], 9);
    }
  }, [map, routePositions]);

  return null;
}

function FitToSearchedReferencePoints({
  searchQuery,
  visiblePoints,
}: {
  searchQuery: string;
  visiblePoints: NavlogPoint[];
}) {
  const map = useMap();

  useEffect(() => {
    const query = searchQuery.trim();

    if (!query || visiblePoints.length === 0) return;

    const positions = visiblePoints
      .slice(0, 20)
      .map((point) => [point.lat, point.lon] as [number, number]);

    if (positions.length === 1) {
      map.setView(positions[0], 11);
      return;
    }

    map.fitBounds(latLngBounds(positions), {
      padding: [40, 40],
      maxZoom: 11,
    });
  }, [map, searchQuery, visiblePoints]);

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

function getKmzTargetLevelForZoom(zoom: number) {
  if (zoom <= 6) return 3;
  if (zoom === 7) return 4;
  if (zoom === 8) return 5;
  if (zoom === 9) return 6;

  return 7;
}

function getBestAvailableKmzLevel(zoom: number, availableLevels?: number[]) {
  const sortedLevels = [...(availableLevels ?? [])].sort((a, b) => a - b);

  if (forcedVfrChartManifestLevel !== null) {
    return sortedLevels.includes(forcedVfrChartManifestLevel)
      ? forcedVfrChartManifestLevel
      : sortedLevels.at(-1) ?? forcedVfrChartManifestLevel;
  }

  const targetLevel = getKmzTargetLevelForZoom(zoom);

  if (!sortedLevels.length) return targetLevel;

  const lowerOrEqualLevels = sortedLevels.filter((level) => level <= targetLevel);

  return lowerOrEqualLevels.at(-1) ?? sortedLevels[0] ?? targetLevel;
}

function overlayIntersectsBounds(
  overlay: VfrKmzOverlayItem,
  bounds: LatLngBounds
) {
  return (
    overlay.south <= bounds.getNorth() &&
    overlay.north >= bounds.getSouth() &&
    overlay.west <= bounds.getEast() &&
    overlay.east >= bounds.getWest()
  );
}

function getOverlayKey(overlay: VfrKmzOverlayItem, index: number) {
  return [
    overlay.href,
    overlay.level,
    overlay.south,
    overlay.west,
    overlay.north,
    overlay.east,
    index,
  ].join(":");
}

function resolveManifestAssetUrl(manifestUrl: string, assetHref: string) {
  if (typeof window === "undefined") return assetHref;

  const absoluteManifestUrl = new URL(manifestUrl, window.location.href);

  return new URL(assetHref, absoluteManifestUrl).toString();
}

function VfrKmzImageOverlay({
  manifestUrl,
  opacity,
}: {
  manifestUrl: string;
  opacity: number;
}) {
  const map = useMap();
  const [manifest, setManifest] = useState<VfrKmzManifest | null>(null);
  const [view, setView] = useState(() => ({
    bounds: map.getBounds(),
    zoom: map.getZoom(),
  }));

  useEffect(() => {
    let cancelled = false;

    async function loadManifest() {
      const response = await fetch(manifestUrl);

      if (!response.ok) {
        throw new Error(`Could not load VFR chart manifest: ${response.status}`);
      }

      const loaded = (await response.json()) as VfrKmzManifest;

      if (!cancelled) {
        setManifest(loaded);
      }
    }

    loadManifest().catch((error) => console.error(error));

    return () => {
      cancelled = true;
    };
  }, [manifestUrl]);

  useMapEvents({
    moveend() {
      setView({ bounds: map.getBounds(), zoom: map.getZoom() });
    },
    zoomend() {
      setView({ bounds: map.getBounds(), zoom: map.getZoom() });
    },
  });

  const visibleOverlays = useMemo(() => {
    if (!manifest) return [];

    const level = getBestAvailableKmzLevel(view.zoom, manifest.levels);

    return manifest.overlays
      .filter((overlay) => overlay.level === level)
      .filter((overlay) => overlayIntersectsBounds(overlay, view.bounds))
      .slice(0, 260);
  }, [manifest, view.bounds, view.zoom]);

  return (
    <>
      {visibleOverlays.map((overlay, index) => (
        <ImageOverlay
          key={getOverlayKey(overlay, index)}
          attribution={vfrChartAttribution}
          bounds={[
            [overlay.south, overlay.west],
            [overlay.north, overlay.east],
          ]}
          opacity={opacity}
          url={resolveManifestAssetUrl(manifestUrl, overlay.href)}
          zIndex={220}
        />
      ))}
    </>
  );
}

function pointMatchesQuery(point: NavlogPoint, query: string) {
  const normalized = query.trim().toUpperCase();

  if (!normalized) return false;

  return (
    point.code.toUpperCase().includes(normalized) ||
    point.name.toUpperCase().includes(normalized) ||
    point.src.toUpperCase().includes(normalized) ||
    point.routes.toUpperCase().includes(normalized) ||
    point.remarks.toUpperCase().includes(normalized)
  );
}

function getIconSpec(src: string) {
  switch (src) {
    case "AD":
      return { label: "AD", bg: "#ef4444", border: "#991b1b", shape: "circle", size: 16 };
    case "VOR":
      return { label: "VOR", bg: "#a855f7", border: "#6d28d9", shape: "diamond", size: 15 };
    case "IFR":
      return { label: "IFR", bg: "#60a5fa", border: "#1d4ed8", shape: "diamond-small", size: 12 };
    case "VFR":
      return { label: "VFR", bg: "#22c55e", border: "#166534", shape: "circle-small", size: 12 };
    case "CALC":
      return { label: "CALC", bg: "#ffffff", border: "#111827", shape: "square", size: 14 };
    default:
      return { label: src, bg: "#a1a1aa", border: "#52525b", shape: "circle-small", size: 12 };
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

  return divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;"><div style="${shapeStyle}"></div></div>`,
    className: "navlog-map-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function NavlogMap({
  points,
  routeWaypoints,
  calculatedNodes,
  searchQuery,
  showReferencePoints,
  referenceLayers,
  manualMapClickEnabled,
  onAddPoint,
  onAddMapPoint,
}: NavlogMapProps) {
  const [mapSourceMode, setMapSourceMode] = useState<MapSourceMode>("standard");
  const selectedLayerSet = useMemo(
    () => new Set(referenceLayers),
    [referenceLayers]
  );
  const showStandardMap = mapSourceMode === "standard";
  const showVfrChart = mapSourceMode === "vfr-chart";

  const routePositions = useMemo(
    () => calculatedNodes.map((node) => [node.lat, node.lon] as [number, number]),
    [calculatedNodes]
  );

  const center: LatLngExpression =
    routePositions.length > 0
      ? routePositions[0]
      : ([39.55, -8.0] as LatLngExpression);

  const visiblePoints = useMemo(() => {
    const query = searchQuery.trim();

    if (!showReferencePoints && !query) return [];

    const filtered = points
      .filter((point) => point.code.trim().toUpperCase() !== "RUWIB")
      .filter((point) => selectedLayerSet.has(point.src as NavlogReferenceLayer))
      .filter((point) => {
        if (!query) return true;
        return pointMatchesQuery(point, query);
      });
    const requiredLpfrPoints = LPFR_REQUIRED_NAVLOG_MAP_POINTS.filter(
      (point) =>
        selectedLayerSet.has(point.src as NavlogReferenceLayer) &&
        (!query || pointMatchesQuery(point, query))
    );
    const limited = filtered.slice(0, query ? 1000 : 1500);
    const merged = new Map<string, NavlogPoint>();

    for (const point of requiredLpfrPoints) {
      merged.set(navlogMapPointKey(point), point);
    }
    for (const point of limited) {
      merged.set(navlogMapPointKey(point), point);
    }

    return Array.from(merged.values());
  }, [points, searchQuery, selectedLayerSet, showReferencePoints]);

  const shouldLabelReferencePoints = searchQuery.trim().length > 0;

  async function exportRouteMapPdf() {
    if (calculatedNodes.length < 2) return;

    const bytes = await buildNavlogRouteMapPdf({
      routeWaypoints,
      mapSourceMode,
      vfrChartTilesUrl: showVfrChart ? vfrChartTilesUrl : "",
      vfrChartMaxNativeZoom,
      vfrChartManifestUrl: showVfrChart ? vfrChartManifestUrl : "",
      vfrChartManifestLevel: forcedVfrChartManifestLevel,
    });
    const firstPoint = routeWaypoints[0]?.point.code || routeWaypoints[0]?.point.name || "ROUTE";
    const lastPoint = routeWaypoints.at(-1)?.point.code || routeWaypoints.at(-1)?.point.name || "MAP";
    const filename = `ROUTE_MAP_${safeFilenameToken(firstPoint)}_${safeFilenameToken(lastPoint)}_${new Date().toISOString().slice(0, 10)}.pdf`;

    downloadBinaryFile(bytes, filename, "application/pdf");
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Route map
          </p>
          <p className="text-sm text-zinc-500">
            Plot the calculated route and export a clean PDF using the selected map source.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <input
              type="radio"
              name="navlog-map-source"
              checked={mapSourceMode === "standard"}
              onChange={() => setMapSourceMode("standard")}
            />
            OpenTopoMap + OpenAIP
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <input
              type="radio"
              name="navlog-map-source"
              disabled={!hasVfrChartOverlay}
              checked={mapSourceMode === "vfr-chart"}
              onChange={() => setMapSourceMode("vfr-chart")}
            />
            VFR map
          </label>

          <button
            type="button"
            onClick={exportRouteMapPdf}
            disabled={calculatedNodes.length < 2}
            className="rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            Download plotted PDF
          </button>
        </div>
      </div>

      <div className="h-[720px] bg-zinc-100">
        <MapContainer
          center={center}
          zoom={7}
          maxZoom={20}
          scrollWheelZoom
          className="h-full w-full"
        >
          <InvalidateMapSize />
          <FitToRoute routePositions={routePositions} />
          <FitToSearchedReferencePoints
            searchQuery={searchQuery}
            visiblePoints={visiblePoints}
          />

          {showStandardMap ? (
            <TileLayer
              attribution='Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              maxZoom={17}
            />
          ) : null}

          {showVfrChart && vfrChartTilesUrl ? (
            <TileLayer
              attribution={vfrChartAttribution}
              bounds={vfrChartBounds}
              detectRetina
              maxNativeZoom={vfrChartMaxNativeZoom}
              maxZoom={20}
              minZoom={vfrChartMinZoom}
              opacity={vfrChartOpacity}
              url={vfrChartTilesUrl}
              zIndex={220}
            />
          ) : null}

          {showVfrChart && !vfrChartTilesUrl && vfrChartManifestUrl ? (
            <VfrKmzImageOverlay
              manifestUrl={vfrChartManifestUrl}
              opacity={vfrChartOpacity}
            />
          ) : null}

          {showStandardMap && openAipTilesUrl ? (
            <TileLayer
              attribution="openAIP"
              url={openAipTilesUrl}
              opacity={0.65}
              minZoom={4}
              maxNativeZoom={16}
              maxZoom={20}
              detectRetina
              zIndex={260}
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
                      {point.src} · {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
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

          <Pane name="navlog-route-line" style={{ zIndex: 550 }}>
            {routePositions.length > 1 ? (
              <Polyline
                positions={routePositions}
                pathOptions={{ color: "#ef4444", weight: 4, opacity: 0.95 }}
              />
            ) : null}
          </Pane>

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
