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

export type AreaMapPdfPoint = { lat: number; lon: number; label?: string };
export type AreaMapPdfArea = {
  id: string;
  name: string;
  points: AreaMapPdfPoint[];
  isDraft?: boolean;
  isSelected?: boolean;
};
export type AreaMapPdfSource = "standard" | "vfr-chart";

type Point = { x: number; y: number };
type Bounds = { north: number; south: number; east: number; west: number };
type Tile = { x: number; y: number; bytes: ArrayBuffer | null };

const PAGE = { width: 842, height: 595 };
const FRAME = { x: 24, y: 48, width: 794, height: 523 };
const MAX_LAT = 85.05112878;
const MAX_TILES = 96;
const TILE_SOURCES: Record<AreaMapPdfSource, { url: string; maxZoom: number }> = {
  standard: {
    url: "/api/navlog-map-tile?source=opentopo&z={z}&x={x}&y={y}",
    maxZoom: 14,
  },
  "vfr-chart": {
    url: "/api/navlog-map-tile?source=vfr&z={z}&x={x}&y={y}",
    maxZoom: 12,
  },
};
const COLORS = [
  rgb(0.86, 0.15, 0.12),
  rgb(0.08, 0.38, 0.78),
  rgb(0.06, 0.55, 0.32),
  rgb(0.58, 0.2, 0.78),
  rgb(0.91, 0.48, 0.08),
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function text(value: unknown, fallback = "") {
  const result = String(value ?? "").replace(/[\n\r]+/g, " ").trim();
  return result || fallback;
}

function drawableAreas(areas: AreaMapPdfArea[]) {
  return areas
    .map((area) => ({
      ...area,
      name: text(area.name, "Area"),
      points: area.points.filter(
        (point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)
      ),
    }))
    .filter((area) => area.points.length > 0);
}

function areaBounds(areas: AreaMapPdfArea[]): Bounds {
  const points = areas.flatMap((area) => area.points);
  const north = Math.max(...points.map((point) => point.lat));
  const south = Math.min(...points.map((point) => point.lat));
  const east = Math.max(...points.map((point) => point.lon));
  const west = Math.min(...points.map((point) => point.lon));
  const centerLat = (north + south) / 2;
  const centerLon = (east + west) / 2;
  const cosLat = Math.max(0.25, Math.cos((centerLat * Math.PI) / 180));
  const frameAspect = FRAME.width / FRAME.height;
  let latSpan = Math.max(0.18, north - south) * 1.35;
  let lonSpan = Math.max(0.18, east - west) * 1.35;

  if ((lonSpan * cosLat) / latSpan < frameAspect) {
    lonSpan = (frameAspect * latSpan) / cosLat;
  } else {
    latSpan = (lonSpan * cosLat) / frameAspect;
  }

  return {
    north: clamp(centerLat + latSpan / 2, -MAX_LAT, MAX_LAT),
    south: clamp(centerLat - latSpan / 2, -MAX_LAT, MAX_LAT),
    east: clamp(centerLon + lonSpan / 2, -180, 180),
    west: clamp(centerLon - lonSpan / 2, -180, 180),
  };
}

function projector(bounds: Bounds) {
  const cosLat = Math.max(
    0.25,
    Math.cos((((bounds.north + bounds.south) / 2) * Math.PI) / 180)
  );
  const minX = bounds.west * cosLat;
  const maxX = bounds.east * cosLat;
  const spanX = Math.max(0.02, maxX - minX);
  const spanY = Math.max(0.02, bounds.north - bounds.south);
  const scale = Math.min(FRAME.width / spanX, FRAME.height / spanY);
  const offsetX = FRAME.x + (FRAME.width - spanX * scale) / 2;
  const offsetY = FRAME.y + (FRAME.height - spanY * scale) / 2;

  return (lat: number, lon: number): Point => ({
    x: offsetX + (lon * cosLat - minX) * scale,
    y: offsetY + (lat - bounds.south) * scale,
  });
}

function lonToTileX(lon: number, zoom: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number) {
  const radians = (clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180;
  const mercator = Math.log(Math.tan(radians) + 1 / Math.cos(radians));
  return Math.floor((1 - mercator / Math.PI) * 0.5 * 2 ** zoom);
}

function tileXToLon(x: number, zoom: number) {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileYToLat(y: number, zoom: number) {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) * 180) / Math.PI;
}

function tileRange(bounds: Bounds, zoom: number) {
  const max = 2 ** zoom - 1;
  const west = clamp(lonToTileX(bounds.west, zoom), 0, max);
  const east = clamp(lonToTileX(bounds.east, zoom), 0, max);
  const north = clamp(latToTileY(bounds.north, zoom), 0, max);
  const south = clamp(latToTileY(bounds.south, zoom), 0, max);

  return {
    west: Math.min(west, east),
    east: Math.max(west, east),
    north: Math.min(north, south),
    south: Math.max(north, south),
  };
}

function chooseZoom(bounds: Bounds, maximum: number) {
  for (let zoom = maximum; zoom >= 0; zoom -= 1) {
    const range = tileRange(bounds, zoom);
    const count =
      (range.east - range.west + 1) * (range.south - range.north + 1);
    if (count <= MAX_TILES) return zoom;
  }
  return 0;
}

function tileUrl(template: string, zoom: number, x: number, y: number) {
  const path = template
    .replaceAll("{z}", String(zoom))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y));
  return typeof window === "undefined"
    ? path
    : new URL(path, window.location.href).toString();
}

