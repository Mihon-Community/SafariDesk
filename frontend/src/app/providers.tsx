"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { useAuth } from "@/store/auth";

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

const PUBLIC_AUTH_FLOWS = new Set([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
]);

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let active = true;
    async function bootstrap() {
      // Remove a registration left behind by an earlier MSW development build.
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations
              .filter((registration) => registration.active?.scriptURL.includes("mockServiceWorker.js"))
              .map((registration) => registration.unregister()),
          );
        }
      } catch (error) {
        console.warn("Could not remove the old mock service worker registration", error);
      }
      // A signed-out visitor on an auth form has no session to hydrate. Avoid
      // expected 401 `/me` and `/refresh` requests cluttering browser errors.
      if (active && !PUBLIC_AUTH_FLOWS.has(window.location.pathname)) {
        await useAuth.getState().hydrate();
      }
    }
    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
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
