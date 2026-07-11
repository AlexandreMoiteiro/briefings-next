import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from "pdf-lib";
import type { NavlogRouteWaypoint } from "@/lib/navlog";

type MapSourceMode = "standard" | "vfr-chart";

type BuildNavlogRouteMapPdfInput = {
  routeWaypoints: NavlogRouteWaypoint[];
  mapSourceMode?: MapSourceMode;
  vfrChartTilesUrl?: string;
  vfrChartMaxNativeZoom?: number;
  vfrChartManifestUrl?: string;
  vfrChartManifestLevel?: number | null;
};

type PlotNode = {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
};

type PlotPoint = {
  x: number;
  y: number;
};

type GeoBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type PlotFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
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

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MAP_FRAME: PlotFrame = { x: 24, y: 24, width: 794, height: 547 };
const MAX_PDF_TILE_COUNT = 240;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;

function safeText(value: unknown) {
  if (value === null || value === undefined) return "";

  return String(value).replace(/[\n\r]+/g, " ").trim();
}

function nodeLabel(node: PlotNode) {
  return safeText(node.code || node.name || "WP").slice(0, 18);
}

function getPlottedRouteNodes(routeWaypoints: NavlogRouteWaypoint[]): PlotNode[] {
  return routeWaypoints
    .map((waypoint, index) => ({
      id: waypoint.id || `wp-${index}`,
      code: waypoint.point.code || waypoint.point.name || `WP${index + 1}`,
      name: waypoint.point.name || waypoint.point.code || `WP${index + 1}`,
      lat: waypoint.point.lat,
      lon: waypoint.point.lon,
    }))
    .filter((node) => Number.isFinite(node.lat) && Number.isFinite(node.lon));
}

function expandRouteBounds(nodes: PlotNode[]): GeoBounds {
  const latitudes = nodes.map((node) => node.lat);
  const longitudes = nodes.map((node) => node.lon);
  const north = Math.max(...latitudes);
  const south = Math.min(...latitudes);
  const east = Math.max(...longitudes);
  const west = Math.min(...longitudes);
  const centerLat = (north + south) / 2;
  const centerLon = (east + west) / 2;
  const meanLatRad = (centerLat * Math.PI) / 180;
  const cosMeanLat = Math.max(0.25, Math.cos(meanLatRad));
  const frameAspect = MAP_FRAME.width / MAP_FRAME.height;

  let latSpan = Math.max(0.22, north - south) * 1.35;
  let lonSpan = Math.max(0.22, east - west) * 1.35;
  const projectedAspect = (lonSpan * cosMeanLat) / latSpan;

  if (projectedAspect < frameAspect) {
    lonSpan = (frameAspect * latSpan) / cosMeanLat;
  } else {
    latSpan = (lonSpan * cosMeanLat) / frameAspect;
  }

  return {
    north: centerLat + latSpan / 2,
    south: centerLat - latSpan / 2,
    east: centerLon + lonSpan / 2,
    west: centerLon - lonSpan / 2,
  };
}

function buildProjector(bounds: GeoBounds, frame: PlotFrame) {
  const meanLatRad = (((bounds.north + bounds.south) / 2) * Math.PI) / 180;
  const cosMeanLat = Math.max(0.25, Math.cos(meanLatRad));
  const minX = bounds.west * cosMeanLat;
  const maxX = bounds.east * cosMeanLat;
  const minY = bounds.south;
  const maxY = bounds.north;
  const spanX = Math.max(0.02, maxX - minX);
  const spanY = Math.max(0.02, maxY - minY);
  const scale = Math.min(frame.width / spanX, frame.height / spanY);
  const drawnWidth = spanX * scale;
  const drawnHeight = spanY * scale;
  const offsetX = frame.x + (frame.width - drawnWidth) / 2;
  const offsetY = frame.y + (frame.height - drawnHeight) / 2;

  return (lat: number, lon: number): PlotPoint => {
    const x = lon * cosMeanLat;
    const y = lat;

    return {
      x: offsetX + (x - minX) * scale,
      y: offsetY + (y - minY) * scale,
    };
  };
}

function resolveAssetUrl(manifestUrl: string, href: string) {
  if (typeof window === "undefined") return href;

  const absoluteManifestUrl = new URL(manifestUrl, window.location.href);

  return new URL(href, absoluteManifestUrl).toString();
}

function overlayIntersectsBounds(overlay: VfrKmzOverlayItem, bounds: GeoBounds) {
  return (
    overlay.south <= bounds.north &&
    overlay.north >= bounds.south &&
    overlay.west <= bounds.east &&
    overlay.east >= bounds.west
  );
}

