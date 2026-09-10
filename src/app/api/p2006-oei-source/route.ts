import { NextRequest, NextResponse } from "next/server";
import type { P2006TRegistration } from "@/lib/performance/p2006t-fleet";

const SOURCE_COMMIT = "fd046d6d6dc5ee45017593dd4801fd450bfea551";
const SOURCE_PAGE: Record<P2006TRegistration, number> = {
  "CS-EAQ": 178,
  "CS-EBX": 178,
  "D-GSEV": 176,
};

function isRegistration(value: string): value is P2006TRegistration {
  return value === "CS-EAQ" || value === "CS-EBX" || value === "D-GSEV";
}

export async function GET(request: NextRequest) {
  const registration = request.nextUrl.searchParams.get("registration") ?? "";
  if (!isRegistration(registration)) {
    return NextResponse.json(
      { error: "Unsupported P2006T registration." },
      { status: 400 }
    );
  }

  const page = SOURCE_PAGE[registration];
  const sourceUrl =
    `https://raw.githubusercontent.com/AlexandreMoiteiro/briefings-next/${SOURCE_COMMIT}` +
    `/public/p2006-performance-pages/${registration}/page-${page}.png`;
  const response = await fetch(sourceUrl, {
    cache: "force-cache",
    headers: { "User-Agent": "Briefings-P2006T-OEI-Mapper" },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "The mapped OEI AFM source page is unavailable." },
      { status: 502 }
    );
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
