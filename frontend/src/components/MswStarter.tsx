"use client";

import { useEffect } from "react";

/**
 * Browser-only MSW bootstrap. Loaded through next/dynamic with ssr:false so
 * Turbopack never resolves msw/browser for the server bundle. Starts the
 * service worker in the background; queries retry until it answers.
 */
export default function MswStarter() {
  useEffect(() => {
    let cancelled = false;
    import("@/mocks/browser")
      .then(({ worker }) =>
        worker.start({
          onUnhandledFrame: "bypass",
          serviceWorker: { url: "/mockServiceWorker.js" },
        }),
      )
      .catch(() => {
        // No service-worker support: run unmocked.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
