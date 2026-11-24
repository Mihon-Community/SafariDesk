import { config } from "../config";
import { logger } from "../logger";
import type { AuthRepository } from "./repository";
import { id } from "./repository";
import { generateToken } from "./memoryStore";
import { hashPassword, verifyPassword } from "./passwords";
import { hashToken, signAccessToken, verifyAccessToken } from "./tokens";
import type { Role, UserRecord } from "./types";

export class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserRecord["status"];
  lastLoginAt: Date | null;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
  };
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

const STAFF_ROLES: Role[] = ["super_admin", "admin", "operations", "finance", "agent", "driver"];

export type DeliveryEvent =
  | { kind: "password_reset"; email: string; token: string; expiresAt: Date }
  | { kind: "invite"; email: string; role: Role; token: string; expiresAt: Date };

export class AuthService {
  private delivery: (event: DeliveryEvent) => void;

  constructor(
    private repo: AuthRepository,
    delivery?: (event: DeliveryEvent) => void,
  ) {
    // Default delivery is a log line; production plugs in Africa's Talking /
    // email here. Tokens never appear in logs.
    this.delivery = delivery ?? ((event) => logger.info({ kind: event.kind, email: event.email }, "auth delivery"));
  }

  async signUp(input: { name: string; email: string; password: string }, ctx: RequestContext): Promise<PublicUser> {
    const existing = await this.repo.findUserByEmail(input.email);
    if (existing) throw new AuthError(409, "EMAIL_TAKEN", "An account already exists for that email.");

    const user = await this.repo.createUser({
      id: id("usr"),
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      // Public self-signup is always a customer; staff arrive via invite.
      role: "customer",
      status: "active",
    });
    await this.repo.audit({ userId: user.id, event: "auth.sign_up", ...ctx, metadata: { role: user.role } });
    logger.info({ userId: user.id, event: "auth.sign_up" }, "sign-up complete");
    return toPublicUser(user);
  }

  async signIn(input: { email: string; password: string }, ctx: RequestContext): Promise<{ user: PublicUser } & IssuedTokens> {
    const user = await this.repo.findUserByEmail(input.email);

    if (!user || user.status === "disabled") {
      // Uniform error: never reveal whether the address exists.
      await this.repo.audit({ userId: null, event: "auth.sign_in_failed", ...ctx, metadata: { reason: "unknown_email" } });
      throw new AuthError(401, "BAD_CREDENTIALS", "Invalid email or password.");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AuthError(423, "LOCKED", "Too many failed attempts. Try again later.", );
    }

    if (!user.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
      const failedAttempts = user.failedAttempts + 1;
      const lockedUntil =
        failedAttempts >= config.maxFailedAttempts
          ? new Date(Date.now() + config.lockoutMinutes * 60 * 1000)
          : null;
      await this.repo.updateUser(user.id, { failedAttempts, lockedUntil });
      await this.repo.audit({ userId: user.id, event: "auth.sign_in_failed", ...ctx, metadata: { failedAttempts } });
      logger.warn({ userId: user.id, failedAttempts }, "failed sign-in");
      if (lockedUntil) {
        throw new AuthError(423, "LOCKED", "Too many failed attempts. Try again later.");
      }
      throw new AuthError(401, "BAD_CREDENTIALS", "Invalid email or password.");
    }

    await this.repo.updateUser(user.id, {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });

    const tokens = await this.issueSession(user, ctx);
    await this.repo.audit({ userId: user.id, event: "auth.sign_in", ...ctx, metadata: {} });
    return { user: toPublicUser({ ...user, lastLoginAt: new Date() }), ...tokens };
  }

  async refresh(presentedRefresh: string, ctx: RequestContext): Promise<{ user: PublicUser } & IssuedTokens> {
    const session = await this.repo.findSessionIncludingRevoked(hashToken(presentedRefresh));
    if (!session) throw new AuthError(401, "INVALID_REFRESH", "Your session has ended. Sign in again.");

    if (session.revokedAt) {
      // A revoked token being presented means it was stolen/replayed: kill the family.
      await this.repo.revokeFamily(session.familyId);
      await this.repo.audit({ userId: session.userId, event: "auth.refresh_reuse", ...ctx, metadata: { familyId: session.familyId } });
      logger.warn({ userId: session.userId, familyId: session.familyId }, "refresh token reuse detected");
      throw new AuthError(401, "SESSION_REUSED", "Your session was revoked. Sign in again.");
    }

    if (session.expiresAt <= new Date()) {
      await this.repo.revokeSession(session.id);
      throw new AuthError(401, "INVALID_REFRESH", "Your session has expired. Sign in again.");
    }

    const user = await this.repo.findUserById(session.userId);
    if (!user || user.status === "disabled") throw new AuthError(401, "INVALID_REFRESH", "Your session has ended. Sign in again.");

    // Rotate: old token dies, new one continues the same family.
    await this.repo.revokeSession(session.id);
    const tokens = await this.issueSession(user, ctx, session.familyId);
    return { user: toPublicUser(user), ...tokens };
  }

