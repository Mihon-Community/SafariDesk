"use client";

import { useEffect } from "react";

/**
 * Browser-only MSW bootstrap. Mounted as a plain client component (it imports
 * `msw/browser` only inside an effect), so Turbopack never bundles msw for the
 * server. Starts the service worker in the background; queries retry until it
 * answers, and any failure is logged to the console instead of failing silently.
 */
let started = false;

export default function MswStarter() {
  useEffect(() => {
    // React StrictMode runs effects twice in dev; starting the worker twice throws
    // "cannot configure an already enabled network", so guard with a module flag.
    if (started) return;
    started = true;
    import("@/mocks/browser")
      .then(({ worker }) =>
        worker.start({
          serviceWorker: { url: "/mockServiceWorker.js" },
        }),
      )
      .catch((err) => {
        // No service-worker support: run unmocked.
        console.error("[msw] failed to start mock worker", err);
      });
    return () => {
      /* keep the worker alive for the page lifetime */
    };
  }, []);

  return null;
}
