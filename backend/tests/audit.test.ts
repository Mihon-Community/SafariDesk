import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

import { createApp } from "../src/app";
import { MemoryRepository } from "../src/auth/memoryStore";
import { AuthService } from "../src/auth/service";
import { bootstrapAdmin } from "../src/auth/bootstrap";

const SUPER = { email: "super@safaridesk.app", password: "password123" };

describe("audit log API", () => {
  let app: Express;
  let repo: MemoryRepository;

  beforeAll(async () => {
    repo = new MemoryRepository();
    process.env.ADMIN_EMAIL = SUPER.email;
    process.env.ADMIN_PASSWORD = SUPER.password;
    process.env.AUTH_RATE_LIMIT = "1000";
    await bootstrapAdmin(repo);
    const admin = await repo.findUserByEmail(SUPER.email);
    await repo.updateUser(admin!.id, { role: "super_admin" });
    ({ app } = createApp(repo, new AuthService(repo)));
  });

  async function cookie(email: string, password: string) {
    const res = await request(app).post("/api/auth/sign-in").send({ email, password });
    const jar = res.headers["set-cookie"] as unknown as string[];
    return jar.find((c) => c.startsWith("sd_access="))!.split(";")[0]!;
  }

  it("lets super_admin read the trail and records its own sign-in", async () => {
    const auth = await cookie(SUPER.email, SUPER.password);
    const res = await request(app).get("/api/audit").set("Cookie", auth);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.some((e: { event: string }) => e.event === "auth.sign_in")).toBe(true);
  });

  it("denies roles without audit:read", async () => {
    await request(app)
      .post("/api/auth/sign-up")
      .send({ name: "Carl Customer", email: "carl-audit@example.com", password: "password123" });
    const auth = await cookie("carl-audit@example.com", "password123");
    const res = await request(app).get("/api/audit").set("Cookie", auth);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });
});
