/** Start the browser mock worker once and share completion across callers. */
let startPromise: Promise<void> | null = null;

export function startMockWorker(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!startPromise) {
    startPromise = import("@/mocks/browser")
      .then(({ worker }) => worker.start({ serviceWorker: { url: "/mockServiceWorker.js" } }))
      .then(() => undefined)
      .catch((error) => {
        startPromise = null;
        throw error;
      });
  }
  return startPromise;
}
