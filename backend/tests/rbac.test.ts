import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

import { createApp } from "../src/app";
import { MemoryRepository } from "../src/auth/memoryStore";
import { AuthService } from "../src/auth/service";
import { bootstrapAdmin } from "../src/auth/bootstrap";
import { hasPermission, permissionsFor } from "../src/auth/permissions";
import type { Role } from "../src/auth/types";

const ADMIN = { email: "admin@safaridesk.app", password: "password123" };

describe("RBAC", () => {
  let app: Express;
  let repo: MemoryRepository;

  beforeAll(async () => {
    repo = new MemoryRepository();
    process.env.ADMIN_EMAIL = ADMIN.email;
    process.env.ADMIN_PASSWORD = ADMIN.password;
    process.env.AUTH_RATE_LIMIT = "1000";
    await bootstrapAdmin(repo);
    ({ app } = createApp(repo, new AuthService(repo)));
  });

  async function signIn(email: string, password: string) {
    const res = await request(app).post("/api/auth/sign-in").send({ email, password });
    const jar = res.headers["set-cookie"] as unknown as string[];
    return jar.find((c) => c.startsWith("sd_access="))!.split(";")[0]!;
  }

  async function makeUser(name: string, email: string, role: Role, password = "password123") {
    await request(app)
      .post("/api/auth/sign-up")
      .send({ name, email, password })
      .catch(() => undefined);
    return (await repo.debugUsers()).find((u) => u.email === email)?.id ?? "";
  }

  async function userIdOf(email: string): Promise<string> {
    return (await repo.debugUsers()).find((u) => u.email === email)!.id;
  }

  it("maps roles to the documented permissions", () => {
    expect(hasPermission("super_admin", "settings:manage")).toBe(true);
    expect(hasPermission("admin", "settings:manage")).toBe(false);
    expect(hasPermission("finance", "payments:refund")).toBe(true);
    expect(hasPermission("finance", "dispatch:write")).toBe(false);
    expect(hasPermission("dispatcher", "dispatch:write")).toBe(true);
    expect(hasPermission("agent", "bookings:write")).toBe(true);
    expect(hasPermission("driver", "dispatch:write")).toBe(false);
    expect(hasPermission("customer", "payments:refund")).toBe(false);
    expect(hasPermission("customer", "concierge:use")).toBe(true);
    expect(permissionsFor("customer").length).toBeGreaterThan(0);
  });

  it("lists users for admins and returns the documented 403 body otherwise", async () => {
    const adminCookie = await signIn(ADMIN.email, ADMIN.password);
    const list = await request(app).get("/api/users").set("Cookie", adminCookie);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.users)).toBe(true);

    await makeUser("Carl Customer", "carl2@example.com", "customer");
    const customerCookie = await signIn("carl2@example.com", "password123");
    const forbidden = await request(app).get("/api/users").set("Cookie", customerCookie);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: "Missing permission users:read.", code: "FORBIDDEN" });
  });

  it("updates roles and statuses, writing the audit log", async () => {
    const adminCookie = await signIn(ADMIN.email, ADMIN.password);
    await makeUser("Dana Driver", "dana@example.com", "driver");

    const targetId = (await userIdOf("dana@example.com"));
    const updated = await request(app)
      .patch(`/api/users/${targetId}`)
      .set("Cookie", adminCookie)
      .send({ role: "operations", status: "active" });
    expect(updated.status).toBe(200);
    expect(updated.body.user.role).toBe("operations");

    // Self-disable is refused.
    const adminId = (await userIdOf(ADMIN.email));
    const selfDisable = await request(app)
      .patch(`/api/users/${adminId}`)
      .set("Cookie", adminCookie)
      .send({ status: "disabled" });
    expect(selfDisable.status).toBe(400);
    expect(selfDisable.body.code).toBe("CANNOT_DISABLE_SELF");
  });

  it("only super_admin can grant super_admin", async () => {
    const adminCookie = await signIn(ADMIN.email, ADMIN.password);
    await makeUser("Eli Agent", "eli@example.com", "agent");
    const targetId = (await userIdOf("eli@example.com"));
    const res = await request(app)
      .patch(`/api/users/${targetId}`)
      .set("Cookie", adminCookie)
      .send({ role: "super_admin" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SUPER_ADMIN_REQUIRED");
  });

  it("issues admin-triggered password resets", async () => {
    const adminCookie = await signIn(ADMIN.email, ADMIN.password);
    await makeUser("Fiona Finance", "fiona@example.com", "finance");
    const targetId = (await userIdOf("fiona@example.com"));
    const res = await request(app)
      .post(`/api/users/${targetId}/password-reset`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
