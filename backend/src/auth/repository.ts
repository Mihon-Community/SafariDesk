import type {
  AuditRecord,
  InviteRecord,
  PasswordResetRecord,
  SessionRecord,
  UserRecord,
} from "./types";

/**
 * Persistence boundary for auth. Two implementations exist:
 * - MemoryRepository: zero-config dev and the vitest suite.
 * - PgRepository (./pgStore.ts): Postgres via `pg`, schema in migrations/004_auth.sql.
 */
export interface AuthRepository {
  // users
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  listUsers(): Promise<UserRecord[]>;
  createUser(user: Omit<UserRecord, "createdAt" | "failedAttempts" | "lockedUntil" | "lastLoginAt">): Promise<UserRecord>;
  updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord>;

  // sessions
  createSession(session: SessionRecord): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  /** Includes revoked rows so reuse of a rotated token can be detected. */
  findSessionIncludingRevoked(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession(id: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;

  // password resets
  createPasswordReset(reset: PasswordResetRecord): Promise<void>;
  findPasswordReset(tokenHash: string): Promise<PasswordResetRecord | null>;
  markPasswordResetUsed(id: string): Promise<void>;

  // invites
  createInvite(invite: InviteRecord): Promise<void>;
  findInvite(tokenHash: string): Promise<InviteRecord | null>;
  acceptInvite(id: string): Promise<void>;
  findInviteByEmail(email: string): Promise<InviteRecord | null>;

  // audit + lockout counters
  audit(entry: Omit<AuditRecord, "id" | "createdAt">): Promise<void>;

  /** Optional atomic helpers implemented by transactional stores (Postgres). */
  rotateSession?(oldSessionId: string, next: SessionRecord): Promise<void>;
  completeInvite?(
    invite: InviteRecord,
    user: Omit<UserRecord, "createdAt" | "failedAttempts" | "lockedUntil" | "lastLoginAt">,
  ): Promise<UserRecord>;
}

let counter = 0;
export function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
