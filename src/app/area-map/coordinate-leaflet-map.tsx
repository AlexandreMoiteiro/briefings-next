"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L, { type LatLngBounds, type LatLngBoundsExpression } from "leaflet";
import {
  Circle,
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { PlotNotam } from "@/lib/notams";
import { parseCoordinateAreaInput } from "@/lib/coordinate-area-parser";
import type { CoordinateMapArea, ParsedCoordinatePoint } from "./area-map-client";

type MapSourceMode = "standard" | "vfr-chart";

type CoordinateLeafletMapProps = {
  areas: CoordinateMapArea[];
  selectedAreaId?: string;
  notams?: PlotNotam[];
  showNotams?: boolean;
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
  process.env.NEXT_PUBLIC_VFR_CHART_TILES_URL ?? "/vfr-chart/{z}/{x}/{y}.png"
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
  12
);
const vfrChartOpacity = parseMapNumber(
  process.env.NEXT_PUBLIC_VFR_CHART_OPACITY,
  0.78
);
const forcedVfrChartManifestLevel = parseOptionalMapNumber(
  process.env.NEXT_PUBLIC_VFR_CHART_MANIFEST_LEVEL
);
const vfrChartLatLonBounds = {
  south: 35.124950538548724,
  west: -10.25,
  north: 42.3125,
  east: -6.00004279020789,
};

const vfrChartBounds: LatLngBoundsExpression = [
  [vfrChartLatLonBounds.south, vfrChartLatLonBounds.west],
  [vfrChartLatLonBounds.north, vfrChartLatLonBounds.east],
];

function isInsideVfrChartBounds(lat: number, lon: number) {
  return (
    lat >= vfrChartLatLonBounds.south &&
    lat <= vfrChartLatLonBounds.north &&
    lon >= vfrChartLatLonBounds.west &&
    lon <= vfrChartLatLonBounds.east
  );
}

function pointInsideVfrChart(point: { lat: number; lon: number }) {
  return isInsideVfrChartBounds(point.lat, point.lon);
}

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

function formatNotamTime(value: string | null) {
  if (!value) return "Permanent / not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

function notamVerticalRange(notam: PlotNotam) {
  const lower =
    notam.lowerLimit ||
    (notam.minimumFl ? `FL${notam.minimumFl}` : "");
  const upper =
    notam.upperLimit ||
    (notam.maximumFl ? `FL${notam.maximumFl}` : "");

  if (lower && upper) return `${lower} – ${upper}`;
  return lower || upper || "Not specified";
}

const NOTAM_AREA_MIN_RADIUS_NM = 5;
const NOTAM_AREA_MAX_RADIUS_NM = 25;

const NOTAM_THEME_LEGEND = [
  { key: "restriction", label: "TFR / drone", color: "#dc2626", fill: "#ef4444" },
  { key: "airspace", label: "Airspace", color: "#ea580c", fill: "#fb923c" },
  { key: "runway", label: "Runway", color: "#be123c", fill: "#fb7185" },
  { key: "ground", label: "Taxiway / apron", color: "#b45309", fill: "#f59e0b" },
  { key: "lighting", label: "Lighting", color: "#a16207", fill: "#eab308" },
  { key: "navaid", label: "NAVAID / GPS", color: "#1d4ed8", fill: "#3b82f6" },
  { key: "obstacle", label: "Obstacle", color: "#7e22ce", fill: "#a855f7" },
  { key: "ops", label: "Procedure / ATC", color: "#0e7490", fill: "#06b6d4" },
  { key: "service", label: "Fuel / service", color: "#15803d", fill: "#22c55e" },
  { key: "other", label: "Other", color: "#52525b", fill: "#71717a" },
] as const;

type NotamTheme = (typeof NOTAM_THEME_LEGEND)[number];
type NotamThemeKey = NotamTheme["key"];

function themeByKey(key: NotamThemeKey): NotamTheme {
  return (
    NOTAM_THEME_LEGEND.find((theme) => theme.key === key) ??
    NOTAM_THEME_LEGEND[NOTAM_THEME_LEGEND.length - 1]
  );
}

function notamTheme(notam: PlotNotam): NotamTheme {
  const category = notam.category.toUpperCase();
  const qCode = notam.qCode.toUpperCase();

  if (
    category.includes("TFR") ||
    category.includes("UAS") ||
    category.includes("DRONE") ||
    qCode.startsWith("QRT") ||
    qCode.startsWith("QRD") ||
    qCode.startsWith("QWU")
  ) {
    return themeByKey("restriction");
  }

  if (category.includes("AIRSPACE") || qCode.startsWith("QR")) {
    return themeByKey("airspace");
  }

  if (
    category.includes("RUNWAY") ||
    category.includes("RWY") ||
    qCode.startsWith("QMR")
  ) {
    return themeByKey("runway");
  }

  if (category.includes("TAXI") || category.includes("APRON")) {
    return themeByKey("ground");
  }

  if (category.includes("LIGHTING")) {
    return themeByKey("lighting");
  }

  if (
    category.includes("NAVAID") ||
    category.includes("GPS") ||
    qCode.startsWith("QNV") ||
    qCode.startsWith("QNM") ||
    qCode.startsWith("QND")
  ) {
    return themeByKey("navaid");
  }

  if (category.includes("OBSTACLE")) {
    return themeByKey("obstacle");
  }

  if (
    category.includes("PROCEDURE") ||
    category.includes("ATC") ||
    category.includes("COMMS")
  ) {
    return themeByKey("ops");
  }

  if (category.includes("FUEL") || category.includes("SERVICE")) {
    return themeByKey("service");
  }

  return themeByKey("other");
}

type NotamMarkerGroup = {
  key: string;
  latitude: number;
  longitude: number;
  notices: PlotNotam[];
  broadAreaCount: number;
};

function shouldDrawNotamArea(notam: PlotNotam) {
  return (
    notam.radiusNm > NOTAM_AREA_MIN_RADIUS_NM &&
    notam.radiusNm <= NOTAM_AREA_MAX_RADIUS_NM
  );
}

function getNotamPolygonPoints(notam: PlotNotam) {
  const category = notam.category.toUpperCase();
  const qCode = notam.qCode.toUpperCase();
  const isAreaNotice =
    qCode.startsWith("QR") ||
    qCode.startsWith("QWU") ||
    ["AIRSPACE", "TFR", "DRONE", "UAS"].some((value) =>
      category.includes(value)
    );

  if (!isAreaNotice || !notam.text) return [];

  const parsed = parseCoordinateAreaInput(notam.text);
  if (parsed.errors.length || parsed.points.length < 3) return [];

  return parsed.points;
}

function groupNotamMarkers(notams: PlotNotam[]) {
  const groups = new Map<string, NotamMarkerGroup>();

  for (const notam of notams) {

    const latKey = notam.latitude.toFixed(2);
    const lonKey = notam.longitude.toFixed(2);
    const key = `${latKey}:${lonKey}`;
    const existing = groups.get(key);

    if (existing) {
      existing.notices.push(notam);
      if (notam.radiusNm > NOTAM_AREA_MAX_RADIUS_NM) {
        existing.broadAreaCount += 1;
      }
      continue;
    }

    groups.set(key, {
      key,
      latitude: notam.latitude,
      longitude: notam.longitude,
      notices: [notam],
      broadAreaCount:
        notam.radiusNm > NOTAM_AREA_MAX_RADIUS_NM ? 1 : 0,
    });
  }

  return Array.from(groups.values());
}

function notamMarkerIcon(group: NotamMarkerGroup) {
  const count = group.notices.length;
  const broad = group.broadAreaCount > 0;
  const label = count > 1 ? String(count) : broad ? "A" : "N";
  const colors = Array.from(
    new Set(group.notices.map((notam) => notamTheme(notam).color))
  );
  const background =
    colors.length <= 1
      ? colors[0] || NOTAM_THEME_LEGEND[7].color
      : `conic-gradient(${colors
          .map(
            (color, index) =>
              `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`
          )
          .join(", ")})`;

  return L.divIcon({
    className: "",
    html: `<div class="area-map-notam-marker ${broad ? "area-map-notam-marker-broad" : ""}" style="background:${background}">
      <span>${label}</span>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function NotamDetails({ notam }: { notam: PlotNotam }) {
  const theme = notamTheme(notam);

  return (
    <div className="space-y-1.5 border-b border-zinc-100 pb-2 last:border-0 last:pb-0">
      <div>
        <div className="text-sm font-semibold text-zinc-950">{notam.number}</div>
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.color }}>
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: theme.color }}
          />
          <span>
            {notam.category}
            {notam.locationCode ? ` · ${notam.locationCode}` : ""}
          </span>
        </div>
      </div>
      {notam.shortReading ? (
        <p className="text-xs leading-5 text-zinc-800">{notam.shortReading}</p>
      ) : null}
      <div className="grid gap-0.5 text-[11px] text-zinc-500">
        <span>
          <strong className="text-zinc-700">Valid:</strong>{" "}
          {formatNotamTime(notam.effectiveStart)} → {formatNotamTime(notam.effectiveEnd)}
        </span>
        <span>
          <strong className="text-zinc-700">Vertical:</strong>{" "}
          {notamVerticalRange(notam)}
        </span>
        {notam.radiusNm > 0 ? (
          <span>
            <strong className="text-zinc-700">Q-line radius:</strong>{" "}
            {notam.radiusNm} NM
            {notam.radiusNm > NOTAM_AREA_MAX_RADIUS_NM
              ? " · broad-area reference"
              : ""}
          </span>
        ) : null}
        {notam.qCode ? (
          <span>
            <strong className="text-zinc-700">Q-code:</strong> {notam.qCode}
          </span>
        ) : null}
      </div>
      {notam.text ? (
        <details>
          <summary className="cursor-pointer text-[11px] font-semibold text-zinc-600">
            Raw NOTAM
          </summary>
          <p className="mt-1 max-h-28 overflow-auto whitespace-pre-line rounded-lg bg-zinc-50 p-2 font-mono text-[10px] leading-4 text-zinc-600">
            {notam.text}
          </p>
        </details>
      ) : null}
    </div>
  );
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
  notams = [],
  showNotams = true,
}: CoordinateLeafletMapProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapSourceMode, setMapSourceMode] = useState<MapSourceMode>(
    hasVfrChartOverlay ? "vfr-chart" : "standard"
  );
  const showStandardMap = mapSourceMode === "standard";
  const showVfrChart = mapSourceMode === "vfr-chart";

  const notamSpatial = useMemo(
    () =>
      notams.map((notam) => ({
        notam,
        polygonPoints: getNotamPolygonPoints(notam),
      })),
    [notams]
  );
  const notamPolygonShapes = useMemo(
    () => notamSpatial.filter((item) => item.polygonPoints.length >= 3),
    [notamSpatial]
  );
  const notamAreaShapes = useMemo(
    () =>
      notamSpatial
        .filter((item) => item.polygonPoints.length < 3)
        .map((item) => item.notam)
        .filter(shouldDrawNotamArea),
    [notamSpatial]
  );
  const notamMarkerGroups = useMemo(
    () =>
      groupNotamMarkers(
        notamSpatial
          .filter(
            (item) =>
              item.polygonPoints.length < 3 &&
              !shouldDrawNotamArea(item.notam)
          )
          .map((item) => item.notam)
      ),
    [notamSpatial]
  );

  const drawableAreas = useMemo(() => {
    const nonEmptyAreas = areas.filter((area) => area.points.length > 0);

    if (!showVfrChart) return nonEmptyAreas;

    return nonEmptyAreas
      .map((area) => ({
        ...area,
        points: area.points.filter((point) => pointInsideVfrChart(point)),
      }))
      .filter((area) => area.points.length > 0);
  }, [areas, showVfrChart]);

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

      {showNotams && notams.length ? (
        <details className="absolute bottom-3 left-3 z-[10000] max-w-[calc(100%-1.5rem)] rounded-xl bg-white/95 px-3 py-2 text-[11px] text-zinc-700 shadow-sm ring-1 ring-zinc-200">
          <summary className="cursor-pointer font-semibold">NOTAM colours</summary>
          <div className="mt-2 flex max-w-[520px] flex-wrap gap-x-3 gap-y-1.5">
            {NOTAM_THEME_LEGEND.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        </details>
      ) : null}

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

          {showNotams ? (
            <>
              {notamPolygonShapes.map(({ notam, polygonPoints }) => (
                <Polygon
                  key={`notam-polygon-${notam.id}`}
                  positions={closePolygon(polygonPoints).map((point) => [
                    point.lat,
                    point.lon,
                  ])}
                  pathOptions={{
                    color: notamTheme(notam).color,
                    weight: 2,
                    fillColor: notamTheme(notam).fill,
                    fillOpacity: 0.11,
                  }}
                >
                  <Popup>
                    <div className="max-w-[320px]">
                      <div className="mb-2 rounded-lg bg-orange-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-orange-800">
                        Limits parsed from NOTAM coordinates
                      </div>
                      <NotamDetails notam={notam} />
                    </div>
                  </Popup>
                </Polygon>
              ))}

              {notamAreaShapes.map((notam) => (
                <Circle
                  key={`area-${notam.id}`}
                  center={[notam.latitude, notam.longitude]}
                  radius={notam.radiusNm * 1852}
                  pathOptions={{
                    color: notamTheme(notam).color,
                    weight: 1.5,
                    fillColor: notamTheme(notam).fill,
                    fillOpacity: 0.07,
                  }}
                >
                  <Popup>
                    <div className="max-w-[320px]">
                      <NotamDetails notam={notam} />
                    </div>
                  </Popup>
                </Circle>
              ))}

              {notamMarkerGroups.map((group) => (
                <Marker
                  key={`notam-group-${group.key}`}
                  position={[group.latitude, group.longitude]}
                  icon={notamMarkerIcon(group)}
                >
                  <Popup>
                    <div className="max-h-[320px] w-[300px] max-w-[72vw] overflow-auto">
                      <div className="mb-2 flex items-center justify-between gap-3 border-b border-zinc-200 pb-2">
                        <strong className="text-sm text-zinc-950">
                          {group.notices.length === 1
                            ? "NOTAM"
                            : `${group.notices.length} NOTAMs`}
                        </strong>
                        {group.broadAreaCount > 0 ? (
                          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
                            {group.broadAreaCount} broad area
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        {group.notices.map((notam) => (
                          <NotamDetails key={notam.id} notam={notam} />
                        ))}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </>
          ) : null}

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

        .area-map-notam-marker {
          display: flex;
          width: 28px;
          height: 28px;
          align-items: center;
          justify-content: center;
          border: 2px solid #ffffff;
          border-radius: 999px;
          background: #52525b;
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
          font-size: 10px;
          font-weight: 800;
          line-height: 1;
        }

      `}</style>
    </section>
  );
}
