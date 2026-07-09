import {
  PDFDocument,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from "pdf-lib";
import type { NavlogRouteNode, NavlogRouteWaypoint } from "@/lib/navlog";

type MapSourceMode = "standard" | "vfr-chart";

type BuildNavlogRouteMapPdfInput = {
  routeWaypoints: NavlogRouteWaypoint[];
  calculatedNodes: NavlogRouteNode[];
  mapSourceMode?: MapSourceMode;
  vfrChartManifestUrl?: string;
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
const MAP_FRAME: PlotFrame = { x: 36, y: 58, width: 770, height: 468 };

function safeText(value: unknown) {
  if (value === null || value === undefined) return "";

  return String(value).replace(/[\n\r]+/g, " ").trim();
}

function nodeLabel(node: NavlogRouteNode) {
  return safeText(node.code || node.name || "WP").slice(0, 18);
}

function routeLabel(routeWaypoints: NavlogRouteWaypoint[]) {
  const labels = routeWaypoints
    .map((waypoint) => waypoint.point.code || waypoint.point.name)
    .map((label) => safeText(label).toUpperCase())
    .filter(Boolean);

  if (labels.length === 0) return "Working route";
  if (labels.length <= 8) return labels.join(" - ");

  return `${labels.slice(0, 5).join(" - ")} - ... - ${labels.at(-1)}`;
}

function expandRouteBounds(nodes: NavlogRouteNode[]): GeoBounds {
  const latitudes = nodes.map((node) => node.lat);
  const longitudes = nodes.map((node) => node.lon);
  const north = Math.max(...latitudes);
  const south = Math.min(...latitudes);
  const east = Math.max(...longitudes);
  const west = Math.min(...longitudes);
  const latSpan = Math.max(0.12, north - south);
  const lonSpan = Math.max(0.12, east - west);
  const latMargin = Math.max(0.08, latSpan * 0.35);
  const lonMargin = Math.max(0.08, lonSpan * 0.35);

  return {
    north: north + latMargin,
    south: south - latMargin,
    east: east + lonMargin,
    west: west - lonMargin,
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

function getBestVfrLevel(manifest: VfrKmzManifest) {
  const levels = manifest.levels?.length
    ? manifest.levels
    : Array.from(new Set(manifest.overlays.map((overlay) => overlay.level)));

  return [...levels].sort((a, b) => a - b).at(-1) ?? null;
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

async function drawVfrChartBackground({
  pdfDoc,
  page,
  manifestUrl,
  bounds,
  project,
}: {
  pdfDoc: PDFDocument;
  page: any;
  manifestUrl: string;
  bounds: GeoBounds;
  project: (lat: number, lon: number) => PlotPoint;
}) {
  const manifest = await fetchJson<VfrKmzManifest>(manifestUrl);

  if (!manifest) return 0;

  const level = getBestVfrLevel(manifest);

  if (level === null) return 0;

  const overlays = manifest.overlays
    .filter((overlay) => overlay.level === level)
    .filter((overlay) => overlayIntersectsBounds(overlay, bounds))
    .slice(0, 80);

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

function drawNorthArrow(page: any, boldFont: any) {
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
  calculatedNodes,
  mapSourceMode = "standard",
  vfrChartManifestUrl = "",
}: BuildNavlogRouteMapPdfInput) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const nodes = calculatedNodes.filter(
    (node) => Number.isFinite(node.lat) && Number.isFinite(node.lon)
  );

  page.drawText("Route map", {
    x: 36,
    y: 556,
    size: 18,
    font: boldFont,
    color: rgb(0.05, 0.05, 0.05),
  });

  page.drawText(routeLabel(routeWaypoints), {
    x: 36,
    y: 536,
    size: 9,
    font: regularFont,
    color: rgb(0.25, 0.25, 0.25),
  });

  page.drawRectangle({
    x: MAP_FRAME.x,
    y: MAP_FRAME.y,
    width: MAP_FRAME.width,
    height: MAP_FRAME.height,
    color: rgb(0.94, 0.96, 0.97),
    borderColor: rgb(0.55, 0.55, 0.55),
    borderWidth: 0.8,
  });

  if (nodes.length < 2) {
    page.drawText("Build a route with at least two plotted points.", {
      x: MAP_FRAME.x + 24,
      y: MAP_FRAME.y + MAP_FRAME.height / 2,
      size: 12,
      font: regularFont,
      color: rgb(0.45, 0.45, 0.45),
    });
  } else {
    const bounds = expandRouteBounds(nodes);
    const project = buildProjector(bounds, MAP_FRAME);
    const userWaypointIds = new Set(routeWaypoints.map((waypoint) => waypoint.id));

    if (mapSourceMode === "vfr-chart" && vfrChartManifestUrl) {
      await drawVfrChartBackground({
        pdfDoc,
        page,
        manifestUrl: vfrChartManifestUrl,
        bounds,
        project,
      });
    }

    const positions = nodes.map((node) => project(node.lat, node.lon));

    for (let i = 1; i < positions.length; i += 1) {
      page.drawLine({
        start: positions[i - 1],
        end: positions[i],
        thickness: 3.2,
        color: rgb(0.95, 0.12, 0.08),
        opacity: 0.9,
      });
      page.drawLine({
        start: positions[i - 1],
        end: positions[i],
        thickness: 1.2,
        color: rgb(1, 1, 1),
        opacity: 0.95,
      });
    }

    nodes.forEach((node, index) => {
      const position = positions[index];
      const isUserWaypoint = userWaypointIds.has(node.id);
      const isEndpoint = index === 0 || index === nodes.length - 1;

      page.drawCircle({
        x: position.x,
        y: position.y,
        size: isUserWaypoint ? 4.8 : 3,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.05, 0.05, 0.05),
        borderWidth: isUserWaypoint ? 1.1 : 0.8,
      });

      if (isUserWaypoint || isEndpoint) {
        page.drawText(nodeLabel(node), {
          x: position.x + 6,
          y: position.y + 6,
          size: 7.5,
          font: boldFont,
          color: rgb(0.02, 0.02, 0.02),
        });
      }
    });
  }

  drawNorthArrow(page, boldFont);

  page.drawText("Planning review only — validate against current charts, AIP and NOTAM.", {
    x: 36,
    y: 28,
    size: 7.5,
    font: regularFont,
    color: rgb(0.36, 0.36, 0.36),
  });

  return pdfDoc.save();
}
