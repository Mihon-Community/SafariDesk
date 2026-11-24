import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { PgRepository } from "../src/auth/pgStore";
import { AuthService } from "../src/auth/service";
import { id } from "../src/auth/repository";
import { hashToken } from "../src/auth/tokens";

/**
 * Postgres-backed auth suite. Runs only when TEST_DATABASE_URL is set:
 *
 *   TEST_DATABASE_URL=postgres://… npm test
 */
const dsn = process.env.TEST_DATABASE_URL ?? "";
const maybe = dsn ? describe : describe.skip;

maybe("PgRepository", () => {
  const pool = new Pool({ connectionString: dsn });
  let repo: PgRepository;
  let service: AuthService;

  beforeAll(async () => {
    repo = new PgRepository(pool);
    service = new AuthService(repo);
    // Isolate each run: wipe the auth tables (dev/test database only).
    await pool.query(
      "TRUNCATE audit_log, invites, password_resets, refresh_tokens, users RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("signs up a customer and issues tokens", async () => {
    const result = await service.signUp(
      { name: "Pg Customer", email: "pg-customer@example.com", password: "password123" },
      { ip: null, userAgent: null },
    );
    expect(result.user.role).toBe("customer");
    expect(result.user.status).toBe("active");
    expect(result.tokens?.accessToken).toBeTruthy();
  });

  it("queues staff roles as pending and lets an admin approve them", async () => {
    const requested = await service.signUp(
      { name: "Pg Driver", email: "pg-driver@example.com", password: "password123", requestedRole: "driver" },
      { ip: null, userAgent: null },
    );
    expect(requested.pending).toBe(true);
    expect(requested.user.role).toBe("customer");
    expect(requested.user.requestedRole).toBe("driver");

    const admin = await repo.createUser({
      id: id("usr"),
      name: "Pg Admin",
      email: "pg-admin@example.com",
      passwordHash: await hashPasswordFor("password123"),
      role: "admin",
      status: "active",
      requestedRole: null,
    });
    const approved = await service.approveRequest(requested.user.id, admin.id, { ip: null, userAgent: null });
    expect(approved.role).toBe("driver");
    expect(approved.status).toBe("active");
  });

  it("rotates refresh tokens atomically within one family", async () => {
    const signedIn = await service.signIn(
      { email: "pg-customer@example.com", password: "password123" },
      { ip: null, userAgent: null },
    );
    expect(signedIn.refreshToken).toBeTruthy();
    const user = signedIn.user;
    const tokens = { refreshToken: signedIn.refreshToken };

    const rotated = await service.refresh(tokens.refreshToken, { ip: null, userAgent: null });
    expect(rotated.user.id).toBe(user.id);

    const old = await repo.findSessionIncludingRevoked(hashToken(tokens.refreshToken));
    expect(old?.revokedAt).not.toBeNull();

    const reused = await service.refresh(tokens.refreshToken, { ip: null, userAgent: null }).catch((e) => e);
    expect(reused.code).toBe("SESSION_REUSED");
  });

  it("completes an invite in one transaction (user + accepted_at)", async () => {
    const raw = "invite-raw-token";
    await repo.createInvite({
      id: id("inv"),
      email: "invited@example.com",
      role: "operations",
      tokenHash: hashToken(raw),
      invitedBy: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      acceptedAt: null,
      createdAt: new Date(),
    });
    const invite = await repo.findInvite(hashToken(raw));
    expect(invite).not.toBeNull();

    const user = await repo.completeInvite(invite!, {
      id: id("usr"),
      name: "Invited Ops",
      email: "invited@example.com",
      passwordHash: await hashPasswordFor("password123"),
      role: invite!.role,
      status: "active",
      requestedRole: null,
    });
    expect(user.role).toBe("operations");

    const after = await repo.findInvite(hashToken(raw));
    expect(after).toBeNull(); // accepted invites are no longer offered
  });
});

async function hashPasswordFor(password: string): Promise<string> {
  const { hashPassword } = await import("../src/auth/passwords");
  return hashPassword(password);
}
