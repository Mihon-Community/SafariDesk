import { randomBytes } from "node:crypto";
import type {
  AuditRecord,
  InviteRecord,
  PasswordResetRecord,
  SessionRecord,
  UserRecord,
} from "./types";
import { id, type AuthRepository } from "./repository";

/**
 * Zero-config repository used for local dev and the vitest suite. Data lives in
 * process memory only; swap in Postgres (./pgStore.ts) by setting DATABASE_URL.
 */
export class MemoryRepository implements AuthRepository {
  private users = new Map<string, UserRecord>();
  private sessions = new Map<string, SessionRecord>();
  private resets = new Map<string, PasswordResetRecord>();
  private invites = new Map<string, InviteRecord>();
  private auditLog: AuditRecord[] = [];

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const needle = email.toLowerCase();
    for (const user of this.users.values()) if (user.email === needle) return user;
    return null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async listUsers(): Promise<UserRecord[]> {
    return [...this.users.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createUser(
    user: Omit<UserRecord, "createdAt" | "failedAttempts" | "lockedUntil" | "lastLoginAt">,
  ): Promise<UserRecord> {
    const record: UserRecord = {
      ...user,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: new Date(),
    };
    this.users.set(record.id, record);
    return record;
  }

  async updateUser(userId: string, patch: Partial<UserRecord>): Promise<UserRecord> {
    const current = this.users.get(userId);
    if (!current) throw new Error(`Unknown user ${userId}`);
    const next = { ...current, ...patch, id: current.id };
    this.users.set(userId, next);
    return next;
  }

  async createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const session = await this.findSessionIncludingRevoked(tokenHash);
    return session && session.revokedAt === null ? session : null;
  }

  /** Includes revoked rows so reuse of an old token can be detected. */
  async findSessionIncludingRevoked(tokenHash: string): Promise<SessionRecord | null> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) return session;
    }
    return null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) this.sessions.set(sessionId, { ...session, revokedAt: new Date() });
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.familyId === familyId && session.revokedAt === null) {
        this.sessions.set(session.id, { ...session, revokedAt: new Date() });
      }
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.revokedAt === null) {
        this.sessions.set(session.id, { ...session, revokedAt: new Date() });
      }
    }
  }

  async createPasswordReset(reset: PasswordResetRecord): Promise<void> {
    this.resets.set(reset.id, reset);
  }

  async findPasswordReset(tokenHash: string): Promise<PasswordResetRecord | null> {
    for (const reset of this.resets.values()) {
      if (reset.tokenHash === tokenHash && reset.usedAt === null) return reset;
    }
    return null;
  }

  async markPasswordResetUsed(resetId: string): Promise<void> {
    const reset = this.resets.get(resetId);
    if (reset) this.resets.set(resetId, { ...reset, usedAt: new Date() });
  }

  async createInvite(invite: InviteRecord): Promise<void> {
    this.invites.set(invite.id, invite);
  }

  async findInvite(tokenHash: string): Promise<InviteRecord | null> {
    for (const invite of this.invites.values()) {
      if (invite.tokenHash === tokenHash && invite.acceptedAt === null) return invite;
    }
    return null;
  }

  async acceptInvite(inviteId: string): Promise<void> {
    const invite = this.invites.get(inviteId);
    if (invite) this.invites.set(inviteId, { ...invite, acceptedAt: new Date() });
  }

  async findInviteByEmail(email: string): Promise<InviteRecord | null> {
    const needle = email.toLowerCase();
    for (const invite of this.invites.values()) {
      if (invite.email === needle && invite.acceptedAt === null) return invite;
    }
    return null;
  }

  async audit(entry: Omit<AuditRecord, "id" | "createdAt">): Promise<void> {
    this.auditLog.push({ ...entry, id: id("aud"), createdAt: new Date() });
  }

  async listAudit(limit = 100): Promise<AuditRecord[]> {
    return [...this.auditLog].reverse().slice(0, limit);
  }

  /** Test helper: full records, used only by the suite. */
  async debugUsers(): Promise<UserRecord[]> {
    return [...this.users.values()];
  }

  /** Test helper. */
  auditEntries(): AuditRecord[] {
    return [...this.auditLog];
  }
}

/** Opaque, URL-safe random token (raw form is returned once, never stored). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
