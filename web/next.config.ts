import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stored files (photos, floor plans, spec sheets) are addressed as /_blob/<id> inside SITREP.
  // Jams Operations (ver1) was merged into SITREP; its old addresses open SITREP
  async redirects() {
    return [
      { source: "/operations", destination: "/app", permanent: true },
      { source: "/jamsos", destination: "/app", permanent: true },
    ];
  },
  async rewrites() {
    return [{ source: "/_blob/:id", destination: "/api/blob/:id" }];
  },
};

export default nextConfig;
