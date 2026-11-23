"use client";

import { useEffect } from "react";

/**
 * Browser-only MSW bootstrap. Loaded through next/dynamic with ssr:false so
 * Turbopack never resolves msw/browser for the server bundle.
 */
export default function MswStarter({ onReady }: { onReady: () => void }) {
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
        // If MSW cannot start (no service-worker support), run unmocked.
      })
      .finally(() => {
        if (!cancelled) onReady();
      });
    return () => {
      cancelled = true;
    };
  }, [onReady]);

  return null;
}
