"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { useAuth } from "@/store/auth";
import { startMockWorker } from "@/mocks/start-worker";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry transient API failures without making navigation depend on a
      // single request succeeding.
      retry: 2,
      retryDelay: 400,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/**
 * Client bootstrap. In mock development mode, wait for MSW before rendering
 * interactive pages so sign-in and auth hydration cannot race the worker.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const mocksOn = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
  const mockMode = mocksOn && process.env.NODE_ENV === "development";
  const [mockWorkerReady, setMockWorkerReady] = useState(!mockMode);

  // Start MSW before checking auth. Otherwise `/api/auth/me` can race the
  // service worker and incorrectly mark a valid mock session as signed out.
  useEffect(() => {
    let active = true;
    async function bootstrap() {
      if (mockMode) {
        try {
          await startMockWorker();
        } catch (error) {
          console.error("[msw] mock mode could not start", error);
        }
      }
      if (active) {
        setMockWorkerReady(true);
        await useAuth.getState().hydrate();
      }
    }
    void bootstrap();
    return () => {
      active = false;
    };
  }, [mockMode]);

  return (
    <QueryClientProvider client={queryClient}>
      {mockWorkerReady ? (
        children
      ) : (
        <main className="grid min-h-dvh place-items-center bg-background px-4" role="status" aria-live="polite">
          <p className="text-sm text-muted-foreground">Starting the local demo…</p>
        </main>
      )}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{ className: "toast-slide" }}
      />
    </QueryClientProvider>
  );
}