function getBestVfrLevel(
  manifest: VfrKmzManifest,
  preferredLevel?: number | null
) {
  const levels = manifest.levels?.length
    ? manifest.levels
    : Array.from(new Set(manifest.overlays.map((overlay) => overlay.level)));
  const sortedLevels = [...levels].sort((a, b) => a - b);

  if (preferredLevel !== null && preferredLevel !== undefined) {
    return sortedLevels.includes(preferredLevel)
      ? preferredLevel
      : sortedLevels.at(-1) ?? null;
  }

  return sortedLevels.at(-1) ?? null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);

    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function fetchArrayBuffer(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not fetch image: ${response.status}`);
  }

  return response.arrayBuffer();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function longitudeToTileX(longitude: number, zoom: number) {
  const tileCount = 2 ** zoom;

  return Math.floor(((longitude + 180) / 360) * tileCount);
}

function latitudeToTileY(latitude: number, zoom: number) {
  const tileCount = 2 ** zoom;
  const clampedLatitude = clamp(
    latitude,
    -WEB_MERCATOR_MAX_LATITUDE,
    WEB_MERCATOR_MAX_LATITUDE
  );
  const latitudeRadians = (clampedLatitude * Math.PI) / 180;
  const mercator = Math.log(
    Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)
  );

  return Math.floor((1 - mercator / Math.PI) * 0.5 * tileCount);
}

function tileXToLongitude(tileX: number, zoom: number) {
  return (tileX / 2 ** zoom) * 360 - 180;
}

function tileYToLatitude(tileY: number, zoom: number) {
  const mercator = Math.PI * (1 - (2 * tileY) / 2 ** zoom);

  return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
}

function getTileRange(bounds: GeoBounds, zoom: number) {
  const maximumTileIndex = 2 ** zoom - 1;
  const west = clamp(
    longitudeToTileX(bounds.west, zoom),
    0,
    maximumTileIndex
  );
  const east = clamp(
    longitudeToTileX(bounds.east, zoom),
    0,
    maximumTileIndex
  );
  const north = clamp(
    latitudeToTileY(bounds.north, zoom),
    0,
    maximumTileIndex
  );
  const south = clamp(
    latitudeToTileY(bounds.south, zoom),
    0,
    maximumTileIndex
  );

  return {
    west: Math.min(west, east),
    east: Math.max(west, east),
    north: Math.min(north, south),
    south: Math.max(north, south),
  };
}

function getTileRangeCount(range: ReturnType<typeof getTileRange>) {
  return (range.east - range.west + 1) * (range.south - range.north + 1);
}

function choosePdfTileZoom(bounds: GeoBounds, maximumZoom: number) {
  for (let zoom = Math.max(0, maximumZoom); zoom >= 0; zoom -= 1) {
    if (getTileRangeCount(getTileRange(bounds, zoom)) <= MAX_PDF_TILE_COUNT) {
      return zoom;
    }
  }

  return 0;
}

function resolveTileUrl(template: string, zoom: number, x: number, y: number) {
  const path = template
    .replaceAll("{z}", String(zoom))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y));

  return typeof window === "undefined"
    ? path
    : new URL(path, window.location.href).toString();
}

async function drawVfrXyzTileBackground({
  pdfDoc,
  page,
  tilesUrl,
  maximumZoom,
  bounds,
  project,
}: {
  pdfDoc: PDFDocument;
  page: PDFPage;
  tilesUrl: string;
  maximumZoom: number;
  bounds: GeoBounds;
  project: (lat: number, lon: number) => PlotPoint;
}) {
  const zoom = choosePdfTileZoom(bounds, maximumZoom);
  const range = getTileRange(bounds, zoom);
  const tiles: { x: number; y: number; bytes: ArrayBuffer | null }[] = [];

  for (let y = range.north; y <= range.south; y += 1) {
    for (let x = range.west; x <= range.east; x += 1) {
      tiles.push({ x, y, bytes: null });
    }
  }

  const loadedTiles = await Promise.all(
    tiles.map(async (tile) => {
      try {
        return {
          ...tile,
          bytes: await fetchArrayBuffer(
            resolveTileUrl(tilesUrl, zoom, tile.x, tile.y)
          ),
        };
      } catch (error) {
        console.error(error);
        return tile;
      }
    })
  );

  let drawn = 0;

  page.pushOperators(
    pushGraphicsState(),
    rectangle(MAP_FRAME.x, MAP_FRAME.y, MAP_FRAME.width, MAP_FRAME.height),
    clip(),
    endPath()
  );

  for (const tile of loadedTiles) {
    if (!tile.bytes) continue;

    try {
      const image = await pdfDoc.embedPng(tile.bytes);
      const northWest = project(
        tileYToLatitude(tile.y, zoom),
        tileXToLongitude(tile.x, zoom)
      );
      const southEast = project(
        tileYToLatitude(tile.y + 1, zoom),
        tileXToLongitude(tile.x + 1, zoom)
      );

      page.drawImage(image, {
        x: Math.min(northWest.x, southEast.x),
        y: Math.min(northWest.y, southEast.y),
        width: Math.abs(southEast.x - northWest.x),
        height: Math.abs(northWest.y - southEast.y),
        opacity: 0.98,
      });
      drawn += 1;
    } catch (error) {
      console.error(error);
    }
  }

  page.pushOperators(popGraphicsState());

  return drawn;
}

async function drawVfrChartBackground({
  pdfDoc,
  page,
  manifestUrl,
  manifestLevel,
  bounds,
  project,
}: {
  pdfDoc: PDFDocument;
  page: PDFPage;
  manifestUrl: string;
  manifestLevel?: number | null;
  bounds: GeoBounds;
  project: (lat: number, lon: number) => PlotPoint;
}) {
  const manifest = await fetchJson<VfrKmzManifest>(manifestUrl);

  if (!manifest) return 0;

  const level = getBestVfrLevel(manifest, manifestLevel);

  if (level === null) return 0;

  const overlays = manifest.overlays
    .filter((overlay) => overlay.level === level)
    .filter((overlay) => overlayIntersectsBounds(overlay, bounds))
    .slice(0, 220);

  let drawn = 0;

  page.pushOperators(
    pushGraphicsState(),
    rectangle(MAP_FRAME.x, MAP_FRAME.y, MAP_FRAME.width, MAP_FRAME.height),
    clip(),
    endPath()
  );

  for (const overlay of overlays) {
    try {
      const imageBytes = await fetchArrayBuffer(
        resolveAssetUrl(manifestUrl, overlay.href)
      );
      const image = await pdfDoc.embedPng(imageBytes);
      const northWest = project(overlay.north, overlay.west);
      const southEast = project(overlay.south, overlay.east);
      const x = Math.min(northWest.x, southEast.x);
      const y = Math.min(northWest.y, southEast.y);
      const width = Math.abs(southEast.x - northWest.x);
      const height = Math.abs(northWest.y - southEast.y);

      page.drawImage(image, {
        x,
        y,
        width,
        height,
        opacity: 0.98,
      });
      drawn += 1;
    } catch (error) {
      console.error(error);
    }
  }

  page.pushOperators(popGraphicsState());

  return drawn;
}

function drawNorthArrow(page: PDFPage, boldFont: PDFFont) {
  page.drawText("N", {
    x: MAP_FRAME.x + MAP_FRAME.width - 24,
    y: MAP_FRAME.y + MAP_FRAME.height - 28,
    size: 11,
    font: boldFont,
    color: rgb(0.05, 0.05, 0.05),
  });
  page.drawLine({
    start: {
      x: MAP_FRAME.x + MAP_FRAME.width - 18,
      y: MAP_FRAME.y + MAP_FRAME.height - 42,
    },
    end: {
      x: MAP_FRAME.x + MAP_FRAME.width - 18,
      y: MAP_FRAME.y + MAP_FRAME.height - 16,
    },
    thickness: 1.2,
    color: rgb(0.05, 0.05, 0.05),
  });
}

export async function buildNavlogRouteMapPdf({
  routeWaypoints,
  mapSourceMode = "standard",
  vfrChartTilesUrl = "",
  vfrChartMaxNativeZoom = 13,
  vfrChartManifestUrl = "",
  vfrChartManifestLevel = null,
}: BuildNavlogRouteMapPdfInput) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const nodes = getPlottedRouteNodes(routeWaypoints);

  page.drawRectangle({
    x: MAP_FRAME.x,
    y: MAP_FRAME.y,
    width: MAP_FRAME.width,
    height: MAP_FRAME.height,
    color: rgb(0.94, 0.96, 0.97),
    borderColor: rgb(0.55, 0.55, 0.55),
    borderWidth: 0.8,
  });

  if (nodes.length >= 2) {
    const bounds = expandRouteBounds(nodes);
    const project = buildProjector(bounds, MAP_FRAME);

    if (mapSourceMode === "vfr-chart" && vfrChartTilesUrl) {
      await drawVfrXyzTileBackground({
        pdfDoc,
        page,
        tilesUrl: vfrChartTilesUrl,
        maximumZoom: vfrChartMaxNativeZoom,
        bounds,
        project,
      });
    } else if (mapSourceMode === "vfr-chart" && vfrChartManifestUrl) {
      await drawVfrChartBackground({
        pdfDoc,
        page,
        manifestUrl: vfrChartManifestUrl,
        manifestLevel: vfrChartManifestLevel,
        bounds,
        project,
      });
    }

    const positions = nodes.map((node) => project(node.lat, node.lon));

    for (let i = 1; i < positions.length; i += 1) {
      page.drawLine({
        start: positions[i - 1],
        end: positions[i],
        thickness: 3.6,
        color: rgb(0.95, 0.12, 0.08),
        opacity: 0.92,
      });
      page.drawLine({
        start: positions[i - 1],
        end: positions[i],
        thickness: 1.35,
        color: rgb(1, 1, 1),
        opacity: 0.98,
      });
    }

    nodes.forEach((node, index) => {
      const position = positions[index];

      page.drawCircle({
        x: position.x,
        y: position.y,
        size: 4.8,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.05, 0.05, 0.05),
        borderWidth: 1.1,
      });

      page.drawText(nodeLabel(node), {
        x: position.x + 6,
        y: position.y + (index % 2 === 0 ? 6 : -12),
        size: 7.5,
        font: boldFont,
        color: rgb(0.02, 0.02, 0.02),
      });
    });
  }

  drawNorthArrow(page, boldFont);

  return pdfDoc.save();
}
