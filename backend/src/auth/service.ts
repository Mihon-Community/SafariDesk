import { config } from "../config";
import { logger } from "../logger";
import type { AuthRepository } from "./repository";
import { id } from "./repository";
import { generateToken } from "./memoryStore";
import { hashPassword, verifyPassword } from "./passwords";
import { hashToken, signAccessToken, verifyAccessToken } from "./tokens";
import type { Role, UserRecord } from "./types";
import { normalizeKenyanPhone } from "../lib/phone";

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
  requestedRole?: Role | null;
  lastLoginAt: Date | null;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    requestedRole: user.requestedRole ?? null,
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

const STAFF_ROLES: Role[] = [
  "super_admin",
  "admin",
  "operations",
  "dispatcher",
  "finance",
  "agent",
  "driver",
];

/** Roles an admin may be offered at self-signup (never admin/super_admin). */
export const REQUESTABLE_ROLES: Role[] = ["customer", "driver", "agent", "operations", "finance"];

/** Roles that must wait for admin approval. */
const PENDING_ROLES: Role[] = ["driver", "agent", "operations", "finance"];

export type DeliveryEvent =
  | { kind: "password_reset"; email: string; phone?: string | null | undefined; token: string; expiresAt: Date }
  | { kind: "invite"; email: string; phone?: string | null | undefined; role: Role; token: string; expiresAt: Date }
  | { kind: "request_approved"; email: string; phone?: string | null | undefined; role: Role }
  | { kind: "request_rejected"; email: string; phone?: string | null | undefined };

export class AuthService {
  private delivery: (event: DeliveryEvent) => unknown;

  constructor(
    private repo: AuthRepository,
    delivery?: (event: DeliveryEvent) => unknown,
  ) {
    // Default delivery is a log line; production plugs in Africa's Talking /
    // email here. Tokens never appear in logs.
    this.delivery = delivery ?? ((event) => logger.info({ kind: event.kind, email: event.email }, "auth delivery"));
  }

  /** Shared delivery hook so admin actions (users service) notify too. */
  async notify(event: DeliveryEvent): Promise<void> {
    await this.delivery(event);
  }

