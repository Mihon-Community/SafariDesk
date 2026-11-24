"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { useAuth } from "@/store/auth";
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
  useEffect(() => {
    void useAuth.getState().hydrate();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {mocksOn && <MswStarter />}
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
