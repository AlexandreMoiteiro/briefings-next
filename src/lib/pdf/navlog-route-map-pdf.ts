import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { NavlogRouteNode, NavlogRouteWaypoint } from "@/lib/navlog";

type BuildNavlogRouteMapPdfInput = {
  routeWaypoints: NavlogRouteWaypoint[];
  calculatedNodes: NavlogRouteNode[];
};

type PlotPoint = {
  x: number;
  y: number;
};

type PlotFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MAP_FRAME: PlotFrame = { x: 38, y: 88, width: 560, height: 414 };
const ROUTE_PANEL: PlotFrame = { x: 618, y: 88, width: 186, height: 414 };

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
  if (labels.length <= 6) return labels.join(" - ");

  return `${labels.slice(0, 4).join(" - ")} - ... - ${labels.at(-1)}`;
}

function buildProjector(nodes: NavlogRouteNode[], frame: PlotFrame) {
  const latitudes = nodes.map((node) => node.lat);
  const longitudes = nodes.map((node) => node.lon);
  const meanLatRad =
    ((latitudes.reduce((sum, lat) => sum + lat, 0) / latitudes.length) *
      Math.PI) /
    180;
  const cosMeanLat = Math.max(0.25, Math.cos(meanLatRad));
  const projected = nodes.map((node) => ({
    x: node.lon * cosMeanLat,
    y: node.lat,
  }));

  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const spanX = Math.max(0.02, maxX - minX);
  const spanY = Math.max(0.02, maxY - minY);
  const scale = Math.min(frame.width / spanX, frame.height / spanY) * 0.88;
  const drawnWidth = spanX * scale;
  const drawnHeight = spanY * scale;
  const offsetX = frame.x + (frame.width - drawnWidth) / 2;
  const offsetY = frame.y + (frame.height - drawnHeight) / 2;

  return (node: NavlogRouteNode): PlotPoint => {
    const x = node.lon * cosMeanLat;
    const y = node.lat;

    return {
      x: offsetX + (x - minX) * scale,
      y: offsetY + (y - minY) * scale,
    };
  };
}

function formatCoordinate(value: number, suffixPositive: string, suffixNegative: string) {
  const suffix = value >= 0 ? suffixPositive : suffixNegative;
  return `${Math.abs(value).toFixed(3)}°${suffix}`;
}

function drawRoutePanel({
  page,
  regularFont,
  boldFont,
  routeWaypoints,
  calculatedNodes,
}: {
  page: any;
  regularFont: any;
  boldFont: any;
  routeWaypoints: NavlogRouteWaypoint[];
  calculatedNodes: NavlogRouteNode[];
}) {
  page.drawRectangle({
    x: ROUTE_PANEL.x,
    y: ROUTE_PANEL.y,
    width: ROUTE_PANEL.width,
    height: ROUTE_PANEL.height,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.82, 0.82, 0.82),
    borderWidth: 1,
  });

  page.drawText("Route sequence", {
    x: ROUTE_PANEL.x + 10,
    y: ROUTE_PANEL.y + ROUTE_PANEL.height - 24,
    size: 11,
    font: boldFont,
    color: rgb(0.05, 0.05, 0.05),
  });

  const userWaypointIds = new Set(routeWaypoints.map((waypoint) => waypoint.id));
  const rows = calculatedNodes
    .map((node, index) => ({ node, index }))
    .filter(({ node, index }) => userWaypointIds.has(node.id) || index === 0 || index === calculatedNodes.length - 1)
    .slice(0, 25);

  let y = ROUTE_PANEL.y + ROUTE_PANEL.height - 44;

  for (const { node, index } of rows) {
    page.drawText(`${String(index + 1).padStart(2, "0")}.`, {
      x: ROUTE_PANEL.x + 10,
      y,
      size: 7.5,
      font: regularFont,
      color: rgb(0.35, 0.35, 0.35),
    });

    page.drawText(nodeLabel(node), {
      x: ROUTE_PANEL.x + 30,
      y,
      size: 8,
      font: boldFont,
      color: rgb(0.08, 0.08, 0.08),
    });

    page.drawText(`${node.alt.toFixed(0)} ft`, {
      x: ROUTE_PANEL.x + 120,
      y,
      size: 7.5,
      font: regularFont,
      color: rgb(0.35, 0.35, 0.35),
    });

    y -= 14;
  }

  if (calculatedNodes.length > rows.length) {
    page.drawText(`Only key points shown. Full route nodes: ${calculatedNodes.length}`, {
      x: ROUTE_PANEL.x + 10,
      y: ROUTE_PANEL.y + 12,
      size: 7,
      font: regularFont,
      color: rgb(0.45, 0.45, 0.45),
    });
  }
}