  /**
   * Public self-signup with a requested role.
   * - customer: active immediately, signed in (tokens returned).
   * - driver/agent/operations/finance: account kept as a pending `customer`,
   *   `requested_role` stored for an admin to approve or reject; no staff access.
   * - admin/super_admin can never be requested here.
   */
  async signUp(
    input: {
      name: string;
      email: string;
      password: string;
      requestedRole?: Role | null;
      company?: string | null | undefined;
      phone?: string | null | undefined;
      licenceNumber?: string | null | undefined;
      vehicleReg?: string | null | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ user: PublicUser; tokens?: IssuedTokens; pending?: boolean }> {
    const requested = input.requestedRole ?? "customer";
    if (requested === "admin" || requested === "super_admin") {
      throw new AuthError(403, "FORBIDDEN_ROLE", "That role cannot be requested at sign-up.");
    }
    if (!REQUESTABLE_ROLES.includes(requested)) {
      throw new AuthError(400, "VALIDATION", "Choose a valid role.");
    }

    const existing = await this.repo.findUserByEmail(input.email);
    if (existing) throw new AuthError(409, "EMAIL_TAKEN", "An account already exists for that email.");

    const needsApproval = PENDING_ROLES.includes(requested);
    const phone = input.phone ? normalizeKenyanPhone(input.phone) : null;
    if (input.phone && !phone) {
      throw new AuthError(400, "INVALID_PHONE", "Enter a valid Kenyan mobile number.");
    }
    const user = await this.repo.createUser({
      id: id("usr"),
      name: input.name,
      email: input.email.toLowerCase(),
      phone,
      passwordHash: await hashPassword(input.password),
      // Pending requesters hold the lowest role until an admin approves them.
      role: needsApproval ? "customer" : requested,
      status: needsApproval ? "pending" : "active",
      requestedRole: needsApproval ? requested : null,
    });
    await this.repo.audit({
      userId: user.id,
      event: needsApproval ? "auth.access_requested" : "auth.sign_up",
      ...ctx,
      metadata: { requestedRole: requested },
    });
    logger.info({ userId: user.id, requestedRole: requested }, needsApproval ? "access requested" : "sign-up complete");

    if (needsApproval) return { user: toPublicUser(user), pending: true };
    const tokens = await this.issueSession(user, ctx);
    return { user: toPublicUser(user), tokens, pending: false };
  }

  /** Users waiting for an admin decision on a staff role. */
  async listPending(): Promise<PublicUser[]> {
    return (await this.repo.listUsers())
      .filter((u) => u.status === "pending")
      .map(toPublicUser);
  }

  /** Grant the requested staff role. */
  async approveRequest(userId: string, actorId: string, ctx: RequestContext): Promise<PublicUser> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.status !== "pending" || !user.requestedRole) {
      throw new AuthError(400, "INVALID_REQUEST", "That account has no pending request.");
    }
    const approved = await this.repo.updateUser(userId, {
      role: user.requestedRole,
      status: "active",
      requestedRole: null,
    });
    await this.repo.audit({ userId, event: "auth.request_approved", ...ctx, metadata: { actorId, role: user.requestedRole } });
    await this.delivery({ kind: "request_approved", email: user.email, phone: user.phone, role: user.requestedRole });
    return toPublicUser(approved);
  }

  /** Reject a pending staff request: account disabled. */
  async rejectRequest(userId: string, actorId: string, ctx: RequestContext): Promise<PublicUser> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.status !== "pending") {
      throw new AuthError(400, "INVALID_REQUEST", "That account has no pending request.");
    }
    const rejected = await this.repo.updateUser(userId, {
      status: "disabled",
      requestedRole: null,
    });
    await this.repo.revokeAllUserSessions(userId);
    await this.repo.audit({ userId, event: "auth.request_rejected", ...ctx, metadata: { actorId } });
    await this.delivery({ kind: "request_rejected", email: user.email, phone: user.phone });
    return toPublicUser(rejected);
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

    // Staff-role requesters stay unapproved until an admin grants access.
    if (user.status === "pending") {
      await this.repo.audit({ userId: user.id, event: "auth.sign_in_blocked", ...ctx, metadata: { reason: "pending_approval" } });
      throw new AuthError(403, "PENDING_APPROVAL", "Your access request is awaiting admin approval.");
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
    if (this.repo.rotateSession) {
      const { token, expiresAt } = signAccessToken(user.id, user.role);
      const refresh = generateToken();
      await this.repo.rotateSession(session.id, {
        id: id("ses"),
        userId: user.id,
        tokenHash: hashToken(refresh),
        familyId: session.familyId,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt: new Date(Date.now() + config.refreshTtlSeconds * 1000),
        revokedAt: null,
        replacedAt: null,
        createdAt: new Date(),
      });
      return { user: toPublicUser(user), accessToken: token, refreshToken: refresh, expiresAt };
    }
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
      await this.delivery({ kind: "password_reset", email: user.email, phone: user.phone, token: raw, expiresAt });
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

  async invite(
    actorId: string,
    email: string,
    role: Role,
    ctx: RequestContext,
    phoneInput?: string,
  ): Promise<{ ok: true }> {
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

    const phone = phoneInput ? normalizeKenyanPhone(phoneInput) : null;
    if (phoneInput && !phone) throw new AuthError(400, "INVALID_PHONE", "Enter a valid Kenyan mobile number.");

    const raw = generateToken();
    const expiresAt = new Date(Date.now() + config.inviteTtlDays * 24 * 60 * 60 * 1000);
    await this.repo.createInvite({
      id: id("inv"),
      email: email.toLowerCase(),
      phone,
      role,
      tokenHash: hashToken(raw),
      invitedBy: actorId,
      expiresAt,
      acceptedAt: null,
      createdAt: new Date(),
    });
    await this.repo.audit({ userId: actorId, event: "auth.invite_created", ...ctx, metadata: { role } });
    await this.delivery({ kind: "invite", email: email.toLowerCase(), phone, role, token: raw, expiresAt });
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
    const draft = {
      id: id("usr"),
      name: input.name,
      email: invite.email,
      phone: invite.phone ?? null,
      passwordHash: await hashPassword(input.password),
      role: invite.role,
      status: "active" as const,
      requestedRole: null,
    };
    const user = this.repo.completeInvite
      ? await this.repo.completeInvite(invite, draft)
      : await this.repo.createUser(draft);
    if (!this.repo.completeInvite) await this.repo.acceptInvite(invite.id);
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
