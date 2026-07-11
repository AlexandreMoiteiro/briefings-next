"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ImageOverlay,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  divIcon,
  type DivIcon,
  type LatLngBounds,
  type LatLngBoundsExpression,
  type LatLngExpression,
} from "leaflet";
import type { NavlogPoint } from "@/lib/navlog";

type AviationLayer = "AD" | "VFR" | "IFR" | "VOR";
type MapSourceMode = "standard" | "vfr-chart";

type AviationMapLeafletProps = {
  points: NavlogPoint[];
  activeLayers: AviationLayer[];
  searchQuery: string;
  selectedPoint: NavlogPoint | null;
  mapSourceMode: MapSourceMode;
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

function InvalidateMapSize({ expanded }: { expanded: boolean }) {
  const map = useMap();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [expanded, map]);

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

export function AviationMapLeaflet({
  points,
  activeLayers,
  searchQuery,
  selectedPoint,
  mapSourceMode,
}: AviationMapLeafletProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const activeLayerSet = useMemo(() => new Set(activeLayers), [activeLayers]);
  const showStandardMap = mapSourceMode === "standard";
  const showVfrChart = mapSourceMode === "vfr-chart";

  const visiblePoints = useMemo(() => {
    const query = searchQuery.trim();

    return points
      .filter((point) => activeLayerSet.has(point.src as AviationLayer))
      .filter((point) => pointMatchesQuery(point, query))
      .slice(0, query ? 1200 : 2600);
  }, [activeLayerSet, points, searchQuery]);

  const center: LatLngExpression = [39.55, -8.0];

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
          : "relative overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 shadow-sm"
      }
    >
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute right-3 top-3 z-[10000] rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold text-zinc-950 shadow-sm ring-1 ring-zinc-200 transition hover:bg-white"
      >
        {expanded ? "Fechar" : "Fullscreen"}
      </button>

      <div className={expanded ? "h-screen w-screen" : "h-[780px] w-full"}>
        <MapContainer
          center={center}
          zoom={7}
          minZoom={5}
          maxZoom={20}
          scrollWheelZoom
          className="h-full w-full"
        >
          <InvalidateMapSize expanded={expanded} />

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
                        {point.src} · {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
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
    </section>
  );
}
