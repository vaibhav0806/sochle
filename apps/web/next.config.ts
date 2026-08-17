import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  reactStrictMode: true,
  transpilePackages: ["@sochle/contracts", "@sochle/domain", "@sochle/fold", "@sochle/db"],
};

export default nextConfig;
