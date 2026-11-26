import path from "node:path";
import type { NextConfig } from "next";

/** Keep API calls same-origin for browser cookies and proxy them to FastAPI. */
const BACKEND_URL = process.env.BACKEND_URL ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The public ngrok URL serves the dev UI for invite and callback checks.
  // Limit this wildcard to the local development server; production has none.
  allowedDevOrigins: process.env.NODE_ENV === "development" ? ["*.ngrok-free.dev"] : [],
  // Callback URLs carry the shared webhook token in the query string. Avoid
  // writing those request targets into the Next.js dev server logs.
  logging: {
    incomingRequests: {
      ignore: [/\/(?:api\/webhooks\/africastalking|webhook\/incoming|ussd)(?:\/|\?|$)/],
    },
  },
  async rewrites() {
    if (!BACKEND_URL) return [];
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/ussd", destination: `${BACKEND_URL}/ussd` },
      { source: "/webhook/incoming", destination: `${BACKEND_URL}/webhook/incoming` },
    ];
  },
  // Keep Turbopack's workspace root at the repo so lockfiles above frontend/ are ignored cleanly.
  turbopack: { root: path.resolve(import.meta.dirname, "..") },
  // Images are local files in public/ for now; remote patterns can be added in Phase 3.
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
