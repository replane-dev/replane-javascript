import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@replanejs/next", "@replanejs/react", "@replanejs/sdk"],
};

export default nextConfig;
