import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep Turbopack's workspace root at the repo so lockfiles above frontend/ are ignored cleanly.
  turbopack: {
    root: path.resolve(import.meta.dirname, ".."),
  },
  // Images are local files in public/ for now; remote patterns can be added in Phase 3.
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
