import { config } from "../config";
import { logger } from "../logger";
import type { AuthRepository } from "./repository";
import { id } from "./repository";
import { AuthError, type DeliveryEvent } from "./service";
import { hashToken } from "./tokens";
import { generateToken } from "./memoryStore";
import { ROLES, type Role, type UserRecord, type UserStatus } from "./types";

export interface PublicUserRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  requestedRole?: Role | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

function toPublic(user: UserRecord): PublicUserRecord {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    requestedRole: user.requestedRole ?? null,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

/** Admin user management for /users (Phase 8). All actions write the audit log. */
export class UsersService {
  constructor(
    private repo: AuthRepository,
    private delivery: (event: DeliveryEvent) => void = () => {},
  ) {}

  async list(): Promise<PublicUserRecord[]> {
    return (await this.repo.listUsers()).map(toPublic);
  }

  /**
   * Change role/status. Guards:
   * - super_admin role can only be granted by a super_admin;
   * - nobody can change their own role or disable themselves (avoids lockout).
   */
  async update(
    actorId: string,
    targetId: string,
    patch: { role?: Role | undefined; status?: UserStatus | undefined },
    ctx: { ip: string | null; userAgent: string | null },
  ): Promise<PublicUserRecord> {
    const actor = await this.repo.findUserById(actorId);
    if (!actor || !["admin", "super_admin"].includes(actor.role)) {
      throw new AuthError(403, "FORBIDDEN", "Admin role required.");
    }
    const target = await this.repo.findUserById(targetId);
    if (!target) throw new AuthError(404, "NOT_FOUND", "User not found.");

    if (actorId === targetId && (patch.role || patch.status)) {
      // Only super_admin may promote themselves; otherwise block self-lockout.
      if (patch.role && patch.role !== actor.role) {
        throw new AuthError(400, "CANNOT_CHANGE_OWN_ROLE", "You cannot change your own role.");
      }
      if (patch.status && patch.status !== "active") {
        throw new AuthError(400, "CANNOT_DISABLE_SELF", "You cannot disable your own account.");
      }
    }

    if (patch.role) {
      if (!ROLES.includes(patch.role)) throw new AuthError(400, "BAD_ROLE", "Unknown role.");
      if (patch.role === "super_admin" && actor.role !== "super_admin") {
        throw new AuthError(403, "SUPER_ADMIN_REQUIRED", "Only a super admin can grant that role.");
      }
    }
    if (patch.status && !["active", "invited", "pending", "disabled"].includes(patch.status)) {
      throw new AuthError(400, "BAD_STATUS", "Unknown status.");
    }

    const patchRecord: Partial<UserRecord> = {};
    if (patch.role) patchRecord.role = patch.role;
    if (patch.status) patchRecord.status = patch.status;
    const updated = await this.repo.updateUser(targetId, patchRecord);
    await this.repo.audit({
      userId: actorId,
      event: "users.updated",
      ...ctx,
      metadata: { targetId, role: patch.role ?? null, status: patch.status ?? null },
    });
    logger.info({ actorId, targetId }, "user record updated");
    return toPublic(updated);
  }

  /** Admin-triggered password reset: issues a single-use token and "sends" it. */
  async requestPasswordReset(
    actorId: string,
    targetId: string,
    ctx: { ip: string | null; userAgent: string | null },
  ): Promise<{ ok: true }> {
    const actor = await this.repo.findUserById(actorId);
    if (!actor || !["admin", "super_admin"].includes(actor.role)) {
      throw new AuthError(403, "FORBIDDEN", "Admin role required.");
    }
    const target = await this.repo.findUserById(targetId);
    if (!target) throw new AuthError(404, "NOT_FOUND", "User not found.");

    const raw = generateToken();
    const expiresAt = new Date(Date.now() + config.passwordResetTtlMinutes * 60 * 1000);
    await this.repo.createPasswordReset({
      id: id("rst"),
      userId: target.id,
      tokenHash: hashToken(raw),
      expiresAt,
      usedAt: null,
      createdAt: new Date(),
    });
    this.delivery({ kind: "password_reset", email: target.email, token: raw, expiresAt });
    await this.repo.audit({ userId: actorId, event: "users.password_reset", ...ctx, metadata: { targetId } });
    return { ok: true };
  }

  /** Accounts that requested a staff role and are waiting for an admin decision. */
  async listPending(): Promise<PublicUserRecord[]> {
    return (await this.repo.listUsers())
      .filter((u) => u.status === "pending")
      .map(toPublic);
  }

  /** Approve a pending request: grant the requested role, activate, notify. */
  async approveRequest(
    actorId: string,
    targetId: string,
    ctx: { ip: string | null; userAgent: string | null },
  ): Promise<PublicUserRecord> {
    const actor = await this.repo.findUserById(actorId);
    if (!actor || !["admin", "super_admin"].includes(actor.role)) {
      throw new AuthError(403, "FORBIDDEN", "Admin role required.");
    }
    const target = await this.repo.findUserById(targetId);
    if (!target || target.status !== "pending" || !target.requestedRole) {
      throw new AuthError(400, "INVALID_REQUEST", "That account has no pending request.");
    }
    const updated = await this.repo.updateUser(targetId, {
      role: target.requestedRole,
      status: "active",
      requestedRole: null,
    });
    this.delivery({ kind: "request_approved", email: target.email, role: target.requestedRole });
    await this.repo.audit({
      userId: actorId,
      event: "users.request_approved",
      ...ctx,
      metadata: { targetId, role: target.requestedRole },
    });
    logger.info({ actorId, targetId, role: target.requestedRole }, "access request approved");
    return toPublic(updated);
  }

  /** Reject a pending request: disable the account, revoke sessions, notify. */
  async rejectRequest(
    actorId: string,
    targetId: string,
    ctx: { ip: string | null; userAgent: string | null },
  ): Promise<PublicUserRecord> {
    const actor = await this.repo.findUserById(actorId);
    if (!actor || !["admin", "super_admin"].includes(actor.role)) {
      throw new AuthError(403, "FORBIDDEN", "Admin role required.");
    }
    const target = await this.repo.findUserById(targetId);
    if (!target || target.status !== "pending") {
      throw new AuthError(400, "INVALID_REQUEST", "That account has no pending request.");
    }
    await this.repo.revokeAllUserSessions(targetId);
    const updated = await this.repo.updateUser(targetId, { status: "disabled", requestedRole: null });
    this.delivery({ kind: "request_rejected", email: target.email });
    await this.repo.audit({ userId: actorId, event: "users.request_rejected", ...ctx, metadata: { targetId } });
    logger.info({ actorId, targetId }, "access request rejected");
    return toPublic(updated);
  }
}
