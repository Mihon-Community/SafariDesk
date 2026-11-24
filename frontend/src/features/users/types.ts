import type { Role } from "@/lib/permissions";

/** Mirrors backend/src/auth/users.ts PublicUserRecord. */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited" | "disabled";
  lastLoginAt: string | null;
  createdAt: string;
}
