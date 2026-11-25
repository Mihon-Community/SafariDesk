/**
 * Single, race-safe MSW bootstrap used by both the UI mount point and auth
 * hydration. Starting once here lets Providers wait for the worker before the
 * first `/api/auth/me` fetch, so dev mode no longer produces a 404 from Next
 * while the service worker is still activating.
 */
let startPromise: Promise<void> | null = null;

function isPageNavigation(request: Request): boolean {
  const url = new URL(request.url);
  return (
    request.destination === "document" ||
    url.searchParams.has("_rsc") ||
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-State-Tree")
  );
}

export function ensureMocksStarted(): Promise<void> {
  if (!startPromise) {
    startPromise = import("@/mocks/browser")
      .then(({ worker }) =>
        worker.start({
          serviceWorker: { url: "/mockServiceWorker.js" },
          // Next.js document/RSC navigations are not API calls. Let the router
          // handle them without an MSW warning or an unhandled-passthrough log.
          onUnhandledFrame({ frame, defaults }) {
            const request =
              frame.protocol === "http"
                ? (frame.data as { request: Request }).request
                : undefined;
            if (request && isPageNavigation(request)) return;
            defaults.warn();
          },
        }),
      )
      .then(() => undefined)
      .catch((err) => {
        // No service-worker support: carry on unmocked, but do not wedge auth.
        console.error("[msw] failed to start mock worker", err);
      });
  }
  return startPromise;
}
