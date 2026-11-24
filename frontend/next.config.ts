import path from "node:path";
import type { NextConfig } from "next";

/**
 * When NEXT_PUBLIC_USE_MOCKS=false and BACKEND_URL is set, /api/* is proxied to
 * the Express server so cookies stay same-origin. In mock mode the browser's
 * service worker answers those paths directly.
 */
const BACKEND_URL = process.env.BACKEND_URL ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!BACKEND_URL) return [];
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
  // Keep Turbopack's workspace root at the repo so lockfiles above frontend/ are ignored cleanly.
  turbopack: {
    root: path.resolve(import.meta.dirname, ".."),
    // Same msw fix for Turbopack itself (it ignores the webpack block).
    resolveAlias: {
      "msw/browser": "./node_modules/msw/lib/browser/index.js",
    },
  },
  webpack: (config) => {
    // msw's exports map sets "node": null for ./browser, which Turbopack refuses to
    // resolve. Point the subpath straight at its browser entry instead.
    config.resolve.alias = {
      ...config.resolve.alias,
      "msw/browser": path.resolve(import.meta.dirname, "node_modules/msw/lib/browser/index.js"),
    };
    return config;
  },
  // Images are local files in public/ for now; remote patterns can be added in Phase 3.
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
