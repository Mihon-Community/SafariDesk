"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { useAuth } from "@/store/auth";

// Browser-only MSW bootstrap: ssr:false keeps Turbopack from resolving
// msw/browser (which is node:null in its exports map) for the server bundle.
const MswStarter = dynamic(() => import("@/components/MswStarter"), {
  ssr: false,
  loading: () => null,
});

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
    useAuth.getState().hydrate();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {mocksOn && <MswStarter />}
      {children}
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
