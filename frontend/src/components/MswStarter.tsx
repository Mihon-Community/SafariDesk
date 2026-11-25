"use client";

import { useEffect } from "react";

import { ensureMocksStarted } from "@/mocks/start";

/**
 * Browser-only MSW bootstrap. Mounted as a plain client component so Turbopack
 * never bundles msw for the server. The shared starter guards against
 * StrictMode's double effect and lets auth hydration wait for the worker.
 */
export default function MswStarter() {
  useEffect(() => {
    void ensureMocksStarted();
  }, []);

  return null;
}
