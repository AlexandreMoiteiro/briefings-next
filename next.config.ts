import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/p2006-form": [
      "./RVP.CFI.071.02TecnamP2006TMBandPerformanceSheet.pdf",
    ],
  },
};

export default nextConfig;
