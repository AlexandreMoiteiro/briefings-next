import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/meteorology/:path*",
        destination: "/",
        permanent: false,
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/p2006-form": [
      "./RVP.CFI.071.02TecnamP2006TMBandPerformanceSheet.pdf",
    ],
  },
};

export default nextConfig;
