"use client";

import type { ReactNode } from "react";

import { useAuth } from "@/store/auth";
import { hasPermission, type Permission } from "@/lib/permissions";

/**
 * Permission gate for UI. Renders children when the current role holds every
 * required permission (`all`) or at least one (`any`). Use `fallback` to render
 * an explanation instead of nothing when access is denied.
 */
export function Can({
  permission,
  any = false,
  fallback = null,
  children,
}: {
  /** Single permission or a list. */
  permission: Permission | Permission[];
  /** When true, holding one of the listed permissions is enough. */
  any?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const role = useAuth((s) => s.user?.role);
  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = any
    ? required.some((p) => hasPermission(role, p))
    : required.every((p) => hasPermission(role, p));

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
