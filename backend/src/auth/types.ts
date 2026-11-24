/** Roles are defined once here; Phase 8 layers permissions on top of them. */
export const ROLES = [
  "super_admin",
  "admin",
  "operations",
  "dispatcher",
  "finance",
  "agent",
  "driver",
  "customer",
] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["active", "invited", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  role: Role;
  status: UserStatus;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  /** sha256 of the presented refresh token — raw tokens never touch storage. */
  tokenHash: string;
  familyId: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedAt: Date | null;
  createdAt: Date;
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface InviteRecord {
  id: string;
  email: string;
  role: Role;
  tokenHash: string;
  invitedBy: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface AuditRecord {
  id: string;
  userId: string | null;
  event: string;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
