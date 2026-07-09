"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L, { type LatLngBounds, type LatLngBoundsExpression } from "leaflet";
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { CoordinateMapArea, ParsedCoordinatePoint } from "./area-map-client";

type MapSourceMode = "standard" | "vfr-chart";

type CoordinateLeafletMapProps = {
  areas: CoordinateMapArea[];
  selectedAreaId?: string;
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

const defaultCenter: [number, number] = [38.7223, -9.1393];

const openAipApiKey = process.env.NEXT_PUBLIC_OPENAIP_API_KEY ?? "";
const openAipTilesUrl = openAipApiKey
  ? `https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${openAipApiKey}`
  : "";

const vfrChartTilesUrl = (
  process.env.NEXT_PUBLIC_VFR_CHART_TILES_URL ?? ""
).trim();
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
  13
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

export function CoordinateLeafletMap({
  areas,
  selectedAreaId,
}: CoordinateLeafletMapProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapSourceMode, setMapSourceMode] = useState<MapSourceMode>("standard");
  const showStandardMap = mapSourceMode === "standard";
  const showVfrChart = mapSourceMode === "vfr-chart";

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
      <div className="absolute left-3 top-3 z-[10000] flex flex-wrap gap-2 rounded-2xl bg-white/95 p-2 text-xs font-semibold text-zinc-700 shadow-sm ring-1 ring-zinc-200">
        <label className="flex items-center gap-1.5 rounded-xl px-2 py-1">
          <input
            type="radio"
            name="area-map-source"
            checked={mapSourceMode === "standard"}
            onChange={() => setMapSourceMode("standard")}
          />
          OpenTopo + OpenAIP
        </label>
        <label className="flex items-center gap-1.5 rounded-xl px-2 py-1">
          <input
            type="radio"
            name="area-map-source"
            disabled={!hasVfrChartOverlay}
            checked={mapSourceMode === "vfr-chart"}
            onChange={() => setMapSourceMode("vfr-chart")}
          />
          VFR map
        </label>
      </div>

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
          maxZoom={20}
          scrollWheelZoom
          className="h-full w-full"
        >
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

          <FitToAreas areas={drawableAreas} expanded={expanded} />

          {drawableAreas.map((area) => {
            const selected = Boolean(
              area.id === selectedAreaId || area.isSelected || area.isDraft
            );
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
