import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone / Cloudflare quick tunnels hit the dev server from a public host.
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "127.0.0.1",
    "localhost",
  ],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
