import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

import { createApp } from "../src/app";
import { MemoryRepository } from "../src/auth/memoryStore";
import { AuthService, type DeliveryEvent } from "../src/auth/service";
import { bootstrapAdmin } from "../src/auth/bootstrap";

const ADMIN = { email: "admin@safaridesk.app", password: "password123" };

/** Pull `name=value` out of a Set-Cookie list. */
function cookie(res: request.Response, name: string): string {
  const jar = res.headers["set-cookie"] as unknown as string[];
  const match = jar.find((c) => c.startsWith(`${name}=`));
  if (!match) throw new Error(`cookie ${name} missing`);
  return match.split(";")[0]!;
}

describe("auth routes", () => {
  let app: Express;
  let repo: MemoryRepository;
  const deliveries: DeliveryEvent[] = [];
  // Admin's password changes in the reset test; later tests use this.
  let adminPassword = ADMIN.password;

  beforeAll(async () => {
    repo = new MemoryRepository();
    process.env.ADMIN_EMAIL = ADMIN.email;
    process.env.ADMIN_PASSWORD = ADMIN.password;
    // Keep functional assertions independent of the rate-limit ceiling; the
    // dedicated rate-limit test still proves 429s happen.
    process.env.AUTH_RATE_LIMIT = "1000";
    await bootstrapAdmin(repo);
    const service = new AuthService(repo, (event) => deliveries.push(event));
    ({ app } = createApp(repo, service));
  });

  afterAll(() => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  async function signIn(email = ADMIN.email, password = adminPassword) {
    return request(app).post("/api/auth/sign-in").send({ email, password });
  }

  it("health is public", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("signs in with valid credentials and sets httpOnly cookies", async () => {
    const res = await signIn();
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ADMIN.email);
    expect(res.body.user.role).toBe("admin");
    const jar = res.headers["set-cookie"] as unknown as string[];
    expect(jar.find((c) => c.startsWith("sd_access="))).toContain("HttpOnly");
    expect(jar.find((c) => c.startsWith("sd_refresh="))).toContain("Path=/api/auth");
  });

  it("rejects wrong passwords without revealing the account", async () => {
    const res = await signIn(ADMIN.email, "wrong-password");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("BAD_CREDENTIALS");
  });

  it("validates request bodies", async () => {
    const res = await request(app).post("/api/auth/sign-in").send({ email: "nope", password: "" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("locks the account after repeated failures", async () => {
    await request(app)
      .post("/api/auth/sign-up")
      .send({ name: "Lock Me", email: "lock@example.com", password: "password123" });
    for (let i = 0; i < 5; i++) {
      const res = await signIn("lock@example.com", "bad-password");
      // The attempt that trips the threshold already reports the lock.
      expect([401, 423]).toContain(res.status);
    }
    const locked = await signIn("lock@example.com", "password123");
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe("LOCKED");
  });

  it("refreshes by rotating the token inside the same family", async () => {
    const login = await signIn();
    const refresh = cookie(login, "sd_refresh");

    const first = await request(app).post("/api/auth/refresh").set("Cookie", refresh);
    expect(first.status).toBe(200);
    expect(first.body.user.email).toBe(ADMIN.email);

    // Replaying the old token is reuse: the whole family is revoked.
    const replay = await request(app).post("/api/auth/refresh").set("Cookie", refresh);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("SESSION_REUSED");

    const rotated = cookie(first, "sd_refresh");
    const afterReuse = await request(app).post("/api/auth/refresh").set("Cookie", rotated);
    expect(afterReuse.status).toBe(401);
  });

  it("returns the current user from /me using the access cookie", async () => {
    const login = await signIn();
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie(login, "sd_access"));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(ADMIN.email);
  });

  it("rejects /me without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("signs out and clears both cookies", async () => {
    const login = await signIn();
    const jar = (login.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]);
    const res = await request(app).post("/api/auth/sign-out").set("Cookie", jar.join("; "));
    expect(res.status).toBe(200);
    const cleared = res.headers["set-cookie"] as unknown as string[];
    expect(cleared.some((c) => c.includes("sd_access=;"))).toBe(true);
    expect(cleared.some((c) => c.includes("sd_refresh=;"))).toBe(true);
  });

  it("creates customers on public sign-up", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up")
      .send({ name: "Amina Otieno", email: "amina@example.com", password: "password123" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("customer");
  });

  it("refuses duplicate sign-ups", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up")
      .send({ name: "Amina Again", email: "amina@example.com", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("forgot-password always answers ok and delivers a single-use token", async () => {
    const missing = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });
    expect(missing.status).toBe(200);
    expect(missing.body).toEqual({ ok: true });

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: ADMIN.email });
    expect(res.status).toBe(200);
    const delivery = deliveries.find(
      (d): d is Extract<DeliveryEvent, { kind: "password_reset" }> =>
        d.kind === "password_reset" && d.email === ADMIN.email,
    );
    expect(delivery?.token).toBeTruthy();

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: delivery!.token, password: "new-password-123" });
    expect(reset.status).toBe(200);

    const replay = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: delivery!.token, password: "another-password" });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe("INVALID_TOKEN");

    const login = await signIn(ADMIN.email, "new-password-123");
    expect(login.status).toBe(200);
    adminPassword = "new-password-123";
  });

  it("invites staff, then accepts the invite into an active account", async () => {
    const login = await signIn();
    const invited = await request(app)
      .post("/api/auth/invite")
      .set("Cookie", cookie(login, "sd_access"))
      .send({ email: "driver@example.com", role: "driver" });
    expect(invited.status).toBe(201);

    const delivery = deliveries.find(
      (d): d is Extract<DeliveryEvent, { kind: "invite" }> =>
        d.kind === "invite" && d.email === "driver@example.com",
    );
    expect(delivery?.token).toBeTruthy();

    const accepted = await request(app)
      .post("/api/auth/accept-invite")
      .send({ token: delivery!.token, name: "Demo Driver", password: "password123" });
    expect(accepted.status).toBe(201);
    expect(accepted.body.user.role).toBe("driver");
    expect(accepted.body.user.status).toBe("active");
  });

  it("forbids inviting when the actor is not an admin", async () => {
    const login = await signIn("amina@example.com", "password123");
    const res = await request(app)
      .post("/api/auth/invite")
      .set("Cookie", cookie(login, "sd_access"))
      .send({ email: "x@example.com", role: "agent" });
    expect(res.status).toBe(403);
  });

  it("rate limits auth endpoints", async () => {
    // Separate app with a tiny ceiling so the test stays fast.
    process.env.AUTH_RATE_LIMIT = "3";
    const { app: limitedApp } = createApp(
      new MemoryRepository(),
      new AuthService(new MemoryRepository()),
    );
    try {
      let last = 0;
      for (let i = 0; i < 5; i++) {
        last = (
          await request(limitedApp)
            .post("/api/auth/sign-in")
            .send({ email: "x@example.com", password: "x" })
        ).status;
      }
      expect(last).toBe(429);
    } finally {
      process.env.AUTH_RATE_LIMIT = "1000";
    }
  });
});
