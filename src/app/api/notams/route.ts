import { NextResponse } from "next/server";
import type { NotamApiResponse, PlotNotam } from "@/lib/notams";

const DEFAULT_BASE_URL = "https://notac.aero/api/v1";
const MAX_PORTUGAL_PAGES = 30;
const NOTAM_CACHE_SECONDS = 60 * 60 * 24;

type NotacReading = {
  short?: unknown;
  long?: unknown;
};

type NotacResult = {
  id?: unknown;
  number?: unknown;
  status?: unknown;
  location_code?: unknown;
  affected_fir?: unknown;
  q_code?: unknown;
  effective_start?: unknown;
  effective_end?: unknown;
  schedule?: unknown;
  lower_limit?: unknown;
  upper_limit?: unknown;
  minimum_fl?: unknown;
  maximum_fl?: unknown;
  text?: unknown;
  readings?: unknown;
  category?: unknown;
  geography?: unknown;
};

type NotacPage = {
  count?: unknown;
  next?: unknown;
  results?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNotam(row: NotacResult): PlotNotam | null {
  const geography =
    row.geography && typeof row.geography === "object"
      ? (row.geography as Record<string, unknown>)
      : null;
  const latitude = finiteNumber(geography?.latitude);
  const longitude = finiteNumber(geography?.longitude);
  if (latitude === null || longitude === null) return null;

  const category =
    row.category && typeof row.category === "object"
      ? (row.category as Record<string, unknown>)
      : null;
  const readings = Array.isArray(row.readings)
    ? (row.readings as NotacReading[])
    : [];
  const firstReading = readings[0];

  return {
    id: text(row.id) || `${text(row.number)}-${latitude}-${longitude}`,
    number: text(row.number) || "NOTAM",
    status: text(row.status) || "active",
    locationCode: text(row.location_code),
    affectedFir: text(row.affected_fir),
    qCode: text(row.q_code),
    category: text(category?.label) || text(category?.code) || "NOTAM",
    text: text(row.text),
    shortReading: text(firstReading?.short) || text(firstReading?.long),
    effectiveStart: text(row.effective_start) || null,
    effectiveEnd: text(row.effective_end) || null,
    schedule: text(row.schedule),
    latitude,
    longitude,
    radiusNm: Math.max(0, finiteNumber(geography?.radius_nm) ?? 0),
    lowerLimit: text(row.lower_limit),
    upperLimit: text(row.upper_limit),
    minimumFl: text(row.minimum_fl),
    maximumFl: text(row.maximum_fl),
  };
}

export async function GET() {
  const provider = (process.env.NOTAM_PROVIDER?.trim().toLowerCase() || "notac");
  if (provider !== "notac") {
    return NextResponse.json(
      { error: `Unsupported NOTAM provider: ${provider}` },
      { status: 500 }
    );
  }

  const token = process.env.NOTAC_API_TOKEN?.trim();
  const baseUrl = (process.env.NOTAM_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");

  if (!token) {
    const response: NotamApiResponse = {
      configured: false,
      provider: "NOTAC",
      notices: [],
      total: 0,
      plotted: 0,
      truncated: false,
      fetchedAt: new Date().toISOString(),
      message: "Live NOTAM source is not configured yet.",
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const providerQuery = "status=active&sort=location&country_code=PT";
  let nextUrl: string | null = `${baseUrl}/notam/?${providerQuery}`;
  const notices: PlotNotam[] = [];
  let providerTotal = 0;
  let page = 0;

  try {
    while (nextUrl && page < MAX_PORTUGAL_PAGES) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        next: { revalidate: NOTAM_CACHE_SECONDS },
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.warn("NOTAM provider request failed", response.status, detail.slice(0, 500));
        return NextResponse.json(
          {
            error: "Could not load live NOTAMs.",
            providerStatus: response.status,
          },
          { status: 502 }
        );
      }

      const payload = (await response.json()) as NotacPage;
      if (page === 0) {
        providerTotal = Math.max(0, finiteNumber(payload.count) ?? 0);
      }

      const results = Array.isArray(payload.results)
        ? (payload.results as NotacResult[])
        : [];

      for (const row of results) {
        const notice = normalizeNotam(row);
        if (notice) notices.push(notice);
      }

      nextUrl = typeof payload.next === "string" && payload.next ? payload.next : null;
      page += 1;
    }

    const portugalNotices = notices.filter((notice) => {
      const location = notice.locationCode.toUpperCase();
      const fir = notice.affectedFir.toUpperCase();
      return location.startsWith("LP") || fir.startsWith("LP");
    });

    const unique = Array.from(
      new Map(portugalNotices.map((notice) => [notice.id, notice])).values()
    );

    const response: NotamApiResponse = {
      configured: true,
      provider: "NOTAC",
      notices: unique,
      total: providerTotal,
      plotted: unique.length,
      truncated: Boolean(nextUrl),
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control":
          "public, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("NOTAM API failed", error);
    return NextResponse.json(
      { error: "Could not load live NOTAMs." },
      { status: 502 }
    );
  }
}
