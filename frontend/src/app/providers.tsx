"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { useAuth } from "@/store/auth";
import { ensureMocksStarted } from "@/mocks/start";
import MswStarter from "@/components/MswStarter";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The mock service worker can start a beat after hydration; retry
      // absorbs that first request instead of gating the whole app on it.
      retry: 2,
      retryDelay: 400,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/**
 * Client bootstrap. Children render immediately in every mode; when mocks are
 * enabled the service worker attaches itself in the background.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const mocksOn = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  // Read the stored session after mount so SSR and the first client render match.
  // In dev, wait for MSW first: otherwise /api/auth/me hits Next before the
  // worker is active and logs a 404 (the same promise is used by MswStarter).
  useEffect(() => {
    void (async () => {
      if (mocksOn && process.env.NODE_ENV === "development") {
        await ensureMocksStarted();
      }
      await useAuth.getState().hydrate();
    })();
  }, [mocksOn]);

  return (
    <QueryClientProvider client={queryClient}>
      {mocksOn && process.env.NODE_ENV === "development" && <MswStarter />}
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{ className: "toast-slide" }}
      />
    </QueryClientProvider>
  );
}
