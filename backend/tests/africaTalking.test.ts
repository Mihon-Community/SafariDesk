import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "../src/auth/memoryStore";
import { createApp } from "../src/app";
import { isKenyanE164Phone, normalizeKenyanPhone } from "../src/lib/phone";
import { AtSmsGateway, authSmsBody, type AtSettings } from "../src/services/at";
import type { SmsReplyJob, SmsReplyQueue } from "../src/services/atQueue";
import { MemoryAtStore } from "../src/services/atStore";

const TOKEN = "a".repeat(40);
const PHONE = "+254712345678";
const settings: AtSettings = {
  username: "sandbox",
  apiKey: "test-api-key",
  senderId: "",
  testPhone: PHONE,
  ussdServiceCode: "*384*123#",
  allowedPhones: [],
  webhookToken: TOKEN,
  publicBaseUrl: "",
  publicAppUrl: "http://localhost:3002",
};

function makeHarness(overrides: Partial<AtSettings> = {}, options: { now?: () => Date; sessionTtlMs?: number } = {}) {
  const store = new MemoryAtStore();
  const jobs: SmsReplyJob[] = [];
  const queue: SmsReplyQueue = { enqueue: (job) => jobs.push(job) };
  const integrations = {
    atStore: store,
    atSettings: { ...settings, ...overrides },
    smsReplyQueue: queue,
    ...(options.now ? { atWebhookNow: options.now } : {}),
    ...(options.sessionTtlMs ? { atSessionTtlMs: options.sessionTtlMs } : {}),
  };
  const { app } = createApp(new MemoryRepository(), undefined, integrations);
  return { app, store, jobs };
}

function callback(path: string) {
  return `${path}?token=${TOKEN}`;
}

function ussdBody(overrides: Record<string, string> = {}) {
  return {
    sessionId: "session-1",
    serviceCode: settings.ussdServiceCode,
    phoneNumber: PHONE,
    text: "",
    ...overrides,
  };
}