  async signOut(presentedRefresh: string | undefined, userId: string, ctx: RequestContext): Promise<void> {
    if (presentedRefresh) {
      const session = await this.repo.findSessionByTokenHash(hashToken(presentedRefresh));
      if (session && !session.revokedAt) await this.repo.revokeSession(session.id);
    }
    await this.repo.audit({ userId, event: "auth.sign_out", ...ctx, metadata: {} });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.status === "disabled") throw new AuthError(401, "UNAUTHENTICATED", "Sign in required.");
    return toPublicUser(user);
  }

  /**
   * Always succeeds so the endpoint cannot be used to enumerate accounts; the
   * token is logged/stub-sent rather than emailed in dev.
   */
  async forgotPassword(email: string, ctx: RequestContext): Promise<{ ok: true }> {
    const user = await this.repo.findUserByEmail(email);
    if (user) {
      const raw = generateToken();
      const expiresAt = new Date(Date.now() + config.passwordResetTtlMinutes * 60 * 1000);
      await this.repo.createPasswordReset({
        id: id("rst"),
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt,
        usedAt: null,
        createdAt: new Date(),
      });
      await this.repo.audit({ userId: user.id, event: "auth.password_reset_requested", ...ctx, metadata: {} });
      this.delivery({ kind: "password_reset", email: user.email, token: raw, expiresAt });
      logger.info({ userId: user.id }, "password reset requested");
    }
    return { ok: true };
  }

  async resetPassword(rawToken: string, newPassword: string, ctx: RequestContext): Promise<void> {
    const reset = await this.repo.findPasswordReset(hashToken(rawToken));
    if (!reset || reset.expiresAt <= new Date()) {
      throw new AuthError(400, "INVALID_TOKEN", "This reset link is invalid or has expired.");
    }
    const user = await this.repo.findUserById(reset.userId);
    if (!user) throw new AuthError(400, "INVALID_TOKEN", "This reset link is invalid or has expired.");

    await this.repo.markPasswordResetUsed(reset.id);
    await this.repo.updateUser(user.id, {
      passwordHash: await hashPassword(newPassword),
      failedAttempts: 0,
      lockedUntil: null,
    });
    // Every existing session is now suspect.
    await this.revokeAllUserSessions(user.id);
    await this.repo.audit({ userId: user.id, event: "auth.password_reset", ...ctx, metadata: {} });
  }

  async invite(actorId: string, email: string, role: Role, ctx: RequestContext): Promise<{ ok: true }> {
    const actor = await this.repo.findUserById(actorId);
    if (!actor || (actor.role !== "admin" && actor.role !== "super_admin")) {
      throw new AuthError(403, "FORBIDDEN", "Only admins can invite staff.");
    }
    if (role === "customer" || role === "super_admin") {
      throw new AuthError(400, "BAD_ROLE", "Choose a staff role to invite.");
    }
    if (!(STAFF_ROLES as string[]).includes(role)) {
      throw new AuthError(400, "BAD_ROLE", "Unknown role.");
    }

    const raw = generateToken();
    const expiresAt = new Date(Date.now() + config.inviteTtlDays * 24 * 60 * 60 * 1000);
    await this.repo.createInvite({
      id: id("inv"),
      email: email.toLowerCase(),
      role,
      tokenHash: hashToken(raw),
      invitedBy: actorId,
      expiresAt,
      acceptedAt: null,
      createdAt: new Date(),
    });
    await this.repo.audit({ userId: actorId, event: "auth.invite_created", ...ctx, metadata: { role } });
    this.delivery({ kind: "invite", email: email.toLowerCase(), role, token: raw, expiresAt });
    logger.info({ userId: actorId, role }, "staff invite created");
    return { ok: true };
  }

  async acceptInvite(
    rawToken: string,
    input: { name: string; password: string },
    ctx: RequestContext,
  ): Promise<PublicUser> {
    const invite = await this.repo.findInvite(hashToken(rawToken));
    if (!invite || invite.expiresAt <= new Date()) {
      throw new AuthError(400, "INVALID_INVITE", "This invitation is invalid or has expired.");
    }
    if (await this.repo.findUserByEmail(invite.email)) {
      throw new AuthError(409, "EMAIL_TAKEN", "An account already exists for that email.");
    }
    const user = await this.repo.createUser({
      id: id("usr"),
      name: input.name,
      email: invite.email,
      passwordHash: await hashPassword(input.password),
      role: invite.role,
      status: "active",
    });
    await this.repo.acceptInvite(invite.id);
    await this.repo.audit({ userId: user.id, event: "auth.invite_accepted", ...ctx, metadata: { role: user.role } });
    return toPublicUser(user);
  }

  /** Verify a presented access token (cookie or Authorization header). */
  async resolveAccess(token: string | undefined): Promise<PublicUser> {
    if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Sign in required.");
    const claims = verifyAccessToken(token);
    if (!claims) throw new AuthError(401, "UNAUTHENTICATED", "Sign in required.");
    return this.me(claims.sub);
  }

  private async issueSession(user: UserRecord, ctx: RequestContext, familyId?: string): Promise<IssuedTokens> {
    const { token, expiresAt } = signAccessToken(user.id, user.role);
    const refresh = generateToken();
    await this.repo.createSession({
      id: id("ses"),
      userId: user.id,
      tokenHash: hashToken(refresh),
      familyId: familyId ?? id("fam"),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
      expiresAt: new Date(Date.now() + config.refreshTtlSeconds * 1000),
      revokedAt: null,
      replacedAt: null,
      createdAt: new Date(),
    });
    return { accessToken: token, refreshToken: refresh, expiresAt };
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    await this.repo.revokeAllUserSessions(userId);
  }
}
