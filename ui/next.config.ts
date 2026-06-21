import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@edycutjong/lethe-sdk"],
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  devIndicators: false,
};

export default nextConfig;
