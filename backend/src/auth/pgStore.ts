import { Pool, type PoolClient } from "pg";

import type {
  AuditRecord,
  InviteRecord,
  PasswordResetRecord,
  SessionRecord,
  UserRecord,
} from "./types";
import type { AuthRepository } from "./repository";

type UserRow = Record<string, unknown>;

const USER_COLUMNS = "id, name, email, phone_e164, password_hash, role, status, requested_role, failed_attempts, locked_until, last_login_at, created_at";

function mapUser(row: UserRow): UserRecord {
  return {
    id: String(row.id),
    name: row.name as string,
    email: row.email as string,
    phone: (row.phone_e164 as string | null) ?? null,
    passwordHash: (row.password_hash as string) ?? null,
    role: row.role as UserRecord["role"],
    status: row.status as UserRecord["status"],
    requestedRole: (row.requested_role as UserRecord["requestedRole"]) ?? null,
    failedAttempts: Number(row.failed_attempts ?? 0),
    lockedUntil: row.locked_until ? new Date(row.locked_until as string) : null,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}

function mapSession(row: UserRow): SessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: row.token_hash as string,
    familyId: String(row.family_id),
    userAgent: (row.user_agent as string) ?? null,
    ip: (row.ip as string) ?? null,
    expiresAt: new Date(row.expires_at as string),
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
    replacedAt: row.replaced_at ? new Date(row.replaced_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}

function mapReset(row: UserRow): PasswordResetRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: row.token_hash as string,
    expiresAt: new Date(row.expires_at as string),
    usedAt: row.used_at ? new Date(row.used_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}

function mapInvite(row: UserRow): InviteRecord {
  return {
    id: String(row.id),
    email: row.email as string,
    phone: (row.phone_e164 as string | null) ?? null,
    role: row.role as InviteRecord["role"],
    tokenHash: row.token_hash as string,
    invitedBy: row.invited_by ? String(row.invited_by) : null,
    expiresAt: new Date(row.expires_at as string),
    acceptedAt: row.accepted_at ? new Date(row.accepted_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Postgres-backed auth store. Parameterised queries only; refresh-token
 * rotation and invite acceptance run inside transactions.
 */
export class PgRepository implements AuthRepository {
  constructor(private pool: Pool) {}

  private async withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------ users
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async listUsers(): Promise<UserRecord[]> {
    const { rows } = await this.pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at`);
    return rows.map(mapUser);
  }

  async createUser(
    user: Omit<UserRecord, "createdAt" | "failedAttempts" | "lockedUntil" | "lastLoginAt">,
  ): Promise<UserRecord> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO users (id, name, email, phone_e164, password_hash, role, status, requested_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${USER_COLUMNS}`,
      [user.id, user.name, user.email, user.phone ?? null, user.passwordHash, user.role, user.status, user.requestedRole ?? null],
    );
    return mapUser(rows[0]!);
  }

  async updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };
    if (patch.name !== undefined) add("name", patch.name);
    if (patch.email !== undefined) add("email", patch.email);
    if (patch.phone !== undefined) add("phone_e164", patch.phone);
    if (patch.passwordHash !== undefined) add("password_hash", patch.passwordHash);
    if (patch.role !== undefined) add("role", patch.role);
    if (patch.status !== undefined) add("status", patch.status);
    if (patch.requestedRole !== undefined) add("requested_role", patch.requestedRole);
    if (patch.failedAttempts !== undefined) add("failed_attempts", patch.failedAttempts);
    if (patch.lockedUntil !== undefined) add("locked_until", patch.lockedUntil);
    if (patch.lastLoginAt !== undefined) add("last_login_at", patch.lastLoginAt);

    values.push(id);
    const { rows } = await this.pool.query<UserRow>(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING ${USER_COLUMNS}`,
      values,
    );
    return mapUser(rows[0]!);
  }

  // --------------------------------------------------------------- sessions
  async createSession(session: SessionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, user_agent, ip, expires_at, revoked_at, replaced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        session.id,
        session.userId,
        session.tokenHash,
        session.familyId,
        session.userAgent,
        session.ip,
        session.expiresAt,
        session.revokedAt,
        session.replacedAt,
      ],
    );
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );
    return rows[0] ? mapSession(rows[0]) : null;
  }

  /** Includes revoked rows so reuse of a rotated token can be detected. */
  async findSessionIncludingRevoked(tokenHash: string): Promise<SessionRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async revokeSession(id: string): Promise<void> {
    await this.pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [id]);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1`, [familyId]);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1`, [userId]);
  }

  /** Atomic rotation: old token revoked, new token inserted in one transaction. */
  async rotateSession(oldSessionId: string, next: SessionRecord): Promise<void> {
    await this.withTx(async (client) => {
      await client.query(`UPDATE refresh_tokens SET revoked_at = now(), replaced_at = now() WHERE id = $1`, [oldSessionId]);
      await client.query(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, user_agent, ip, expires_at, revoked_at, replaced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [next.id, next.userId, next.tokenHash, next.familyId, next.userAgent, next.ip, next.expiresAt, null, null],
      );
    });
  }

  // -------------------------------------------------------- password resets
  async createPasswordReset(reset: PasswordResetRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [reset.id, reset.userId, reset.tokenHash, reset.expiresAt, reset.usedAt],
    );
  }

  async findPasswordReset(tokenHash: string): Promise<PasswordResetRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT * FROM password_resets WHERE token_hash = $1 AND used_at IS NULL`,
      [tokenHash],
    );
    return rows[0] ? mapReset(rows[0]) : null;
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    await this.pool.query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [id]);
  }

  // ----------------------------------------------------------------- invites
  async createInvite(invite: InviteRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO invites (id, email, phone_e164, role, token_hash, invited_by, expires_at, accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [invite.id, invite.email, invite.phone ?? null, invite.role, invite.tokenHash, invite.invitedBy, invite.expiresAt, invite.acceptedAt],
    );
  }

  async findInvite(tokenHash: string): Promise<InviteRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT * FROM invites WHERE token_hash = $1 AND accepted_at IS NULL`,
      [tokenHash],
    );
    return rows[0] ? mapInvite(rows[0]) : null;
  }

  async acceptInvite(id: string): Promise<void> {
    await this.pool.query(`UPDATE invites SET accepted_at = now() WHERE id = $1`, [id]);
  }

  async findInviteByEmail(email: string): Promise<InviteRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT * FROM invites WHERE lower(email) = lower($1) AND accepted_at IS NULL`,
      [email],
    );
    return rows[0] ? mapInvite(rows[0]) : null;
  }

  /** Create the invited user and mark the invite accepted atomically. */
  async completeInvite(
    invite: InviteRecord,
    user: Omit<UserRecord, "createdAt" | "failedAttempts" | "lockedUntil" | "lastLoginAt">,
  ): Promise<UserRecord> {
    return this.withTx(async (client) => {
      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (id, name, email, phone_e164, password_hash, role, status, requested_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (email) DO NOTHING
         RETURNING ${USER_COLUMNS}`,
        [user.id, user.name, user.email, invite.phone ?? user.phone ?? null, user.passwordHash, user.role, user.status, user.requestedRole ?? null],
      );
      if (!rows[0]) throw new Error("EMAIL_TAKEN");
      await client.query(`UPDATE invites SET accepted_at = now() WHERE id = $1`, [invite.id]);
      return mapUser(rows[0]!);
    });
  }

  // ------------------------------------------------------------------ audit
  async audit(entry: Omit<AuditRecord, "id" | "createdAt">): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_log (user_id, event, metadata, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.userId, entry.event, JSON.stringify(entry.metadata ?? {}), entry.ip, entry.userAgent],
    );
  }
}
