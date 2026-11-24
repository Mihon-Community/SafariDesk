import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

import { createApp } from "../src/app";
import { MemoryRepository } from "../src/auth/memoryStore";
import { AuthService, type DeliveryEvent } from "../src/auth/service";
import { bootstrapAdmin } from "../src/auth/bootstrap";

const ADMIN = { email: "admin@safaridesk.app", password: "password123" };

/** Staff-role self-signup, approval and rejection (finish-up prompt, Task 5). */
describe("staff access requests", () => {
  let app: Express;
  let repo: MemoryRepository;
  const deliveries: DeliveryEvent[] = [];

  beforeAll(async () => {
    repo = new MemoryRepository();
    process.env.ADMIN_EMAIL = ADMIN.email;
    process.env.ADMIN_PASSWORD = ADMIN.password;
    process.env.AUTH_RATE_LIMIT = "1000";
    await bootstrapAdmin(repo);
    const service = new AuthService(repo, (event) => deliveries.push(event));
    ({ app } = createApp(repo, service));
  });

  afterAll(() => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  function adminCookie(): Promise<string> {
    return request(app)
      .post("/api/auth/sign-in")
      .send(ADMIN)
      .then((res) => res.headers["set-cookie"].find((c: string) => c.startsWith("sd_access="))!.split(";")[0]!);
  }

  it("creates a customer immediately, signed in with cookies", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up")
      .send({ name: "Amina Otieno", email: "amina@example.com", password: "password123" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("customer");
    expect(res.body.user.status).toBe("active");
    expect(res.body.pending).toBe(false);
    const jar = res.headers["set-cookie"] as unknown as string[];
    expect(jar.find((c) => c.startsWith("sd_access="))).toContain("HttpOnly");
    expect(jar.find((c) => c.startsWith("sd_role="))).toContain("customer");
  });

  it.each(["driver", "agent", "operations", "finance"])(
    "queues %s as pending with role=customer and no staff session",
    async (role) => {
      const res = await request(app)
        .post("/api/auth/sign-up")
        .send({ name: `${role} User`, email: `${role}@example.com`, password: "password123", requestedRole: role });
      expect(res.status).toBe(201);
      expect(res.body.pending).toBe(true);
      expect(res.body.user.role).toBe("customer");
      expect(res.body.user.status).toBe("pending");
      expect(res.body.user.requestedRole).toBe(role);
      expect(res.headers["set-cookie"] ?? []).not.toContain(expect.stringContaining("sd_access="));
    },
  );

  it("rejects admin/super_admin at sign-up with 403", async () => {
    for (const role of ["admin", "super_admin"]) {
      const res = await request(app)
        .post("/api/auth/sign-up")
        .send({ name: "Sneaky", email: `${role}-bad@example.com`, password: "password123", requestedRole: role });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN_ROLE");
    }
  });

  it("blocks pending users from signing in and from staff endpoints", async () => {
    const signIn = await request(app)
      .post("/api/auth/sign-in")
      .send({ email: "driver@example.com", password: "password123" });
    expect(signIn.status).toBe(403);
    expect(signIn.body.code).toBe("PENDING_APPROVAL");
  });

  it("lets an admin approve a request, then the user signs in with the granted role", async () => {
    const cookie = await adminCookie();
    const target = (await repo.debugUsers()).find((u) => u.email === "driver@example.com")!;
    const pendingBefore = await request(app).get("/api/users/pending").set("cookie", cookie);
    expect(pendingBefore.body.users.map((u: { id: string }) => u.id)).toContain(target.id);

    const approved = await request(app)
      .post(`/api/users/${target.id}/approve`)
      .set("cookie", cookie)
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.user.role).toBe("driver");
    expect(approved.body.user.status).toBe("active");

    const signIn = await request(app)
      .post("/api/auth/sign-in")
      .send({ email: "driver@example.com", password: "password123" });
    expect(signIn.status).toBe(200);
    expect(signIn.body.user.role).toBe("driver");

    const pendingAfter = await request(app).get("/api/users/pending").set("cookie", cookie);
    expect(pendingAfter.body.users.map((u: { id: string }) => u.id)).not.toContain(target.id);
    expect(deliveries.some((d) => d.kind === "request_approved")).toBe(true);
  });

  it("lets an admin reject a request and disables the account", async () => {
    const cookie = await adminCookie();
    const target = (await repo.debugUsers()).find((u) => u.email === "finance@example.com")!;
    const rejected = await request(app)
      .post(`/api/users/${target.id}/reject`)
      .set("cookie", cookie)
      .send({});
    expect(rejected.status).toBe(200);
    expect(rejected.body.user.status).toBe("disabled");

    const signIn = await request(app)
      .post("/api/auth/sign-in")
      .send({ email: "finance@example.com", password: "password123" });
    // Disabled accounts use the uniform bad-credentials error.
    expect(signIn.status).toBe(401);
    expect(signIn.body.code).toBe("BAD_CREDENTIALS");
  });

  it("refuses approvals from non-admins", async () => {
    const customer = await request(app)
      .post("/api/auth/sign-up")
      .send({ name: "Cust", email: "cust@example.com", password: "password123" });
    const access = (customer.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("sd_access="))!.split(";")[0]!;
    const target = (await repo.debugUsers()).find((u) => u.email === "agent@example.com")!;
    const res = await request(app)
      .post(`/api/users/${target.id}/approve`)
      .set("Cookie", access)
      .send({});
    expect(res.status).toBe(403);
  });
});
