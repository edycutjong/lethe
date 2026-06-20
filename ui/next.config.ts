import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@lethe/sdk"],
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