async function fetchImage(url: string) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Map tile HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.startsWith("image/")) {
    throw new Error("Map tile did not return an image.");
  }
  return response.arrayBuffer();
}

async function drawBackground(
  pdf: PDFDocument,
  page: PDFPage,
  source: AreaMapPdfSource,
  bounds: Bounds,
  project: (lat: number, lon: number) => Point
) {
  const config = TILE_SOURCES[source];
  const zoom = chooseZoom(bounds, config.maxZoom);
  const range = tileRange(bounds, zoom);
  const tiles: Tile[] = [];

  for (let y = range.north; y <= range.south; y += 1) {
    for (let x = range.west; x <= range.east; x += 1) {
      tiles.push({ x, y, bytes: null });
    }
  }

  const loaded = await Promise.all(
    tiles.map(async (tile) => {
      try {
        return {
          ...tile,
          bytes: await fetchImage(tileUrl(config.url, zoom, tile.x, tile.y)),
        };
      } catch (error) {
        console.error("Area Map PDF tile failed", { ...tile, zoom, error });
        return tile;
      }
    })
  );

  page.pushOperators(
    pushGraphicsState(),
    rectangle(FRAME.x, FRAME.y, FRAME.width, FRAME.height),
    clip(),
    endPath()
  );

  let drawn = 0;
  for (const tile of loaded) {
    if (!tile.bytes) continue;
    try {
      const image = await pdf.embedPng(tile.bytes);
      const northWest = project(
        tileYToLat(tile.y, zoom),
        tileXToLon(tile.x, zoom)
      );
      const southEast = project(
        tileYToLat(tile.y + 1, zoom),
        tileXToLon(tile.x + 1, zoom)
      );
      page.drawImage(image, {
        x: Math.min(northWest.x, southEast.x),
        y: Math.min(northWest.y, southEast.y),
        width: Math.abs(southEast.x - northWest.x) + 0.7,
        height: Math.abs(northWest.y - southEast.y) + 0.7,
      });
      drawn += 1;
    } catch (error) {
      console.error("Could not embed Area Map PDF tile", error);
    }
  }

  page.pushOperators(popGraphicsState());
  return drawn;
}

function labelPosition(points: Point[]) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function drawLabel(
  page: PDFPage,
  font: PDFFont,
  value: string,
  position: Point,
  selected: boolean
) {
  const label = text(value, "Area").slice(0, 36);
  const size = 7.5;
  const width = font.widthOfTextAtSize(label, size) + 8;
  const height = 13.5;
  const x = clamp(position.x - width / 2, FRAME.x + 2, FRAME.x + FRAME.width - width - 2);
  const y = clamp(position.y - height / 2, FRAME.y + 2, FRAME.y + FRAME.height - height - 2);

  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: selected ? rgb(0.03, 0.04, 0.08) : rgb(1, 1, 1),
    opacity: 0.9,
    borderColor: rgb(0.15, 0.15, 0.17),
    borderWidth: 0.5,
  });
  page.drawText(label, {
    x: x + 4,
    y: y + 3,
    size,
    font,
    color: selected ? rgb(1, 1, 1) : rgb(0.05, 0.05, 0.07),
  });
}