export async function buildNavlogRouteMapPdf({
  routeWaypoints,
  calculatedNodes,
}: BuildNavlogRouteMapPdfInput) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const nodes = calculatedNodes.filter(
    (node) => Number.isFinite(node.lat) && Number.isFinite(node.lon)
  );

  page.drawText("NavLog route map", {
    x: 38,
    y: 558,
    size: 22,
    font: boldFont,
    color: rgb(0.05, 0.05, 0.05),
  });

  page.drawText(routeLabel(routeWaypoints), {
    x: 38,
    y: 538,
    size: 10,
    font: regularFont,
    color: rgb(0.28, 0.28, 0.28),
  });

  page.drawText(new Date().toISOString().slice(0, 10), {
    x: 744,
    y: 558,
    size: 9,
    font: regularFont,
    color: rgb(0.35, 0.35, 0.35),
  });

  page.drawRectangle({
    x: MAP_FRAME.x,
    y: MAP_FRAME.y,
    width: MAP_FRAME.width,
    height: MAP_FRAME.height,
    color: rgb(0.97, 0.99, 1),
    borderColor: rgb(0.72, 0.72, 0.72),
    borderWidth: 1,
  });

  if (nodes.length < 2) {
    page.drawText("Build a route with at least two plotted points to export a route map.", {
      x: MAP_FRAME.x + 24,
      y: MAP_FRAME.y + MAP_FRAME.height / 2,
      size: 12,
      font: regularFont,
      color: rgb(0.45, 0.45, 0.45),
    });
  } else {
    const project = buildProjector(nodes, MAP_FRAME);
    const positions = nodes.map((node) => project(node));
    const userWaypointIds = new Set(routeWaypoints.map((waypoint) => waypoint.id));

    for (let i = 1; i < positions.length; i += 1) {
      page.drawLine({
        start: positions[i - 1],
        end: positions[i],
        thickness: 2.2,
        color: rgb(0.07, 0.09, 0.12),
      });
    }

    nodes.forEach((node, index) => {
      const position = positions[index];
      const isUserWaypoint = userWaypointIds.has(node.id);
      const isCalculated = node.src === "CALC";
      const markerSize = isUserWaypoint ? 4.6 : 3.1;

      page.drawCircle({
        x: position.x,
        y: position.y,
        size: markerSize,
        color: isCalculated ? rgb(0.93, 0.93, 0.93) : rgb(1, 1, 1),
        borderColor: rgb(0.05, 0.05, 0.05),
        borderWidth: isUserWaypoint ? 1.2 : 0.8,
      });

      if (isUserWaypoint || nodes.length <= 26 || index === 0 || index === nodes.length - 1) {
        page.drawText(nodeLabel(node), {
          x: position.x + 5,
          y: position.y + 5,
          size: isUserWaypoint ? 7.5 : 6.5,
          font: isUserWaypoint ? boldFont : regularFont,
          color: rgb(0.05, 0.05, 0.05),
        });
      }
    });

    const latitudes = nodes.map((node) => node.lat);
    const longitudes = nodes.map((node) => node.lon);
    const north = Math.max(...latitudes);
    const south = Math.min(...latitudes);
    const east = Math.max(...longitudes);
    const west = Math.min(...longitudes);

    page.drawText(
      `Bounds: ${formatCoordinate(north, "N", "S")} / ${formatCoordinate(south, "N", "S")} / ${formatCoordinate(west, "E", "W")} / ${formatCoordinate(east, "E", "W")}`,
      {
        x: MAP_FRAME.x,
        y: MAP_FRAME.y - 16,
        size: 7,
        font: regularFont,
        color: rgb(0.45, 0.45, 0.45),
      }
    );
  }

  drawRoutePanel({
    page,
    regularFont,
    boldFont,
    routeWaypoints,
    calculatedNodes: nodes,
  });

  page.drawText("N", {
    x: MAP_FRAME.x + MAP_FRAME.width - 26,
    y: MAP_FRAME.y + MAP_FRAME.height - 28,
    size: 12,
    font: boldFont,
    color: rgb(0.05, 0.05, 0.05),
  });
  page.drawLine({
    start: { x: MAP_FRAME.x + MAP_FRAME.width - 20, y: MAP_FRAME.y + MAP_FRAME.height - 40 },
    end: { x: MAP_FRAME.x + MAP_FRAME.width - 20, y: MAP_FRAME.y + MAP_FRAME.height - 16 },
    thickness: 1.4,
    color: rgb(0.05, 0.05, 0.05),
  });

  const totalDistanceNm = routeWaypoints.length > 1 ? "Route plotted from calculated NavLog nodes." : "No route plotted.";

  page.drawText(totalDistanceNm, {
    x: 38,
    y: 42,
    size: 9,
    font: boldFont,
    color: rgb(0.15, 0.15, 0.15),
  });

  page.drawText(
    "For planning review only. Validate against current charts, AIP and NOTAM before flight.",
    {
      x: 38,
      y: 26,
      size: 8,
      font: regularFont,
      color: rgb(0.45, 0.45, 0.45),
    }
  );

  return pdfDoc.save();
}
