import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Disable TypeScript checking during builds
    ignoreBuildErrors: true,
  },
  eslint: {
    // Disable ESLint checking during builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