function drawArea(
  page: PDFPage,
  font: PDFFont,
  area: AreaMapPdfArea,
  index: number,
  project: (lat: number, lon: number) => Point
) {
  const points = area.points.map((point) => project(point.lat, point.lon));
  const color = COLORS[index % COLORS.length];
  const selected = Boolean(area.isDraft || area.isSelected);
  const thickness = selected ? 3.2 : 2.1;

  if (points.length >= 2) {
    const closed = points.length >= 3 ? [...points, points[0]] : points;
    for (let position = 1; position < closed.length; position += 1) {
      page.drawLine({
        start: closed[position - 1],
        end: closed[position],
        thickness,
        color,
        opacity: 0.98,
      });
    }
  }

  points.forEach((point) => {
    page.drawCircle({
      x: point.x,
      y: point.y,
      size: points.length === 1 ? 6 : 2.8,
      color: rgb(1, 1, 1),
      borderColor: color,
      borderWidth: 1.2,
    });
  });

  drawLabel(page, font, area.name, labelPosition(points), selected);
}

function drawNorth(page: PDFPage, font: PDFFont) {
  const x = FRAME.x + FRAME.width - 29;
  const y = FRAME.y + FRAME.height - 42;
  page.drawRectangle({ x: x - 5, y: y - 6, width: 27, height: 38, color: rgb(1, 1, 1), opacity: 0.84 });
  page.drawText("N", { x: x + 4, y: y + 19, size: 10, font, color: rgb(0.05, 0.05, 0.05) });
  page.drawLine({ start: { x: x + 7, y }, end: { x: x + 7, y: y + 19 }, thickness: 1.2, color: rgb(0.05, 0.05, 0.05) });
}

export async function buildAreaMapPdf({
  areas,
  source = "standard",
  title = "Coordinate areas",
}: {
  areas: AreaMapPdfArea[];
  source?: AreaMapPdfSource;
  title?: string;
}) {
  const drawable = drawableAreas(areas);
  if (!drawable.length) {
    throw new Error("Add at least one valid point before exporting the PDF.");
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bounds = areaBounds(drawable);
  const project = projector(bounds);

  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(0.97, 0.97, 0.98) });
  page.drawRectangle({
    x: FRAME.x,
    y: FRAME.y,
    width: FRAME.width,
    height: FRAME.height,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.2, 0.2, 0.22),
    borderWidth: 0.8,
  });

  if ((await drawBackground(pdf, page, source, bounds, project)) === 0) {
    throw new Error("The map background could not be loaded. No PDF was generated.");
  }

  drawable.forEach((area, index) => drawArea(page, bold, area, index, project));

  const heading = text(title, "Coordinate areas").slice(0, 64);
  page.drawRectangle({
    x: FRAME.x + 5,
    y: FRAME.y + FRAME.height - 28,
    width: Math.min(430, bold.widthOfTextAtSize(heading, 12) + 18),
    height: 22,
    color: rgb(1, 1, 1),
    opacity: 0.86,
  });
  page.drawText(heading, {
    x: FRAME.x + 12,
    y: FRAME.y + FRAME.height - 20,
    size: 12,
    font: bold,
    color: rgb(0.04, 0.04, 0.06),
  });
  drawNorth(page, bold);
  page.drawText(
    `${drawable.length} area(s) · Map: ${source === "vfr-chart" ? "VFR chart" : "OpenTopoMap / OpenStreetMap contributors"}`,
    { x: FRAME.x, y: 25, size: 7, font: regular, color: rgb(0.25, 0.25, 0.28) }
  );

  return pdf.save({ useObjectStreams: true, addDefaultPage: false });
}