describe("Africa's Talking phone and SMS integration", () => {
  it("normalizes common Kenyan phone formats and rejects non-Kenyan numbers", () => {
    expect(normalizeKenyanPhone("0712 345 678")).toBe(PHONE);
    expect(normalizeKenyanPhone("254712345678")).toBe(PHONE);
    expect(normalizeKenyanPhone(PHONE)).toBe(PHONE);
    expect(normalizeKenyanPhone("+14155550123")).toBeNull();
    expect(isKenyanE164Phone(PHONE)).toBe(true);
    expect(isKenyanE164Phone("0712345678")).toBe(false);
  });

  it("sends SMS through the SDK and stores the provider acceptance separately", async () => {
    const store = new MemoryAtStore();
    const send = vi.fn().mockResolvedValue({
      SMSMessageData: {
        Recipients: [{ messageId: "AT-test-001", status: "Sent", statusCode: 101, cost: "KES 0.80" }],
      },
    });
    const factory = vi.fn(() => ({ SMS: { send } }));
    const gateway = new AtSmsGateway(settings, store, factory);

    const result = await gateway.sendText(PHONE, "SafariDesk test update");

    expect(result.accepted).toBe(true);
    expect(factory).toHaveBeenCalledWith({ username: "sandbox", apiKey: "test-api-key" });
    expect(send).toHaveBeenCalledWith({ to: [PHONE], message: "SafariDesk test update" });
    expect(store.getStoredSms("AT-test-001")).toMatchObject({
      apiStatus: "Sent",
      apiStatusCode: 101,
      deliveryStatus: null,
      cost: "KES 0.80",
    });
  });

  it("does not report an ambiguous provider response as accepted", async () => {
    const gateway = new AtSmsGateway(settings, new MemoryAtStore(), () => ({
      SMS: { send: async () => ({ SMSMessageData: { Recipients: [{ messageId: "unknown-status", status: "Unknown" }] } }) },
    }));
    await expect(gateway.sendText(PHONE, "hello")).resolves.toMatchObject({ accepted: false, reason: "provider_error" });
  });

  it("keeps the sandbox test-send helper pinned to sandbox and the configured phone", async () => {
    const send = vi.fn().mockResolvedValue({ SMSMessageData: { Recipients: [{ messageId: "one", statusCode: 101 }] } });
    const factory = () => ({ SMS: { send } });
    const liveGateway = new AtSmsGateway({ ...settings, username: "production" }, new MemoryAtStore(), factory);
    await expect(liveGateway.sendSandboxTest(PHONE)).rejects.toThrow(/sandbox/);

    const sandboxGateway = new AtSmsGateway(settings, new MemoryAtStore(), factory);
    await expect(sandboxGateway.sendSandboxTest("+254722222222")).rejects.toThrow(/AT_TEST_PHONE/);
    expect(send).not.toHaveBeenCalled();
    await expect(sandboxGateway.sendSandboxTest(PHONE)).resolves.toMatchObject({ accepted: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not send after STOP and sends the required opt-out acknowledgement", async () => {
    const { app, store, jobs } = makeHarness();
    const stop = await request(app).post(callback("/webhook/incoming")).type("form").send({ id: "sms-stop", from: PHONE, text: "STOP" });
    expect(stop.status).toBe(200);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ recipient: PHONE, bypassOptOut: true });
    expect(jobs[0]?.message).toContain("Text START");

    const send = vi.fn().mockResolvedValue({
      SMSMessageData: { Recipients: [{ messageId: "after-start", status: "Sent", statusCode: 101 }] },
    });
    const gateway = new AtSmsGateway(settings, store, () => ({ SMS: { send } }));
    await expect(gateway.sendText(PHONE, "booking update")).resolves.toMatchObject({ accepted: false, reason: "opted_out" });
    expect(send).not.toHaveBeenCalled();

    await request(app).post(callback("/webhook/incoming")).type("form").send({ id: "sms-start", from: PHONE, text: "START" }).expect(200);
    await expect(gateway.sendText(PHONE, "booking update")).resolves.toMatchObject({ accepted: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("builds authentication SMS links without changing the email flow", () => {
    expect(authSmsBody({ kind: "password_reset", email: "a@example.test", token: "secret-token", expiresAt: new Date() }, "https://safaridesk.example/"))
      .toContain("https://safaridesk.example/reset-password?token=secret-token");
    expect(authSmsBody({ kind: "invite", email: "a@example.test", role: "agent", token: "invite-token", expiresAt: new Date("2026-11-25T00:00:00Z") }, "https://safaridesk.example"))
      .toContain("https://safaridesk.example/accept-invite?token=invite-token");
  });
});

describe("Africa's Talking callbacks", () => {
  it("requires the query token on incoming SMS and deduplicates provider retries", async () => {
    const { app, jobs, store } = makeHarness();
    const payload = { id: "incoming-001", from: PHONE, text: "HELP" };

    await request(app).post("/webhook/incoming").set("x-webhook-token", TOKEN).type("form").send(payload).expect(401);
    await request(app).post(callback("/webhook/incoming")).type("form").send(payload).expect(200);
    await request(app).post(callback("/webhook/incoming")).type("form").send(payload).expect(200);

    expect(store.hasInboundSms("incoming-001")).toBe(true);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.message).toContain("text BOOK");
  });

  it("rejects a bad query token even when a valid injected header is present", async () => {
    const { app } = makeHarness();
    await request(app)
      .post("/api/webhooks/africastalking/sms-status?token=wrong")
      .set("x-webhook-token", TOKEN)
      .type("form")
      .send({ id: "sms-1", status: "Success" })
      .expect(401);
  });

  it("accepts the ngrok-injected header only for the delivery report API route", async () => {
    const { app, store } = makeHarness();
    const response = await request(app)
      .post("/api/webhooks/africastalking/sms-status")
      .set("x-webhook-token", TOKEN)
      .type("form")
      .send({ id: "sms-report-1", status: "Delivered", phoneNumber: PHONE });
    expect(response.status).toBe(200);
    expect(store.getStoredSms("sms-report-1")).toMatchObject({ deliveryStatus: "Success" });
  });

  it("returns AT-compatible text/plain END responses for unauthenticated USSD requests", async () => {
    const { app } = makeHarness();
    const missingToken = await request(app).post("/ussd").type("form").send(ussdBody());
    expect(missingToken.status).toBe(401);
    expect(missingToken.type).toBe("text/plain");
    expect(missingToken.text.startsWith("END ")).toBe(true);

    const unconfigured = makeHarness({ webhookToken: "" }).app;
    const disabled = await request(unconfigured).post("/ussd").type("form").send(ussdBody());
    expect(disabled.status).toBe(503);
    expect(disabled.type).toBe("text/plain");
    expect(disabled.text.startsWith("END ")).toBe(true);
  });

  it("serves a text/plain USSD menu, caches duplicate inputs, and rejects repeated selections", async () => {
    const { app } = makeHarness();
    const first = await request(app).post(callback("/ussd")).type("form").send(ussdBody());
    expect(first.status).toBe(200);
    expect(first.type).toBe("text/plain");
    expect(first.text.startsWith("CON ")).toBe(true);

    const browse = await request(app).post(callback("/ussd")).type("form").send(ussdBody({ text: "1" }));
    expect(browse.text.startsWith("END ")).toBe(true);
    expect(browse.text).toContain("/parks");
    const duplicate = await request(app).post(callback("/ussd")).type("form").send(ussdBody({ text: "1" }));
    expect(duplicate.text).toBe(browse.text);
    const repeatedSelection = await request(app).post(callback("/ussd")).type("form").send(ussdBody({ text: "1*1" }));
    expect(repeatedSelection.text).toContain("selection was repeated");
    expect(repeatedSelection.type).toBe("text/plain");
  });

  it("expires persisted USSD sessions and checks the configured service code", async () => {
    let now = new Date("2026-11-25T12:00:00Z");
    const { app } = makeHarness({}, { now: () => now, sessionTtlMs: 1_000 });
    await request(app).post(callback("/ussd")).type("form").send(ussdBody()).expect(200);
    now = new Date(now.getTime() + 1_001);
    const expired = await request(app).post(callback("/ussd")).type("form").send(ussdBody({ text: "1" }));
    expect(expired.text).toBe("END Session expired. Dial again to restart.");

    const wrongCode = await request(app).post(callback("/ussd")).type("form").send(ussdBody({ sessionId: "other", serviceCode: "*123#" }));
    expect(wrongCode.status).toBe(403);
    expect(wrongCode.text.startsWith("END ")).toBe(true);
  });

  it("rejects duplicate form fields, unsupported types, and unallowlisted phones", async () => {
    const { app } = makeHarness({ allowedPhones: ["+254722222222"] });
    await request(app)
      .post(callback("/webhook/incoming"))
      .type("application/x-www-form-urlencoded")
      .send(`id=one&id=two&from=${encodeURIComponent(PHONE)}&text=HELP`)
      .expect(400);
    await request(app).post(callback("/webhook/incoming")).send({ id: "sms-json", from: PHONE, text: "HELP" }).expect(415);
    await request(app).post(callback("/webhook/incoming")).type("form").send({ id: "sms-not-allowed", from: PHONE, text: "HELP" }).expect(403);
  });

  it("stores later delivery reports without overwriting API acceptance", async () => {
    const store = new MemoryAtStore();
    const gateway = new AtSmsGateway(settings, store, () => ({
      SMS: { send: async () => ({ SMSMessageData: { Recipients: [{ messageId: "accepted-then-delivered", status: "Sent", statusCode: 101 }] } }) },
    }));
    await gateway.sendText(PHONE, "hello");
    // Exercise the same store to verify status fields remain distinct.
    const routed = createApp(new MemoryRepository(), undefined, {
      atStore: store,
      atSettings: settings,
      smsReplyQueue: { enqueue: () => undefined },
    }).app;
    await request(routed).post(callback("/api/webhooks/africastalking/sms-status"))
      .type("form").send({ id: "accepted-then-delivered", status: "Success", phoneNumber: PHONE }).expect(200);
    expect(store.getStoredSms("accepted-then-delivered")).toMatchObject({ apiStatus: "Sent", apiStatusCode: 101, deliveryStatus: "Success" });
  });
});
