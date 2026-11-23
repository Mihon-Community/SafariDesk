"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

// Browser-only MSW bootstrap: ssr:false keeps Turbopack from resolving
// msw/browser (which is node:null in its exports map) for the server bundle.
const MswStarter = dynamic(() => import("@/components/MswStarter"), {
  ssr: false,
  loading: () => null,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/**
 * Client bootstrap: provides TanStack Query and toasts. In mock mode it waits
 * for the MSW service worker to be ready before rendering queries.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const mocksOn = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
  const [ready, setReady] = useState(!mocksOn);

  return (
    <QueryClientProvider client={queryClient}>
      {mocksOn && <MswStarter onReady={() => setReady(true)} />}
      {ready ? (
        children
      ) : (
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Loading SafariDesk…</p>
        </div>
      )}
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
