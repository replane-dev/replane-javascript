import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable transpilation of the workspace packages
  transpilePackages: ["@replanejs/next", "@replanejs/react", "@replanejs/sdk"],
};

export default nextConfig;
