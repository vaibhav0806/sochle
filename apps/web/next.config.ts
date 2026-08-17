import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@sochle/contracts", "@sochle/domain", "@sochle/fold", "@sochle/db"],
};

export default nextConfig;
