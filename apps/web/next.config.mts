import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@event-hub/config", "@event-hub/contracts"],
};

export default nextConfig;
