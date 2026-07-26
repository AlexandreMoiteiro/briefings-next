import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const OPEN_TOPO_TEMPLATE =
  "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
const DEFAULT_VFR_TEMPLATE = "/vfr-chart/{z}/{x}/{y}.png";
const TILE_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";

function parseInteger(value: string | null) {
  if (value === null || !/^-?\d+$/.test(value)) return null;

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isValidTileCoordinate(zoom: number, x: number, y: number) {
  if (zoom < 0 || zoom > 18) return false;

  const tileCount = 2 ** zoom;

  return x >= 0 && x < tileCount && y >= 0 && y < tileCount;
}

function resolveTemplate(
  template: string,
  zoom: number,
  x: number,
  y: number,
  origin: string,
  subdomain = "a"
) {
  const path = template
    .replaceAll("{s}", subdomain)
    .replaceAll("{z}", String(zoom))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y));

  return new URL(path, origin).toString();
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source");
  const zoom = parseInteger(request.nextUrl.searchParams.get("z"));
  const x = parseInteger(request.nextUrl.searchParams.get("x"));
  const y = parseInteger(request.nextUrl.searchParams.get("y"));

  if (
    zoom === null ||
    x === null ||
    y === null ||
    !isValidTileCoordinate(zoom, x, y)
  ) {
    return errorResponse("Invalid map tile coordinates.", 400);
  }

  let upstreamUrl: string;

  if (source === "opentopo") {
    const subdomains = ["a", "b", "c"];
    const subdomain = subdomains[Math.abs(x + y) % subdomains.length];
    upstreamUrl = resolveTemplate(
      OPEN_TOPO_TEMPLATE,
      zoom,
      x,
      y,
      request.nextUrl.origin,
      subdomain
    );
  } else if (source === "vfr") {
    const template = (
      process.env.NEXT_PUBLIC_VFR_CHART_TILES_URL ?? DEFAULT_VFR_TEMPLATE
    ).trim();

    if (!template) {
      return errorResponse("The VFR chart tile source is not configured.", 503);
    }

    upstreamUrl = resolveTemplate(
      template,
      zoom,
      x,
      y,
      request.nextUrl.origin
    );
  } else {
    return errorResponse("Unknown map tile source.", 400);
  }

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        Accept: "image/png,image/*;q=0.9,*/*;q=0.1",
        "User-Agent": "Briefings route-map PDF tile proxy",
      },
      next: { revalidate: 604800 },
    });

    if (!response.ok) {
      return errorResponse(
        `Map tile source returned HTTP ${response.status}.`,
        response.status === 404 ? 404 : 502
      );
    }

    const contentType = response.headers.get("content-type") ?? "image/png";

    if (!contentType.toLowerCase().startsWith("image/")) {
      return errorResponse("Map tile source did not return an image.", 502);
    }

    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: {
        "Cache-Control": TILE_CACHE_CONTROL,
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Route-map tile proxy failed", {
      source,
      zoom,
      x,
      y,
      upstreamUrl,
      error,
    });

    return errorResponse("Could not load the requested map tile.", 502);
  }
}
