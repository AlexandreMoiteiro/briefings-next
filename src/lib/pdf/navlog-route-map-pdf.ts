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

type PdfTile = {
  x: number;
  y: number;
  bytes: ArrayBuffer | null;
};

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MAP_FRAME: PlotFrame = { x: 24, y: 24, width: 794, height: 547 };
const MAX_PDF_TILE_COUNT = 96;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const STANDARD_MAP_MAX_ZOOM = 14;
const OPEN_TOPO_PROXY_TEMPLATE =
  "/api/navlog-map-tile?source=opentopo&z={z}&x={x}&y={y}";
const VFR_PROXY_TEMPLATE =
  "/api/navlog-map-tile?source=vfr&z={z}&x={x}&y={y}";

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
    north: clamp(
      centerLat + latSpan / 2,
      -WEB_MERCATOR_MAX_LATITUDE,
      WEB_MERCATOR_MAX_LATITUDE
    ),
    south: clamp(
      centerLat - latSpan / 2,
      -WEB_MERCATOR_MAX_LATITUDE,
      WEB_MERCATOR_MAX_LATITUDE
    ),
    east: clamp(centerLon + lonSpan / 2, -180, 180),
    west: clamp(centerLon - lonSpan / 2, -180, 180),
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
    const response = await fetch(url, { cache: "force-cache" });

    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function fetchArrayBuffer(url: string) {
  const response = await fetch(url, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`Could not fetch map image: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType && !contentType.toLowerCase().startsWith("image/")) {
    throw new Error("The map image request did not return an image.");
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

async function loadPdfTiles(
  template: string,
  zoom: number,
  range: ReturnType<typeof getTileRange>
) {
  const tiles: PdfTile[] = [];

  for (let y = range.north; y <= range.south; y += 1) {
    for (let x = range.west; x <= range.east; x += 1) {
      tiles.push({ x, y, bytes: null });
    }
  }

  return Promise.all(
    tiles.map(async (tile) => {
      try {
        return {
          ...tile,
          bytes: await fetchArrayBuffer(
            resolveTileUrl(template, zoom, tile.x, tile.y)
          ),
        };
      } catch (error) {
        console.error("Route-map tile failed", {
          zoom,
          x: tile.x,
          y: tile.y,
          error,
        });
        return tile;
      }
    })
  );
}

async function drawXyzTileBackground({
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
  const loadedTiles = await loadPdfTiles(tilesUrl, zoom, range);
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
      console.error("Could not embed route-map tile", error);
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

      page.drawImage(image, {
        x: Math.min(northWest.x, southEast.x),
        y: Math.min(northWest.y, southEast.y),
        width: Math.abs(southEast.x - northWest.x),
        height: Math.abs(northWest.y - southEast.y),
        opacity: 0.98,
      });
      drawn += 1;
    } catch (error) {
      console.error("Could not embed VFR chart overlay", error);
    }
  }

  page.pushOperators(popGraphicsState());

  return drawn;
}

function drawNorthArrow(page: PDFPage, boldFont: PDFFont) {
  const box = {
    x: MAP_FRAME.x + MAP_FRAME.width - 35,
    y: MAP_FRAME.y + MAP_FRAME.height - 52,
    width: 26,
    height: 40,
  };

  page.drawRectangle({
    ...box,
    color: rgb(1, 1, 1),
    opacity: 0.82,
  });
  page.drawText("N", {
    x: box.x + 9,
    y: box.y + 25,
    size: 11,
    font: boldFont,
    color: rgb(0.05, 0.05, 0.05),
  });
  page.drawLine({
    start: { x: box.x + 13, y: box.y + 7 },
    end: { x: box.x + 13, y: box.y + 27 },
    thickness: 1.2,
    color: rgb(0.05, 0.05, 0.05),
  });
}

function drawMapAttribution(page: PDFPage, font: PDFFont, text: string) {
  const size = 5.5;
  const padding = 3;
  const width = font.widthOfTextAtSize(text, size) + padding * 2;
  const x = MAP_FRAME.x + MAP_FRAME.width - width - 3;
  const y = MAP_FRAME.y + 3;

  page.drawRectangle({
    x,
    y,
    width,
    height: size + padding * 2,
    color: rgb(1, 1, 1),
    opacity: 0.8,
  });
  page.drawText(text, {
    x: x + padding,
    y: y + padding,
    size,
    font,
    color: rgb(0.15, 0.15, 0.15),
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
  const nodes = getPlottedRouteNodes(routeWaypoints);

  if (nodes.length < 2) {
    throw new Error("The route map needs at least two valid waypoints.");
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bounds = expandRouteBounds(nodes);
  const project = buildProjector(bounds, MAP_FRAME);

  page.drawRectangle({
    x: MAP_FRAME.x,
    y: MAP_FRAME.y,
    width: MAP_FRAME.width,
    height: MAP_FRAME.height,
    color: rgb(0.94, 0.96, 0.97),
    borderColor: rgb(0.55, 0.55, 0.55),
    borderWidth: 0.8,
  });

  let backgroundImagesDrawn = 0;
  let attribution = "";

  if (mapSourceMode === "vfr-chart" && vfrChartTilesUrl) {
    backgroundImagesDrawn = await drawXyzTileBackground({
      pdfDoc,
      page,
      tilesUrl: VFR_PROXY_TEMPLATE,
      maximumZoom: vfrChartMaxNativeZoom,
      bounds,
      project,
    });
    attribution = "VFR chart";
  } else if (mapSourceMode === "vfr-chart" && vfrChartManifestUrl) {
    backgroundImagesDrawn = await drawVfrChartBackground({
      pdfDoc,
      page,
      manifestUrl: vfrChartManifestUrl,
      manifestLevel: vfrChartManifestLevel,
      bounds,
      project,
    });
    attribution = "VFR chart";
  } else if (mapSourceMode === "standard") {
    backgroundImagesDrawn = await drawXyzTileBackground({
      pdfDoc,
      page,
      tilesUrl: OPEN_TOPO_PROXY_TEMPLATE,
      maximumZoom: STANDARD_MAP_MAX_ZOOM,
      bounds,
      project,
    });
    attribution = "Map: OpenTopoMap / OpenStreetMap contributors";
  }

  if (backgroundImagesDrawn === 0) {
    throw new Error(
      "The map background could not be loaded. No route-map PDF was generated."
    );
  }

  const positions = nodes.map((node) => project(node.lat, node.lon));

  for (let index = 1; index < positions.length; index += 1) {
    page.drawLine({
      start: positions[index - 1],
      end: positions[index],
      thickness: 3.6,
      color: rgb(0.95, 0.12, 0.08),
      opacity: 0.92,
    });
    page.drawLine({
      start: positions[index - 1],
      end: positions[index],
      thickness: 1.35,
      color: rgb(1, 1, 1),
      opacity: 0.98,
    });
  }

  nodes.forEach((node, index) => {
    const position = positions[index];
    const label = nodeLabel(node);
    const fontSize = 7.5;
    const labelWidth = boldFont.widthOfTextAtSize(label, fontSize);
    const labelY = position.y + (index % 2 === 0 ? 6 : -12);

    page.drawCircle({
      x: position.x,
      y: position.y,
      size: 4.8,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.05, 0.05, 0.05),
      borderWidth: 1.1,
    });
    page.drawRectangle({
      x: position.x + 4.5,
      y: labelY - 1.5,
      width: labelWidth + 4,
      height: fontSize + 3,
      color: rgb(1, 1, 1),
      opacity: 0.76,
    });
    page.drawText(label, {
      x: position.x + 6,
      y: labelY,
      size: fontSize,
      font: boldFont,
      color: rgb(0.02, 0.02, 0.02),
    });
  });

  drawNorthArrow(page, boldFont);
  drawMapAttribution(page, regularFont, attribution);

  return pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
}
