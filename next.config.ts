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
      {
        protocol: "https",
        hostname: "pub-f9646e60f04f4f65b9af51fa12e459f9.r2.dev",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:slug/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        source: "/widget.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
