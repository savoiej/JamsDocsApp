import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stored files (photos, floor plans, spec sheets) are addressed as /_blob/<id> inside Netline.
  // JamsOS was renamed Jams Operations; the old address still works
  async redirects() {
    return [{ source: "/jamsos", destination: "/operations", permanent: true }];
  },
  async rewrites() {
    return [{ source: "/_blob/:id", destination: "/api/blob/:id" }];
  },
};

export default nextConfig;
