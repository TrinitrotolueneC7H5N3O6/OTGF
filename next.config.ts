import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone / Cloudflare quick tunnels hit the dev server from a public host.
  allowedDevOrigins: ["*.trycloudflare.com"],
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
