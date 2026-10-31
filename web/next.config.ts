import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stored files (photos, floor plans, spec sheets) are addressed as /_blob/<id> inside JamsNET.
  async rewrites() {
    return [{ source: "/_blob/:id", destination: "/api/blob/:id" }];
  },
};

export default nextConfig;
