"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { api } from "@/lib/api";
import type { AdminUser } from "@/features/users/types";
import { ErrorState } from "@/components/States";
import { UsersAdmin } from "@/features/users/UsersAdmin";

/** Admin user management (Phase 8): invite, role changes, deactivation, resets. */
export default function UsersPage() {
  const query = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: AdminUser[] }>("/api/users").then((r) => r.users),
  });

  return (
    <div className="space-y-4">
      {query.isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
        </div>
      )}
      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "Request failed"}
          onRetry={() => query.refetch()}
        />
      )}
      {query.data && <UsersAdmin users={query.data} />}
    </div>
  );
}
