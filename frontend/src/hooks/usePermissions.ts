"use client";

import { useMemo } from "react";

import { useAuth } from "@/store/auth";
import { hasPermission, permissionsFor, type Permission, type Role } from "@/lib/permissions";

/** Current role's permission set plus convenience checkers. */
export function usePermissions(): {
  role: Role | null;
  permissions: Permission[];
  can: (permission: Permission) => boolean;
  canAny: (list: Permission[]) => boolean;
} {
  const role = useAuth((s) => s.user?.role ?? null);
  const permissions = useMemo(() => (role ? permissionsFor(role) : []), [role]);
  return {
    role,
    permissions,
    can: (permission) => hasPermission(role, permission),
    canAny: (list) => list.some((p) => hasPermission(role, p)),
  };
}

/** Single-permission check. */
export function usePermission(permission: Permission): boolean {
  const role = useAuth((s) => s.user?.role ?? null);
  return hasPermission(role, permission);
}
