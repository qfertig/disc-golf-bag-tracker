import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  allowedDevOrigins: ['192.168.1.117'],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
