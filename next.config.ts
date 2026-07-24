import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VFR_CHART_TILES_URL: "/vfr-chart/{z}/{x}/{y}.png",
    NEXT_PUBLIC_VFR_CHART_MAX_NATIVE_ZOOM: "12",
  },
  outputFileTracingIncludes: {
    "/api/p2006-form": [
      "./RVP.CFI.071.02TecnamP2006TMBandPerformanceSheet.pdf",
    ],
  },
};

export default nextConfig;
